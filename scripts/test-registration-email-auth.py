"""Manual authentication probe. Hardcoded dry-run; never prints server data."""
import json
import os
import sys
import urllib.error
import urllib.request

WORKER_URL = "https://xauxotzqlrylhrjababc.supabase.co/functions/v1/send-registration-email"
SECRET_NAME = "REGISTRATION_EMAIL_WORKER_SECRET"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def authenticate(environ, opener=None):
    secret = environ.get(SECRET_NAME, "")
    if not 32 <= len(secret) <= 4000 or any(ord(c) < 33 or ord(c) > 126 for c in secret):
        return 1, "FAIL: worker secret is missing or malformed."
    try:
        # No mode, URL, recipient, or outbox override is accepted.
        request = urllib.request.Request(
            WORKER_URL,
            data=b'{"dry_run":true}',
            headers={"Authorization": "Bearer " + secret, "Content-Type": "application/json"},
            method="POST",
        )
        if opener is None:
            opener = urllib.request.build_opener(NoRedirect())
        with opener.open(request, timeout=90) as response:
            if response.status != 200:
                return 1, "FAIL: worker did not confirm a successful dry-run."
            raw = response.read(4097)
        if len(raw) > 4096:
            return 1, "FAIL: invalid worker response."
        result = json.loads(raw)
        if (
            isinstance(result, dict)
            and result.get("dry_run") is True
            and result.get("status") in ("no_job", "preview")
        ):
            return 0, "PASS: authentication accepted; worker confirmed dry-run."
        return 1, "FAIL: worker did not confirm a successful dry-run."
    except urllib.error.HTTPError as error:
        rejected = error.code in (401, 403)
        error.close()
        return 1, ("FAIL: authentication rejected." if rejected else "FAIL: worker request failed.")
    except Exception:
        # Never print exception details, headers, body, identifiers or preview data.
        return 1, "FAIL: connection or response validation failed."


if __name__ == "__main__":
    code, message = authenticate(os.environ)
    print(message)
    sys.exit(code)
