#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("iic_multisource",Path(__file__).with_name("iic_multisource_test.py"))
m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
SHA="a"*40
DATE="2026-11-21T19:00:00Z"
NOW=1795287600
def registry():
    return {"registry_id":"COMIND-IIC-REGISTRY",
        "implemented_controls":[{"control_id":"NDT-001","maturity_state":"ENFORCED"}],
        "defined_controls":[]}
def reader():
    return {"commit":{"sha":SHA}},{"workflow_runs":[{
        "id":123,"head_sha":SHA,"head_branch":"main","event":"push",
        "path":".github/workflows/implementation-integrity.yml",
        "repository":{"full_name":"jlhogarth/CoMind"},"status":"completed",
        "conclusion":"success","updated_at":DATE,
        "html_url":"https://github.com/jlhogarth/CoMind/actions/runs/123"}]}
def runbook():
    return {"project_key":"a"*64,"work_key":"b"*64,"status":"in_progress","last_event_at":DATE}
class MultisourceTests(unittest.TestCase):
    def test_off_executes_zero_reads(self):
        report=m.evaluate("OFF",30,10,sample=lambda:self.fail("called"))
        self.assertEqual([],report["samples"])
        self.assertTrue(report["stopped"])
    def test_full_graph_with_real_adapter_contract(self):
        s=m.take_sample(reader,runbook,registry(),clock=lambda:NOW,expected_status="in_progress")
        self.assertEqual("current",s["source_states"]["github"])
        self.assertEqual("current",s["source_states"]["runbook"])
        self.assertEqual("supported",s["claim_statuses"]["IIC-GITHUB-WORKFLOW"])
        self.assertEqual("supported",s["claim_statuses"]["IIC-RUNBOOK-LANE"])
        self.assertEqual("unresolved",s["claim_statuses"]["IIC-PRODUCTION-READY"])
    def test_missing_runbook_never_supported(self):
        def broken():raise RuntimeError("not authorized")
        s=m.take_sample(reader,broken,registry(),clock=lambda:NOW)
        self.assertEqual("unavailable",s["source_states"]["runbook"])
        self.assertNotIn("IIC-RUNBOOK-LANE",s["claim_statuses"])
    def test_missing_github_no_false_success(self):
        def broken():raise RuntimeError("network")
        s=m.take_sample(broken,runbook,registry(),clock=lambda:NOW)
        self.assertEqual("unavailable",s["source_states"]["github"])
        self.assertEqual("unresolved",s["claim_statuses"]["IIC-PRODUCTION-READY"])
    def test_stale_runbook_unresolved(self):
        s=m.take_sample(reader,lambda:{**runbook(),"last_event_at":"2026-11-19T19:00:00Z"},registry(),clock=lambda:NOW)
        self.assertEqual("stale",s["source_states"]["runbook"])
        self.assertEqual("unresolved",s["claim_statuses"]["IIC-RUNBOOK-LANE"])
    def test_mismatch_status_contested(self):
        s=m.take_sample(reader,runbook,registry(),clock=lambda:NOW,expected_status="done")
        self.assertEqual("contested",s["claim_statuses"]["IIC-RUNBOOK-LANE"])
    def test_exceed_duration_rejected(self):
        with self.assertRaises(ValueError):m.evaluate("ON",901,15,lambda:None)
    def test_poll_limit_rejected(self):
        with self.assertRaises(ValueError):m.evaluate("ON",900,10,lambda:None)
    def test_invalid_mode_rejected(self):
        with self.assertRaises(ValueError):m.evaluate("ALWAYS",30,15,lambda:None)
    def test_on_auto_stops_and_has_count(self):
        clock=[0.]
        def sleeper(delta):clock[0]+=delta
        rep=m.evaluate("ON",30,10,lambda:{"claim_statuses":{"IIC-PRODUCTION-READY":"unresolved"}},
              clock=lambda:clock[0],sleep=sleeper)
        self.assertEqual(3,rep["observations"])
        self.assertTrue(rep["stopped"])
        self.assertTrue(rep["no_false_success"])
    def test_no_credential_in_error(self):
        with self.assertRaises(ValueError) as err:m.postgres_read("postgres://postgres:SECRET@localhost/test")
        self.assertNotIn("SECRET",str(err.exception))
    def test_admin_db_role_rejected(self):
        with self.assertRaises(ValueError):m.postgres_read(
            "postgres://postgres.sbgfuanxiqepcoboxzcl:pwd@pooler.supabase.com/postgres")
    def test_non_test_scope_rejected(self):
        with self.assertRaises(ValueError):m.postgres_read("postgres://reader:pwd@other.host/postgres")
    def test_hashes_are_deterministic(self):
        self.assertEqual(64,len(m.safe_hash("COMIND")))
        self.assertEqual(m.safe_hash("COMIND"),m.safe_hash("COMIND"))
if __name__=="__main__":unittest.main()
