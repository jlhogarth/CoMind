"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, ShieldCheck, Workflow } from "lucide-react";

import {
  deriveManagementLaneState,
  managementCounts,
  sortManagementLanes,
  type ManagementLane,
  type ManagementLaneState,
  type ManagementPlaneSnapshot,
} from "@/lib/management-plane/model";
import styles from "./management-plane.module.css";

const labels: Record<ManagementLaneState, string> = {
  WORKING: "Working",
  WAITING_CI: "Waiting CI",
  RECOVERY: "Recovery",
  BLOCKED: "Blocked",
  AUTH_REQUIRED: "Auth required",
  HUMAN_STOP: "Human stop",
  STALE: "Stale",
  READY_TO_MERGE: "Ready to merge",
  REVIEW: "Review",
  QUEUED: "Queued",
  DEFERRED: "Deferred",
  COMPLETE: "Complete",
  UNKNOWN: "Unknown",
};

function when(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Time unavailable" : parsed.toLocaleString();
}

function githubUrl(kind: "issue" | "pull", value?: string) {
  if (!value || !/^\d+$/.test(value)) return null;
  return `https://github.com/jlhogarth/CoMind/${kind === "issue" ? "issues" : "pull"}/${value}`;
}

function LaneCard({ lane }: { lane: ManagementLane }) {
  const state = deriveManagementLaneState(lane);
  const issueUrl = githubUrl("issue", lane.github?.issue);
  const prUrl = githubUrl("pull", lane.github?.pull_request);
  const checks = lane.github?.checks_total ? `${lane.github.checks_success ?? "?"}/${lane.github.checks_total}` : "Not recorded";
  return (
    <article className={styles.laneCard}>
      <div className={styles.laneHead}>
        <span className={`${styles.state} ${styles[`state${state}`] ?? ""}`}>{labels[state]}</span>
        <span className={styles.key}>{lane.work_key}</span>
        <span className={styles.priority}>{lane.priority}</span>
      </div>
      <div className={styles.laneBody}>
        <div>
          <h3>{lane.title}</h3>
          <p>{lane.current_summary ?? lane.latest_result ?? "No durable summary is recorded."}</p>
          <div className={styles.meta}>
            <span>{lane.area ?? "Unclassified area"}</span>
            <span>Owner: {lane.owner ?? "Unassigned"}</span>
            <span>Last durable event: {when(lane.last_event_at)}</span>
          </div>
        </div>
        <div className={styles.snapshot}>
          <b>GitHub / CI snapshot</b>
          <span>Issue: {issueUrl ? <a href={issueUrl} target="_blank" rel="noreferrer">#{lane.github?.issue} <ExternalLink size={11} /></a> : "Not recorded"}</span>
          <span>PR: {prUrl ? <a href={prUrl} target="_blank" rel="noreferrer">#{lane.github?.pull_request} <ExternalLink size={11} /></a> : "Not recorded"}</span>
          <span>Checks: {checks}</span>
          <span>Freshness: {lane.github?.freshness ?? "Unknown"}</span>
          <span>Mergeable: {lane.github?.mergeable === undefined ? "Unknown" : lane.github.mergeable ? "Yes" : "No"}</span>
        </div>
      </div>
      <details className={styles.details}>
        <summary>Next action and evidence</summary>
        <dl>
          <div><dt>Next action</dt><dd>{lane.next_action ?? "No next action recorded"}</dd></div>
          <div><dt>Latest event</dt><dd>{lane.latest_event_type ?? "None"} / {lane.latest_outcome ?? "unknown"}</dd></div>
          <div><dt>Latest result</dt><dd>{lane.latest_result ?? "No result recorded"}</dd></div>
          <div><dt>Branch</dt><dd>{lane.github?.branch ?? "Not recorded"}</dd></div>
          <div><dt>Head SHA</dt><dd><code>{lane.github?.head_sha ?? "Not recorded"}</code></dd></div>
          <div><dt>Base SHA</dt><dd><code>{lane.github?.base_sha ?? "Not recorded"}</code></dd></div>
          <div><dt>Production change</dt><dd>{lane.production_change ? "Recorded true" : "No Production change recorded"}</dd></div>
        </dl>
      </details>
    </article>
  );
}

export default function ManagementPlanePage() {
  const [snapshot, setSnapshot] = useState<ManagementPlaneSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");

  useEffect(() => {
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/management-plane", { cache: "no-store", headers: { Accept: "application/json" } });
        const data = await response.json() as ManagementPlaneSnapshot | { error?: string };
        if (!response.ok || !("lanes" in data)) throw new Error("error" in data && data.error ? data.error : "Management-plane read failed");
        if (active) setSnapshot(data);
      } catch (readError) {
        if (active) {
          setSnapshot(null);
          setError(readError instanceof Error ? readError.message : "Management-plane read failed");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [refresh]);

  const lanes = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLowerCase();
    return sortManagementLanes(snapshot.lanes.filter((lane) => {
      const state = deriveManagementLaneState(lane);
      const stateMatch = stateFilter === "all" || state === stateFilter;
      const textMatch = !needle || [lane.work_key, lane.title, lane.area ?? "", lane.current_summary ?? "", lane.next_action ?? ""].join(" ").toLowerCase().includes(needle);
      return stateMatch && textMatch;
    }));
  }, [query, snapshot, stateFilter]);

  const counts = managementCounts(snapshot?.lanes ?? []);

  return (
    <main className="hud-shell">
      <aside className="hud-sidebar">
        <a className="hud-brand" href="/">CoMind <span>Operator Console</span></a>
        <div className="hud-env"><i /> L4A DEVELOPMENT MANAGEMENT</div>
        <nav aria-label="Operator Console">
          <a href="/">Overview</a>
          <a href="/activity">Activity HUD</a>
          <a className="active" href="/management-plane" aria-current="page">L4A Management</a>
          <a href="/rulebook">RuleBook HUD</a>
          <a href="/integrations">Integration Gateway</a>
        </nav>
        <div className="hud-side-note"><b>Projection, not a second source of truth</b>RunBook, authority, and evidence remain canonical. Controller heartbeats are observations only.</div>
      </aside>
      <section className="hud-content">
        <header className="hud-topbar">
          <div className="hud-breadcrumb">CoMind <span>/</span> Operator Console <span>/</span> <b>L4A Management Plane</b></div>
          <div className={`hud-source-state ${error ? "source-error" : "source-connected"}`}><i />{error ? "Management read failed" : loading ? "Refreshing durable state" : "Canonical durable snapshot"}</div>
        </header>
        <div className="hud-heading">
          <div><p className="hud-eyebrow">Development organization management plane</p><h1>L4A Management Plane</h1><p>See lanes, authority, blockers, durable PR/CI snapshots, controller heartbeats, next actions, and evidence freshness in one governed surface.</p></div>
          <div className="hud-heading-actions"><button className="hud-refresh" onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCw size={14} /> {loading ? "Refreshing" : "Refresh"}</button></div>
        </div>
        {snapshot && <div className="hud-data-note" role="status"><ShieldCheck size={16} /><span>{snapshot.coverage_limit} Snapshot generated {when(snapshot.generated_at)}.</span></div>}
        {error && <div className="hud-read-error" role="alert">{error}</div>}

        <div className={styles.metrics}>
          <article><strong>{snapshot?.authority.active ? "ACTIVE" : "UNAVAILABLE"}</strong><span>L4A authority</span></article>
          <article><strong>{counts.active}</strong><span>Active / unresolved lanes</span></article>
          <article><strong>{counts.waitingCi}</strong><span>Waiting on CI</span></article>
          <article><strong>{counts.readyToMerge}</strong><span>Durably ready to merge</span></article>
          <article><strong>{snapshot?.blockers.length ?? 0}</strong><span>Open canonical blockers</span></article>
          <article><strong>{counts.recovery}</strong><span>Recovery lanes</span></article>
        </div>

        <section className={styles.authority} aria-label="L4A authority and controllers">
          <article>
            <h2><ShieldCheck size={17} /> Authority</h2>
            <p><b>Level:</b> {snapshot?.authority.authority_level ?? "Unknown"}</p>
            <p><b>Autonomous merge:</b> {snapshot?.authority.autonomous_merge ? "Granted" : "Not established"}</p>
            <p><b>Autonomous recovery:</b> {snapshot?.authority.autonomous_recovery ? "Granted" : "Not established"}</p>
            <p><b>Production authority:</b> {snapshot?.authority.production_authority ? "Granted" : "NOT GRANTED"}</p>
            <details><summary>Mandatory human stops</summary><ul>{snapshot?.authority.human_stop_boundaries?.map((stop) => <li key={stop}>{stop}</li>)}</ul></details>
          </article>
          <article>
            <h2><Workflow size={17} /> Controllers</h2>
            {snapshot?.controllers.map((controller) => <div className={styles.controller} key={controller.work_key}>
              <b>{controller.title}</b><span>{controller.enabled ? "Enabled" : "Disabled"} / {controller.recorded_status ?? "No run status"}</span>
              <span>Observed: {when(controller.observed_at ?? controller.last_event_at)}</span>
              <span>Last selection: {controller.selected_lane ?? "Not recorded"}</span>
              {controller.requires_user_action && <em>Human action required</em>}
            </div>)}
          </article>
        </section>

        {snapshot && snapshot.blockers.length > 0 && <section className={styles.blockers}><h2><AlertTriangle size={18} /> Open blockers</h2>{snapshot.blockers.map((blocker) => <article key={blocker.work_key}><b>{blocker.work_key}: {blocker.title}</b><span>{blocker.current_summary ?? "No summary"}</span></article>)}</section>}

        <div className={styles.filters}>
          <label>Search <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="lane, area, next action" /></label>
          <label>State <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="all">All</option>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <span>{lanes.length} of {snapshot?.lanes.length ?? 0} lanes</span>
        </div>

        <section className={styles.lanes} aria-label="Canonical development lanes">{lanes.map((lane) => <LaneCard lane={lane} key={lane.work_key} />)}</section>
      </section>
    </main>
  );
}
