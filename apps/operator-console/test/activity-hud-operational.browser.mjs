import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.ACTIVITY_HUD_BROWSER_PORT ?? 3161);
const baseUrl = `http://127.0.0.1:${port}`;
const now = Date.now();
const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();

function row(overrides) {
  return {
    activity_id: crypto.randomUUID(),
    activity_key: "OPS-000",
    source_system: "github",
    source_ref: "https://github.com/jlhogarth/CoMind/issues/358",
    title: "Operational activity",
    owner_label: "Joseph Hogarth",
    started_at: ago(120),
    expected_deadline_at: null,
    stale_after_seconds: 0,
    latest_observation_id: crypto.randomUUID(),
    latest_event_type: "status_change",
    last_reported_status: "in_progress",
    last_source_event_ref: "github:issue:358",
    last_source_occurred_at: ago(5),
    last_observed_at: ago(5),
    last_observation_summary: "Operational browser verification row.",
    last_evidence: { project_key: "COMIND", event_type: "status_change" },
    hud_state: "running",
    evidence_based_resolution: null,
    has_terminal_source_evidence: false,
    is_synthetic: false,
    coverage_limit: "Bounded operational browser fixture.",
    ...overrides,
  };
}

const operationalRows = [
  row({
    activity_key: "CE-002",
    source_ref: "https://github.com/jlhogarth/CoMind/pull/345",
    title: "Recovery and Reorientation Protocol automation",
    latest_event_type: "verification",
    last_reported_status: "review",
    last_source_event_ref: "https://github.com/jlhogarth/CoMind/pull/345",
    hud_state: "awaiting_review",
  }),
  row({
    activity_key: "PFC-001",
    source_ref: "https://github.com/jlhogarth/CoMind/issues/250",
    title: "Pre-Content Foundation Closure",
    owner_label: "ChatGPT",
    last_reported_status: "blocked",
    last_source_event_ref: "github:issue:250",
    hud_state: "blocked",
  }),
  row({
    activity_key: "PFC-A01",
    source_system: "chatgpt",
    source_ref: "conversation:recovery-lane",
    title: "Append-only ChatGPT archive import interruption recovery",
    owner_label: "ChatGPT",
  }),
  row({
    activity_key: "LF-3",
    source_system: "supabase",
    source_ref: "runbook:tracking:init:LF-3",
    title: "Live Foundry LF-3 Security and Compatibility Readiness",
  }),
  row({
    activity_key: "DRIVE-001",
    source_system: "drive",
    source_ref: "CINT-CP04-FRESHNESS-20261028:research-source-runbook-sync",
    last_source_event_ref: "CINT-CP04-FRESHNESS-20261028:research-source-runbook-sync",
    title: "Research Source RunBook projection synchronized",
    owner_label: "ChatGPT",
    last_reported_status: "done",
    hud_state: "completed",
    evidence_based_resolution: "completed",
    has_terminal_source_evidence: true,
  }),
  row({
    activity_key: "CFR-001G",
    source_ref: "https://github.com/jlhogarth/CoMind/pull/199",
    last_source_event_ref: "PR #199",
    title: "Analytics and intent derivation layer",
    last_reported_status: "done",
    hud_state: "completed",
    evidence_based_resolution: "completed",
    has_terminal_source_evidence: true,
  }),
  ...Array.from({ length: 7 }, (_, index) => row({
    activity_key: `OPS-${String(index + 1).padStart(3, "0")}`,
    source_system: index % 2 ? "github" : "supabase",
    source_ref: index % 2 ? `github:issue:${310 + index}` : `supabase://bounded/check/${index + 1}`,
    last_source_event_ref: index % 2 ? `github:issue:${310 + index}` : null,
    title: `Operational work item ${index + 1}`,
    owner_label: index % 2 ? "Joseph Hogarth" : "ChatGPT",
  })),
];

const syntheticRows = Array.from({ length: 5 }, (_, index) => row({
  activity_id: crypto.randomUUID(),
  activity_key: `synthetic-activity-${index + 1}`,
  source_system: "synthetic_test",
  source_ref: `synthetic://activity/${index + 1}`,
  last_source_event_ref: null,
  title: `Synthetic activity ${index + 1}`,
  owner_label: "Test Operator",
  is_synthetic: true,
  coverage_limit: "Synthetic browser fixture.",
}));

let serverOutput = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "https://sbgfuanxiqepcoboxzcl.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test_fixture_only",
    OPERATOR_CONSOLE_ACTIVITY_CAPABILITY: "browser-fixture-capability-not-used-by-mocked-api",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5000); });
server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5000); });

let browser;
try {
  const deadline = Date.now() + 90_000;
  let started = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/activity`);
      if (response.ok) { started = true; break; }
    } catch { /* wait */ }
    await delay(500);
  }
  assert.equal(started, true, `Next dev server did not start.\n${serverOutput}`);

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.ACTIVITY_HUD_CHROMIUM_PATH ? { executablePath: process.env.ACTIVITY_HUD_CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage();
  await page.route(`${baseUrl}/api/activity**`, async (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope") ?? "operational";
    const rows = scope === "synthetic" ? syntheticRows : scope === "all" ? [...operationalRows, ...syntheticRows] : operationalRows;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "private, no-store" },
      body: JSON.stringify({ scope, rows, total: rows.length, coverage_limit: "Bounded browser acceptance fixture." }),
    });
  });

  await page.goto(`${baseUrl}/activity`);
  await page.getByRole("heading", { name: "Activity HUD" }).waitFor();
  await page.getByText("Recovery and Reorientation Protocol automation", { exact: true }).waitFor();

  assert.equal(await page.getByLabel("Choose Activity HUD data scope").inputValue(), "operational");
  assert.equal(await page.getByText("Synthetic activity 1", { exact: true }).count(), 0);

  const sourceOptions = await page.getByLabel("Filter source", { exact: true }).locator("option").allTextContents();
  for (const expected of ["Github", "Supabase", "Chatgpt", "Drive"]) {
    assert.equal(sourceOptions.includes(expected), true, `real source dropdown should include ${expected}`);
  }

  const titleLink = page.getByRole("link", { name: "Open source for Recovery and Reorientation Protocol automation" });
  assert.equal(await titleLink.getAttribute("href"), "https://github.com/jlhogarth/CoMind/pull/345");
  assert.equal(await titleLink.getAttribute("target"), "_blank");

  const pfcCard = page.locator(".activity-card").filter({ hasText: "Pre-Content Foundation Closure" });
  await pfcCard.locator("summary").click();
  assert.equal(
    await pfcCard.getByRole("link", { name: /Open source event: github:issue:250/ }).getAttribute("href"),
    "https://github.com/jlhogarth/CoMind/issues/250",
  );

  await page.getByLabel("Filter source", { exact: true }).selectOption("drive");
  const driveCard = page.locator(".activity-card").filter({ hasText: "Research Source RunBook projection synchronized" });
  await driveCard.locator("summary").click();
  assert.equal(await driveCard.locator(".source-reference a").count(), 0, "opaque Drive refs must remain text");
  await page.getByLabel("Filter source", { exact: true }).selectOption("all");

  const cards = page.locator(".activity-card");
  assert.equal(await cards.count(), 10);
  assert.match(await page.getByRole("navigation", { name: "Activity pages" }).innerText(), /Showing 1–10 of 13 matching activities · page 1 of 2/);
  await page.getByRole("button", { name: "Next page" }).click();
  assert.equal(await cards.count(), 3);

  await page.getByLabel("Filter source", { exact: true }).selectOption("github");
  assert.equal(await page.getByText("Live Foundry LF-3 Security and Compatibility Readiness", { exact: true }).count(), 0);
  assert.equal((await cards.count()) > 0, true);

  await page.getByLabel("Choose Activity HUD data scope").selectOption("synthetic");
  await page.getByText("Synthetic activity 1", { exact: true }).waitFor();
  assert.equal(await cards.count(), 5);
  assert.equal(await page.getByText("Recovery and Reorientation Protocol automation", { exact: true }).count(), 0);

  await page.getByLabel("Choose Activity HUD data scope").selectOption("all");
  await page.getByText("Recovery and Reorientation Protocol automation", { exact: true }).waitFor();
  assert.equal(await page.getByText("Synthetic activity 1", { exact: true }).count(), 1);
  assert.match(await page.getByText(/operational · 5 synthetic/).first().innerText(), /13 operational · 5 synthetic/);

  if (process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT) {
    await page.getByLabel("Choose Activity HUD data scope").selectOption("operational");
    await page.getByText("Recovery and Reorientation Protocol automation", { exact: true }).waitFor();
    await mkdir(dirname(process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT, fullPage: true });
  }

  console.log("PASS Activity HUD browser: operational default, real sources, canonical links, synthetic isolation and pagination verified.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(5_000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}