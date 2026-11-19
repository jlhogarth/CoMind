import { Network, ShieldCheck } from "lucide-react";
import { capabilityObservations, capabilityPreflight, isSafeCapabilityInventory } from "@/lib/integration-gateway/capabilities";

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
  if (!isSafeCapabilityInventory(capabilityObservations)) {
    throw new Error("Integration capability inventory violated its non-secret evidence boundary");
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
          <a href="/management-plane">L4A Management</a>
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
          <div className="hud-source-state source-connected"><i /> CIG-001 historical snapshot</div>
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
          <span>The CIG-001 connection snapshot was verified on {snapshot.verified_at.slice(0, 10)}. It is historical, not a current connection-health reading. Every consequential action must recheck connection state and current durable authority before execution.</span>
        </div>

        <div className="cards">
          <article className="card"><h2>{snapshot.provider}</h2><p>Managed integration provider</p></article>
          <article className="card"><h2>{snapshot.authority}</h2><p>Bounded autonomous authority</p></article>
          <article className="card"><h2>{snapshot.connections.length}</h2><p>Initial connection proofs</p></article>
          <article className="card"><h2>OFF</h2><p>Production authority</p></article>
        </div>

        <section aria-label="Historical integration connections">
          {snapshot.connections.map((connection) => (
            <article className="activity-card" key={connection.toolkit}>
              <div className="activity-card-main">
                <div className="activity-state-column">
                  <span className="state-pill"><i aria-hidden="true" />{connection.status} at snapshot</span>
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

        <section aria-label="Dated capability observations">
          <h2>Founder operator access checks</h2>
          <p>These are dated observations, not a live permission grant. Each action needs a fresh connection, scope and authority check before execution.</p>
          {capabilityObservations.map((item) => {
            const preflight = capabilityPreflight(item);
            return (
              <article className="activity-card" key={item.id}>
                <div className="activity-card-main">
                  <div className="activity-state-column">
                    <span className="state-pill">{preflight.historical_proof.replaceAll("_", " ")}</span>
                    <span className="activity-key">{item.observed_on ?? "No proof date"}</span>
                  </div>
                  <div className="activity-summary-column">
                    <div className="activity-title-row"><h3>{item.service}</h3></div>
                    <p><b>Account:</b> {item.account}</p>
                    <p><b>Observed action:</b> {item.action}</p>
                    <p><b>Next check:</b> {item.continuation}</p>
                    {item.evidence && <a href={item.evidence} target="_blank" rel="noreferrer">Inspect evidence</a>}
                  </div>
                </div>
              </article>
            );
          })}
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
