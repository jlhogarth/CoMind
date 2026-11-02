"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, KeyRound, Play, RefreshCw, RotateCcw, ShieldCheck, Smartphone, Square, Zap } from "lucide-react";
import type { CbeControlAction, CbeControlStatus } from "@/lib/cbe-control/model";
import styles from "./cbe-control.module.css";

const icons: Record<CbeControlAction, typeof Play> = {
  start_browser: Play,
  stop_browser: Square,
  retry_recovery: RotateCcw,
  open_auth: KeyRound,
  wake_conversation: Zap,
};

function when(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Time unavailable" : parsed.toLocaleString();
}

export default function CbeControlPage() {
  const [status, setStatus] = useState<CbeControlStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selectedWorkKey, setSelectedWorkKey] = useState("");
  const [busy, setBusy] = useState<CbeControlAction | null>(null);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string; url?: string | null } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const response = await fetch("/api/cbe-control", { cache: "no-store", headers: { Accept: "application/json" } });
        const data = await response.json() as CbeControlStatus | { error?: string };
        if (!response.ok || !("actions" in data)) throw new Error("error" in data && data.error ? data.error : "CBE control status read failed");
        if (active) setStatus(data);
      } catch (readError) {
        if (active) { setStatus(null); setError(readError instanceof Error ? readError.message : "CBE control status read failed"); }
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [refresh]);

  const laneOptions = useMemo(() => status?.lanes ?? [], [status]);

  const runAction = async (action: CbeControlAction, requiresWorkKey: boolean) => {
    if (requiresWorkKey && !selectedWorkKey) return;
    setBusy(action); setLastResult(null);
    try {
      const response = await fetch("/api/cbe-control", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action, ...(requiresWorkKey ? { work_key: selectedWorkKey } : {}) }),
      });
      const data = await response.json() as { message?: string; error?: string; human_action_url?: string | null };
      if (!response.ok) throw new Error(data.error ?? `Control request failed with HTTP ${response.status}`);
      setLastResult({ ok: true, message: data.message ?? "Control request accepted.", url: data.human_action_url });
      setRefresh((value) => value + 1);
    } catch (actionError) {
      setLastResult({ ok: false, message: actionError instanceof Error ? actionError.message : "Control request failed." });
    } finally { setBusy(null); }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <a href="/" className={styles.back}>CoMind</a>
        <div className={styles.device}><Smartphone size={15} /> Mobile Control</div>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div><p>CBE CONTROL PLANE</p><h1>Control without the terminal.</h1><span>Phone-first commands, durable status, human authority, separate execution.</span></div>
          <button className={styles.refresh} onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCw size={16} /> {loading ? "Refreshing" : "Refresh"}</button>
        </div>

        {error ? <div className={styles.error} role="alert">{error}</div> : null}

        <section className={styles.statusGrid} aria-label="CBE control status">
          <article><Activity size={18} /><strong>{status?.execution_adapter.configured ? "BOUND" : "UNAVAILABLE"}</strong><span>Execution adapter</span><small>{status?.execution_adapter.endpoint_origin ?? "No actuator endpoint configured"}</small></article>
          <article><ShieldCheck size={18} /><strong>{status?.authority.active ? "ACTIVE" : "UNAVAILABLE"}</strong><span>{status?.authority.level ?? "Authority unknown"}</span><small>Production authority: {status?.authority.production_authority ? "recorded" : "not granted"}</small></article>
        </section>

        <section className={styles.target}>
          <label htmlFor="work-key">Target lane</label>
          <select id="work-key" value={selectedWorkKey} onChange={(event) => setSelectedWorkKey(event.target.value)}>
            <option value="">Select only when the action needs a lane</option>
            {laneOptions.map((lane) => <option key={lane.work_key} value={lane.work_key}>{lane.work_key}: {lane.title}</option>)}
          </select>
          <small>Retry and conversation wake require an explicit lane selection. No implicit target is chosen.</small>
        </section>

        <section className={styles.controls} aria-label="Bounded CBE controls">
          {status?.actions.map((control) => {
            const Icon = icons[control.action];
            const missingTarget = control.requires_work_key && !selectedWorkKey;
            return <button key={control.action} className={styles.control} disabled={!control.available || missingTarget || busy !== null} onClick={() => void runAction(control.action, control.requires_work_key)}>
              <span className={styles.controlIcon}><Icon size={22} /></span>
              <span className={styles.controlText}><b>{busy === control.action ? "Sending..." : control.label}</b><small>{missingTarget && control.available ? "Select a target lane first." : control.reason}</small></span>
              <span className={`${styles.state} ${control.available ? styles.available : ""}`}>{control.state}</span>
            </button>;
          })}
        </section>

        {lastResult ? <section className={`${styles.result} ${lastResult.ok ? styles.resultOk : styles.resultError}`} role="status"><b>{lastResult.ok ? "Accepted" : "Not executed"}</b><span>{lastResult.message}</span>{lastResult.url ? <a href={lastResult.url} target="_blank" rel="noreferrer">Open human login</a> : null}</section> : null}

        <section className={styles.lanes}>
          <div className={styles.sectionTitle}><h2>Relevant durable lanes</h2><span>{status?.lanes.length ?? 0}</span></div>
          {status?.lanes.length ? status.lanes.map((lane) => <article key={lane.work_key}><div><b>{lane.work_key}</b><span>{lane.status}</span></div><h3>{lane.title}</h3><p>{lane.current_summary ?? "No durable summary recorded."}</p><small>Next: {lane.next_action ?? "No next action recorded"}</small><time>{when(lane.last_event_at)}</time></article>) : <div className={styles.empty}>No CBE/AED/browser lane is currently present in the durable management snapshot.</div>}
        </section>

        <footer className={styles.footer}>Development/Test only. Secrets stay server-side. Unavailable means unavailable, never simulated success.</footer>
      </section>
    </main>
  );
}
