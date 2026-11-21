import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "expense_preflight.py"

class ExpenseGateTests(unittest.TestCase):
    def run_gate(self, payload):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "request.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            proc = subprocess.run([sys.executable, str(SCRIPT), str(path)], capture_output=True, text=True)
            return proc.returncode, json.loads(proc.stdout)
    def test_paid_unapproved_blocks(self):
        code, result = self.run_gate({"provider":"Railway","purpose":"acceptance","estimated_usd":0.1,"maximum_usd":1})
        self.assertEqual(code, 3)
        self.assertEqual(result["decision"], "block")
    def test_explicit_bounded_approval(self):
        code, result = self.run_gate({"provider":"Railway","purpose":"acceptance","estimated_usd":0.1,"maximum_usd":1,"approved":True,"approval_scope":"one acceptance test","approved_maximum_usd":1})
        self.assertEqual(code, 0)
    def test_unknown_max_blocks(self):
        code, result = self.run_gate({"provider":"Work","purpose":"experiment","approved":True,"approval_scope":"test"})
        self.assertEqual(code, 3)
        self.assertTrue(result["cost_unknown"])
    def test_verified_free_allows(self):
        code, result = self.run_gate({"provider":"local","purpose":"offline tests","incremental_cost":False})
        self.assertEqual(code, 0)

if __name__ == "__main__":
    unittest.main()
