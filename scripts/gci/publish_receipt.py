"""Post a sanitized GCI-001 run receipt to the existing draft PR.

Only runner-generated JSONL events are summarized. The Google Doc and model
response remain in the restricted document and are never copied to GitHub.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import urllib.request

REPOSITORY = "jlhogarth/CoMind"
PR_NUMBER = 545
TERMINAL = {
    "preflight_completed", "existing_reply_verified", "idle_stopped",
    "max_duration_stopped", "orphaned_or_invalid_receipt", "delivery_unverified",
    "cancelled", "failed", "rejected", "disabled", "deadline_after_claim",
}
HEX = re.compile(r"[0-9a-f]{64}\Z")


def summarize(records: list[dict], run_id: str) -> str | None:
    records = [r for r in records if r.get("run_id") == run_id]
    started = next((r for r in records if r.get("event") == "started"), None)
    terminal = next((r for r in reversed(records) if r.get("event") in TERMINAL), None)
    if not started or not terminal:
        return None
    delivered = next((r for r in reversed(records) if r.get("event") == "delivered"), None)
    digest = delivered.get("sha256") if delivered else None
    if digest is not None and (not isinstance(digest, str) or not HEX.fullmatch(digest)):
        raise ValueError("Invalid reply digest")
    events = {r.get("event") for r in records}
    calls = max((r.get("calls", 0) for r in records if type(r.get("calls")) is int), default=0)
    lines = [
        "<!-- GCI-001-RETURN -->",
        "### GCI-001 Test run receipt",
        f"Run: https://github.com/{REPOSITORY}/actions/runs/{run_id}",
        f"Session: `{started['session']}` · Exchange: `{started['exchange']}`",
        f"Terminal event: `{terminal['event']}` · Gemini attempts: `{calls}`",
        f"Delivery event: `{'recorded' if delivered else 'absent'}`",
        f"Reply SHA-256: `{digest or 'not recorded'}`",
        f"Read-only preflight: `{'yes' if started.get('preflight') else 'no'}`",
        f"Observed event names: `{', '.join(sorted(str(e) for e in events if e))}`",
        "",
        "This public receipt contains no prompt or reply text. A Work return must independently read the restricted Doc, verify its reply digest and claim count, then classify failures or ambiguous attempts without repeating inference.",
    ]
    return "\n".join(lines)


def main() -> int:
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    path = pathlib.Path(os.environ.get("GCI_EVIDENCE_FILE", ""))
    if (not run_id.isdecimal() or os.environ.get("GITHUB_REPOSITORY") != REPOSITORY
            or not token or not path.is_file()):
        print("receipt_skipped: missing scoped runner context", flush=True)
        return 0
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
    body = summarize(records, run_id)
    if body is None:
        print("receipt_skipped: no complete runner event sequence", flush=True)
        return 0
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPOSITORY}/issues/{PR_NUMBER}/comments",
        data=json.dumps({"body": body}).encode("utf-8"),
        headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}",
                 "Content-Type": "application/json", "User-Agent": "CoMind-GCI-001"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 201:
            raise RuntimeError("Receipt comment not accepted")
    print("receipt_published: sanitized PR comment", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
