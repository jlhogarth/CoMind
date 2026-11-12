#!/usr/bin/env python3
"""Deterministic FinOps bridge tests using synthetic AED proof archives."""
import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from finops_aed_reconciliation import (
    PROJECTION_FIELDS, digest, load_aed_tools, private_report, read_proof,
)


class FinOpsAedReconciliationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.aed = load_aed_tools(Path(os.environ.get("FINOPS_AED_TOOLS", "server/scripts")))

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.execution_id = "a" * 24

    def proof(self, sequences=(1, 2, 3), before_at="2026-11-01T12:00:00+00:00",
              balances=(40, 37), damage=None):
        execution, before, after, sidecar, report = (
            self.root / name for name in ("execution.jsonl", "before.json", "after.json",
                                          "sidecar.json", "report.json"))
        events = [{"schema": "comind.aed.transaction.v1", "execution_id": self.execution_id,
                   "sequence": sequence, "kind": kind, "elapsed_ms": i * 1000,
                   "at": f"2026-11-01T12:00:0{i + 1}+00:00"}
                  for i, (sequence, kind) in enumerate(zip(sequences, ("preflight", "started", "exited")))]
        events[-1]["returncode"] = 0
        execution.write_text("".join(json.dumps(row) + "\n" for row in events))
        intake = self.aed["aed_work_usage_evidence"]
        intake.capture(before, before_at, allowance=balances[0], purchased=8)
        intake.capture(after, "2026-11-01T12:00:04+00:00", allowance=balances[1], purchased=8)
        if damage in {"missing_event", "duplicate_sequence", "timestamp"}:
            sidecar.write_text('{"schema":"comind.aed.work-usage-reconciliation.v1"}')
            report.write_text("[]")
        else:
            row = intake.reconcile(execution, before, after, sidecar)
            report.write_text(json.dumps(self.aed["aed_transaction_report"].report(
                [execution], usage_evidence=[sidecar])))
            if damage == "sidecar":
                row["execution_sha256"] = "0" * 64
                sidecar.write_text(json.dumps(row))
        files = {path.name: path.read_bytes() for path in (execution, before, after, sidecar, report)}
        if damage == "missing_observation":
            files[after.name] = b"{}"
        manifest = {"schema": "comind.aed.work-meter-proof.v1", "environment": "CoMind Test",
                    "scope": "shared account; unallocated", "execution_id": self.execution_id,
                    "files": {name: digest(raw) for name, raw in files.items()}}
        if damage == "member_hash":
            manifest["files"][execution.name] = "0" * 64
        archive = self.root / "proof.zip"
        with ZipFile(archive, "w") as bundle:
            for name, raw in files.items():
                bundle.writestr(name, raw)
            bundle.writestr("manifest.json", json.dumps(manifest))
        expected = "0" * 64 if damage == "archive_hash" else digest(archive.read_bytes())
        return read_proof(archive, expected, "synthetic-test-proof", self.aed)

    def projection(self, proof=None):
        row = dict.fromkeys(PROJECTION_FIELDS)
        row.update(execution_id=self.execution_id, source_sha256="1" * 64,
                   artifact_sha256="2" * 64, declared_events=3, observed_events=3,
                   distinct_sequences=3, min_sequence=1, max_sequence=3,
                   hashed_events=3, sequence_verified=True)
        if proof:
            row.update({key: proof[key] for key in ("first_at", "last_at", "source_sha256")})
        return row

    def test_historical_execution_and_unknown_cost(self):
        row, = private_report([self.projection()], [])["executions"]
        self.assertEqual(row["classification"]["execution_evidence"], "verified")
        self.assertEqual(row["work_account_meter"], {"status": "not_observed"})
        self.assertEqual(row["classification"]["actual_cost"], "unknown")
        self.assertIsNone(row["actual_cost_usd"])

    def test_verified_archive_and_persisted_execution_join(self):
        proof = self.proof()
        archived, = private_report([], [proof])["executions"]
        self.assertFalse(archived["persisted_in_supabase"])
        matched, = private_report([self.projection(proof)], [proof])["executions"]
        self.assertEqual(matched["verification"], "verified_archive_and_supabase")
        meter = matched["work_account_meter"]
        self.assertEqual(meter["meters"]["allowance_percentage_points"]["unattributed_change"], 3)
        self.assertEqual(meter["meters"]["purchased_credits"]["unattributed_change"], 0)
        self.assertIsNone(meter["process_attributed_work_usage"])

    def test_missing_persisted_event_is_incomplete(self):
        projection = {**self.projection(), "observed_events": 2,
                      "input_tokens": 100, "output_tokens": 10, "duration_ms": 500}
        row, = private_report([projection], [])["executions"]
        self.assertEqual(row["verification"], "incomplete")
        for field in ("input_tokens", "output_tokens", "duration_ms"):
            self.assertIsNone(row[field])

    def test_missing_archive_event(self):
        with self.assertRaisesRegex(ValueError, "noncontiguous"):
            self.proof(sequences=(1, 3), damage="missing_event")

    def test_duplicate_sequence(self):
        with self.assertRaisesRegex(ValueError, "noncontiguous"):
            self.proof(sequences=(1, 1, 3), damage="duplicate_sequence")

    def test_invalid_source_hash(self):
        with self.assertRaisesRegex(ValueError, "member SHA-256 mismatch"):
            self.proof(damage="member_hash")

    def test_invalid_artifact_hash(self):
        with self.assertRaisesRegex(ValueError, "archive SHA-256 mismatch"):
            self.proof(damage="archive_hash")

    def test_invalid_observation_digest(self):
        with self.assertRaisesRegex(ValueError, "sidecar disagrees"):
            self.proof(damage="sidecar")

    def test_observation_does_not_bracket_execution(self):
        with self.assertRaisesRegex(ValueError, "do not bracket"):
            self.proof(before_at="2026-11-01T12:00:02+00:00", damage="timestamp")

    def test_missing_observation(self):
        with self.assertRaisesRegex(ValueError, "incomplete"):
            self.proof(damage="missing_observation")

    def test_balance_increase_is_not_consumption(self):
        proof = self.proof(balances=(37, 40))
        meter = proof["work_account_meter"]["meters"]["allowance_percentage_points"]
        self.assertEqual(meter["status"], "balance_increased_or_reset")
        self.assertIsNone(meter["unattributed_change"])

    def test_duplicate_or_overlapping_reconciliation(self):
        proof = self.proof()
        with self.assertRaisesRegex(ValueError, "duplicate or overlapping"):
            private_report([], [proof, proof])
        overlap = copy.deepcopy(proof)
        overlap.update(execution_id="b" * 24, source_sha256="3" * 64)
        overlap["work_account_meter"].update(before_snapshot_sha256="5" * 64,
                                             after_snapshot_sha256="6" * 64)
        with self.assertRaisesRegex(ValueError, "duplicate or overlapping"):
            private_report([], [proof, overlap])

    def test_reused_snapshot_at_adjacent_window_boundary_is_rejected(self):
        proof = self.proof()
        adjacent = copy.deepcopy(proof)
        adjacent.update(execution_id="b" * 24, source_sha256="3" * 64)
        meter = proof["work_account_meter"]
        adjacent["work_account_meter"].update(
            before_at=meter["after_at"], after_at="2026-11-01T12:00:05+00:00",
            before_snapshot_sha256=meter["after_snapshot_sha256"], after_snapshot_sha256="6" * 64,
        )
        with self.assertRaisesRegex(ValueError, "duplicate or overlapping"):
            private_report([], [proof, adjacent])

    def test_conflicting_persisted_proof(self):
        proof = self.proof()
        row = {**self.projection(proof), "source_sha256": "4" * 64}
        with self.assertRaisesRegex(ValueError, "conflicts"):
            private_report([row], [proof])

    def test_projection_omits_extra_raw_fields_and_refuses_unverified_cost(self):
        projection = self.projection()
        projection["payload"] = "synthetic raw data"
        row, = private_report([projection], [])["executions"]
        self.assertNotIn("payload", row)
        with self.assertRaisesRegex(ValueError, "cannot verify"):
            private_report([{**projection, "actual_cost_usd": 0}], [])


if __name__ == "__main__":
    unittest.main()
