import { Network, ShieldCheck } from "lucide-react";

import {
  integrationGatewayProcess,
  integrationGatewaySnapshot,
  isPublicIntegrationGatewaySnapshotSafe,
  l4aMandatoryStops,
} from "@/lib/integration-gateway/model";

export default function IntegrationGatewayPage() {
  const snapshot = integrationGatewaySnapshot;
  if (!isPublicIntegrationGatewaySnapshotSafe(snapshot)) {
    throw new Error("Integration Gateway status projection violated its non-secret boundary");
  }

  return (
    <main className="hud-shell">
      <aside className="hud-sidebar">
        <a className="hud-brand" href="/">CoMind <span>Operator Console</span></a>
        <div className="hud-env"><i /> GOVERNED DEVELOPMENT / TEST</div>
        <nav aria-label="Operator Console">
          <a href="/">Overview</a>
          <a href="/activity">Activity HUD</a>
          <a href="/rulebook">RuleBook HUD</a>
          <a className="active" href="/integrations" aria-current="page">Integration Gateway</a>
        </nav>
        <div className="hud-side-note">
          <b>Credentials stay outside CoMind evidence</b>
          This surface shows only governed status and process metadata. OAuth tokens, passwords, API keys, authorization headers, and equivalent secret material are excluded.
        </div>
      </aside>

      <section className="hud-content">
        <header className="hud-topbar">
          <div className="hud-breadcrumb">CoMind <span>/</span> Operator Console <span>/</span> <b>Integration Gateway</b></div>
          <div className="hud-source-state source-connected"><i /> CIG-001 verified snapshot</div>
        </header>

        <div className="hud-heading">
          <div>
            <p className="hud-eyebrow">Governed external execution</p>
            <h1>CoMind Integration Gateway</h1>
            <p>Composio supplies managed external-tool connectivity. CoMind retains authority, RuleBook governance, L4A stop boundaries, provenance, and final human control.</p>
          </div>
        </div>

        <div className="hud-data-note" role="status">
          <ShieldCheck size={16} />
          <span>This is a verified CIG-001 status snapshot, not a promise that OAuth is permanently active. Every consequential action must recheck connection state and current durable authority before execution.</span>
        </div>

        <div className="cards">
          <article className="card"><h2>{snapshot.provider}</h2><p>Managed integration provider</p></article>
          <article className="card"><h2>{snapshot.authority}</h2><p>Bounded autonomous authority</p></article>
          <article className="card"><h2>{snapshot.connections.length}</h2><p>Verified initial toolkits</p></article>
          <article className="card"><h2>OFF</h2><p>Production authority</p></article>
        </div>

        <section aria-label="Verified integration connections">
          {snapshot.connections.map((connection) => (
            <article className="activity-card" key={connection.toolkit}>
              <div className="activity-card-main">
                <div className="activity-state-column">
                  <span className="state-pill"><i aria-hidden="true" />{connection.status}</span>
                  <span className="activity-key">CIG-001</span>
                </div>
                <div className="activity-summary-column">
                  <div className="activity-title-row"><h3>{connection.toolkit}</h3></div>
                  <p><b>Scope:</b> {connection.scope}</p>
                  <p><b>Authentication:</b> {connection.authentication}. Raw credentials are not exposed to this Console surface.</p>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="activity-card" aria-labelledby="gateway-process-title">
          <div className="activity-card-main">
            <div className="activity-state-column"><Network size={22} aria-hidden="true" /><span className="activity-key">PROCESS</span></div>
            <div className="activity-summary-column">
              <div className="activity-title-row"><h3 id="gateway-process-title">Canonical execution sequence</h3></div>
              <ol>{integrationGatewayProcess.map((step) => <li key={step}>{step}</li>)}</ol>
            </div>
          </div>
        </section>

        <section className="activity-card" aria-labelledby="gateway-stops-title">
          <div className="activity-card-main">
            <div className="activity-state-column"><ShieldCheck size={22} aria-hidden="true" /><span className="activity-key">HUMAN GATES</span></div>
            <div className="activity-summary-column">
              <div className="activity-title-row"><h3 id="gateway-stops-title">L4A mandatory stops remain unchanged</h3></div>
              <ul>{l4aMandatoryStops.map((stop) => <li key={stop}>{stop}</li>)}</ul>
            </div>
          </div>
        </section>

        <div className="hud-data-note">
          Canonical records: <a href="https://github.com/jlhogarth/CoMind/issues/414" target="_blank" rel="noreferrer">CIG-001 issue #414</a> · <a href="https://github.com/jlhogarth/CoMind/blob/main/docs/governance/COMIND-DEVELOPMENT-ENVIRONMENT-CONTRACT.md" target="_blank" rel="noreferrer">Development Contract</a> · <a href="https://github.com/jlhogarth/CoMind/blob/main/docs/governance/rulebook-control-plane.md" target="_blank" rel="noreferrer">RuleBook Control Plane</a>.
        </div>
      </section>
    </main>
  );
}
