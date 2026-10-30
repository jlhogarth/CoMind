import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.ACTIVITY_HUD_BROWSER_PORT ?? 3161);
const baseUrl = `http://127.0.0.1:${port}`;

const now = Date.now();
const isoAgo = (minutes) => new Date(now - minutes * 60_000).toISOString();

const operationalRows = [
  {
    activity_id: "00000000-0000-4000-8000-000000000001",
    activity_key: "CE-002",
    source_system: "github",
    source_ref: "https://github.com/jlhogarth/CoMind/pull/345",
    title: "Recovery and Reorientation Protocol automation",
    owner_label: "Joseph Hogarth",
    started_at: isoAgo(180), expected_deadline_at: null, stale_after_seconds: 0,
    latest_observation_id: "00000000-0000-4000-8000-000000001001",
    latest_event_type: "verification", last_reported_status: "review",
    last_source_event_ref: "https://github.com/jlhogarth/CoMind/pull/345",
    last_source_occurred_at: isoAgo(5), last_observed_at: isoAgo(5),
    last_observation_summary: "CE-002 implementation passed final exact-head acceptance and is ready for human review.",
    last_evidence: { project_key: "COMIND", work_key: "CE-002", event_type: "verification" },
    hud_state: "awaiting_review", evidence_based_resolution: null, has_terminal_source_evidence: false,
    is_synthetic: false, coverage_limit: "Canonical PM work-item state with latest linked PM event only.",
  },
  {
    activity_id: "00000000-0000-4000-8000-000000000002",
    activity_key: "PFC-A01",
    source_system: "chatgpt",
    source_ref: "conversation:recovery-lane",
    title: "Append-only ChatGPT archive import interruption recovery",
    owner_label: "ChatGPT",
    started_at: isoAgo(900), expected_deadline_at: null, stale_after_seconds: 0,
    latest_observation_id: "00000000-0000-4000-8000-000000001002",
    latest_event_type: "authorization", last_reported_status: "in_progress",
    last_source_event_ref: "conversation:recovery-lane", last_source_occurred_at: isoAgo(400), last_observed_at: isoAgo(400),
    last_observation_summary: "Recovery and differential ingestion authorized.",
    last_evidence: { project_key: "COMIND", work_key: "PFC-A01", event_type: "authorization" },
    hud_state: "running", evidence_based_resolution: null, has_terminal_source_evidence: false,
    is_synthetic: false, coverage_limit: "Canonical PM work-item state with latest linked PM event only.",
  },
  {
    activity_id: "00000000-0000-4000-8000-000000000003",
    activity_key: "PFC-001",
    source_system: "github",
    source_ref: "https://github.com/jlhogarth/CoMind/issues/250",
    title: "Pre-Content Foundation Closure",
    owner_label: "ChatGPT",
    started_at: isoAgo(950), expected_deadline_at: null, stale_after_seconds: 0,
    latest_observation_id: "00000000-0000-4000-8000-000000001003",
    latest_event_type: "verification", last_reported_status: "blocked",
    last_source_event_ref: "github:issue:250", last_source_occurred_at: isoAgo(500), last_observed_at: isoAgo(500),
    last_observation_summary: "Differential ingestion requirement remains open.",
    last_evidence: { project_key: "COMIND", work_key: "PFC-001", event_type: "verification" },
    hud_state: "blocked", evidence_based_resolution: null, has_terminal_source_evidence: false,
    is_synthetic: false, coverage_limit: "Canonical PM work-item state with latest linked PM event only.",
  },
  {
    activity_id: "00000000-0000-4000-8000-000000000004",
    activity_key: "CFR-001G",
    source_system: "github",
    source_ref: "https://github.com/jlhogarth/CoMind/pull/199",
    title: "Analytics and intent derivation layer",
    owner_label: "Joseph Hogarth",
    started_at: isoAgo(1200), expected_deadline_at: null, stale_after_seconds: 0,
    latest_observation_id: "00000000-0000-4000-8000-000000001004",
    latest_event_type: "verification", last_reported_status: "done",
    last_source_event_ref: "PR #199", last_source_occurred_at: isoAgo(600), last_observed_at: isoAgo(600),
    last_observation_summary: "Deterministic governed derivation and Test acceptance passed.",
    last_evidence: { project_key: "COMIND", work_key: "CFR-001G", event_type: "verification" },
    hud_state: "completed", evidence_based_resolution: "completed", has_terminal_source_evidence: true,
    is_synthetic: false, coverage_limit: "Canonical PM work-item state with latest linked PM event only.",
  },
  {
    activity_id: "00000000-0000-4000-8000-000000000005",
    activity_key: "LF-3",
    source_system: "supabase",
    source_ref: "runbook:tracking:init:LF-3",
    title: "Live Foundry LF-3 Security and Compatibility Readiness",
    owner_label: "Joseph Hogarth",
    started_at: isoAgo(1400), expected_deadline_at: null, stale_after_seconds: 0,
    latest_observation_id: "00000000-0000-4000-8000-000000001005",
    latest_event_type: "created", last_reported_status: "in_progress",
    last_source_event_ref: "runbook:tracking:init:LF-3", last_source_occurred_at: isoAgo(700), last_observed_at: isoAgo(700),
    last_observation_summary: "Initialized Durable RunBook tracking.",
    last_evidence: { project_key: "COMIND", work_key: "LF-3", event_type: "created" },
    hud_state: "running", evidence_based_resolution: null, has_terminal_source_evidence: false,
    is_synthetic: false, coverage_limit: "Canonical PM work-item state with latest linked PM event only.",
  },
  {
    activity_id: "00000000-0000-4000-8000-000000000006",
    activity_key: "DRIVE-001",
    source_system: "drive",
    source_ref: "CINT-CP04-FRESHNESS-20261028:research-source-runbook-sync",
    title: "Research Source RunBook projection synchronized",
    owner_label: "ChatGPT",
    started_at: isoAgo(1500), expected_deadline_at: null, stale_after_seconds: 0,
    latest_observation_id: "00000000-0000-4000-8000-000000001006",
    latest_event_type: "sync", last_reported_status: "done",
    last_source_event_ref: "CINT-CP04-FRESHNESS-20261028:research-source-runbook-sync",
    last_source_occurred_at: isoAgo(720), last_observed_at: isoAgo(720),
    last_observation_summary: "Research Source RunBook projection synchronized.",
    last_evidence: { project_key: "COMIND", work_key: "DRIVE-001", event_type: "sync" },
    hud_state: "completed", evidence_based_resolution: "completed", has_terminal_source_evidence: true,
    is_synthetic: false, coverage_limit: "Canonical PM work-item state with latest linked PM event only.",
  },
  ...Array.from({ length: 7 }, (_, index) => ({
    activity_id: `00000000-0000-4000-8000-${String(index + 7).padStart(12, "0")}`,
    activity_key: `OPS-${String(index + 1).padStart(3, "0")}`,
    source_system: index % 2 ? "github" : "supabase",
    source_ref: index % 2 ? `github:issue:${300 + index}` : `supabase://bounded/check/${index + 1}`,
    title: `Operational work item ${index + 1}`,
    owner_label: index % 2 ? "Joseph Hogarth" : "ChatGPT",
    started_at: isoAgo(1600 + index * 10), expected_deadline_at: null, stale_after_seconds: 0,
    latest_observation_id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
    latest_event_type: "status_change", last_reported_status: index === 5 ? "done" : "in_progress",
    last_source_event_ref: index % 2 ? `github:issue:${300 + index}` : null,
    last_source_occurred_at: isoAgo(60 + index), last_observed_at: isoAgo(60 + index),
    last_observation_summary: "Operational browser verification record.",
    last_evidence: { project_key: "COMIND", event_type: "status_change" },
    hud_state: index === 5 ? "completed" : "running",
    evidence_based_resolution: index === 5 ? "completed" : null,
    has_terminal_source_evidence: index === 5,
    is_synthetic: false,
    coverage_limit: "Canonical PM work-item state with latest linked PM event only.",
  })),
];

const syntheticRows = Array.from({ length: 5 }, (_, index) => ({
  activity_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  activity_key: `synthetic-activity-${index + 1}`,
  source_system: "synthetic_test",
  source_ref: `synthetic://activity/${index + 1}`,
  title: `Synthetic activity ${index + 1}`,
  owner_label: "Test Operator",
  started_at: isoAgo(index + 1), expected_deadline_at: null, stale_after_seconds: 60,
  latest_observation_id: null, latest_event_type: "synthetic_observation", last_reported_status: "running",
  last_source_event_ref: null, last_source_occurred_at: isoAgo(index + 1), last_observed_at: isoAgo(index + 1),
  last_observation_summary: "Synthetic browser verification record.", last_evidence: [], hud_state: "running",
  evidence_based_resolution: null, has_terminal_source_evidence: false, is_synthetic: true,
  coverage_limit: "Synthetic browser fixture. Bounded and changing view.",
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
  const startDeadline = Date.now() + 90_000;
  let started = false;
  while (Date.now() < startDeadline) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/activity`);
      if (response.ok) { started = true; break; }
    } catch { /* Wait for the local development server. */ }
    await delay(500);
  }
  assert.equal(started, true, `Next dev server did not start within 90 seconds.\n${serverOutput}`);

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
      body: JSON.stringify({
        scope,
        rows,
        total: rows.length,
        coverage_limit: "Bounded browser acceptance fixture.",
      }),
    });
  });

  await page.goto(`${baseUrl}/activity`);
  await page.getByRole("heading", { name: "Activity HUD" }).waitFor();
  await page.getByText("Recovery and Reorientation Protocol automation", { exact: true }).waitFor();

  assert.equal(await page.getByLabel("Choose Activity HUD data scope").inputValue(), "operational", "operational data must be the default scope");
  assert.equal(await page.getByText("Synthetic activity 1", { exact: true }).count(), 0, "synthetic data must not appear in the default scope");

  const sourceOptions = await page.getByLabel("Filter source").locator("option").allTextContents();
  for (const expected of ["GitHub", "Supabase", "Chatgpt", "Drive"]) {
    assert.equal(sourceOptions.includes(expected), true, `real source dropdown should include ${expected}`);
  }

  const sourceTitleLink = page.getByRole("link", { name: "Open source for Recovery and Reorientation Protocol automation" });
  assert.equal(await sourceTitleLink.getAttribute("href"), "https://github.com/jlhogarth/CoMind/pull/345");

  await page.getByText("Pre-Content Foundation Closure", { exact: true }).click();
  const pfcCard = page.locator(".activity-card").filter({ hasText: "Pre-Content Foundation Closure" });
  await pfcCard.locator("summary").click();
  const issueLink = pfcCard.getByRole("link", { name: /Open source event: github:issue:250/ });
  assert.equal(await issueLink.getAttribute("href"), "https://github.com/jlhogarth/CoMind/issues/250");

  const driveCard = page.locator(".activity-card").filter({ hasText: "Research Source RunBook projection synchronized" });
  await driveCard.locator("summary").click();
  assert.equal(await driveCard.locator(".source-reference a").count(), 0, "opaque Drive references must remain provenance text rather than invented links");

  const cards = page.locator(".activity-card");
  assert.equal(await cards.count(), 10, "first operational page should honor the default page size");
  assert.match(await page.getByRole("navigation", { name: "Activity pages" }).innerText(), /Showing 1–10 of 13 matching activities · page 1 of 2/);
  await page.getByRole("button", { name: "Next page" }).click();
  assert.equal(await cards.count(), 3, "second operational page should show the remaining rows");

  await page.getByLabel("Filter source").selectOption("github");
  assert.equal(await page.getByText("Live Foundry LF-3 Security and Compatibility Readiness", { exact: true }).count(), 0, "source filter should exclude non-GitHub rows");
  assert.equal((await cards.count()) > 0, true, "source filter should retain matching GitHub rows");

  await page.getByLabel("Choose Activity HUD data scope").selectOption("synthetic");
  await page.getByText("Synthetic activity 1", { exact: true }).waitFor();
  assert.equal(await cards.count(), 5, "synthetic scope should show only the isolated five-row fixture");
  assert.equal(await page.getByText("Recovery and Reorientation Protocol automation", { exact: true }).count(), 0, "operational rows must not leak into synthetic scope");
  assert.equal(await page.getByLabel("Filter source").locator("option").allTextContents().then((items) => items.includes("Synthetic Test")), true);

  await page.getByLabel("Choose Activity HUD data scope").selectOption("all");
  await page.getByText("Recovery and Reorientation Protocol automation", { exact: true }).waitFor();
  assert.match(await page.getByText(/operational · 5 synthetic/).first().innerText(), /13 operational · 5 synthetic/);

  if (process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT) {
    await page.getByLabel("Choose Activity HUD data scope").selectOption("operational");
    await page.getByText("Recovery and Reorientation Protocol automation", { exact: true }).waitFor();
    await mkdir(dirname(process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT, fullPage: true });
  }

  console.log("PASS Activity HUD browser: operational scope defaults, real source filters, canonical links, synthetic isolation, combined scope and pagination verified.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(5_000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
