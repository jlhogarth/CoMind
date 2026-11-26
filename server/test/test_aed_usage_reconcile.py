import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from aed_usage_reconcile import reconcile


class UsageReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.transaction, self.observations = root / "transaction.jsonl", root / "observations.json"
        rows = [
            {"schema": "comind.aed.transaction.v1", "kind": "preflight",
             "execution_id": "a" * 24, "at": "2026-11-07T10:01:00Z"},
            {"schema": "comind.aed.transaction.v1", "kind": "exited",
             "execution_id": "a" * 24, "at": "2026-11-07T10:02:00Z"},
        ]
        self.transaction.write_text("".join(json.dumps(row) + "\n" for row in rows))
        before = {"observed_at": "2026-11-07T10:00:00Z",
                  "source": "chatgpt_settings_usage_ui",
                  "five_hour_remaining_pct": 80, "weekly_remaining_pct": 70,
                  "purchased_credits_remaining": 23}
        after = dict(before, observed_at="2026-11-07T10:04:00Z",
                     five_hour_remaining_pct=78, weekly_remaining_pct=69)
        self.data = {"execution_id": "a" * 24, "before": before, "after": after,
                     "concurrent_activity": False, "reset_occurred": False}
        self.save()

    def save(self):
        self.observations.write_text(json.dumps(self.data))

    def test_separate_allowance_and_purchased_credit_delta(self):
        result = reconcile(self.transaction, self.observations)
        self.assertEqual(result["deltas"]["five_hour_used_pct"], 2)
        self.assertEqual(result["deltas"]["weekly_used_pct"], 1)
        self.assertEqual(result["deltas"]["purchased_credits_used"], 0)
        self.assertIsNone(result["reasoning_tokens"])

    def test_concurrent_activity_remains_unattributed(self):
        self.data["concurrent_activity"] = True
        self.save()
        self.assertEqual(reconcile(self.transaction, self.observations)["status"],
                         "shared_window_unattributed")

    def test_reset_or_balance_increase_blocks_attribution(self):
        self.data["after"]["five_hour_remaining_pct"] = 82
        self.save()
        self.assertEqual(reconcile(self.transaction, self.observations)["status"],
                         "not_reconcilable_reset_or_balance_increase")

    def test_mismatched_execution_rejected(self):
        self.data["execution_id"] = "b" * 24
        self.save()
        with self.assertRaisesRegex(ValueError, "mismatch"):
            reconcile(self.transaction, self.observations)

    def test_unbracketed_readings_rejected(self):
        self.data["after"]["observed_at"] = "2026-11-07T10:01:30Z"
        self.save()
        with self.assertRaisesRegex(ValueError, "bracket"):
            reconcile(self.transaction, self.observations)


if __name__ == "__main__":
    unittest.main()
