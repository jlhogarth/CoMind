#!/usr/bin/env python3
"""Verify account-meter provenance without making a provider request."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

scripts = Path(__file__).resolve().parents[1] / "scripts"


def module(name):
    spec = importlib.util.spec_from_file_location(name, scripts / f"{name}.py")
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


monitor = module("aed_transaction_monitor")
reporter = module("aed_transaction_report")


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


if __name__ == "__main__":
    unittest.main()
