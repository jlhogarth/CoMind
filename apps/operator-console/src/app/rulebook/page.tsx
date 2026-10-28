"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, RefreshCw, ShieldCheck } from "lucide-react";
import { assertActivityHudTestProject } from "@/lib/activity-hud/source";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  completionRatio,
  needsRulebookAttention,
  sortRulebookRows,
  type RulebookControlRow,
  type RulebookHealth,
} from "@/lib/rulebook-hud/model";

const healthLabels: Record<RulebookHealth, string> = {
  healthy: "Healthy",
  warning: "Verification pending",
  blocking: "Blocking",
  unknown: "Unknown",
};

function downloadStatus(rows: RulebookControlRow[]) {
  const report = {
    generated_at: new Date().toISOString(),
    environment: "CoMind Test",
    purpose: "RuleBook successor-remediation control health review",
    coverage_limit: "Status projection only. No sensitive policy context, evidence payload, tenant identifiers, or secret references are included.",
    controls: rows,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "comind-rulebook-control-status.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function RulebookHudPage() {
  const [rows, setRows] = useState<RulebookControlRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [healthFilter, setHealthFilter] = useState("all");
  const [coverageFilter, setCoverageFilter] = useState("all");
  const [query, setQuery] = useState("");
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
        assertActivityHudTestProject(getPublicSupabaseConfig().url);
        const { data, error } = await getBrowserSupabaseClient()
          .from("v_rulebook_control_hud_test")
          .select("*")
          .order("layer0_section", { ascending: true });
        if (error) throw error;
        const nextRows = (data ?? []) as unknown as RulebookControlRow[];
        if (nextRows.some((row) => row.is_synthetic !== true)) {
          throw new Error("RuleBook HUD Test projection returned a row outside its synthetic status boundary.");
        }
        if (active) {
          setRows(nextRows);
          setLastRefreshed(new Date().toISOString());
        }
      } catch (error) {
        if (active) {
          setRows([]);
          setSourceError(error instanceof Error ? error.message : "Unknown RuleBook HUD read error");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [refreshNonce]);

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sortRulebookRows(rows.filter((row) => {
      const searchMatches = !normalized || [row.control_key, row.family_name, String(row.layer0_section)]
        .join(" ").toLowerCase().includes(normalized);
      const healthMatches = healthFilter === "all" || row.health_state === healthFilter;
      const coverageMatches = coverageFilter === "all" || row.source_coverage_state === coverageFilter;
      return searchMatches && healthMatches && coverageMatches;
    }));
  }, [coverageFilter, healthFilter, query, rows]);

  const attention = rows.filter(needsRulebookAttention).length;
  const healthy = rows.filter((row) => row.health_state === "healthy").length;
  const verified = rows.reduce((sum, row) => sum + row.verified_count, 0);
  const requirements = rows.reduce((sum, row) => sum + row.requirements_total, 0);

  return (
    <main className="hud-shell">
      <aside className="hud-sidebar">
        <a className="hud-brand" href="/">CoMind <span>Operator Console</span></a>
        <div className="hud-env"><i /> TEST ENVIRONMENT</div>
        <nav aria-label="Operator Console">
          <a href="/">Overview</a>
          <a href="/activity">Activity HUD</a>
          <a className="active" href="/rulebook" aria-current="page">RuleBook HUD</a>
        </nav>
        <div className="hud-side-note">
          <b>Policy data stays private</b>
          This page shows control health and verification counts only. Runtime context, exception reasons, tenant IDs, evidence payloads, and secret references remain outside the browser projection.
        </div>
      </aside>

      <section className="hud-content">
        <header className="hud-topbar">
          <div className="hud-breadcrumb">CoMind <span>/</span> Operator Console <span>/</span> <b>RuleBook HUD</b></div>
          <div className={`hud-source-state ${sourceError ? "source-error" : "source-connected"}`}>
            <i /> {sourceError ? "Supabase Test read failed" : isLoading ? "Refreshing RuleBook status" : "Supabase Test · status-only view"}
          </div>
        </header>

        <div className="hud-heading">
          <div>
            <p className="hud-eyebrow">Governance control plane</p>
            <h1>RuleBook Control HUD</h1>
            <p>Track the twelve historical successor deficiencies as explicit modern controls, including runtime gates, verification coverage, exceptions, and scheduled health checks.</p>
          </div>
          <div className="hud-heading-actions">
            <button className="hud-refresh" onClick={() => setRefreshNonce((value) => value + 1)} disabled={isLoading}>
              <RefreshCw size={14} /> {isLoading ? "Refreshing" : "Refresh"}
            </button>
            <button className="hud-export" onClick={() => downloadStatus(visibleRows)} disabled={visibleRows.length === 0}>
              <ArrowDownToLine size={15} /> Export status
            </button>
          </div>
        </div>

        <div className="hud-data-note" role="status">
          <ShieldCheck size={16} />
          <span>Connected to <code>public.v_rulebook_control_hud_test</code>, a read-only Test projection. Health refresh is automated every 15 minutes in Supabase Test. Last browser refresh: {lastRefreshed ? new Date(lastRefreshed).toLocaleString() : "not yet"}.</span>
        </div>
        {sourceError && <div className="hud-read-error" role="alert">RuleBook HUD read failed: {sourceError}</div>}

        <div className="cards">
          <article className="card"><h2>{healthy}</h2><p>Healthy controls</p></article>
          <article className="card"><h2>{attention}</h2><p>Need verification or review</p></article>
          <article className="card"><h2>{verified}/{requirements}</h2><p>Verified requirements</p></article>
          <article className="card"><h2>{rows.length}</h2><p>Deficiency families governed</p></article>
        </div>

        <div className="hud-filters">
          <label>Search <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="section, control, family" /></label>
          <label>Health <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
            <option value="all">All</option><option value="blocking">Blocking</option><option value="warning">Verification pending</option><option value="healthy">Healthy</option><option value="unknown">Unknown</option>
          </select></label>
          <label>Original disposition <select value={coverageFilter} onChange={(event) => setCoverageFilter(event.target.value)}>
            <option value="all">All</option><option value="modern_governance_gap">Original GAP</option><option value="modern_coverage_partial">Original PARTIAL</option>
          </select></label>
        </div>

        <section aria-label="RuleBook controls">
          {visibleRows.map((row) => (
            <article className="activity-card" key={row.control_key}>
              <div className="activity-card-main">
                <div className="activity-state-column">
                  <span className="state-pill"><i aria-hidden="true" />{healthLabels[row.health_state]}</span>
                  <span className="activity-key">§{row.layer0_section} · {row.control_key}</span>
                </div>
                <div className="activity-summary-column">
                  <div className="activity-title-row"><h3>{row.family_name}</h3></div>
                  <p>{row.coverage_note}</p>
                  <p><b>Remediation:</b> {row.remediation_state.replaceAll("_", " ")} · <b>Verified:</b> {row.verified_count}/{row.requirements_total} ({Math.round(completionRatio(row) * 100)}%) · <b>Operational:</b> {row.operational_count} · <b>Open exceptions:</b> {row.open_exception_count}</p>
                  <p><b>Health checked:</b> {new Date(row.last_checked_at).toLocaleString()} {row.next_review_at ? `· Next review ${new Date(row.next_review_at).toLocaleDateString()}` : ""}</p>
                </div>
              </div>
            </article>
          ))}
          {!isLoading && visibleRows.length === 0 && <div className="hud-data-note">No RuleBook controls match the current filters.</div>}
        </section>
      </section>
    </main>
  );
}
