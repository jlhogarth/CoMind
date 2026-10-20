"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Clock3, ExternalLink, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { assertActivityHudTestProject } from "@/lib/activity-hud/source";
import {
  formatElapsed,
  hasNoTerminalReturn,
  needsInvestigation,
  paginateActivityRows,
  sortActivityRows,
  type ActivityHudRow,
  type ActivitySort,
  type HudState,
} from "@/lib/activity-hud/model";

const stateLabels: Record<HudState, string> = {
  queued: "Queued",
  running: "Running",
  waiting_external: "Waiting on source",
  cancellation_requested: "Cancellation requested",
  completed: "Completed",
  failed: "Returned failure",
  cancelled: "Cancelled",
  unknown: "Unknown",
  deadline_exceeded: "Deadline exceeded",
  stale_unknown: "Stale, no terminal return",
};

const stateDescriptions: Partial<Record<HudState, string>> = {
  deadline_exceeded: "The local deadline elapsed. The last source report is not a terminal result.",
  stale_unknown: "The source has stopped reporting within its expected interval. The outcome is unknown.",
  unknown: "No source observation is available. The outcome is unknown.",
  cancellation_requested: "Cancellation was requested. Source confirmation has not arrived.",
  failed: "The source returned a failure result. Review the linked evidence.",
};

function sourceLabel(source: string): string {
  return source.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateLabel(value: string | null): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
}

function downloadInvestigation(rows: ActivityHudRow[]) {
  const candidates = rows.filter((row) => !row.has_terminal_source_evidence);
  const report = {
    generated_at: new Date().toISOString(),
    purpose: "Review bounded Activity HUD observations with no terminal source result.",
    coverage_limit:
      "This report contains observed rows only. It does not claim complete history, a lossless feed, or snapshot consistency.",
    records: candidates.map((row) => ({
      activity_key: row.activity_key,
      source_system: row.source_system,
      source_ref: row.source_ref,
      title: row.title,
      owner_label: row.owner_label,
      started_at: row.started_at,
      last_observed_at: row.last_observed_at,
      last_reported_status: row.last_reported_status,
      hud_state: row.hud_state,
      evidence_based_resolution: row.evidence_based_resolution,
      latest_event_type: row.latest_event_type,
      last_source_event_ref: row.last_source_event_ref,
      last_observation_summary: row.last_observation_summary,
      last_evidence: row.last_evidence,
      is_synthetic: row.is_synthetic,
    })),
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "comind-activity-investigation.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function evidenceText(row: ActivityHudRow): string {
  return JSON.stringify(
    {
      activity_key: row.activity_key,
      source_ref: row.source_ref,
      hud_state: row.hud_state,
      last_reported_status: row.last_reported_status,
      last_observed_at: row.last_observed_at,
      last_source_event_ref: row.last_source_event_ref,
      last_observation_summary: row.last_observation_summary,
      last_evidence: row.last_evidence,
      coverage_limit: row.coverage_limit,
    },
    null,
    2,
  );
}

function ActivityCard({ row, now }: { row: ActivityHudRow; now: number }) {
  const unresolved = hasNoTerminalReturn(row);
  const investigate = needsInvestigation(row);
  const httpSource = /^https?:\/\//i.test(row.source_ref);

  return (
    <article className={`activity-card state-${row.hud_state}`}>
      <div className="activity-card-main">
        <div className="activity-state-column">
          <span className={`state-pill state-pill-${row.hud_state}`}>
            <i aria-hidden="true" />
            {stateLabels[row.hud_state]}
          </span>
          <span className="activity-key">{row.activity_key}</span>
        </div>
        <div className="activity-summary-column">
          <div className="activity-title-row">
            <h3>{row.title}</h3>
            {investigate && <span className="investigation-badge"><AlertTriangle size={13} /> Investigate</span>}
            {row.is_synthetic && <span className="synthetic-badge">Synthetic</span>}
          </div>
          <p>{row.last_observation_summary ?? "No source observation has been recorded."}</p>
          <div className="activity-meta">
            <span>{sourceLabel(row.source_system)}</span>
            <span>Owner: {row.owner_label ?? "Unassigned"}</span>
            <span>Started {formatElapsed(row.started_at, now)}</span>
            <span className={unresolved ? "age-emphasis" : ""}>
              Last report {formatElapsed(row.last_observed_at, now)}
            </span>
          </div>
          {stateDescriptions[row.hud_state] && (
            <div className={`state-explanation ${investigate ? "needs-investigation" : ""}`}>
              {stateDescriptions[row.hud_state]}
            </div>
          )}
        </div>
        <div className="activity-action-column">
          {row.evidence_based_resolution ? (
            <span className="resolution-pill">Source returned: {stateLabels[row.evidence_based_resolution]}</span>
          ) : (
            <span className="no-resolution">No confirmed resolution</span>
          )}
          <details className="activity-details">
            <summary>Evidence and timing</summary>
            <dl>
              <div><dt>Started</dt><dd>{dateLabel(row.started_at)}</dd></div>
              <div><dt>Last source observation</dt><dd>{dateLabel(row.last_source_occurred_at)}</dd></div>
              <div><dt>Recorded by HUD</dt><dd>{dateLabel(row.last_observed_at)}</dd></div>
              <div><dt>Expected deadline</dt><dd>{dateLabel(row.expected_deadline_at)}</dd></div>
              <div><dt>Last event</dt><dd>{row.latest_event_type ?? "None"}</dd></div>
              <div><dt>Source event ID</dt><dd>{row.last_source_event_ref ?? "Not provided"}</dd></div>
              <div className="source-reference"><dt>Source reference</dt><dd>
                {httpSource ? <a href={row.source_ref} target="_blank" rel="noreferrer">Open source <ExternalLink size={12} /></a> : <code>{row.source_ref}</code>}
              </dd></div>
            </dl>
            <div className="evidence-block"><b>Source evidence</b><pre>{JSON.stringify(row.last_evidence, null, 2)}</pre></div>
            <p className="coverage-note">{row.coverage_limit}</p>
          </details>
        </div>
      </div>
    </article>
  );
}

export default function ActivityHudPage() {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sort, setSort] = useState<ActivitySort>("investigation");
  const [now, setNow] = useState(() => Date.now());
  const [rows, setRows] = useState<ActivityHudRow[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [reportedTotal, setReportedTotal] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [reportAgeFilter, setReportAgeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      setRefreshNonce((current) => current + 1);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setSourceError(null);
      try {
        assertActivityHudTestProject(getPublicSupabaseConfig().url);
        const { data, error, count } = await getBrowserSupabaseClient()
          .from("v_activity_hud_test")
          .select("*", { count: "exact" })
          .order("has_terminal_source_evidence", { ascending: true, nullsFirst: true })
          .order("last_observed_at", { ascending: true, nullsFirst: true })
          .order("started_at", { ascending: true })
          .limit(1000);
        if (error) throw error;
        const nextRows = (data ?? []) as unknown as ActivityHudRow[];
        if (nextRows.some((row) => row.is_synthetic !== true)) {
          throw new Error("The Test browser projection returned a non-synthetic activity.");
        }
        if (active) {
          setRows(nextRows);
          setReportedTotal(count ?? nextRows.length);
          setLastRefreshed(new Date().toISOString());
        }
      } catch (error) {
        if (active) {
          setRows([]);
          setReportedTotal(0);
          setSourceError(error instanceof Error ? error.message : "Unknown Supabase read error");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [refreshNonce]);

  const sources = useMemo(() => [...new Set(rows.map((row) => row.source_system))].sort(), [rows]);
  const owners = useMemo(() => [...new Set(rows.map((row) => row.owner_label).filter((owner): owner is string => Boolean(owner)))].sort(), [rows]);
  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const matchesSearch = !normalized || [
        row.title,
        row.activity_key,
        row.source_system,
        row.source_ref,
        row.owner_label ?? "",
        row.last_observation_summary ?? "",
        row.last_source_event_ref ?? "",
      ].join(" ").toLowerCase().includes(normalized);
      const matchesState = stateFilter === "all"
        || (stateFilter === "investigate" && needsInvestigation(row))
        || row.hud_state === stateFilter;
      const matchesSource = sourceFilter === "all" || row.source_system === sourceFilter;
      const matchesOwner = ownerFilter === "all" || row.owner_label === ownerFilter;
      const matchesResult = resultFilter === "all"
        || (resultFilter === "no-terminal" && hasNoTerminalReturn(row))
        || (resultFilter === "terminal" && row.has_terminal_source_evidence)
        || (resultFilter === "failed" && row.evidence_based_resolution === "failed");
      const ageSeconds = row.last_observed_at ? Math.max(0, (now - Date.parse(row.last_observed_at)) / 1000) : Number.POSITIVE_INFINITY;
      const matchesAge = reportAgeFilter === "all"
        || (reportAgeFilter === "under-hour" && ageSeconds < 3600)
        || (reportAgeFilter === "one-to-24-hours" && ageSeconds >= 3600 && ageSeconds < 86400)
        || (reportAgeFilter === "over-24-hours" && ageSeconds >= 86400)
        || (reportAgeFilter === "never" && !row.last_observed_at);
      return matchesSearch && matchesState && matchesSource && matchesOwner && matchesResult && matchesAge;
    });
    return sortActivityRows(filtered, sort);
  }, [now, ownerFilter, query, reportAgeFilter, resultFilter, rows, sort, sourceFilter, stateFilter]);

  const pageData = useMemo(() => paginateActivityRows(visibleRows, page, pageSize), [page, pageSize, visibleRows]);
  const visiblePage = pageData.items;

  function resetPage(change: () => void) {
    change();
    setPage(1);
  }

  const noTerminal = rows.filter(hasNoTerminalReturn).length;
  const investigationCount = rows.filter(needsInvestigation).length;
  const failed = rows.filter((row) => row.hud_state === "failed").length;
  const resolved = rows.filter((row) => row.has_terminal_source_evidence).length;

  return (
    <main className="hud-shell">
      <aside className="hud-sidebar">
        <a className="hud-brand" href="/">CoMind <span>Operator Console</span></a>
        <div className="hud-env"><i /> TEST ENVIRONMENT</div>
        <nav aria-label="Operator Console">
          <a href="/">Overview</a>
          <a className="active" href="/activity" aria-current="page">Activity HUD</a>
        </nav>
        <div className="hud-side-note">
          <b>Source evidence stays separate</b>
          RunBook events, activity reports, PM decisions, Foundry authorizations, and human assessments remain distinct records.
        </div>
      </aside>

      <section className="hud-content">
        <header className="hud-topbar">
          <div className="hud-breadcrumb">CoMind <span>/</span> Operator Console <span>/</span> <b>Activity HUD</b></div>
          <div className={`hud-source-state ${sourceError ? "source-error" : "source-connected"}`}>
            <i /> {sourceError ? "Supabase Test read failed" : isLoading ? "Connecting to Supabase Test" : "Supabase Test · read-only synthetic view"}
          </div>
        </header>

        <div className="hud-heading">
          <div>
            <p className="hud-eyebrow">Bounded operational view</p>
            <h1>Activity HUD</h1>
            <p>Find work that stopped reporting, sort by time without a terminal return, and inspect the source evidence before deciding what to investigate.</p>
          </div>
          <div className="hud-heading-actions">
          <button className="hud-refresh" onClick={() => setRefreshNonce((current) => current + 1)} disabled={isLoading}>
            <RefreshCw size={14} /> {isLoading ? "Refreshing" : "Refresh"}
          </button>
          <button className="hud-export" onClick={() => downloadInvestigation(visibleRows)} disabled={visibleRows.length === 0}>
            <ArrowDownToLine size={15} /> Export no-return set
          </button>
          </div>
        </div>

        <div className="hud-data-note" role="status">
          <ShieldAlert size={16} />
          <span>Connected to <code>public.v_activity_hud_test</code>, a read-only Test projection limited to synthetic rows from <code>comind_hud_test.v_activity_hud</code>. It refreshes every 30 seconds and returns at most 1,000 rows per read. Results are bounded and changing, not a lossless feed or a fixed snapshot.</span>
        </div>
        {sourceError && <div className="hud-read-error" role="alert">Supabase read failed: {sourceError}. Confirm this app is configured for the CoMind Test project and reload.</div>}
        {reportedTotal > rows.length && <div className="hud-read-error" role="status">Showing {rows.length} of {reportedTotal} rows reported by the latest read. The 1,000-row query limit was reached, so some activities may not be shown.</div>}

        <div className="hud-stats" aria-label="Activity summary">
          <article className="hud-stat attention"><span>Needs investigation</span><b>{investigationCount}</b><small>Stale, overdue, unknown, awaiting cancellation, or returned failure</small></article>
          <article className="hud-stat pending"><span>No terminal result</span><b>{noTerminal}</b><small>Source has not confirmed completion, failure, or cancellation</small></article>
          <article className="hud-stat returned"><span>Terminal source result</span><b>{resolved}</b><small>{failed} returned failure · other terminal outcomes are listed</small></article>
          <article className="hud-stat sources"><span>Activities loaded</span><b>{rows.length}</b><small>{reportedTotal} rows reported · {sources.length} source types loaded</small></article>
        </div>

        <section className="hud-list-panel" aria-labelledby="activity-list-title">
          <div className="hud-list-heading">
            <div><h2 id="activity-list-title">Tracked activities</h2><p>{visibleRows.length} shown from {rows.length} loaded · sorted by {sort === "investigation" ? "investigation priority" : sort.replaceAll("_", " ")}</p></div>
            <span className="hud-snapshot-label"><Clock3 size={13} /> Last read {lastRefreshed ? new Date(lastRefreshed).toLocaleTimeString() : "not yet completed"} · refreshes every 30 seconds</span>
          </div>
          <div className="hud-filters">
            <label className="hud-search"><Search size={15} /><input value={query} onChange={(event) => resetPage(() => setQuery(event.target.value))} placeholder="Search activity, source, owner, evidence" /></label>
            <label className="sr-only" htmlFor="state-filter">Filter activity state</label>
            <select id="state-filter" value={stateFilter} onChange={(event) => resetPage(() => setStateFilter(event.target.value))}>
              <option value="all">All states</option>
              <option value="investigate">Needs investigation</option>
              {Object.entries(stateLabels).map(([state, label]) => <option key={state} value={state}>{label}</option>)}
            </select>
            <label className="sr-only" htmlFor="source-filter">Filter source</label>
            <select id="source-filter" value={sourceFilter} onChange={(event) => resetPage(() => setSourceFilter(event.target.value))}>
              <option value="all">All sources</option>
              {sources.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}
            </select>
            <label className="sr-only" htmlFor="owner-filter">Filter owner</label>
            <select id="owner-filter" value={ownerFilter} onChange={(event) => resetPage(() => setOwnerFilter(event.target.value))}>
              <option value="all">All owners</option>
              {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
            <label className="sr-only" htmlFor="result-filter">Filter source result</label>
            <select id="result-filter" value={resultFilter} onChange={(event) => resetPage(() => setResultFilter(event.target.value))}>
              <option value="all">All source results</option>
              <option value="no-terminal">No terminal result</option>
              <option value="terminal">Terminal result confirmed</option>
              <option value="failed">Returned failure</option>
            </select>
            <label className="sr-only" htmlFor="report-age-filter">Filter last report age</label>
            <select id="report-age-filter" value={reportAgeFilter} onChange={(event) => resetPage(() => setReportAgeFilter(event.target.value))}>
              <option value="all">Any report age</option>
              <option value="under-hour">Reported within 1 hour</option>
              <option value="one-to-24-hours">Reported 1–24 hours ago</option>
              <option value="over-24-hours">Reported over 24 hours ago</option>
              <option value="never">No report time</option>
            </select>
            <label className="sr-only" htmlFor="sort-order">Sort activities</label>
            <select id="sort-order" value={sort} onChange={(event) => resetPage(() => setSort(event.target.value as ActivitySort))}>
              <option value="investigation">Investigation priority</option>
              <option value="longest_wait">Longest without report</option>
              <option value="last_observed">Most recently observed</option>
              <option value="newest_started">Newest started</option>
              <option value="title">Title A to Z</option>
            </select>
          </div>

          <div className="hud-sort-explainer"><AlertTriangle size={14} /> Default ordering puts deadline overruns and stale or unconfirmed work first, then sorts unresolved rows by the oldest source observation. A local deadline is not a source failure.</div>

          <div className="activity-list" aria-live="polite">
            {visiblePage.length ? visiblePage.map((row) => <ActivityCard key={row.activity_id} row={row} now={now} />) : (
              <div className="hud-empty"><b>{isLoading ? "Loading Test activities" : "No matching activities"}</b><span>{isLoading ? "Reading the synthetic Activity HUD view from Supabase." : "Change the filters or search terms to see more rows."}</span></div>
            )}
          </div>
          <nav className="hud-pagination" aria-label="Activity pages">
            <span className="hud-page-count" aria-live="polite">Showing {pageData.firstItem}–{pageData.lastItem} of {pageData.total} matching activities · page {pageData.page} of {pageData.pageCount}</span>
            <div className="hud-page-controls">
              <label htmlFor="page-size">Rows per page</label>
              <select id="page-size" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
              </select>
              <button type="button" onClick={() => setPage(1)} disabled={pageData.page <= 1} aria-label="First page">First</button>
              <button type="button" onClick={() => setPage(Math.max(1, pageData.page - 1))} disabled={pageData.page <= 1} aria-label="Previous page">Previous</button>
              <button type="button" onClick={() => setPage(Math.min(pageData.pageCount, pageData.page + 1))} disabled={pageData.page >= pageData.pageCount} aria-label="Next page">Next</button>
              <button type="button" onClick={() => setPage(pageData.pageCount)} disabled={pageData.page >= pageData.pageCount} aria-label="Last page">Last</button>
            </div>
          </nav>
        </section>
        <footer className="hud-footer">Bounded observations only. This view does not establish complete history, a lossless feed, or snapshot consistency.</footer>
      </section>
    </main>
  );
}

