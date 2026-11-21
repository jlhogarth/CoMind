#!/usr/bin/env python3
"""IIC-008 deterministic projection and fail-closed graph acceptance."""
import importlib.util
import sys
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("integrity_reality_graph",Path(__file__).with_name("integrity_reality_graph.py"))
g=importlib.util.module_from_spec(spec);sys.modules[spec.name]=g;spec.loader.exec_module(g)
REG={"registry_id":"COMIND-IIC-REGISTRY","implemented_controls":[{"control_id":"NDT-001","maturity_state":"ENFORCED"}],"defined_controls":[]}
def evidence(**changes):
    a={"source_system":"github-actions","source_revision":"a"*40,"evidence_ref":"https://github.com/jlhogarth/CoMind/actions/runs/44876259235",
       "environment":"Test","claim_type":"github.run.conclusion","claim_value":"success","status":"verified","freshness":"current",
       "provenance":{"source_record_sha256":"abc"}}
    a.update(changes);return a
def claim(**changes):
    v={"claim_id":"IIC-CI","statement":"One CI run reports success","environment":"Test",
       "expected":{"claim_type":"github.run.conclusion","claim_value":"success"},"authority_required":False}
    v.update(changes);return v
def binding(**changes):
    v={"kind":"evidence","claim_id":"IIC-CI","evidence_ref":evidence()["evidence_ref"]}
    v.update(changes);return v
def graph(e=None,c=None,b=None,a=None):
    return g.build(e if e is not None else [evidence()],
        c if c is not None else [claim()],b if b is not None else [binding()],
        a if a is not None else [],REG)
class GraphTests(unittest.TestCase):
    def test_exact_evidence_supports_only_narrow_observation(self):
        x=graph();self.assertEqual("supported",x["assessments"][0]["status"])
        self.assertTrue(any(n["type"]=="repository_revision" for n in x["nodes"]))
    def test_unknown_freshness_unresolved(self):
        x=graph(e=[evidence(freshness="unspecified",status="uncertain")])
        self.assertEqual("unresolved",x["assessments"][0]["status"])
    def test_stale_evidence_unresolved(self):
        x=graph(e=[evidence(freshness="stale",status="uncertain")])
        self.assertIn("stale_against",[v["relation"] for v in x["edges"]])
    def test_explicit_conflict_contested(self):
        x=graph(e=[evidence(claim_value="failure")])
        self.assertEqual("contested",x["assessments"][0]["status"])
    def test_cross_environment_not_evidence(self):
        x=graph(e=[evidence(environment="Production")])
        self.assertEqual("unresolved",x["assessments"][0]["status"])
        self.assertIn("limited_by",[v["relation"] for v in x["edges"]])
    def test_absent_evidence_not_success(self):
        x=graph(e=[],b=[])
        self.assertEqual("unresolved",x["assessments"][0]["status"])
    def test_authority_required_not_inferred(self):
        x=graph(c=[claim(authority_required=True)])
        self.assertEqual("unresolved",x["assessments"][0]["status"])
    def test_explicit_verified_approval_scoped_to_claim(self):
        a=[{"id":"approval-1","status":"verified","scope":["IIC-CI"],"environment":"Test","evidence_ref":"governance://approval-1"}]
        x=graph(c=[claim(authority_required=True)],a=a,b=[binding(),{"kind":"authority","claim_id":"IIC-CI","authority_id":"approval-1"}])
        self.assertEqual("supported",x["assessments"][0]["status"])
    def test_unverified_approval_cannot_authorize(self):
        a=[{"id":"approval-1","status":"uncertain","scope":["IIC-CI"],"environment":"Test","evidence_ref":"governance://approval-1"}]
        x=graph(c=[claim(authority_required=True)],a=a,b=[binding(),{"kind":"authority","claim_id":"IIC-CI","authority_id":"approval-1"}])
        self.assertEqual("unresolved",x["assessments"][0]["status"])
    def test_missing_authority_binding_rejected(self):
        with self.assertRaises(g.GraphError):
            graph(b=[binding(),{"kind":"authority","claim_id":"IIC-CI","authority_id":"missing"}])
    def test_duplicate_evidence_ref_rejected(self):
        with self.assertRaises(g.GraphError):
            graph(e=[evidence(),evidence()])
    def test_registry_control_link_preserves_maturity(self):
        x=graph(b=[binding(),{"kind":"control","claim_id":"IIC-CI","control_id":"NDT-001"}])
        self.assertIn("depends_on",[v["relation"] for v in x["edges"]])
        self.assertEqual("ENFORCED",next(v for v in x["nodes"] if v["id"]=="control:NDT-001")["maturity_state"])
    def test_unknown_registry_control_rejected(self):
        with self.assertRaises(g.GraphError):
            graph(b=[binding(),{"kind":"control","claim_id":"IIC-CI","control_id":"BAD-001"}])
    def test_documentation_only_not_verification(self):
        x=graph(e=[],b=[{"kind":"documentation","claim_id":"IIC-CI","source_ref":"docs/integrity/IIC-007.md"}])
        self.assertEqual("unresolved",x["assessments"][0]["status"])
    def test_duplicate_claim_rejected(self):
        with self.assertRaises(g.GraphError):
            graph(c=[claim(),claim()])
if __name__=="__main__":
    unittest.main()
