"""Offline scheduler tests; all HTTP is mocked and real network is forbidden."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("invoke_worker", ROOT / "scripts/invoke-registration-email.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
SECRET = "synthetic-worker-secret-offline-tests-only"


class SchedulerTests(unittest.TestCase):
    def setUp(self):
        guard = patch("socket.socket", side_effect=AssertionError("Network forbidden"))
        guard.start()
        self.addCleanup(guard.stop)
        self.env = {worker.SECRET_NAME: SECRET}
        self.opener = Mock()

    def response(self, body, status=200):
        response = Mock(status=status)
        response.read.return_value = body if isinstance(body, bytes) else json.dumps(body).encode()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        self.opener.open.return_value = response
        return response

    def test_exact_request_and_one_call(self):
        response = self.response({"status": "no_job"})
        self.assertEqual(worker.invoke(self.env, self.opener), (0, "no_job"))
        self.opener.open.assert_called_once()
        request = self.opener.open.call_args.args[0]
        self.assertEqual(request.full_url, worker.WORKER_URL)
        self.assertEqual(request.method, "POST")
        self.assertEqual(json.loads(request.data), {"dry_run": False})
        self.assertEqual(request.get_header("Authorization"), "Bearer " + SECRET)
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(self.opener.open.call_args.kwargs, {"timeout": 90})
        response.read.assert_called_once_with(4097)

    def test_missing_and_malformed_credentials_fail_before_http(self):
        for value in ("", "short", "x" * 4001, SECRET + "\n", SECRET + " ", SECRET + "é"):
            with self.subTest(value_length=len(value)):
                self.assertEqual(worker.invoke({worker.SECRET_NAME: value}, self.opener)[0], 1)
        self.opener.open.assert_not_called()

    def test_sent_and_empty_are_success(self):
        for status in ("sent", "no_job"):
            self.response({"status": status, "outbox_id": SECRET})
            self.assertEqual(worker.invoke(self.env, self.opener), (0, status))

    def test_throttle_is_deferred(self):
        self.response({"status": "not_authorized", "reason": "dispatch_throttled"})
        self.assertEqual(worker.invoke(self.env, self.opener)[0], 0)

    def test_http_200_worker_failures_are_not_success(self):
        for reason in ("rate_limited", "pre_dispatch_failure", "delivery_unknown", "quota_exhausted", "configuration_error", "provider_rejected", "invalid_registration"):
            with self.subTest(reason=reason):
                self.response({"status": "failed", "reason": reason, "secret": SECRET})
                code, message = worker.invoke(self.env, self.opener)
                self.assertEqual(code, 1)
                self.assertNotIn(SECRET, message)

    def test_uncertain_and_unauthorized_results_fail(self):
        for status in ("reconciliation_required", "not_authorized", "unknown", SECRET):
            self.response({"status": status, "reason": SECRET})
            code, message = worker.invoke(self.env, self.opener)
            self.assertEqual(code, 1)
            self.assertNotIn(SECRET, message)

    def test_invalid_and_oversized_responses_fail_without_logging_body(self):
        for body in (b"bad json", b"x" * 4097, b"\xff", [], None, {}, {"status": [SECRET]}):
            self.response(body)
            code, message = worker.invoke(self.env, self.opener)
            self.assertEqual(code, 1)
            self.assertNotIn(SECRET, message)

    def test_http_errors_never_retry_or_log_raw_error(self):
        for status in (301, 302, 307, 308, 401, 403, 429, 500, 502, 503):
            with self.subTest(status=status):
                self.opener.reset_mock()
                self.opener.open.side_effect = urllib.error.HTTPError(worker.WORKER_URL, status, SECRET, {}, io.BytesIO(SECRET.encode()))
                code, message = worker.invoke(self.env, self.opener)
                self.assertEqual(code, 1)
                self.assertNotIn(SECRET, message)
                self.opener.open.assert_called_once()

    def test_transport_failures_never_retry_or_log_exception(self):
        for error in (TimeoutError(SECRET), urllib.error.URLError(SECRET), OSError(SECRET)):
            self.opener.reset_mock()
            self.opener.open.side_effect = error
            code, message = worker.invoke(self.env, self.opener)
            self.assertEqual(code, 1)
            self.assertNotIn(SECRET, message)
            self.opener.open.assert_called_once()

    def test_non_200_response_fails(self):
        self.response({"status": "sent"}, 204)
        self.assertEqual(worker.invoke(self.env, self.opener)[0], 1)

    def test_default_opener_disables_redirects(self):
        self.response({"status": "no_job"})
        with patch.object(urllib.request, "build_opener", return_value=self.opener) as build:
            worker.invoke(self.env)
        self.assertIsInstance(build.call_args.args[0], worker.NoRedirect)

    def test_redirect_handler_does_not_forward_bearer(self):
        handler = worker.NoRedirect()
        request = urllib.request.Request(worker.WORKER_URL, data=b"{}", headers={"Authorization": "Bearer " + SECRET})
        parent = Mock()
        handler.add_parent(parent)
        for status in (301, 302, 303, 307, 308):
            self.assertIsNone(handler.http_error_302(request, io.BytesIO(), status, "redirect", {"location": "https://untrusted.invalid"}))
        parent.open.assert_not_called()

    def test_real_opener_rejects_redirect_with_mock_transport(self):
        class Transport(urllib.request.HTTPSHandler):
            calls = 0

            def https_open(self, request):
                self.calls += 1
                response = urllib.response.addinfourl(io.BytesIO(b"redirect"), {"location": "https://untrusted.invalid"}, request.full_url, 302)
                response.msg = "Found"
                return response

        transport = Transport()
        opener = urllib.request.build_opener(worker.NoRedirect(), transport)
        code, message = worker.invoke(self.env, opener)
        self.assertEqual(code, 1)
        self.assertIn("http_error", message)
        self.assertEqual(transport.calls, 1)

    def test_workflow_enables_five_minute_schedule_and_scopes_secret(self):
        text = (ROOT / ".github/workflows/registration-email-recovery.yml").read_text()
        active = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
        self.assertIn("schedule:", active)
        self.assertIn("- cron: '2-57/5 * * * *'", active)
        self.assertNotIn("if: ${{ false }}", active)
        self.assertIn("Registration email recovery (every five minutes)", active)
        self.assertIn("${{ secrets.REGISTRATION_EMAIL_WORKER_SECRET }}", active)
        self.assertEqual(active.count("${{ secrets."), 1)
        self.assertIn("permissions:\n  contents: read", active)
        self.assertIn("cancel-in-progress: false", active)
        self.assertIn("timeout-minutes: 3", active)
        self.assertIn("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", active)
        self.assertIn("persist-credentials: false", active)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", active)
        self.assertNotIn("pull_request", active)
        self.assertNotIn("push:", active)

    def test_recovery_request_is_one_fixed_non_redirecting_send_attempt(self):
        self.assertTrue(worker.WORKER_URL.startswith("https://xauxotzqlrylhrjababc.supabase.co/"))
        self.assertEqual(worker.MAX_RESPONSE_BYTES, 4096)
        source = (ROOT / "scripts/invoke-registration-email.py").read_text()
        self.assertIn("NoRedirect()", source)
        self.assertIn("opener.open(request, timeout=90)", source)
        self.assertIn("data=b'{\"dry_run\":false}'", source)
        self.assertNotIn("retry(", source)
        self.assertNotIn("sleep(", source)

    def test_unsafe_migration_is_outside_deployment_directory(self):
        name = "20260925000000_add_registration_email_recovery.sql"
        self.assertFalse((ROOT / "supabase/migrations" / name).exists())
        self.assertTrue((ROOT / "supabase/archive/pg-net-recovery" / (name + ".disabled")).is_file())


if __name__ == "__main__":
    unittest.main()
