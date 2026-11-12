"""GCI-001 isolated Test poller. A revision-checked claim precedes inference."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import quote

import google.auth
import requests
from google.auth.transport.requests import AuthorizedSession

DRIVE = "https://www.googleapis.com/drive/v3"
DOCS = "https://docs.googleapis.com/v1/documents"
GEMINI = "https://generativelanguage.googleapis.com/v1beta"
MODEL = "gemini-3.5-flash-lite"
IDENTIFIER = r"[a-zA-Z0-9_-]{8,80}"
START = re.compile(
    rf"\[COMIND_EXCHANGE_START id=({IDENTIFIER}) role=(CHATGPT|GEMINI) "
    rf"session=({IDENTIFIER})(?: parent_exchange_id=({IDENTIFIER}))?\]"
)
COMPLETE = re.compile(
    rf"\[COMIND_EXCHANGE_COMPLETE id=({IDENTIFIER})(?: sha256=([0-9a-f]{{64}}))?\]"
)
CLAIM = re.compile(rf"^\[COMIND_CLAIM id=({IDENTIFIER}) session=({IDENTIFIER})\]$", re.M)
REPLY = re.compile(rf"^\[COMIND_REPLY parent=({IDENTIFIER}) session=({IDENTIFIER})\]$", re.M)
REGISTRY_PATH = pathlib.Path(__file__).resolve().parents[2] / "docs/integrations/gci-001-collaboration-registry.json"


def sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def event(kind: str, **attrs: object) -> None:
    print(json.dumps({
        "at": datetime.now(timezone.utc).isoformat(),
        "event": kind,
        "run_id": os.environ.get("GITHUB_RUN_ID"),
        **attrs,
    }), flush=True)


@dataclass(frozen=True)
class Exchange:
    exchange_id: str
    session_id: str
    body: str


def eligible(content: str, session_id: str) -> list[Exchange]:
    unavailable = {match.groups() for marker in (CLAIM, REPLY) for match in marker.finditer(content)}
    seen = set()
    found = {}
    start = None
    body_lines = []
    for line in content.split("\n"):
        if line.startswith("[COMIND_EXCHANGE_START"):
            start = START.fullmatch(line)
            body_lines = []
        elif line.startswith("[COMIND_EXCHANGE_COMPLETE"):
            complete = COMPLETE.fullmatch(line)
            if start and complete and start[1] == complete[1] and start[3] == session_id:
                exchange_id, role, _, parent = start.groups()
                body = "\n".join(body_lines).strip()
                if exchange_id in seen:
                    found.pop(exchange_id, None)
                elif (role == "CHATGPT" and parent is None and
                      (exchange_id, session_id) not in unavailable and
                      0 < len(body.encode("utf-8")) <= 2048 and
                      (complete[2] is None or complete[2] == sha256(body))):
                    found[exchange_id] = Exchange(exchange_id, session_id, body)
                seen.add(exchange_id)
            start = None
        elif line.startswith("[COMIND_"):
            start = None
        elif start:
            body_lines.append(line)
    return list(found.values())


def authorized_document(document_id: str, session_id: str) -> tuple[dict | None, str]:
    """Only a registered synthetic exchange may be sent for Test inference."""
    try:
        register = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
        matches = [entry for entry in register["entries"] if entry["document_id"] == document_id]
        if len(matches) != 1:
            return None, "document_not_uniquely_registered"
        entry = matches[0]
        if entry["mode"] != "test_dispatch_allowed" or entry["protocol"] != "COMIND-v1":
            return None, "document_not_authorized_for_automatic_invocation"
        if entry.get("auto_invoke_gemini") is not True or entry.get("session_id") != session_id:
            return None, "document_session_not_authorized"
        if not re.fullmatch(IDENTIFIER, entry["exchange_id"]) or not re.fullmatch(r"[0-9a-f]{64}", entry["payload_sha256"]):
            return None, "exchange_authorization_unavailable"
        return entry, "registered_test_exchange"
    except (OSError, KeyError, ValueError, TypeError):
        return None, "document_registry_unavailable"


def google_session() -> AuthorizedSession:
    credentials, _ = google.auth.default(scopes=[
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/documents",
    ])
    return AuthorizedSession(credentials)


def checked(response: requests.Response) -> requests.Response:
    response.raise_for_status()
    return response


def verify_identity(client: AuthorizedSession, expected_email: str) -> None:
    info = checked(client.get(f"{DRIVE}/about", params={"fields": "user(emailAddress)"}, timeout=20)).json()
    if not expected_email or info.get("user", {}).get("emailAddress") != expected_email:
        raise ValueError("Unexpected Drive identity")
    event("google_identity_verified")


def verify_document_access(client: AuthorizedSession, doc_id: str) -> None:
    result = checked(client.get(f"{DRIVE}/files", params={
        "q": "trashed = false", "spaces": "drive", "corpora": "user",
        "includeItemsFromAllDrives": "true", "supportsAllDrives": "true",
        "fields": "nextPageToken,incompleteSearch,files(id)", "pageSize": 100,
    }, timeout=20)).json()
    if (result.get("nextPageToken") or result.get("incompleteSearch") or
            {item["id"] for item in result.get("files", [])} != {doc_id}):
        raise ValueError("Service account Drive inventory differs from isolated test scope")
    event("google_document_scope_verified", document=doc_id)


def metadata(client: AuthorizedSession, doc_id: str) -> dict:
    return checked(client.get(f"{DRIVE}/files/{quote(doc_id, safe='')}", params={
        "fields": "id,mimeType,version",
    }, timeout=20)).json()


def snapshot(client: AuthorizedSession, doc_id: str) -> tuple[str, str]:
    doc = checked(client.get(f"{DOCS}/{quote(doc_id, safe='')}", params={
        "fields": "documentId,revisionId,body(content)",
    }, timeout=20)).json()
    revision = doc.get("revisionId")
    if doc.get("documentId") != doc_id or not revision:
        raise ValueError("Unexpected document identity or unavailable writable revision")
    text = []
    for element in doc["body"]["content"]:
        if "sectionBreak" in element:
            continue
        if "paragraph" not in element:
            raise ValueError("The isolated document must contain only paragraphs")
        for part in element["paragraph"]["elements"]:
            text.append(part["textRun"]["content"])
    content = "".join(text)
    if len(content.encode("utf-8")) > 1_000_000:
        raise ValueError("Isolated document exceeds the configured size limit")
    return content, revision


def append(client: AuthorizedSession, doc_id: str, revision: str, payload: str) -> str:
    result = checked(client.post(f"{DOCS}/{quote(doc_id, safe='')}:batchUpdate", json={
        "writeControl": {"requiredRevisionId": revision},
        "requests": [{"insertText": {"endOfSegmentLocation": {}, "text": "\n" + payload + "\n"}}],
    }, timeout=20)).json()
    return result["writeControl"]["requiredRevisionId"]


def verified_reply(content: str, marker: str, exchange_id: str, session_id: str) -> str | None:
    lines = content.split("\n")
    if lines.count(marker) != 1:
        return None
    reply_id = "g_" + sha256(exchange_id)
    start = lines.index(marker) + 1
    header = START.fullmatch(lines[start]) if start < len(lines) else None
    if not header or header.groups() != (reply_id, "GEMINI", session_id, exchange_id):
        return None
    body_lines = []
    for line in lines[start + 1:]:
        if line.startswith("[COMIND_"):
            complete = COMPLETE.fullmatch(line)
            digest = sha256("\n".join(body_lines))
            return digest if body_lines and complete and complete.groups() == (reply_id, digest) else None
        body_lines.append(line)
    return None


def verify_model(key: str, model: str) -> None:
    info = checked(requests.get(f"{GEMINI}/models/{model}", headers={"x-goog-api-key": key},
                                timeout=15, allow_redirects=False)).json()
    if "generateContent" not in info.get("supportedGenerationMethods", []):
        raise ValueError("Selected Gemini model cannot generate content")


def ask_gemini(key: str, model: str, prompt: str) -> tuple[str, dict]:
    response = requests.post(
        f"{GEMINI}/models/{model}:generateContent",
        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
        json={"contents": [{"role": "user", "parts": [{"text": prompt}]}],
              "generationConfig": {"maxOutputTokens": 512}},
        timeout=45, allow_redirects=False,
    )
    result = checked(response).json()
    candidates = result.get("candidates") or []
    if not candidates or candidates[0].get("finishReason") != "STOP":
        raise ValueError("Gemini did not return a complete answer")
    parts = candidates[0].get("content", {}).get("parts", [])
    answer = "\n".join(p["text"] for p in parts if "text" in p and not p.get("thought")).strip()
    if not answer or "[COMIND_" in answer or any(ord(c) < 32 and c not in "\n\t" for c in answer):
        raise ValueError("Gemini returned unsafe or empty reply text")
    evidence = {k: result[k] for k in ("responseId", "modelVersion", "usageMetadata") if k in result}
    return answer, evidence


def run(args: argparse.Namespace) -> int:
    if os.environ.get("GCI_ENABLE_LIVE", "false").lower() != "true":
        event("disabled")
        return 0
    if args.model != MODEL or not (5 <= args.interval <= 120 and 30 <= args.idle <= args.maximum <= 1800):
        event("rejected", reason="model_or_timing_outside_test_policy")
        return 5
    authorization, gate_reason = authorized_document(args.document_id, args.session_id)
    if not authorization:
        event("rejected", reason=gate_reason)
        return 5
    exchange_id = authorization["exchange_id"]
    key = os.environ.get("GEMINI_API_KEY")
    expected_email = os.environ.get("GCI_SERVICE_ACCOUNT_EMAIL")
    if not (key and expected_email and os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")):
        event("failed", reason="gemini_key_or_google_federation_unavailable")
        return 2

    start = last_activity = time.monotonic()
    last_version = None
    checks = calls = 0
    claimed = False
    stage = "google_authentication"
    context = {"document": args.document_id, "session": args.session_id,
               "exchange": exchange_id, "model": args.model}
    event("started", **context, preflight=args.preflight)
    try:
        client = google_session()
        verify_identity(client, expected_email)
        stage = "google_document_scope"
        verify_document_access(client, args.document_id)
        while True:
            now = time.monotonic()
            if now - last_activity >= args.idle:
                event("idle_stopped", **context, checks=checks, calls=calls,
                      idle_seconds=round(now - last_activity, 3), elapsed_seconds=round(now - start, 3))
                return 0
            if now - start >= args.maximum:
                event("max_duration_stopped", **context, checks=checks, calls=calls,
                      elapsed_seconds=round(now - start, 3))
                return 0
            stage = "drive_metadata"
            md = metadata(client, args.document_id)
            checks += 1
            if md.get("id") != args.document_id or md.get("mimeType") != "application/vnd.google-apps.document":
                raise ValueError("Unexpected Drive file")
            version = md["version"]
            if version != last_version:
                stage = "docs_read"
                content, revision = snapshot(client, args.document_id)
                last_version = version
                event("document_read", **context, version=version, revision=revision, sha256=sha256(content))
                claim = f"[COMIND_CLAIM id={exchange_id} session={args.session_id}]"
                marker = f"[COMIND_REPLY parent={exchange_id} session={args.session_id}]"
                lines = content.splitlines()
                if claim in lines or marker in lines:
                    digest = verified_reply(content, marker, exchange_id, args.session_id)
                    if lines.count(claim) != 1 or digest is None:
                        event("orphaned_or_invalid_receipt", **context, calls=calls)
                        return 7
                    event("existing_reply_verified", **context, calls=calls, sha256=digest, revision=revision)
                    if args.preflight:
                        return 0
                pending = [msg for msg in eligible(content, args.session_id)
                           if msg.exchange_id == exchange_id and sha256(msg.body) == authorization["payload_sha256"]]
                if args.preflight:
                    if pending:
                        stage = "gemini_model_metadata"
                        verify_model(key, args.model)
                    event("preflight_completed", **context, eligible=len(pending), calls=0)
                    return 0 if pending else 5
                if pending and not calls:
                    stage = "gemini_model_metadata"
                    verify_model(key, args.model)
                    if time.monotonic() - start >= args.maximum:
                        continue
                    stage = "claim_write"
                    claim_revision = append(client, args.document_id, revision, claim)
                    claimed = True
                    last_activity = time.monotonic()
                    event("claimed", **context, revision=claim_revision,
                          payload_sha256=authorization["payload_sha256"])
                    if time.monotonic() - start >= args.maximum:
                        event("deadline_after_claim", **context, calls=calls)
                        return 7
                    stage = "gemini_generation"
                    calls += 1
                    event("gemini_request_attempted", **context, calls=calls)
                    answer, provider_evidence = ask_gemini(key, args.model, pending[0].body)
                    digest = sha256(answer)
                    event("gemini_response_received", **context, calls=calls, sha256=digest, **provider_evidence)
                    reply_id = "g_" + sha256(exchange_id)
                    reply = (f"{marker}\n"
                             f"[COMIND_EXCHANGE_START id={reply_id} role=GEMINI session={args.session_id} "
                             f"parent_exchange_id={exchange_id}]\n"
                             f"{answer}\n[COMIND_EXCHANGE_COMPLETE id={reply_id} sha256={digest}]")
                    stage = "reply_write"
                    append(client, args.document_id, claim_revision, reply)
                    stage = "reply_readback"
                    verified_content, verified_revision = snapshot(client, args.document_id)
                    if verified_reply(verified_content, marker, exchange_id, args.session_id) != digest:
                        event("delivery_unverified", **context, calls=calls)
                        return 6
                    event("delivered", **context, calls=calls, sha256=digest, revision=verified_revision)
                    last_activity = time.monotonic()
            remaining = min(args.interval, args.maximum - (time.monotonic() - start),
                            args.idle - (time.monotonic() - last_activity))
            if remaining > 0:
                time.sleep(remaining)
    except KeyboardInterrupt:
        event("cancelled", **context, stage=stage, calls=calls, claimed=claimed,
              elapsed_seconds=round(time.monotonic() - start, 3))
        return 130
    except (requests.RequestException, google.auth.exceptions.GoogleAuthError, KeyError, TypeError, ValueError) as exc:
        response = getattr(exc, "response", None)
        event("failed", **context, stage=stage, reason=type(exc).__name__,
              http_status=response.status_code if response is not None else None, calls=calls,
              claimed=claimed, elapsed_seconds=round(time.monotonic() - start, 3))
        return 3 if claimed or stage == "claim_write" else 4


def cancel(_signum: int, _frame: object) -> None:
    raise KeyboardInterrupt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--document-id", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--generate", dest="preflight", action="store_false")
    parser.add_argument("--interval", type=int, default=15)
    parser.add_argument("--idle", type=int, default=240)
    parser.add_argument("--maximum", type=int, default=1800)
    signal.signal(signal.SIGTERM, cancel)
    return run(parser.parse_args())


if __name__ == "__main__":
    sys.exit(main())
