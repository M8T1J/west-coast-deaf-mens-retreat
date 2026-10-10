"""Offline tests: synthetic credentials, mocked HTTP, sockets forbidden."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("auth_probe", ROOT / "scripts/test-registration-email-auth.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
SECRET = "synthetic-worker-secret-for-auth-tests-only"
PERSONAL = "synthetic-person@example.invalid"


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        guard = patch("socket.socket", side_effect=AssertionError("Network forbidden"))
        guard.start()
        self.addCleanup(guard.stop)
        self.env = {probe.SECRET_NAME: SECRET}
        self.opener = Mock()

    def response(self, value, status=200):
        response = Mock(status=status)
        response.read.return_value = value if isinstance(value, bytes) else json.dumps(value).encode()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        self.opener.open.return_value = response
        return response

    def test_exact_dry_run_request_and_no_overrides(self):
        response = self.response({"dry_run": True, "status": "no_job"})
        self.env.update({"WORKER_URL": "https://untrusted.invalid", "DRY_RUN": "false"})
        self.assertEqual(probe.authenticate(self.env, self.opener)[0], 0)
        self.opener.open.assert_called_once()
        request = self.opener.open.call_args.args[0]
        self.assertEqual(request.full_url, probe.WORKER_URL)
        self.assertEqual(request.method, "POST")
        self.assertEqual(request.data, b'{"dry_run":true}')
        self.assertEqual(request.get_header("Authorization"), "Bearer " + SECRET)
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(self.opener.open.call_args.kwargs, {"timeout": 90})
        response.read.assert_called_once_with(4097)

    def test_missing_or_invalid_secret_never_calls_http(self):
        for value in ("", "short", "x" * 4001, SECRET + "\n", SECRET + "é"):
            self.assertEqual(probe.authenticate({probe.SECRET_NAME: value}, self.opener)[0], 1)
        self.opener.open.assert_not_called()

    def test_preview_and_empty_queue_pass_without_exposing_data(self):
        for status in ("preview", "no_job"):
            self.response({"dry_run": True, "status": status, "recipient": PERSONAL, "secret": SECRET, "outbox_id": "private-id"})
            code, message = probe.authenticate(self.env, self.opener)
            self.assertEqual((code, message), (0, "PASS: authentication accepted; worker confirmed dry-run."))

    def test_requires_explicit_dry_run_confirmation(self):
        for value in ({"status": "no_job"}, {"dry_run": False, "status": "no_job"}, {"dry_run": 1, "status": "no_job"}, {"dry_run": "true", "status": "preview"}, {"dry_run": True, "status": "sent"}, {"dry_run": True, "status": PERSONAL}):
            self.response(value)
            code, message = probe.authenticate(self.env, self.opener)
            self.assertEqual(code, 1)
            self.assertNotIn(PERSONAL, message)

    def test_malformed_or_oversized_response_fails_closed(self):
        for value in (b"bad json", b"\xff", b"x" * 4097, [], None, {}, {"status": [SECRET]}):
            self.response(value)
            code, message = probe.authenticate(self.env, self.opener)
            self.assertEqual(code, 1)
            self.assertNotIn(SECRET, message)

    def test_errors_are_sanitized_and_never_retried(self):
        errors = [TimeoutError(SECRET), urllib.error.URLError(PERSONAL)]
        errors += [urllib.error.HTTPError(probe.WORKER_URL, status, SECRET, {}, io.BytesIO(PERSONAL.encode())) for status in (301, 302, 307, 308, 401, 403, 429, 500, 503)]
        for error in errors:
            self.opener.reset_mock()
            self.opener.open.side_effect = error
            code, message = probe.authenticate(self.env, self.opener)
            self.assertEqual(code, 1)
            self.assertNotIn(SECRET, message)
            self.assertNotIn(PERSONAL, message)
            self.opener.open.assert_called_once()

    def test_non_200_is_failure(self):
        self.response({"dry_run": True, "status": "no_job"}, 204)
        self.assertEqual(probe.authenticate(self.env, self.opener)[0], 1)

    def test_default_opener_rejects_redirects(self):
        self.response({"dry_run": True, "status": "no_job"})
        with patch.object(urllib.request, "build_opener", return_value=self.opener) as build:
            probe.authenticate(self.env)
        self.assertIsInstance(build.call_args.args[0], probe.NoRedirect)

    def test_real_redirect_path_never_forwards_credential(self):
        class Transport(urllib.request.HTTPSHandler):
            calls = 0

            def https_open(self, request):
                self.calls += 1
                response = urllib.response.addinfourl(io.BytesIO(), {"location": "https://untrusted.invalid"}, request.full_url, 302)
                response.msg = "Found"
                return response

        transport = Transport()
        opener = urllib.request.build_opener(probe.NoRedirect(), transport)
        self.assertEqual(probe.authenticate(self.env, opener)[0], 1)
        self.assertEqual(transport.calls, 1)


if __name__ == "__main__":
    unittest.main()
