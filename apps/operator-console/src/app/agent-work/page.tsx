"use client";

import { useEffect, useState } from "react";
import type { AgentWorkSnapshot } from "@/lib/agent-work/server";

function timestamp(value: string | null) {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : "Not recorded";
}

export default function AgentWorkPage() {
  const [snapshot, setSnapshot] = useState<AgentWorkSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setRefresh(value => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/agent-work", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Agent work source unavailable");
        const data = await response.json() as AgentWorkSnapshot;
        setSnapshot(data); setError(null);
      } catch {
        if (!controller.signal.aborted) { setSnapshot(null); setError("Agent work source unavailable. Status is unknown."); }
      }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  return <main className="hud-shell">
    <aside className="hud-sidebar">
      <a className="hud-brand" href="/">CoMind <span>Operator Console</span></a>
      <nav aria-label="Operator Console">
        <a href="/">Overview</a><a href="/activity">Activity HUD</a>
        <a href="/management-plane">L4A Management</a>
        <a className="active" href="/agent-work" aria-current="page">Agent work</a>
        <a href="https://approvals.comindinc.com">Approvals</a>
      </nav>
      <div className="hud-side-note">Durable Test evidence is the source. This view does not grant approval or restart work.</div>
    </aside>
    <section className="hud-content">
      <header className="hud-topbar"><div className="hud-breadcrumb">CoMind / Operator Console / Agent work</div></header>
      <div className="hud-heading"><div><p className="hud-eyebrow">AGCOL accountability</p><h1>Agent work</h1>
        <p>Where specialists worked, their latest recorded phase, and which claims need review.</p></div>
        <button className="hud-refresh" onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>
      <div className="hud-data-note" role="status">Execution mode: bounded Supabase Test invocation. Persistent agent service: off. Host location for each historical run is not recorded in this projection.</div>
      {error && <div className="hud-read-error" role="alert">{error}</div>}
      {snapshot && <div className="hud-data-note">Latest {snapshot.coverage_limit}. Snapshot {timestamp(snapshot.generated_at)}. Source: Foundry lease and AGCOL evidence.</div>}
      {snapshot?.work.length === 0 && <p>No AGCOL Test runs were recorded within this source coverage.</p>}
      <div style={{ display: "grid", gap: "1rem", padding: "1rem 0" }}>
        {snapshot?.work.map(item => <article key={`${item.run_key}:${item.task_id}`} style={{ border: "1px solid #566678", borderRadius: 12, padding: "1rem", minWidth: 0 }}>
          <h2 style={{ overflowWrap: "anywhere" }}>{item.specialist_key} <small>({item.attention.replaceAll("_", " ")})</small></h2>
          <p>Run: <code>{item.run_key}</code> · Capability: {item.capability_code}</p>
          <p>Phase: {item.phase ?? "No observation"} · Lease: {item.lease_state ?? "Unknown"} · Last observation: {timestamp(item.observed_at)}</p>
          {item.lease_state === "leased" && <p>Lease expiry: {timestamp(item.lease_expires_at)}. An expired claim needs reconciliation before retry.</p>}
          {item.blocker_code && <p role="alert">Stop reason: {item.blocker_code}. Review the canonical evidence before resuming.</p>}
          <details><summary>Evidence and identity</summary>
            <p>Task: <code>{item.task_id}</code> · Profile: <code>{item.profile_id}</code> · Fencing epoch: {item.fencing_epoch ?? "Unknown"}</p>
            <p>Manifest: <code>{item.manifest_id}</code> · Progress: <code>{item.progress_id ?? "None"}</code> · Result: <code>{item.result_ref ?? "None"}</code></p>
          </details>
        </article>)}
      </div>
      <p><a href="https://approvals.comindinc.com">Review governed approvals</a> · <a href="https://github.com/jlhogarth/CoMind/issues/559">Accountability development lane</a></p>
      <p>Brainstorming intake and AED recovery actions are planned integrations. This view does not claim they are operating.</p>
    </section>
  </main>;
}
