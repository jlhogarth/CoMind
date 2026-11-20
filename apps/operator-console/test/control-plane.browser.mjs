import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.CONTROL_PLANE_BROWSER_PORT ?? 3162);
const baseUrl = `http://127.0.0.1:${port}`;
let serverOutput = "";

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5000); });
server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5000); });

let browser;
try {
  const startDeadline = Date.now() + 90_000;
  let started = false;
  while (Date.now() < startDeadline) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) { started = true; break; }
    } catch { /* Wait for the local development server. */ }
    await delay(500);
  }
  assert.equal(started, true, `Next dev server did not start within 90 seconds.\n${serverOutput}`);

  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "CoMind Control Plane" }).waitFor();

  const activityLinks = page.getByRole("link", { name: "Open Activity HUD" });
  assert.ok((await activityLinks.count()) >= 1, "Expected at least one Activity HUD link");
  assert.equal(await activityLinks.first().getAttribute("href"), "/activity");

  const approvalLinks = page.getByRole("link", { name: "Review Approvals" });
  assert.ok((await approvalLinks.count()) >= 1, "Expected at least one approvals link");
  assert.equal(await approvalLinks.first().getAttribute("href"), "https://approvals.comindinc.com");

  const workspaceMailHeading = page.getByRole("heading", { name: "Workspace Mail" });
  assert.equal(await workspaceMailHeading.count(), 1, "Expected Workspace Mail quick-access panel");

  const founderInbox = page.getByRole("link", { name: "Open JLHogarth@comindinc.com inbox" });
  assert.equal(await founderInbox.count(), 1, "Expected founder Workspace mailbox link");
  assert.equal(
    await founderInbox.getAttribute("href"),
    "https://mail.google.com/mail/u/?authuser=JLHogarth%40comindinc.com",
  );

  const developmentInbox = page.getByRole("link", { name: "Open CoMindDevelopment@comindinc.com inbox" });
  assert.equal(await developmentInbox.count(), 1, "Expected CoMind Development mailbox link");
  assert.equal(
    await developmentInbox.getAttribute("href"),
    "https://mail.google.com/mail/u/?authuser=CoMindDevelopment%40comindinc.com",
  );

  const sidebar = page.getByRole("complementary", { name: "CoMind control plane navigation" });

  const workspaceNavLink = sidebar.getByRole("link", { name: "Workspace Mail" });
  assert.equal(await workspaceNavLink.count(), 1, "Expected Workspace Mail navigation link");
  assert.equal(await workspaceNavLink.getAttribute("href"), "#workspace-mail");

  const threadKeeperNavLink = sidebar.getByRole("link", { name: "ThreadKeeper" });
  assert.equal(await threadKeeperNavLink.count(), 1, "Expected ThreadKeeper navigation link");
  assert.equal(await threadKeeperNavLink.getAttribute("href"), "#threadkeeper");

  const threadKeeperHeading = page.getByRole("heading", { name: "ThreadKeeper", exact: true });
  assert.equal(await threadKeeperHeading.count(), 1, "Expected ThreadKeeper visibility panel");
  assert.equal(await page.getByText("C4 Operational", { exact: true }).count(), 2);
  assert.equal(await page.getByText("Production=false", { exact: true }).count(), 1);
  assert.equal(await page.getByText("JRN-20261028-0001", { exact: true }).count(), 1);

  const c4Closure = page.getByRole("link", { name: /C4 final closure/ });
  assert.equal(await c4Closure.count(), 1, "Expected canonical C4 closure link");
  assert.equal(
    await c4Closure.getAttribute("href"),
    "https://github.com/jlhogarth/CoMind/blob/main/docs/provenance/2026-10-28-tk-007-c4-final-closure.md",
  );

  const expansionClosure = page.getByRole("link", { name: /Expansion closure/ });
  assert.equal(await expansionClosure.count(), 1, "Expected expansion closure link");
  assert.equal(
    await expansionClosure.getAttribute("href"),
    "https://github.com/jlhogarth/CoMind/blob/main/docs/architecture/threadkeeper-capability-expansion-closure.md",
  );

  const closurePr = page.getByRole("link", { name: /Closure PR #337/ });
  assert.equal(await closurePr.count(), 1, "Expected ThreadKeeper closure PR link");
  assert.equal(await closurePr.getAttribute("href"), "https://github.com/jlhogarth/CoMind/pull/337");

  for (const code of ["TK-008", "TK-009", "TK-010", "TK-011", "TK-012"]) {
    assert.equal(await page.getByText(code, { exact: true }).count(), 1, `Expected ${code} capability link`);
  }

  assert.equal(
    await page.getByText(/Visibility only\. No ThreadKeeper state mutation/, { exact: false }).count(),
    1,
    "Expected explicit ThreadKeeper authority boundary",
  );

  assert.equal(await page.getByText("No mailbox API access is used by this panel.", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Two governed domains", { exact: true }).count(), 1);
  assert.equal(await page.getByText("No paid call triggered by this page", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Live behind governed access perimeter", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Live at console.comindinc.com", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Deployment perimeter", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Cloudflare Access + origin proxy + Vercel protection", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Dev/Test", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Production activation excluded", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Not activated by HUD-001", { exact: true }).count(), 0);
  assert.equal(await page.getByText("HUD-001 branch implementation", { exact: true }).count(), 0);

  assert.equal(await sidebar.getByRole("link", { name: /Monitoring/ }).count(), 1);
  assert.equal(await sidebar.getByRole("link", { name: /RuleBook HUD/ }).count(), 1);

  if (process.env.CONTROL_PLANE_BROWSER_SCREENSHOT) {
    await mkdir(dirname(process.env.CONTROL_PLANE_BROWSER_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: process.env.CONTROL_PLANE_BROWSER_SCREENSHOT, fullPage: true });
  }

  const aedNav = sidebar.getByRole("link", { name: "AED evidence" });
  assert.equal(await aedNav.getAttribute("href"), "/aed");
  await aedNav.click();
  await page.getByRole("heading", { name: "AED monitoring evidence" }).waitFor();
  await page.getByRole("button", { name: "Send sign-in link" }).waitFor();

  console.log("PASS Control Plane browser: Workspace Mail, ThreadKeeper visibility, truthful deployed Development/Test state, canonical links, wired destinations, governance labels, and responsive shell rendered.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(5_000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
