import { readRunBookLifecycleStatus } from "@/lib/runbook-lifecycle/server";

export const dynamic = "force-dynamic";

const eastern = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Indiana/Indianapolis",
});
const stateLabels = {
  waiting: "Within the scheduled check window",
  missed: "Scheduled receipt missing",
  conflicting_receipts: "Conflicting scheduled receipts",
  measurement_failed: "Scheduled measurement failed",
  late: "Scheduled receipt arrived late",
  current: "Scheduled receipt verified",
};

export default async function RunBookPage() {
  const status = await readRunBookLifecycleStatus().catch((error: unknown) => {
    const code = error && typeof error === "object" && "code" in error
      && typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code : "UNCLASSIFIED";
    console.error("RunBook status read failed", {
      code,
      preview: process.env.VERCEL_ENV === "preview",
      enabled: process.env.DRB_RUNBOOK_CONSOLE === "test",
      trustedPerimeter: process.env.DRB_RUNBOOK_CONSOLE_ACCESS === "trusted-test-perimeter",
      credentialConfigured: Boolean(process.env.DRB_RUNBOOK_CONSOLE_DATABASE_URL),
    });
    return null;
  });
  const latest = status?.latest;
  return (
    <main className="hud-shell">
      <aside className="hud-sidebar">
        <a className="hud-brand" href="/">CoMind <span>Operator Console</span></a>
        <div className="hud-env"><i /> TEST ENVIRONMENT</div>
        <nav aria-label="Operator Console">
          <a href="/">Overview</a>
          <a href="/activity">Activity HUD</a>
          <a className="active" href="/runbook" aria-current="page">RunBook</a>
        </nav>
      </aside>
      <section className="hud-main">
        <h1>RunBook health</h1>
        <p>Monday at 9 a.m. Eastern. Measurements use approximate UTF-16 units.</p>
        {status ? (
          <>
            <h2>{stateLabels[status.state]}</h2>
            <p>Due slot {eastern.format(new Date(status.due_at))} Eastern</p>
            {status.scheduled_receipt_id && <p>Scheduled receipt <code>{status.scheduled_receipt_id}</code></p>}
            {latest ? (
              <>
                <h2>{latest.trigger === "probe" ? "Latest observation · manual Test probe" : "Latest scheduled observation"}</h2>
                <dl>
                  <dt>Observed</dt><dd>{eastern.format(new Date(latest.observed_at))} Eastern</dd>
                  <dt>Size</dt><dd>{latest.units?.toLocaleString("en-US") ?? "Unavailable"}</dd>
                  <dt>Threshold</dt><dd>{latest.size.replaceAll("_", " ")}</dd>
                  <dt>Rollover</dt><dd>{latest.rollover.replaceAll("_", " ")}</dd>
                  <dt>Policy version</dt><dd>{latest.policy_version}</dd>
                  <dt>Evidence receipt</dt><dd><code>{latest.id}</code></dd>
                </dl>
              </>
            ) : <p>No observation receipt has been recorded.</p>}
          </>
        ) : <p role="status">Protected RunBook status is unavailable.</p>}
      </section>
    </main>
  );
}
