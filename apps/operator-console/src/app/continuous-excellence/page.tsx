"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

import type {
  ContinuousExcellenceStateCount,
  ContinuousExcellenceSummary,
} from "@/lib/continuous-excellence/service";

interface SnapshotResponse {
  available: boolean;
  summary?: ContinuousExcellenceSummary;
  states?: ContinuousExcellenceStateCount[];
  error?: string;
}

function displayState(value: string) {
  return value.replaceAll("_", " ");
}

function displayTime(value: string | null | undefined) {
  if (!value) return "none recorded";
  return new Date(value).toLocaleString();
}

export default function ContinuousExcellencePage() {
  const [summary, setSummary] = useState<ContinuousExcellenceSummary | null>(null);
  const [states, setStates] = useState<ContinuousExcellenceStateCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshNonce((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setSourceError(null);
      try {
        const response = await fetch("/api/continuous-excellence", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const body = (await response.json()) as SnapshotResponse;
        if (!response.ok || body.available !== true || !body.summary || !Array.isArray(body.states)) {
          throw new Error(body.error || `Continuous Excellence status unavailable (${response.status})`);
        }
        if (active) {
          setSummary(body.summary);
          setStates(body.states);
          setLastRefreshed(new Date().toISOString());
        }
      } catch (error) {
        if (active) {
          setSummary(null);
          setStates([]);
          setSourceError(error instanceof Error ? error.message : "Unknown Continuous Excellence read error");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [refreshNonce]);

  const groupedStates = useMemo(() => {
    const groups = new Map<string, ContinuousExcellenceStateCount[]>();
    for (const row of states) {
      const rows = groups.get(row.dimension) ?? [];
      rows.push(row);
      groups.set(row.dimension, rows);
    }
    return [...groups.entries()];
  }, [states]);

  return (
    <main className="hud-shell">
      <aside className="hud-sidebar">
        <a className="hud-brand" href="/">CoMind <span>Operator Console</span></a>
        <div className="hud-env"><i /> TEST ENVIRONMENT</div>
        <nav aria-label="Operator Console">
          <a href="/">Overview</a>
          <a href="/activity">Activity HUD</a>
          <a href="/rulebook">RuleBook HUD</a>
          <a className="active" href="/continuous-excellence" aria-current="page">Continuous Excellence</a>
        </nav>
        <div className="hud-side-note">
          <b>Prevent. Recover. Improve.</b>
          Continuous Excellence turns material friction, interruptions, missingness, and failures into recoverable state and evidence-backed systemic improvement.
        </div>
      </aside>

      <section className="hud-content">
        <header className="hud-topbar">
          <div className="hud-breadcrumb">CoMind <span>/</span> Operator Console <span>/</span> <b>Continuous Excellence</b></div>
          <div className={`hud-source-state ${sourceError ? "source-error" : "source-connected"}`}>
            <i /> {sourceError ? "Protected CE read unavailable" : isLoading ? "Refreshing CE status" : "Supabase Test · trusted server read"}
          </div>
        </header>

        <div className="hud-heading">
          <div>
            <p className="hud-eyebrow">Human-AI operating improvement layer</p>
            <h1>Continuous Excellence</h1>
            <p>Detect operational friction, preserve continuity, recover from interrupted work, and convert verified lessons into improvements without weakening human authority.</p>
          </div>
          <div className="hud-heading-actions">
            <button className="hud-refresh" onClick={() => setRefreshNonce((value) => value + 1)} disabled={isLoading}>
              <RefreshCw size={14} /> {isLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="hud-data-note" role="status">
          <ShieldCheck size={16} />
          <span>CE detail remains private. This page reads aggregate Test status through a server-only trusted perimeter. Browser roles cannot query the underlying CE tables or operator projections directly. Last browser refresh: {lastRefreshed ? new Date(lastRefreshed).toLocaleString() : "not yet"}.</span>
        </div>

        {sourceError && (
          <div className="hud-read-error" role="alert">
            Continuous Excellence status read failed: {sourceError}. The operating contract remains in force even when this protected projection is unavailable.
          </div>
        )}

        <div className="cards">
          <article className="card"><h2>{summary?.actionable_backlog_count ?? 0}</h2><p>Actionable signals</p></article>
          <article className="card"><h2>{summary?.recovery_attention_count ?? 0}</h2><p>Capsules needing recovery attention</p></article>
          <article className="card"><h2>{summary?.current_capsule_count ?? 0}</h2><p>Current continuity capsules</p></article>
          <article className="card"><h2>{summary?.validated_improvement_count ?? 0}</h2><p>Validated or retained improvements</p></article>
        </div>

        <section aria-label="Continuous Excellence operating model">
          <article className="activity-card">
            <div className="activity-card-main">
              <div className="activity-state-column">
                <span className="state-pill"><i aria-hidden="true" />Operating contract</span>
                <span className="activity-key">CE-001</span>
              </div>
              <div className="activity-summary-column">
                <div className="activity-title-row"><h3>Prevent · Recover · Improve</h3></div>
                <p><b>Improvement loop:</b> Observe → Diagnose → Propose → Implement → Validate → Measure → Retain or Revert.</p>
                <p><b>Recovery interrupts:</b> Reasoning Failed · Stopped thinking · Lost context · Lost conversation content · Recover · Resume from checkpoint.</p>
                <p><b>Completion rule:</b> activity is not completion. Consequential completion requires explicit criteria, verification, and inspectable evidence.</p>
              </div>
            </div>
          </article>
        </section>

        {summary && (
          <section aria-label="Continuous Excellence aggregate health">
            <article className="activity-card">
              <div className="activity-card-main">
                <div className="activity-state-column">
                  <span className="state-pill"><i aria-hidden="true" />Continuity</span>
                  <span className="activity-key">Test aggregate</span>
                </div>
                <div className="activity-summary-column">
                  <div className="activity-title-row"><h3>Recovery readiness</h3></div>
                  <p><b>Ready capsules:</b> {summary.recovery_ready_count} · <b>Attention:</b> {summary.recovery_attention_count} · <b>Recovery interrupts recorded:</b> {summary.recovery_interrupt_count}</p>
                  <p><b>Latest capsule:</b> {displayTime(summary.latest_capsule_at)} · <b>Latest signal:</b> {displayTime(summary.latest_signal_at)}</p>
                  <p><b>Total signals:</b> {summary.signal_count} · <b>Total improvements:</b> {summary.improvement_count}</p>
                </div>
              </div>
            </article>
          </section>
        )}

        <section aria-label="Continuous Excellence state distribution">
          {groupedStates.map(([dimension, rows]) => (
            <article className="activity-card" key={dimension}>
              <div className="activity-card-main">
                <div className="activity-state-column">
                  <span className="state-pill"><i aria-hidden="true" />Distribution</span>
                  <span className="activity-key">{displayState(dimension)}</span>
                </div>
                <div className="activity-summary-column">
                  <div className="activity-title-row"><h3>{displayState(dimension)}</h3></div>
                  <p>{rows.map((row) => `${displayState(row.state)}: ${row.item_count}`).join(" · ")}</p>
                </div>
              </div>
            </article>
          ))}
          {!isLoading && !sourceError && groupedStates.length === 0 && (
            <div className="hud-data-note">No Continuous Excellence events have been durably recorded yet. The foundation is ready for its first real signal and Continuity Capsule.</div>
          )}
        </section>
      </section>
    </main>
  );
}
