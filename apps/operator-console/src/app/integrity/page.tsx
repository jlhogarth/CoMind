import type { Metadata } from "next";
import { readIntegrityConsoleSnapshot } from "@/lib/integrity/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Implementation Integrity" };

const colors: Record<string, string> = {
  current: "#126d45", stale: "#b76308", failed: "#a12c33",
  pending: "#8b6000", unavailable: "#8a3c36",
};

export default async function IntegrityPage() {
  const info = await readIntegrityConsoleSnapshot();
  const stateLabel = {
    current: "Current GitHub check",
    stale: "Stale evidence",
    failed: "Failed integrity workflow",
    pending: "Verification pending",
    unavailable: "Source unavailable",
  }[info.state];
  return (
    <main className="hud-shell">
      <aside className="hud-sidebar">
        <a className="hud-brand" href="/">CoMind <span>Operator Console</span></a>
        <div className="hud-env"><i /> DEVELOPMENT / TEST</div>
        <nav aria-label="Operator Console">
          <a href="/">Overview</a>
          <a href="/activity">Activity HUD</a>
          <a href="/rulebook">RuleBook HUD</a>
          <a href="/integrations">Integration Gateway</a>
          <a className="active" aria-current="page" href="/integrity">Implementation Integrity</a>
        </nav>
        <div className="hud-side-note">
          <b>Read-only evidence</b>
          Source observation does not confer execution authority. A passing CI run does not
          prove runtime operation or Production readiness.
        </div>
      </aside>
      <section className="hud-content">
        <header className="hud-topbar">
          <div className="hud-breadcrumb">CoMind <span>/</span> Operator Console <span>/</span> <b>Integrity</b></div>
          <div className="hud-source-state" role="status">
            <i /> GitHub main · {stateLabel}
          </div>
        </header>
        <div className="hud-heading">
          <div>
            <p className="hud-eyebrow">IIC-001 through IIC-008</p>
            <h1>Implementation Reality</h1>
            <p>Exact-revision integrity evidence and canonical control maturity. Evidence and
              human approval remain separate. Production status is not inferred.</p>
          </div>
        </div>
        <section className="hud-data-note" aria-label="Evidence state" role="status"
          style={{ borderLeft: "4px solid " + colors[info.state] }}>
          <strong>{stateLabel}</strong>
          <span>{info.explanation}</span>
        </section>
        <div className="cards" aria-label="Integrity source and authority">
          <article className="card">
            <h2>{info.state.toUpperCase()}</h2>
            <p>Exact-main workflow evidence</p>
          </article>
          <article className="card">
            <h2>{info.controls.length ? info.controls.filter(x=>x.enforcement==="blocking").length : "Unavailable"}</h2>
            <p>Registry-reported blocking controls, not repository ruleset proof</p>
          </article>
          <article className="card">
            <h2>Not established</h2>
            <p>Production approval / graph authority</p>
          </article>
          <article className="card">
            <h2>Unbound</h2>
            <p>Private RunBook evidence stream</p>
          </article>
        </div>
        <section className="activity-card" aria-labelledby="integrity-provenance">
          <div className="activity-card-main">
            <div className="activity-summary-column">
              <h2 id="integrity-provenance">Source, freshness, and authority</h2>
              <dl>
                <dt>Environment scope</dt><dd>{info.environment}</dd>
                <dt>Exact main revision</dt><dd><code>{info.revision ?? "Unavailable"}</code></dd>
                <dt>Observed</dt><dd>{info.observedAt}</dd>
                <dt>Recorded</dt><dd>{info.sourceRecordedAt ?? "Unavailable"}</dd>
                <dt>Freshness deadline (24h)</dt><dd>{info.expiresAt ?? "Unavailable"}</dd>
                <dt>CI conclusion</dt><dd>{info.sourceConclusion ?? "Unavailable"}</dd>
                <dt>Evidence</dt><dd>{info.runUrl
                  ? <a href={info.runUrl} target="_blank" rel="noreferrer">GitHub workflow run #{info.runId}</a>
                  : "No verified current-main workflow reference"}</dd>
                <dt>RunBook</dt><dd>Private source not connected to this route. No status inferred.</dd>
                <dt>Production authority</dt><dd>Not established by this projection</dd>
              </dl>
            </div>
          </div>
        </section>
        <section aria-labelledby="integrity-controls">
          <h2 id="integrity-controls">Canonical control registry</h2>
          {info.controls.length ? (
            <div className="cards">
              {info.controls.map(control => (
                <article className="card" key={control.control_id}>
                  <h3>{control.control_id} · {control.name}</h3>
                  <p>{control.maturity_state} · {control.enforcement}</p>
                </article>
              ))}
            </div>
          ) : <p role="status">Registry unavailable. No inferred controls or healthy state.</p>}
        </section>
        <div className="hud-data-note">
          <strong>Implementation Reality Graph limitation:</strong>
          <span>These panels consume exact-main CI and versioned registry evidence,
            not a live multi-source graph execution. Claim/evidence/authority graph
            evaluation remains a separate governed source binding.</span>
          <a href="https://github.com/jlhogarth/CoMind/blob/main/docs/integrity/IIC-008.md"
            target="_blank" rel="noreferrer">Graph contract</a>
        </div>
      </section>
    </main>
  );
}
