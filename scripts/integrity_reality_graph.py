#!/usr/bin/env python3
"""IIC-008 deterministic implementation-claim reality projection.

Projection is read-only. Its output cannot grant authority, approve a release,
promote Production, or replace any authoritative source system.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

NODE_TYPES={
    "claim","repository_revision","configuration_contract","test_ci_result",
    "runtime_outcome","evidence_artifact","documentation_statement","authority",
    "environment","dependency","integrity_control","integrity_finding"
}
EDGE_TYPES={
    "implemented_by","verified_by","observed_in","documented_by","authorized_by",
    "depends_on","contradicts","supersedes","stale_against","limited_by","unresolved_due_to"
}
SOURCE_STATUSES={"verified","mixed","uncertain","unavailable"}
CLAIM_STATUSES={"supported","contested","unresolved"}

class GraphError(ValueError):
    pass

def required(record,name):
    value=record.get(name)
    if not isinstance(value,str) or not value.strip():
        raise GraphError("missing "+name)
    return value

def stable_id(prefix,*parts):
    return prefix+":"+hashlib.sha256("|".join(map(str,parts)).encode("utf-8")).hexdigest()[:24]

def build(envelopes,claims,bindings,approvals,registry):
    if not all(isinstance(x,list) for x in (envelopes,claims,bindings,approvals)):
        raise GraphError("envelopes, claims, bindings and approvals must be lists")
    if not isinstance(registry,dict) or registry.get("registry_id")!="COMIND-IIC-REGISTRY":
        raise GraphError("canonical integrity registry identity required")
    nodes={}
    edges=set()
    def node(id,kind,**attrs):
        if kind not in NODE_TYPES:
            raise GraphError("invalid node type")
        payload={"id":id,"type":kind,**attrs}
        if id in nodes and nodes[id]!=payload:
            raise GraphError("node identity collision: "+id)
        nodes[id]=payload
        return id
    def edge(src,relation,dst):
        if relation not in EDGE_TYPES:
            raise GraphError("invalid graph edge type")
        if src not in nodes or dst not in nodes:
            raise GraphError("unresolved edge endpoint")
        edges.add((src,relation,dst))
    evidence={}
    for item in envelopes:
        if not isinstance(item,dict) or item.get("status") not in SOURCE_STATUSES:
            raise GraphError("malformed source evidence")
        ref=required(item,"evidence_ref")
        if ref in evidence:
            raise GraphError("duplicate evidence reference")
        env=required(item,"environment")
        id=stable_id("evidence",ref,required(item,"source_revision"),required(item,"claim_type"))
        evidence[ref]=item
        node(id,"evidence_artifact",evidence_ref=ref,claim_type=item["claim_type"],
             claim_value=item.get("claim_value"),source_system=required(item,"source_system"),
             status=item["status"],freshness=item.get("freshness","unspecified"),
             provenance=item.get("provenance"))
        env_id=node("environment:"+env,"environment",name=env)
        edge(id,"observed_in",env_id)
        if item["source_system"]=="github-actions":
            rev=required(item,"source_revision")
            rev_id=node("revision:"+rev,"repository_revision",sha=rev)
            edge(id,"observed_in",rev_id)
    controls=[]
    for kind in ("implemented_controls","defined_controls"):
        if not isinstance(registry.get(kind),list):
            raise GraphError("registry control list missing")
        for control in registry[kind]:
            cid=required(control,"control_id")
            controls.append(cid)
            node("control:"+cid,"integrity_control",control_id=cid,
                 maturity_state=required(control,"maturity_state"))
    if len(controls)!=len(set(controls)):
        raise GraphError("duplicate registry control")
    approval_index={}
    for item in approvals:
        if not isinstance(item,dict):
            raise GraphError("invalid approval")
        id=required(item,"id")
        if id in approval_index:
            raise GraphError("duplicate authority identity")
        status=item.get("status")
        if status not in {"verified","uncertain","unavailable","denied"}:
            raise GraphError("invalid approval status")
        approval_index[id]=item
        node("authority:"+id,"authority",status=status,scope=item.get("scope",[]),
             evidence_ref=required(item,"evidence_ref"))
    claim_index={}
    for item in claims:
        if not isinstance(item,dict):
            raise GraphError("invalid claim")
        cid=required(item,"claim_id")
        if cid in claim_index:
            raise GraphError("duplicate claim")
        environment=required(item,"environment")
        expected=item.get("expected")
        if not isinstance(expected,dict):
            raise GraphError("claim expected value required")
        required(expected,"claim_type")
        required(expected,"claim_value")
        if not isinstance(item.get("authority_required"),bool):
            raise GraphError("authority_required must be explicit")
        claim_index[cid]=item
        node("claim:"+cid,"claim",statement=required(item,"statement"),
             environment=environment,expected=expected,
             authority_required=item["authority_required"])
        env_id=node("environment:"+environment,"environment",name=environment)
        edge("claim:"+cid,"observed_in",env_id)
    bindings_by_claim={k:[] for k in claim_index}
    for item in bindings:
        if not isinstance(item,dict):
            raise GraphError("malformed binding")
        cid=required(item,"claim_id")
        if cid not in claim_index:
            raise GraphError("binding references missing claim")
        subject="claim:"+cid
        kind=required(item,"kind")
        if kind=="evidence":
            ref=required(item,"evidence_ref")
            if ref not in evidence:
                raise GraphError("binding references absent source evidence")
            e=evidence[ref]
            eid=stable_id("evidence",ref,e["source_revision"],e["claim_type"])
            if e["environment"]!=claim_index[cid]["environment"]:
                relation="limited_by"
            elif e["claim_type"]!=claim_index[cid]["expected"]["claim_type"]:
                relation="limited_by"
            elif e["claim_value"]!=claim_index[cid]["expected"]["claim_value"]:
                relation="contradicts"
            elif e.get("freshness")=="stale":
                relation="stale_against"
            elif e["status"]=="verified" and e.get("freshness")=="current":
                relation="verified_by"
            else:
                relation="unresolved_due_to"
            edge(subject,relation,eid)
            bindings_by_claim[cid].append(relation)
        elif kind=="authority":
            aid=required(item,"authority_id")
            if aid not in approval_index:
                raise GraphError("authority binding absent evidence")
            a=approval_index[aid]
            allowed=(a["status"]=="verified" and cid in a.get("scope",[]) and
                     a.get("environment")==claim_index[cid]["environment"])
            relation="authorized_by" if allowed else "unresolved_due_to"
            edge(subject,relation,"authority:"+aid)
            bindings_by_claim[cid].append(relation)
        elif kind=="control":
            control=required(item,"control_id")
            if control not in controls:
                raise GraphError("binding unknown registry control")
            edge(subject,"depends_on","control:"+control)
        elif kind=="documentation":
            doc=required(item,"source_ref")
            id=node(stable_id("document",doc),"documentation_statement",source_ref=doc,
                    status="unverified")
            edge(subject,"documented_by",id)
        else:
            raise GraphError("unknown binding kind")
    assessments=[]
    for cid,claim in sorted(claim_index.items()):
        relations=bindings_by_claim[cid]
        contested="contradicts" in relations
        verified="verified_by" in relations
        authorized=(not claim["authority_required"] or "authorized_by" in relations)
        status="contested" if contested else "supported" if verified and authorized else "unresolved"
        assessments.append({"claim_id":cid,"status":status,
                            "authority_satisfied":authorized,
                            "verified_evidence_present":verified,
                            "path_edges":[{"relation":rel,"to":dst}
                                for src,rel,dst in sorted(edges) if src=="claim:"+cid]})
    return {"schema_version":1,"component":"implementation-reality-graph","mode":"read-only",
            "node_count":len(nodes),"edge_count":len(edges),
            "nodes":[nodes[k] for k in sorted(nodes)],
            "edges":[{"from":a,"relation":b,"to":c} for a,b,c in sorted(edges)],
            "assessments":assessments}

def main(argv=None):
    p=argparse.ArgumentParser()
    for key in ("envelopes","claims","bindings","approvals","registry"):
        p.add_argument("--"+key,required=True,type=Path)
    p.add_argument("--output",type=Path)
    args=p.parse_args(argv)
    try:
        def load(path):
            return json.loads(path.read_text(encoding="utf-8"))
        evidence=load(args.envelopes)
        if not isinstance(evidence,dict) or evidence.get("schema_version")!=1:
            raise GraphError("source evidence envelope schema invalid")
        graph=build(evidence.get("source_envelopes"),load(args.claims),
                    load(args.bindings),load(args.approvals),load(args.registry))
        data=json.dumps(graph,indent=2,sort_keys=True)
        if args.output:
            args.output.parent.mkdir(parents=True,exist_ok=True)
            args.output.write_text(data+"\n",encoding="utf-8")
        print(data)
    except (OSError,ValueError,TypeError,KeyError) as exc:
        print("IIC-008 graph validation error: "+str(exc),file=sys.stderr)
        return 2
    return 0
if __name__=="__main__":
    raise SystemExit(main())
