"""Format registry and verifiable document publication receipts."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

REGISTRY = Path(__file__).with_name("registry.json")
REQUIRED = frozenset("docx pdf pptx xlsx csv svg png jpg jpeg md html".split())
DIGEST = re.compile(r"[0-9a-f]{64}")


def registry():
    data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("schema_version") != "1.0.0":
        raise ValueError("Unsupported format registry schema")
    formats = data.get("formats")
    if not isinstance(formats, dict) or not REQUIRED <= formats.keys():
        raise ValueError("Missing required document formats")
    for ext, item in formats.items():
        if (
            not isinstance(item, dict)
            or item.get("extension") != ext
            or not isinstance(item.get("editable"), bool)
            or "google_native" not in item
            or (item["google_native"] is not None and not isinstance(item["google_native"], str))
            or not all(isinstance(item.get(key), str) and item[key].strip()
                       for key in ("mime", "conversion", "conversion_warning", "publishing"))
            or not isinstance(item.get("validation"), list)
            or not item["validation"]
            or not all(isinstance(check, str) and check.strip() for check in item["validation"])
        ):
            raise ValueError(f"Malformed registry entry: {ext}")
    return formats


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def build_manifest(document_id, version, sources, artifacts, classification="internal",
                   destinations=None, *, title=None, generated_at=None, engine=None,
                   development=None, editable_sources=None, validation=None, cost=None):
    paths = tuple(map(Path, artifacts))
    if not document_id or not version or not paths:
        raise ValueError("document_id, version, and artifacts are required")
    if len({p.name for p in paths}) != len(paths):
        raise ValueError("Duplicate artifact names")
    formats = registry()
    entries = {}
    for path in paths:
        extension = path.suffix.lower().lstrip(".")
        if extension not in formats:
            raise ValueError(f"Unsupported format: {extension}")
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"Missing or empty artifact: {path}")
        checks = (validation or {}).get(path.name, [])
        entries[path.name] = {
            "name": path.name,
            "format": extension,
            "mime": formats[extension]["mime"],
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
            "editable": formats[extension]["editable"],
            "editable_source": None,
            "validation": {"status": "pending", "evidence": checks},
            "drive": None,
        }
    for derivative, source in (editable_sources or {}).items():
        if (derivative not in entries or source not in entries or derivative == source
                or not entries[source]["editable"]):
            raise ValueError("Invalid editable-source relationship")
        entries[derivative]["editable_source"] = source
    for item in entries.values():
        checks = item["validation"]["evidence"]
        if any(check["status"] == "FAIL" for check in checks):
            item["validation"]["status"] = "failed"
        elif checks and all(check["status"] == "PASS" for check in checks):
            item["validation"]["status"] = "passed"
    return {
        "schema_version": "1.1.0",
        "document_id": document_id,
        "version": version,
        "title": title,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "generated_utc": generated_at,
        "generation_engine": engine,
        "classification": classification,
        "sources": sources,
        "artifacts": list(entries.values()),
        "destinations": destinations or [],
        "development": development or {"issue": None, "commit": None, "pr": None},
        "approval": {"state": "test-only", "production_authorized": False},
        "cost": cost or {"amount": None, "currency": None},
        "publication": {"status": "pending"},
    }


def verify_manifest(manifest, directory):
    """Verify listed bytes for both the original and current schema."""
    try:
        if manifest["schema_version"] not in {"1.0.0", "1.1.0"}:
            return False
        entries = manifest["artifacts"]
        if not isinstance(entries, list) or not entries:
            return False
        base = Path(directory).resolve(strict=True)
        seen = set()
        for item in entries:
            name = item["name"]
            if (not isinstance(name, str) or name in {"", ".", ".."} or "/" in name
                    or "\\" in name or name in seen or not DIGEST.fullmatch(item["sha256"])):
                return False
            seen.add(name)
            path = base / name
            if (path.is_symlink() or not path.is_file() or type(item["bytes"]) is not int
                    or item["bytes"] <= 0 or path.stat().st_size != item["bytes"]
                    or sha256(path) != item["sha256"]):
                return False
    except (KeyError, TypeError, ValueError, OSError):
        return False
    return True


def verify_publication(manifest, receipts, directory):
    """Record publication only after metadata and authenticated readback match."""
    manifest["publication"] = {"status": "failed"}
    entries = manifest["artifacts"]
    for item in entries:
        item["drive"] = None
    if not verify_manifest(manifest, directory):
        return False
    destination_ids = {d["folder_id"] for d in manifest["destinations"]}
    if set(receipts) != {item["name"] for item in entries}:
        return False
    file_ids = set()
    for item in entries:
        receipt = receipts[item["name"]]
        file_id = receipt.get("file_id")
        if (not isinstance(file_id, str) or not file_id.strip() or file_id in file_ids
                or not receipt.get("folder_id") or receipt["folder_id"] not in destination_ids
                or receipt.get("mime") != item["mime"]
                or receipt.get("bytes") != item["bytes"]
                or receipt.get("authenticated") is not True
                or item["validation"]["status"] != "passed"
                or not receipt.get("retrieved_utc")):
            return False
        file_ids.add(file_id)
    for item in entries:
        item["drive"] = {**receipts[item["name"]], "readback_sha256": item["sha256"]}
    manifest["publication"] = {"status": "verified", "environment": "Test"}
    return True
