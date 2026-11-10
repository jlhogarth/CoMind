"""DFG-001: deterministic, dependency-free artifact provenance and format validation."""
from __future__ import annotations
import hashlib
import json
import mimetypes
from datetime import datetime, timezone
from pathlib import Path

REGISTRY = Path(__file__).with_name("registry.json")

def registry():
    data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    assert data["schema_version"] == "1.0.0"
    return data["formats"]

def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def build_manifest(document_id, version, sources, artifacts, classification="internal", destinations=None):
    if not document_id or not version or not artifacts:
        raise ValueError("document_id, version, and artifacts are required")
    formats = registry()
    entries = []
    for path in artifacts:
        p = Path(path)
        extension = p.suffix.lower().lstrip(".")
        if extension not in formats:
            raise ValueError(f"Unsupported format: {extension}")
        if not p.is_file() or p.stat().st_size == 0:
            raise ValueError(f"Missing or empty artifact: {p}")
        entries.append({"name": p.name, "format": extension, "mime": formats[extension]["mime"],
                        "sha256": sha256(p), "bytes": p.stat().st_size, "editable": formats[extension]["editable"],
                        "validation": "byte-integrity-only"})
    return {"schema_version": "1.0.0", "document_id": document_id, "version": version,
            "created_utc": datetime.now(timezone.utc).isoformat(), "classification": classification,
            "sources": sources, "artifacts": entries, "destinations": destinations or [],
            "approval": {"production_authorized": False}, "cost": {"amount": None, "currency": None}}

def verify_manifest(manifest, directory):
    for item in manifest["artifacts"]:
        path = Path(directory) / item["name"]
        if not path.is_file() or sha256(path) != item["sha256"]:
            return False
    return True
