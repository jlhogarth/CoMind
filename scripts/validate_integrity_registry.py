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

    controls = payload.get("controls")
    if not isinstance(controls, list) or not controls:
        errors.append("controls must be a non-empty list")
        controls = []

    seen_ids: set[str] = set()
    state_by_id: dict[str, str] = {}
    detector_kind_by_id: dict[str, str] = {}
    for index, control in enumerate(controls):
        prefix = f"controls[{index}]"
        if not isinstance(control, dict):
            errors.append(f"{prefix} must be an object")
            continue
        control_id = control.get("control_id")
        if not isinstance(control_id, str) or not CONTROL_RE.fullmatch(control_id):
            errors.append(f"{prefix}.control_id is invalid")
            continue
        if control_id in seen_ids:
            errors.append(f"duplicate control_id: {control_id}")
        seen_ids.add(control_id)
        state = control.get("maturity_state")
        if state not in MATURITY:
            errors.append(f"{control_id}: invalid maturity_state {state!r}")
        else:
            state_by_id[control_id] = state

        for field in ("name", "family", "definition", "applicability", "exception_authority"):
            if not isinstance(control.get(field), str) or not control[field].strip():
                errors.append(f"{control_id}: {field} is required")

        detector = control.get("detector")
        if not isinstance(detector, dict):
            errors.append(f"{control_id}: detector must be an object")
            continue
        kind = detector.get("kind")
        if kind not in {"none", "iic-engine", "external-checker"}:
            errors.append(f"{control_id}: invalid detector kind {kind!r}")
        else:
            detector_kind_by_id[control_id] = kind
        paths = detector.get("paths")
        if not isinstance(paths, list) or not all(isinstance(item, str) and item for item in paths):
            errors.append(f"{control_id}: detector.paths must be a list of non-empty strings")
            paths = []
        if state != "DEFINED" and kind == "none":
            errors.append(f"{control_id}: non-DEFINED control cannot have detector kind none")
        if state == "DEFINED" and kind != "none":
            errors.append(f"{control_id}: DEFINED-only control must not claim an implemented detector")
        if kind != "none" and not paths:
            errors.append(f"{control_id}: implemented detector must declare repository paths")
        for repo_path in paths:
            if not (root / repo_path).is_file():
                errors.append(f"{control_id}: detector path does not exist: {repo_path}")

        enforcement = control.get("enforcement")
        if not isinstance(enforcement, dict):
            errors.append(f"{control_id}: enforcement must be an object")
        else:
            blocking = enforcement.get("blocking")
            if not isinstance(blocking, bool):
                errors.append(f"{control_id}: enforcement.blocking must be boolean")
            if state == "ENFORCED" and blocking is not True:
                errors.append(f"{control_id}: ENFORCED control must be blocking")
            if state in {"DEFINED", "SHADOW", "PROVEN"} and blocking is True:
                errors.append(f"{control_id}: {state} control must not claim blocking enforcement")
            if not isinstance(enforcement.get("basis"), str) or not enforcement["basis"].strip():
                errors.append(f"{control_id}: enforcement.basis is required")

        semantics = control.get("classification_semantics")
        if not isinstance(semantics, dict) or not DISPOSITIONS.issubset(semantics):
            errors.append(f"{control_id}: classification_semantics must define candidate, verified-risk, accepted-pattern")

        history = control.get("promotion_history")
        if not isinstance(history, list) or not history:
            errors.append(f"{control_id}: promotion_history must be non-empty")
        else:
            positions: list[int] = []
            for step_index, step in enumerate(history):
                if not isinstance(step, dict) or step.get("state") not in MATURITY:
                    errors.append(f"{control_id}: invalid promotion_history step {step_index}")
                    continue
                if not isinstance(step.get("evidence"), str) or not step["evidence"].strip():
                    errors.append(f"{control_id}: promotion_history step {step_index} requires evidence")
                positions.append(MATURITY.index(step["state"]))
            if positions and positions != sorted(positions):
                errors.append(f"{control_id}: promotion_history cannot move backward")
            if history and isinstance(history[-1], dict) and history[-1].get("state") != state:
                errors.append(f"{control_id}: maturity_state must equal final promotion_history state")

        last = control.get("last_accepted_verification")
        if state == "DEFINED" and last is not None:
            errors.append(f"{control_id}: DEFINED-only control must not claim accepted verification")
        if state != "DEFINED" and (not isinstance(last, str) or not last.strip()):
            errors.append(f"{control_id}: implemented/proven control requires last_accepted_verification")

        evidence = control.get("evidence_requirements")
        if not isinstance(evidence, list) or not evidence or not all(isinstance(item, str) and item.strip() for item in evidence):
            errors.append(f"{control_id}: evidence_requirements must be a non-empty string list")
        if not isinstance(control.get("exclusions"), list):
            errors.append(f"{control_id}: exclusions must be a list")

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
        control_id = record.get("control_id")
        fingerprint = record.get("fingerprint")
        disposition = record.get("disposition")
        if control_id not in seen_ids:
            errors.append(f"{prefix}: unknown control_id {control_id!r}")
        if not isinstance(fingerprint, str) or not FINGERPRINT_RE.fullmatch(fingerprint):
            errors.append(f"{prefix}: fingerprint must be 24 lowercase hex characters")
        else:
            key = (str(control_id), fingerprint)
            if key in seen_review:
                errors.append(f"{prefix}: duplicate reviewed finding {control_id}/{fingerprint}")
            seen_review.add(key)
        if disposition not in DISPOSITIONS:
            errors.append(f"{prefix}: invalid disposition {disposition!r}")
        for field in ("source_path", "target", "rationale", "evidence_source", "reconsideration_trigger"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                errors.append(f"{prefix}: {field} is required")
        if control_id and state_by_id.get(control_id) == "DEFINED":
            errors.append(f"{prefix}: DEFINED-only control cannot have reviewed runtime findings")

    required = {"NPH-001": "ENFORCED", "NDT-001": "ENFORCED", "NFS-001": "PROVEN"}
    for control_id, expected_state in required.items():
        if state_by_id.get(control_id) != expected_state:
            errors.append(f"{control_id}: registry must reflect current state {expected_state}")
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
