#!/usr/bin/env python3
"""Verify account-meter provenance without making a provider request."""
import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

scripts = Path(__file__).resolve().parents[1] / "scripts"


def module(name):
    spec = importlib.util.spec_from_file_location(name, scripts / f"{name}.py")
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


monitor = module("aed_transaction_monitor")
reporter = module("aed_transaction_report")
evidence = module("aed_work_usage_evidence")


class WorkMeterTest(unittest.TestCase):
    def test_observed_account_difference_is_unallocated_and_not_billed_cost(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            counter = root / "count"
            observer = root / "observer.py"
            observer.write_text("#!/usr/bin/env python3\n"
                                "import json\nfrom datetime import datetime, timezone\nfrom pathlib import Path\n"
                                f"p=Path({str(counter)!r})\n"
                                "n=int(p.read_text()) if p.exists() else 0\np.write_text(str(n+1))\n"
                                "print(json.dumps({'source':'openai_usage_ui',"
                                "'captured_at':datetime.now(timezone.utc).isoformat(),"
                                "'included_allowance_remaining_percent':90-n,"
                                "'purchased_credits_remaining':100-n}))\n")
            observer.chmod(0o700)
            output = root / "execution.jsonl"
            self.assertEqual(monitor.run([sys.executable, "-c", "print('test')"], output, 10, observer), 0)
            rows = [json.loads(line) for line in output.read_text().splitlines()]
            self.assertEqual(rows[-1]["kind"], "exited")
            self.assertEqual([row["phase"] for row in rows if row["kind"] == "usage_snapshot"],
                             ["before", "after"])
            reading = next(row for row in rows if row["kind"] == "usage_reconciliation")
            self.assertEqual(reading["included_allowance_observed_consumed_percent"], 1)
            self.assertEqual(reading["purchased_credits_observed_consumed"], 1)
            self.assertEqual(reading["attribution"], "unallocated")
            summary = reporter.report([output])[0]
            self.assertIsNone(summary["reported_cost_usd"])
            self.assertEqual(summary["reported_charge_event_count"], 0)
            self.assertGreater(summary["process_output_bytes"], 0)
            self.assertIsNone(summary["input_tokens"])
            self.assertEqual(summary["token_reported_step_count"], 0)
            self.assertEqual(summary["work_account_meter"]["scope"], "shared_account")
            self.assertEqual(summary["chatgpt_work_cost"], "unknown")

    def test_missing_meter_and_missing_charge_stay_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "execution.jsonl"
            self.assertEqual(monitor.run([sys.executable, "-c", "print('test')"], output, 10), 0)
            summary = reporter.report([output])[0]
            self.assertIsNone(summary["reported_cost_usd"])
            self.assertIsNone(summary["work_account_meter"])

    def test_invalid_observer_fails_closed_without_leaking_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            observer = root / "observer.py"
            observer.write_text("#!/usr/bin/env python3\nprint('{\"source\":\"openai_usage_ui\",\"secret\":\"sensitive\"}')\n")
            observer.chmod(0o700)
            output = root / "execution.jsonl"
            self.assertEqual(monitor.run([sys.executable, "-c", "print('test')"], output, 10, observer), 0)
            content = output.read_text()
            self.assertNotIn("sensitive", content)
            rows = [json.loads(line) for line in content.splitlines()]
            self.assertEqual([row["phase"] for row in rows if row["kind"] == "usage_unavailable"],
                             ["before", "after"])
            self.assertIsNone(reporter.report([output])[0]["work_account_meter"])

    def test_manual_ui_evidence_brackets_one_run_without_attributing_shared_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before, after = root / "before.json", root / "after.json"
            execution, result = root / "execution.jsonl", root / "reconciled.json"
            evidence.capture(before, datetime.now(timezone.utc).isoformat(), 90, 100)
            self.assertEqual(monitor.run([sys.executable, "-c", "print('test')"], execution, 10), 0)
            evidence.capture(after, datetime.now(timezone.utc).isoformat(), 88, 99)
            row = evidence.reconcile(execution, before, after, result)
            self.assertEqual(row["allowance_percentage_points_observed"], 2)
            self.assertEqual(row["purchased_credits_observed"], 1)
            self.assertEqual(row["attribution"], "unallocated")
            self.assertIsNone(row["actual_work_charge_usd"])
            self.assertEqual(json.loads(result.read_text()), row)
            summary = reporter.report([execution], usage_evidence=[result])[0]
            self.assertEqual(summary["work_account_meter"]["purchased_credits_observed"], 1)
            self.assertIsNone(summary["reported_cost_usd"])
            with self.assertRaises(FileExistsError):
                evidence.reconcile(execution, before, after, result)
            altered = root / "altered.jsonl"
            altered.write_bytes(execution.read_bytes() + b"\n")
            with self.assertRaises(ValueError):
                reporter.report([altered], usage_evidence=[result])

    def test_stale_order_and_reset_do_not_create_a_process_charge(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before, after = root / "before.json", root / "after.json"
            execution = root / "execution.jsonl"
            evidence.capture(before, datetime.now(timezone.utc).isoformat(), 40, 10)
            self.assertEqual(monitor.run([sys.executable, "-c", "print('test')"], execution, 10), 0)
            evidence.capture(after, datetime.now(timezone.utc).isoformat(), 100, 20)
            row = evidence.reconcile(execution, before, after, root / "result.json")
            self.assertIsNone(row["allowance_percentage_points_observed"])
            self.assertIsNone(row["purchased_credits_observed"])
            bad = root / "late-before.json"
            evidence.capture(bad, (datetime.now(timezone.utc) - timedelta(microseconds=1)).isoformat(), 40, 10)
            with self.assertRaises(ValueError):
                evidence.reconcile(execution, bad, after, root / "bad.json")


if __name__ == "__main__":
    unittest.main()
