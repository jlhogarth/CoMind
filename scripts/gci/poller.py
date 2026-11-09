"""GCI-001: bounded, manual Gemini review session. No background scheduler.

The Google Doc is the durable delivery/claim ledger for this first implementation.
An orphaned claim is not automatically re-issued to avoid duplicate billable Gemini calls.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import quote

import requests
import google.auth
from google.auth.transport.requests import AuthorizedSession

DRIVE = "https://www.googleapis.com/drive/v3/files"
DOCS = "https://docs.googleapis.com/v1/documents"
GEMINI = "https://generativelanguage.googleapis.com/v1beta"
EXCHANGE = re.compile(
    r"\[COMIND_EXCHANGE_START id=([a-zA-Z0-9_-]{8,80}) role=(CHATGPT|GEMINI) session=([a-zA-Z0-9_-]{8,80})\]"
    r"\s*(.*?)\s*\[COMIND_EXCHANGE_COMPLETE id=\1\]", re.S
)
CLAIM = re.compile(r"\[COMIND_CLAIM id=([a-zA-Z0-9_-]{8,80}) session=([a-zA-Z0-9_-]{8,80})\]")
REPLY = re.compile(r"\[COMIND_REPLY parent=([a-zA-Z0-9_-]{8,80}) session=([a-zA-Z0-9_-]{8,80})\]")
ALLOWED_DOC = re.compile(r"^[a-zA-Z0-9_-]{10,160}$")
ALLOWED_MODEL = re.compile(r"^[a-zA-Z0-9_.-]{3,80}$")


def event(kind: str, **attrs: object) -> None:
    safe = {k: v for k, v in attrs.items() if k not in {"body", "secret", "key", "reply"}}
    print(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "event": kind, **safe}), flush=True)


@dataclass(frozen=True)
class Exchange:
    exchange_id: str
    session_id: str
    body: str

def eligible(content: str, session_id: str) -> list[Exchange]:
    claimed = {(match.group(1), match.group(2)) for match in CLAIM.finditer(content)}
    replied = {(match.group(1), match.group(2)) for match in REPLY.finditer(content)}
    found = []
    seen = set()
    for match in EXCHANGE.finditer(content):
        exchange_id, role, sid, body = match.groups()
        key = (exchange_id, sid)
        if sid != session_id or role != "CHATGPT" or key in claimed or key in replied or key in seen:
            continue
        if not body.strip() or len(body) > 100000:
            continue
        seen.add(key)
        found.append(Exchange(exchange_id, sid, body.strip()))
    return found


REGISTRY_PATH = pathlib.Path(__file__).resolve().parents[2] / "docs/integrations/gci-001-collaboration-registry.json"


def authorized_document(document_id: str, session_id: str) -> tuple[bool, str]:
    """Fail closed unless a test dispatch is explicitly registered.

    Legacy CM-XAI and governance documents remain inventory/read-only.
    No historic turn is replayed into a billable Gemini invocation.
    """
    try:
        register = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        matches = [entry for entry in register["entries"] if entry["document_id"] == document_id]
        if len(matches) != 1:
            return False, "document_not_uniquely_registered"
        entry = matches[0]
        if entry["mode"] != "test_dispatch_allowed" or entry["protocol"] != "COMIND-v1":
            return False, "document_not_authorized_for_automatic_invocation"
        if not entry.get("auto_invoke_gemini") or entry.get("session_id") != session_id:
            return False, "document_session_not_authorized"
        return True, "registered_test_document"
    except (OSError, KeyError, ValueError, TypeError):
        return False, "document_registry_unavailable"


def google_session() -> AuthorizedSession:
    """Use GitHub OIDC federated Application Default Credentials, not JSON keys."""
    credentials, _ = google.auth.default(scopes=[
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/documents",
    ])
    return AuthorizedSession(credentials)


def checked(response: requests.Response) -> requests.Response:
    response.raise_for_status()
    return response


def metadata(client: AuthorizedSession, doc_id: str) -> dict:
    return checked(client.get(f"{DRIVE}/{quote(doc_id, safe='')}", params={
        "fields": "id,name,mimeType,version,modifiedTime",
    }, timeout=20)).json()


def export(client: AuthorizedSession, doc_id: str) -> tuple[str, str]:
    for mime in ("text/markdown", "text/plain"):
        response = client.get(f"{DRIVE}/{quote(doc_id, safe='')}/export",
                              params={"mimeType": mime}, timeout=40)
        if response.ok:
            if len(response.content) > 9_000_000:
                raise ValueError("Export exceeds configured safe size")
            return response.content.decode("utf-8"), mime
        if mime == "text/plain":
            response.raise_for_status()
    raise RuntimeError("Unable to export document")


def append(client: AuthorizedSession, doc_id: str, payload: str) -> None:
    checked(client.post(f"{DOCS}/{quote(doc_id, safe='')}:batchUpdate",
        json={"requests": [{"insertText": {
            "endOfSegmentLocation": {},
            "text": "\n" + payload + "\n"
        }}]}, timeout=40))


def ask_gemini(key: str, model: str, prompt: str) -> tuple[str, dict]:
    response = requests.post(
        f"{GEMINI}/models/{model}:generateContent",
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        json={"contents": [{"role": "user", "parts": [{"text": prompt}]}],
              "generationConfig": {"maxOutputTokens": 2048}},
        timeout=120,
    )
    checked(response)
    result = response.json()
    parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    answer = "\n".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()
    if not answer:
        raise ValueError("Gemini returned no text; claim preserved for operator reconciliation")
    return answer, result.get("usageMetadata", {})


def run(args: argparse.Namespace) -> int:
    if not ALLOWED_DOC.fullmatch(args.document_id):
        raise ValueError("Invalid Google Doc ID")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{8,80}", args.session_id):
        raise ValueError("Invalid session ID")
    if not ALLOWED_MODEL.fullmatch(args.model):
        raise ValueError("Invalid model ID")
    if not (5 <= args.interval <= 120 and 30 <= args.idle <= 3600 and args.idle <= args.maximum <= 7200):
        raise ValueError("Unsafe timeouts")
    if os.environ.get("GCI_ENABLE_LIVE", "false").lower() != "true":
        event("disabled", reason="GCI_ENABLE_LIVE not true")
        return 0
    allowed, gate_reason = authorized_document(args.document_id, args.session_id)
    if not allowed:
        event("rejected", reason=gate_reason)
        return 5
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key or not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        event("failed", reason="Gemini key or OIDC credentials file unavailable")
        return 2
    client = google_session()
    start = last_activity = time.monotonic()
    last_version = None
    checks = exports = invocations = 0
    event("started", session=args.session_id, doc=args.document_id, model=args.model)
    while time.monotonic() - start < args.maximum:
        now = time.monotonic()
        if now - last_activity >= args.idle:
            event("idle_stopped", checks=checks, exports=exports, calls=invocations)
            return 0
        try:
            md = metadata(client, args.document_id)
            checks += 1
            if md.get("mimeType") != "application/vnd.google-apps.document":
                raise ValueError("Only native Google Docs supported")
            version = md.get("version") or md.get("modifiedTime")
            if version != last_version:
                content, mime = export(client, args.document_id)
                exports += 1
                last_version = version
                event("changed", version=version, format=mime, sha256=hashlib.sha256(content.encode()).hexdigest())
                pending = eligible(content, args.session_id)
                for msg in pending[:20]:
                    # Append a durable claim BEFORE calling Gemini. Orphaned claims are
                    # intentionally not retried automatically: billable retries need review.
                    append(client, args.document_id,
                           f"[COMIND_CLAIM id={msg.exchange_id} session={args.session_id}]")
                    last_activity = time.monotonic()
                    event("claimed", exchange=msg.exchange_id)
                    try:
                        answer, usage = ask_gemini(api_key, args.model, msg.body)
                        invocations += 1
                        digest = hashlib.sha256(answer.encode()).hexdigest()
                        reply = (f"[COMIND_REPLY parent={msg.exchange_id} session={args.session_id}]\n"
                                 f"[COMIND_EXCHANGE_START id=g_{msg.exchange_id} role=GEMINI session={args.session_id}]\n"
                                 f"{answer}\n[COMIND_EXCHANGE_COMPLETE id=g_{msg.exchange_id}]")
                        append(client, args.document_id, reply)
                        event("delivered", exchange=msg.exchange_id, sha256=digest, usage=usage)
                        last_activity = time.monotonic()
                    except Exception as exc:
                        event("processing_failed", exchange=msg.exchange_id, reason=type(exc).__name__)
                        # Fail closed and leave claim for manual readback.
                        return 3
                # Document modification by our own claims/replies will be inspected next
                # iteration; Gemini-origin messages are deliberately ineligible.
        except (requests.RequestException, ValueError) as exc:
            event("monitor_failed", reason=type(exc).__name__)
            return 4
        remaining = min(args.interval, args.maximum - (time.monotonic() - start),
                        args.idle - (time.monotonic() - last_activity))
        if remaining > 0:
            time.sleep(remaining)
    event("max_duration_stopped", checks=checks, exports=exports, calls=invocations)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--document-id", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--model", default="gemini-3.5-flash-lite")
    parser.add_argument("--interval", type=int, default=15)
    parser.add_argument("--idle", type=int, default=240)
    parser.add_argument("--maximum", type=int, default=1800)
    return run(parser.parse_args())


if __name__ == "__main__":
    sys.exit(main())
