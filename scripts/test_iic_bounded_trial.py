#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("iic_bounded",Path(__file__).with_name("iic_bounded_trial.py"))
m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
NOW=1795268400
SHA="a"*40
def branch():return {"commit":{"sha":SHA}}
def runs(**changes):
    run={"id":123,"head_sha":SHA,"head_branch":"main","event":"push",
         "path":m.WORKFLOW,"repository":{"full_name":m.REPO},
         "html_url":"https://github.com/jlhogarth/CoMind/actions/runs/123",
         "updated_at":m.utc(NOW-60),"status":"completed","conclusion":"success"}
    run.update(changes)
    return {"workflow_runs":[run]}
class BoundTests(unittest.TestCase):
    def test_qualified_exact_head_success(self):
        self.assertEqual("current",m.classify(branch(),runs(),NOW)["state"])
    def test_mismatch_revision_no_success(self):
        self.assertEqual("unavailable",m.classify(branch(),runs(head_sha="b"*40),NOW)["state"])
    def test_stale_source_never_current(self):
        self.assertEqual("stale",m.classify(branch(),runs(updated_at=m.utc(NOW-86401)),NOW)["state"])
    def test_failed_source_not_current(self):
        self.assertEqual("failed",m.classify(branch(),runs(conclusion="failure"),NOW)["state"])
    def test_pending_source_not_current(self):
        self.assertEqual("pending",m.classify(branch(),runs(status="in_progress",conclusion=None),NOW)["state"])
    def test_wrong_repo_fails_closed(self):
        self.assertEqual("unavailable",m.classify(branch(),runs(repository={"full_name":"other/other"}),NOW)["state"])
    def test_invalid_future_source_fails_closed(self):
        self.assertEqual("unavailable",m.classify(branch(),runs(updated_at=m.utc(NOW+120)),NOW)["state"])
    def test_no_workflow_never_current(self):
        self.assertEqual("unavailable",m.classify(branch(),{"workflow_runs":[]},NOW)["state"])
    def test_error_no_health_inference(self):
        def broken(_endpoint,_token):raise OSError("down")
        self.assertEqual("unavailable",m.observe(fetch=broken,clock=lambda:NOW)["state"])
    def test_http_allowlist_fail_closed(self):
        with self.assertRaises(ValueError):m.http_json("some/other/endpoint")
    def test_caps_prevent_unbounded_monitoring(self):
        with self.assertRaises(ValueError):m.run(301,15)
        with self.assertRaises(ValueError):m.run(60,1)
    def test_mocked_monotonic_window_ends(self):
        now=[0.0]
        def sleeper(n):now[0]+=n
        def fetch(endpoint,token):return branch() if endpoint=="branches/main" else runs()
        r=m.run(30,10,fetch=fetch,clock=lambda:NOW,monotonic=lambda:now[0],sleeper=sleeper)
        self.assertEqual(3,r["sample_count"])
        self.assertEqual({"current":3,"stale":0,"failed":0,"pending":0,"unavailable":0},r["state_counts"])
        self.assertEqual("finite-and-auto-stop",r["mode"])
    def test_unavailable_sample_does_not_pass_trial(self):
        now=[0.0]
        def sleeper(n):now[0]+=n
        def bad(_endpoint,_token):raise OSError("down")
        r=m.run(20,10,fetch=bad,clock=lambda:NOW,monotonic=lambda:now[0],sleeper=sleeper)
        self.assertFalse(r["all_observations_current"])
    def test_no_scheduled_background_process(self):
        import inspect
        src=inspect.getsource(m)
        self.assertNotIn("subprocess.Popen",src)
        self.assertNotIn("schedule.every",src)
if __name__=="__main__":unittest.main()
