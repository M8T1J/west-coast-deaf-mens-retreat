"""Single recovery tick. No database credentials, redirects, or request retries."""

import json
import os
import sys
import urllib.error
import urllib.request

# Fixed destination: credentials must never follow a configurable URL or redirect.
WORKER_URL = "https://xauxotzqlrylhrjababc.supabase.co/functions/v1/send-registration-email"
SECRET_NAME = "REGISTRATION_EMAIL_WORKER_SECRET"
MAX_RESPONSE_BYTES = 4096


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def invoke(environ, opener=None):
    secret = environ.get(SECRET_NAME, "")
    if not 32 <= len(secret) <= 4000 or any(ord(c) < 33 or ord(c) > 126 for c in secret):
        return 1, "configuration_error: missing or invalid worker secret"

    request = urllib.request.Request(
        WORKER_URL,
        data=b'{"dry_run":false}',
        headers={"Authorization": "Bearer " + secret, "Content-Type": "application/json"},
        method="POST",
    )
    # Default HTTPS handler validates certificates. Do not print exceptions,
    # headers, bodies, URLs supplied by a response, or personal data.
    if opener is None:
        opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=90) as response:
            if response.status != 200:
                return 1, "http_error"
            raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            return 1, "invalid_response"
        result = json.loads(raw)
        if not isinstance(result, dict):
            return 1, "invalid_response"
        status = result.get("status")
        if status in ("sent", "no_job"):
            return 0, status
        if status == "not_authorized" and result.get("reason") == "dispatch_throttled":
            return 0, "dispatch_throttled: next tick will check again"
        if status == "failed":
            # HTTP 200 does not mean delivery succeeded. The outbox, not this
            # caller, decides whether and when the email may be retried.
            return 1, "worker_failed: inspect protected outbox diagnostics"
        if status == "reconciliation_required":
            return 1, "reconciliation_required: manual review required"
        return 1, "unexpected_worker_result"
    except urllib.error.HTTPError as error:
        error.close()
        return 1, "http_error: check worker configuration and protected diagnostics"
    except Exception:
        # A lost response can conceal a successful send. Never immediately retry.
        return 1, "request_or_response_error: no immediate retry; next tick will check again"


if __name__ == "__main__":
    code, message = invoke(os.environ)
    print(message)
    sys.exit(code)
