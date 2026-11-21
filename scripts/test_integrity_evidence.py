#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location("integrity_evidence",Path(__file__).with_name("integrity_evidence.py"))
m=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=m
spec.loader.exec_module(m)

SHA="a"*40
READ="2026-11-21T06:30:00Z"
FRESH="2026-11-22T06:30:00Z"
def github():
    return {"id":44875629600,"head_sha":SHA,"repository":{"full_name":"jlhogarth/CoMind"},"status":"completed",
            "conclusion":"success","updated_at":"2026-11-21T06:25:00Z",
            "html_url":"https://github.com/jlhogarth/CoMind/actions/runs/44875629600"}
def runbook():
    return {"project_key":"COMIND","work_key":"AED-007","status":"in_progress",
            "last_event_at":"2026-11-20T19:13:14Z"}

class EvidenceTests(unittest.TestCase):
    def gh(self, **changes):
        data=github()
        data.update(changes)
        return m.from_github_run(data,environment="Test",observed_at=READ,fresh_until=FRESH)
    def test_github_exact_sha_and_success_scope(self):
        e=self.gh()
        self.assertEqual("github.run.conclusion",e["claim_type"])
        self.assertEqual("verified",e["status"])
        self.assertTrue(e["limitations"])
    def test_runbook_status_is_not_completion(self):
        e=m.from_runbook_lane(runbook(),environment="Test",observed_at=READ,fresh_until=FRESH)
        self.assertEqual("in_progress",e["claim_value"])
        self.assertEqual("runbook.lane.status",e["claim_type"])
    def test_stale_explicit(self):
        e=self.gh()
        e=m.from_github_run(github(),environment="Test",observed_at="2026-11-25T06:30:00Z",fresh_until=FRESH)
        self.assertEqual(("stale","uncertain"),(e["freshness"],e["status"]))
    def test_no_freshness_never_verified(self):
        e=m.from_runbook_lane(runbook(),environment="Test",observed_at=READ)
        self.assertEqual("uncertain",e["status"])
    def test_future_source_rejected(self):
        with self.assertRaises(m.EvidenceError):
            self.gh(updated_at="2026-11-22T06:25:00Z")
    def test_missing_sha_rejected(self):
        with self.assertRaises(m.EvidenceError):
            self.gh(head_sha=None)
    def test_nonterminal_run_rejected(self):
        with self.assertRaises(m.EvidenceError):
            self.gh(status="in_progress",conclusion=None)
    def test_cross_repo_ref_rejected(self):
        with self.assertRaises(m.EvidenceError):
            self.gh(html_url="https://github.com/other/repo/actions/runs/44875629600")
    def test_unknown_runbook_status_fails(self):
        row=runbook()
        row["status"]="impossible"
        with self.assertRaises(m.EvidenceError):
            m.from_runbook_lane(row,environment="Test",observed_at=READ)
    def test_conflict_preserved(self):
        a=self.gh()
        b=dict(a,claim_value="failure")
        z=m.reconcile([a,b])
        self.assertEqual("mixed",z["assessments"][0]["status"])
        self.assertTrue(z["assessments"][0]["contradiction"])
    def test_missing_and_uncertain_fails_closed(self):
        with self.assertRaises(m.EvidenceError):
            m.reconcile([{"status":"verified"}])
    def test_environment_scope_required(self):
        with self.assertRaises(m.EvidenceError):
            m.from_runbook_lane(runbook(),environment="Unknown",observed_at=READ)
if __name__=="__main__":
    unittest.main()
