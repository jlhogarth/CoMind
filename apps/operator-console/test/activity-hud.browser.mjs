import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.ACTIVITY_HUD_BROWSER_PORT ?? 3161);
const baseUrl = `http://127.0.0.1:${port}`;
const syntheticRows = Array.from({ length: 23 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  const failed = index === 14 || index === 20;
  const cancelled = index === 22;
  const terminal = index >= 15 || failed || cancelled;
  const hudState = index < 3 ? "stale_unknown" : failed ? "failed" : cancelled ? "cancelled" : terminal ? "completed" : "running";
  const observed = new Date(Date.now() - (index % 4) * 60_000).toISOString();
  return {
    activity_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    activity_key: `synthetic-activity-${number}`,
    source_system: index % 2 ? "drive_write" : "github_action",
    source_ref: `synthetic://activity/${number}`,
    title: `Synthetic activity ${number}`,
    owner_label: `Operator ${index % 3 + 1}`,
    started_at: observed,
    expected_deadline_at: null,
    stale_after_seconds: 60,
    latest_observation_id: null,
    latest_event_type: "synthetic_observation",
    last_reported_status: hudState,
    last_source_event_ref: `synthetic-event-${number}`,
    last_source_occurred_at: index === 22 ? null : observed,
    last_observed_at: index === 22 ? null : observed,
    last_observation_summary: "Synthetic browser verification record.",
    last_evidence: [],
    hud_state: hudState,
    evidence_based_resolution: failed ? "failed" : cancelled ? "cancelled" : terminal ? "completed" : null,
    has_terminal_source_evidence: terminal,
    is_synthetic: true,
    coverage_limit: "Synthetic browser fixture. Bounded and changing view.",
  };
});

let serverOutput = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "https://sbgfuanxiqepcoboxzcl.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test_fixture_only",
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
  await page.route("https://sbgfuanxiqepcoboxzcl.supabase.co/rest/v1/v_activity_hud_test**", async (route) => {
    const request = route.request();
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, accept, accept-profile, content-profile, x-client-info, prefer",
      "access-control-expose-headers": "content-range, content-location",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json", "content-range": `0-${syntheticRows.length - 1}/${syntheticRows.length}` },
      body: JSON.stringify(syntheticRows),
    });
  });

  await page.goto(`${baseUrl}/activity`);
  await page.getByRole("heading", { name: "Activity HUD" }).waitFor();
  await page.getByText("Synthetic activity 01", { exact: true }).waitFor();
  const cards = page.locator(".activity-card");
  assert.equal(await cards.count(), 10, "first page should show the selected page size");
  const firstPageTitles = await cards.locator("h3").allTextContents();
  assert.match(await page.getByRole("navigation", { name: "Activity pages" }).innerText(), /Showing 1–10 of 23 matching activities · page 1 of 3/);

  await page.getByRole("button", { name: "Next page" }).click();
  assert.equal(await cards.count(), 10, "second page should show ten rows");
  const secondPageTitles = await cards.locator("h3").allTextContents();
  assert.equal(secondPageTitles.some((title) => firstPageTitles.includes(title)), false, "adjacent pages must contain disjoint rows");
  await page.getByRole("button", { name: "Last page" }).click();
  assert.equal(await cards.count(), 3, "last page should show the remaining rows");
  assert.match(await page.getByRole("navigation", { name: "Activity pages" }).innerText(), /Showing 21–23 of 23 matching activities · page 3 of 3/);
  await page.getByRole("button", { name: "Previous page" }).click();
  assert.match(await page.getByRole("navigation", { name: "Activity pages" }).innerText(), /page 2 of 3/);

  await page.getByLabel("Filter source result").selectOption("no-terminal");
  assert.match(await page.getByRole("navigation", { name: "Activity pages" }).innerText(), /Showing 1–10 of 14 matching activities · page 1 of 2/);
  await page.getByLabel("Filter source result").selectOption("all");

  await page.getByLabel("Filter owner").selectOption({ label: "Operator 1" });
  await page.getByText("Synthetic activity 01", { exact: true }).waitFor();
  assert.match(await page.getByRole("navigation", { name: "Activity pages" }).innerText(), /page 1 of 1/);
  assert.equal(await cards.count(), 8, "owner filter should narrow the bounded result and reset to page one");
  assert.equal(await page.getByText("Synthetic activity 02", { exact: true }).count(), 0, "owner filter should exclude other owners");

  await page.getByLabel("Filter source result").selectOption("failed");
  assert.equal(await cards.count(), 0, "the selected owner has no returned failures in this fixture");
  await page.getByLabel("Filter owner").selectOption("all");
  assert.equal(await cards.count(), 2, "returned-failure filter should show only confirmed failed results");
  await page.getByLabel("Filter last report age").selectOption("under-hour");
  assert.equal(await cards.count(), 2, "report-age filter should retain recently observed matching rows");
  await page.getByLabel("Filter source result").selectOption("all");
  await page.getByLabel("Filter last report age").selectOption("never");
  assert.equal(await cards.count(), 1, "missing source report timestamps should be filterable");
  assert.equal(await page.getByText("Synthetic activity 23", { exact: true }).count(), 1);

  if (process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT) {
    await mkdir(dirname(process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT), { recursive: true });
    await page.screenshot({ path: process.env.ACTIVITY_HUD_BROWSER_SCREENSHOT, fullPage: true });
  }

  console.log("PASS Activity HUD browser: Supabase mocked with 23 synthetic rows; pagination, filters, reset behavior, and bounded page counts verified.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(5_000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
