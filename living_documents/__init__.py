"""Governed, on-demand representations for immutable source revisions."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

AUDIENCES = ("strategic", "technical", "public")
CLASSIFICATIONS = ("public", "internal", "confidential", "restricted")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


@dataclass(frozen=True)
class Reader:
    subject: str
    allowed_sources: frozenset[str]
    allowed_classes: frozenset[str]
    scope_revision: str


class LivingDocument:
    """A local L1 proof. Caller supplies a trusted reader from the existing auth layer."""

    def __init__(self, manifest: dict, root: Path):
        self.manifest = manifest
        self.root = root.resolve()
        self.cache: dict[str, dict] = {}
        self.events: list[dict] = []
        required = ("document_id", "family", "sources", "audiences", "classification",
                    "disclosure", "structure", "style_version", "template_version",
                    "policy_version", "renderers", "cache_policy", "freshness_policy",
                    "approval", "verification", "snapshot_policy")
        if any(field not in manifest for field in required):
            raise ValueError("incomplete_manifest")
        if manifest["classification"] not in CLASSIFICATIONS or not manifest["sources"]:
            raise ValueError("invalid_manifest")
        if any(a not in AUDIENCES for a in manifest["audiences"]):
            raise ValueError("invalid_audience")
        if "L1" not in manifest["renderers"]:
            raise ValueError("no_deterministic_renderer")

    def _authorize(self, reader: Reader, audience: str) -> None:
        m = self.manifest
        if (not reader.subject or not reader.scope_revision or
                audience not in m["audiences"] or
                m["classification"] not in reader.allowed_classes or
                any(s["id"] not in reader.allowed_sources for s in m["sources"]) or
                (audience == "public" and
                 (m["classification"] != "public" or
                  any(s["classification"] != "public" for s in m["sources"])))):
            self.events.append({"event": "authorization_rejected", "document_id": m["document_id"]})
            raise PermissionError("not_authorized")

    def _read(self) -> list[dict]:
        sources = []
        for source in self.manifest["sources"]:
            path = (self.root / source["path"]).resolve(strict=True)
            if not path.is_relative_to(self.root) or not path.is_file():
                raise ValueError("source_outside_root")
            content = path.read_bytes()
            if digest(content) != source["sha256"]:
                raise ValueError("source_revision_changed")
            excerpt = source["approved_excerpt"]
            if not excerpt or excerpt not in content.decode("utf-8"):
                raise ValueError("approved_excerpt_missing")
            sources.append({"id": source["id"], "revision": source["revision"],
                            "sha256": source["sha256"], "content": excerpt})
        return sources

    def render(self, reader: Reader, audience: str, *, depth: int = 1,
               language: str = "en", format: str = "md", preference: str = "standard") -> dict:
        self._authorize(reader, audience)  # Resolve permission before source read or cache lookup.
        if depth not in (1, 2, 3) or language != "en" or format != "md":
            raise ValueError("unsupported_representation")
        sources = self._read()  # Check revisions even for a cache hit.
        m = self.manifest
        key = digest(canonical({"document_id": m["document_id"], "source_revisions":
            [(s["id"], s["revision"], s["sha256"]) for s in sources],
            "audience": audience, "subject": reader.subject,
            "allowed_classes": sorted(reader.allowed_classes),
            "allowed_sources": sorted(reader.allowed_sources), "scope_revision": reader.scope_revision,
            "policy_version": m["policy_version"], "style_version": m["style_version"],
            "template_version": m["template_version"], "language": language,
            "depth": depth, "preference": preference, "format": format}))
        if key in self.cache:
            self.events.append({"event": "cache_hit", "key": key, "avoided_generation_usd": 0})
            return {**self.cache[key], "cache_hit": True}
        # Public manifests contain only separately reviewed public-safe sources. The L1
        # proof renders one approved passage without sending source bytes to a provider.
        passage = sources[0]["content"].split("\n\n", 1)[0].strip()
        headings = {"strategic": "Strategic and Intellectual",
                    "technical": "Technical and Operational",
                    "public": "Public and Informational"}
        detail = "\n\n## Source inspection\n" + "\n".join(
            f"- {s['id']} @ {s['revision']} (SHA-256: {s['sha256']})" for s in sources) if depth >= 2 else ""
        text = f"# {m['family']} | {headings[audience]}\n\n{passage}{detail}\n"
        result = {"document_id": m["document_id"], "audience": audience, "mode": "L1",
                  "content": text, "sha256": digest(text.encode()), "source_revisions":
                  [{k: s[k] for k in ("id", "revision", "sha256")} for s in sources],
                  "cache_key": key, "cache_hit": False, "verification": "deterministic_source_excerpt"}
        self.cache[key] = result
        self.events.append({"event": "cache_miss", "key": key, "provider_usage": None,
                            "gamma_credits": 0, "generation_usd": 0})
        return result

    def snapshot(self, reader: Reader, representation: dict, destination: Path) -> dict:
        self._authorize(reader, representation["audience"])
        cached = self.cache.get(representation["cache_key"])
        if not cached or any(cached.get(k) != representation.get(k) for k in
                             ("document_id", "audience", "content", "sha256", "source_revisions")):
            raise ValueError("unverified_representation")
        self._read()
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            raise FileExistsError(destination)
        payload = representation["content"].encode()
        with destination.open("xb") as stream:
            stream.write(payload)
        if digest(destination.read_bytes()) != representation["sha256"]:
            raise IOError("snapshot_readback_failed")
        receipt = {"document_id": representation["document_id"], "sha256": representation["sha256"],
                   "bytes": len(payload), "source_revisions": representation["source_revisions"],
                   "style_version": self.manifest["style_version"],
                   "template_version": self.manifest["template_version"],
                   "policy_version": self.manifest["policy_version"], "provider": "local_L1",
                   "verified_local_readback": True}
        self.events.append({"event": "snapshot_verified", "receipt": receipt})
        return receipt
