"""Offline failure and idempotency checks. Never invokes real Google APIs."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/gci/bootstrap-google-oidc.sh"
spec = importlib.util.spec_from_file_location("access_setup", ROOT / "scripts/gci/access_setup.py")
access = importlib.util.module_from_spec(spec)
spec.loader.exec_module(access)

FAKE_GCLOUD = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
p=Path(os.environ["GCI_FIXTURE"])
s=json.loads(p.read_text())
a=sys.argv[1:]
with open(str(p)+".calls","a") as f: f.write(json.dumps(a)+"\\n")
def out(x): print(json.dumps(x))
pool="projects/373198958202/locations/global/workloadIdentityPools/comind-gci"
member="principalSet://iam.googleapis.com/"+pool+"/attribute.repository_id/1028814081"
if s.get("no_auth"):
 print("You do not currently have an active account",file=sys.stderr);sys.exit(1)
if a[:3]==["iam","service-accounts","list"]:
 out([{"uniqueId":"102716239802737631124","email":"comind@comind-513807.iam.gserviceaccount.com"}])
elif a[:2]==["projects","describe"]: print(s.get("number","373198958202"))
elif a[:2]==["services","list"]:
 print("\\n".join(s.get("apis",[])))
elif a[:3]==["iam","workload-identity-pools","list"]:
 out([{"name":pool,"state":"ACTIVE"}] if s.get("pool") else [])
elif a[:4]==["iam","workload-identity-pools","providers","list"]:
 providers=[]
 if s.get("provider"):
  providers=[dict(s["provider"],name=pool+"/providers/github-comind",state="ACTIVE")]
 if s.get("foreign_provider"): providers.append({"name":pool+"/providers/foreign"})
 out(providers)
elif a[:2]==["projects","get-iam-policy"]:
 out({"bindings":[{"role":"roles/viewer","members":["serviceAccount:comind@comind-513807.iam.gserviceaccount.com"]}] if s.get("project_role") else []})
elif a[:4]==["iam","service-accounts","keys","list"]: out([{"name":"fixture-key"}] if s.get("key") else [])
elif a[:3]==["iam","service-accounts","get-iam-policy"]:
 out({"bindings":[{"role":"roles/iam.workloadIdentityUser","members":[member if not s.get("broad_binding") else "allUsers"]}] if s.get("binding") else []})
elif a[:2]==["services","enable"]: s["apis"]=[x for x in a[2:] if not x.startswith("--")]
elif a[:3]==["iam","workload-identity-pools","create"]: s["pool"]=True
elif a[:4]==["iam","workload-identity-pools","providers","create-oidc"]:
 if not s.get("lost_write"):
  flags=dict(x[2:].split("=",1) for x in a if x.startswith("--") and "=" in x)
  s["provider"]={"attributeMapping":dict(x.split("=",1) for x in flags["attribute-mapping"].split(",")),"attributeCondition":flags["attribute-condition"],"oidc":{"issuerUri":flags["issuer-uri"]}}
elif a[:3]==["iam","service-accounts","add-iam-policy-binding"]: s["binding"]=True
else: print("unexpected fixture call",file=sys.stderr); sys.exit(99)
p.write_text(json.dumps(s))
'''


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        directory = Path(self.tmp.name)
        self.state = directory / "state.json"
        self.state.write_text("{}")
        fake = directory / "gcloud"
        fake.write_text(FAKE_GCLOUD)
        fake.chmod(0o700)
        self.env = dict(os.environ, PATH=str(directory)+os.pathsep+os.environ["PATH"], GCI_FIXTURE=str(self.state))

    def run_script(self, mode="--audit"):
        return subprocess.run(["bash", str(SCRIPT), mode], env=self.env, text=True, capture_output=True, timeout=20)

    def update(self, **values):
        data = json.loads(self.state.read_text())
        data.update(values)
        self.state.write_text(json.dumps(data))

    def mutations(self):
        calls = Path(str(self.state)+".calls").read_text().splitlines()
        return [a for a in map(json.loads,calls) if set(a) & {"enable","create","create-oidc","add-iam-policy-binding"}]

    def test_audit_reports_missing_without_mutation(self):
        r=self.run_script()
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn("GCI_SETUP_READY=false",r.stdout)
        self.assertFalse(self.mutations())

    def test_verify_fails_when_incomplete(self):
        self.assertEqual(self.run_script("--verify").returncode,5)
        self.assertFalse(self.mutations())

    def test_apply_readback_and_repeat_are_idempotent(self):
        r=self.run_script("--apply")
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn("GCI_SETUP_READY=true",r.stdout)
        before=self.mutations()
        self.assertEqual(len(before),4)
        self.assertEqual(self.run_script("--apply").returncode,0)
        self.assertEqual(before,self.mutations())

    def test_successful_write_without_provider_readback_fails(self):
        self.update(lost_write=True)
        self.assertEqual(self.run_script("--apply").returncode,5)

    def test_auth_failure_stops_before_mutation(self):
        self.update(no_auth=True)
        self.assertNotEqual(self.run_script("--apply").returncode,0)
        self.assertFalse(self.mutations())

    def test_project_mismatch_stops_before_mutation(self):
        self.update(number="999")
        self.assertEqual(self.run_script("--apply").returncode,3)
        self.assertFalse(self.mutations())

    def test_unexpected_existing_access_stops(self):
        for state in ({"pool":True,"foreign_provider":True},{"project_role":True},{"key":True},{"binding":True,"broad_binding":True}):
            with self.subTest(state=state):
                self.state.write_text(json.dumps(state))
                self.assertEqual(self.run_script("--apply").returncode,3)
        self.assertFalse(self.mutations())

    def test_changed_provider_is_never_replaced(self):
        self.assertEqual(self.run_script("--apply").returncode,0)
        data=json.loads(self.state.read_text())
        data["provider"]["attributeCondition"]="assertion.repository_owner_id != ''"
        self.state.write_text(json.dumps(data))
        before=self.mutations()
        self.assertEqual(self.run_script("--apply").returncode,3)
        self.assertEqual(before,self.mutations())


class ReceiptTests(unittest.TestCase):
    def test_rendering_buttons_does_not_authenticate_or_execute_setup(self):
        buttons=[]
        class Button:
            def __init__(self, **kw): self.__dict__.update(kw); buttons.append(self)
            def on_click(self, callback): self.callback=callback
        class Output:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def clear_output(self): pass
        auth=Mock()
        widgets=SimpleNamespace(Button=Button,Output=Output,Layout=lambda **kw:kw,VBox=lambda x:x)
        modules={"ipywidgets":widgets,"IPython.display":SimpleNamespace(display=Mock()),
                 "google.colab":SimpleNamespace(auth=auth,files=Mock())}
        with patch.dict(sys.modules,modules),patch.object(access,"run_setup") as runner:
            access.launch("x",hashlib.sha256(b"x").hexdigest())
            auth.authenticate_user.assert_not_called()
            runner.assert_not_called()
            self.assertTrue(buttons[1].disabled)
            buttons[1].callback(None)
            runner.assert_not_called()

    def test_tampering_rejected_before_execution(self):
        with self.assertRaises(ValueError): access.run_setup("changed", "0"*64,"--apply")

    def test_provider_error_and_unexpected_stdout_not_exported(self):
        source="synthetic fixture"
        r=access.run_setup(source,hashlib.sha256(source.encode()).hexdigest(),"--audit",
            runner=lambda *a,**k:SimpleNamespace(returncode=1,stdout="token fixture-secret",stderr="credential fixture-secret"))
        self.assertEqual(r["status"],"GOOGLE_SIGN_IN_REQUIRED")
        self.assertNotIn("fixture-secret",json.dumps(r))

    def test_timeout_keeps_state_unknown(self):
        def timeout(*a,**k): raise subprocess.TimeoutExpired("fixture",600)
        r=access.run_setup("x",hashlib.sha256(b"x").hexdigest(),"--apply",runner=timeout)
        self.assertEqual(r["status"],"TIMED_OUT_STATE_UNKNOWN")
        self.assertFalse(r["ready"])

    def test_notebook_matches_reviewed_sources_and_contains_no_results(self):
        spec=importlib.util.spec_from_file_location("builder",ROOT/"scripts/gci/build_access_notebook.py")
        builder=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        saved=json.loads((ROOT/"scripts/gci/gci-001-access-setup.ipynb").read_text())
        self.assertEqual(saved,builder.build())
        code=saved["cells"][1]
        compile("".join(code["source"]),"notebook","exec")
        self.assertEqual(code["outputs"],[])
        self.assertIsNone(code["execution_count"])


if __name__ == "__main__": unittest.main()
