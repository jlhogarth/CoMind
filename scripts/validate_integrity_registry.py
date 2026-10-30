#!/usr/bin/env python3
"""Validate the canonical CoMind Implementation Integrity Registry."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REGISTRY_PATH = Path("config/integrity-registry.v1.json")
MATURITY = ("DEFINED", "SHADOW", "PROVEN", "ENFORCED", "GOVERNED")
DISPOSITIONS = {"candidate", "verified-risk", "accepted-pattern"}
FINGERPRINT_RE = re.compile(r"^[0-9a-f]{24}$")
CONTROL_RE = re.compile(r"^[A-Z]+[A-Z0-9]*-\d{3}$")


def validate(root: Path) -> list[str]:
    path = root / REGISTRY_PATH
    if not path.is_file():
        return [f"missing registry: {REGISTRY_PATH.as_posix()}"]
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"registry cannot be parsed: {exc}"]

    errors: list[str] = []
    if payload.get("schema_version") != 1:
        errors.append("schema_version must equal 1")
    if payload.get("registry_id") != "COMIND-IIC-REGISTRY":
        errors.append("registry_id must equal COMIND-IIC-REGISTRY")
    if payload.get("maturity_states") != list(MATURITY):
        errors.append("maturity_states must match the canonical ordered maturity model")
    if not str(payload.get("governing_invariant", "")).strip():
        errors.append("governing_invariant is required")

    defaults = payload.get("defaults")
    if not isinstance(defaults, dict):
        errors.append("defaults must be an object")
    else:
        semantics = defaults.get("classification_semantics")
        if not isinstance(semantics, dict) or not DISPOSITIONS.issubset(semantics):
            errors.append("defaults.classification_semantics must define candidate, verified-risk, accepted-pattern")
        for field in ("applicability", "exception_authority"):
            if not isinstance(defaults.get(field), str) or not defaults[field].strip():
                errors.append(f"defaults.{field} is required")
        evidence = defaults.get("evidence_requirements")
        if not isinstance(evidence, list) or not evidence or not all(isinstance(x, str) and x.strip() for x in evidence):
            errors.append("defaults.evidence_requirements must be a non-empty string list")

    implemented = payload.get("implemented_controls")
    defined = payload.get("defined_controls")
    if not isinstance(implemented, list) or not implemented:
        errors.append("implemented_controls must be a non-empty list")
        implemented = []
    if not isinstance(defined, list):
        errors.append("defined_controls must be a list")
        defined = []

    seen_ids: set[str] = set()
    state_by_id: dict[str, str] = {}
    detector_kind_by_id: dict[str, str] = {}

    def common(control: object, prefix: str) -> str | None:
        if not isinstance(control, dict):
            errors.append(f"{prefix} must be an object")
            return None
        cid = control.get("control_id")
        if not isinstance(cid, str) or not CONTROL_RE.fullmatch(cid):
            errors.append(f"{prefix}.control_id is invalid")
            return None
        if cid in seen_ids:
            errors.append(f"duplicate control_id: {cid}")
        seen_ids.add(cid)
        for field in ("name", "family", "definition"):
            if not isinstance(control.get(field), str) or not control[field].strip():
                errors.append(f"{cid}: {field} is required")
        return cid

    for index, control in enumerate(implemented):
        cid = common(control, f"implemented_controls[{index}]")
        if cid is None:
            continue
        state = control.get("maturity_state")
        if state not in {"SHADOW", "PROVEN", "ENFORCED", "GOVERNED"}:
            errors.append(f"{cid}: implemented control has invalid maturity_state {state!r}")
        else:
            state_by_id[cid] = state

        detector = control.get("detector")
        if not isinstance(detector, dict):
            errors.append(f"{cid}: detector must be an object")
            continue
        kind = detector.get("kind")
        if kind not in {"iic-engine", "external-checker"}:
            errors.append(f"{cid}: implemented detector kind is invalid: {kind!r}")
        else:
            detector_kind_by_id[cid] = kind
        paths = detector.get("paths")
        if not isinstance(paths, list) or not paths or not all(isinstance(x, str) and x for x in paths):
            errors.append(f"{cid}: implemented detector must declare repository paths")
            paths = []
        for repo_path in paths:
            if not (root / repo_path).is_file():
                errors.append(f"{cid}: detector path does not exist: {repo_path}")

        enforcement = control.get("enforcement")
        if not isinstance(enforcement, dict):
            errors.append(f"{cid}: enforcement must be an object")
        else:
            blocking = enforcement.get("blocking")
            if not isinstance(blocking, bool):
                errors.append(f"{cid}: enforcement.blocking must be boolean")
            if state == "ENFORCED" and blocking is not True:
                errors.append(f"{cid}: ENFORCED control must be blocking")
            if state in {"SHADOW", "PROVEN"} and blocking is True:
                errors.append(f"{cid}: {state} control must not claim blocking enforcement")
            if not isinstance(enforcement.get("basis"), str) or not enforcement["basis"].strip():
                errors.append(f"{cid}: enforcement.basis is required")

        history = control.get("promotion_history")
        if not isinstance(history, list) or not history:
            errors.append(f"{cid}: promotion_history must be non-empty")
        else:
            positions: list[int] = []
            for step_index, step in enumerate(history):
                if not isinstance(step, dict) or step.get("state") not in MATURITY:
                    errors.append(f"{cid}: invalid promotion_history step {step_index}")
                    continue
                if not isinstance(step.get("evidence"), str) or not step["evidence"].strip():
                    errors.append(f"{cid}: promotion_history step {step_index} requires evidence")
                positions.append(MATURITY.index(step["state"]))
            if positions and positions != sorted(positions):
                errors.append(f"{cid}: promotion_history cannot move backward")
            if history and isinstance(history[-1], dict) and history[-1].get("state") != state:
                errors.append(f"{cid}: maturity_state must equal final promotion_history state")

        last = control.get("last_accepted_verification")
        if not isinstance(last, str) or not last.strip():
            errors.append(f"{cid}: implemented control requires last_accepted_verification")

    for index, control in enumerate(defined):
        cid = common(control, f"defined_controls[{index}]")
        if cid is None:
            continue
        if control.get("maturity_state") != "DEFINED":
            errors.append(f"{cid}: defined control maturity_state must be DEFINED")
        state_by_id[cid] = "DEFINED"
        for field in {"detector", "enforcement", "promotion_history", "last_accepted_verification"}:
            if field in control:
                errors.append(f"{cid}: DEFINED-only control must not contain {field}")

    reviewed = payload.get("reviewed_findings")
    if not isinstance(reviewed, list):
        errors.append("reviewed_findings must be a list")
        reviewed = []
    seen_review: set[tuple[str, str]] = set()
    for index, record in enumerate(reviewed):
        prefix = f"reviewed_findings[{index}]"
        if not isinstance(record, dict):
            errors.append(f"{prefix} must be an object")
            continue
        cid = record.get("control_id")
        fp = record.get("fingerprint")
        if cid not in seen_ids:
            errors.append(f"{prefix}: unknown control_id {cid!r}")
        if not isinstance(fp, str) or not FINGERPRINT_RE.fullmatch(fp):
            errors.append(f"{prefix}: fingerprint must be 24 lowercase hex characters")
        else:
            key = (str(cid), fp)
            if key in seen_review:
                errors.append(f"{prefix}: duplicate reviewed finding {cid}/{fp}")
            seen_review.add(key)
        if record.get("disposition") not in DISPOSITIONS:
            errors.append(f"{prefix}: invalid disposition {record.get('disposition')!r}")
        for field in ("source_path", "target", "rationale", "evidence_source", "reconsideration_trigger"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                errors.append(f"{prefix}: {field} is required")
        if state_by_id.get(str(cid)) == "DEFINED":
            errors.append(f"{prefix}: DEFINED-only control cannot have reviewed runtime findings")

    if len(seen_ids) != 24:
        errors.append(f"registry must contain 24 unique cataloged controls; found {len(seen_ids)}")

    required = {"NPH-001": "ENFORCED", "NDT-001": "ENFORCED", "NFS-001": "PROVEN"}
    for cid, expected in required.items():
        if state_by_id.get(cid) != expected:
            errors.append(f"{cid}: registry must reflect current state {expected}")
    if detector_kind_by_id.get("NPH-001") != "external-checker":
        errors.append("NPH-001 must remain represented as the existing external checker")
    if detector_kind_by_id.get("NDT-001") != "iic-engine" or detector_kind_by_id.get("NFS-001") != "iic-engine":
        errors.append("NDT-001 and NFS-001 must be represented as IIC-engine controls")

    return errors


def main(argv: list[str] | None = None) -> int:
    root = Path(argv[0] if argv else ".").resolve()
    errors = validate(root)
    if errors:
        for error in errors:
            print(f"Integrity Registry violation: {error}", file=sys.stderr)
        return 1
    print("Integrity Registry: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
