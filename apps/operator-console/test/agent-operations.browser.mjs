import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

// Synthetic browser contract test. No request reaches Supabase or Vercel.
const port = 3166;
const origin = `http://127.0.0.1:${port}`;
const supabase = "https://sbgfuanxiqepcoboxzcl.supabase.co";
const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "operator@example.invalid" };
const expires = Math.floor(Date.now() / 1000) + 3600;
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expires, role: "authenticated" })}.synthetic`;
const session = { access_token: accessToken, refresh_token: "synthetic-refresh", token_type: "bearer", expires_at: expires, expires_in: 3600, user };
const snapshot = {
  worker: { state: "healthy", completed_at: new Date().toISOString() },
  aed: [{ task_id: "synthetic-stall", fencing_epoch: 1, disposition: "needs_review", observed_at: new Date().toISOString(), result_evidence_id: null }],
  approvals: [{ proposal_id: "synthetic-proposal", purpose: "Synthetic approval proof", model_or_service: "Test service", proposal_status: "pending_approval", awaiting_decision: true, link_expires_at: new Date(Date.now() + 3600000).toISOString(), authorization_decision_id: null }],
  ideas: [],
};
let output = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: supabase, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_browser_test" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", chunk => { output = (output + chunk).slice(-6000); });
server.stderr.on("data", chunk => { output = (output + chunk).slice(-6000); });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
    await delay(500);
  }
  assert.ok(ready, output);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  async function contextFor({ signedIn = false, denied = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    if (signedIn) {
      await context.addInitScript(value => {
        localStorage.setItem("sb-sbgfuanxiqepcoboxzcl-auth-token", JSON.stringify(value));
      }, session);
    }
    const requests = [];
    let retrySubmission = true;
    const data = structuredClone(snapshot);
    await context.route("**/api/agent-work", route => route.fulfill({ status: 503, json: { error: "Synthetic history source unavailable" } }));
    await context.route(supabase + "/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push({ path, body: request.postDataJSON(), authorization: request.headers().authorization });
      if (path === "/auth/v1/otp") return route.fulfill({ json: {} });
      if (path === "/auth/v1/user") return route.fulfill({ json: user });
      if (path === "/rest/v1/rpc/operator_agent_operations") {
        assert.equal(request.headers().authorization, `Bearer ${accessToken}`);
        return denied ? route.fulfill({ status: 403, json: { code: "42501", message: "operator required" } }) : route.fulfill({ json: data });
      }
      if (path === "/rest/v1/rpc/operator_submit_agent_idea") {
        if (retrySubmission) {
          retrySubmission = false;
          return route.fulfill({ status: 503, json: { message: "Synthetic uncertain submission" } });
        }
        const body = request.postDataJSON();
        data.ideas = [{ idea_id: "synthetic-idea", title: body.p_title, description: body.p_description, queued_for_review_at: new Date().toISOString(), decision: null, basis: null }];
        return route.fulfill({ json: "synthetic-idea" });
      }
      if (path === "/rest/v1/rpc/operator_dispose_agent_idea") {
        const body = request.postDataJSON();
        data.ideas[0].decision = body.p_decision;
        data.ideas[0].basis = body.p_basis;
        return route.fulfill({ status: 204 });
      }
      throw new Error("Unexpected synthetic request " + path);
    });
    const page = await context.newPage();
    await page.goto(origin + "/agent-work");
    return { context, page, requests };
  }

  const anonymous = await contextFor();
  await anonymous.page.getByRole("button", { name: "Send sign-in link" }).waitFor();
  assert.equal(await anonymous.page.getByRole("heading", { name: "Approval inbox" }).count(), 0);
  assert.equal(anonymous.requests.filter(r => r.path.endsWith("operator_agent_operations")).length, 0);
  await anonymous.page.getByLabel("Test operator email").fill("operator@example.invalid");
  await anonymous.page.getByRole("button", { name: "Send sign-in link" }).click();
  await anonymous.page.getByText("Open the sign-in link in this browser.", { exact: true }).waitFor();
  const otp = anonymous.requests.find(r => r.path === "/auth/v1/otp");
  assert.equal(otp.body.create_user, false);
  await anonymous.context.close();

  const accepted = await contextFor({ signedIn: true });
  await accepted.page.getByRole("heading", { name: "Approval inbox" }).waitFor();
  await accepted.page.getByRole("heading", { name: "Brainstorming intake" }).waitFor();
  await accepted.page.getByText("healthy", { exact: true }).waitFor();
  await accepted.page.getByText(/needs review/).waitFor();
  assert.equal(await accepted.page.getByRole("link", { name: "Open the approval portal" }).getAttribute("href"), "https://approvals.comindinc.com");
  assert.equal(await accepted.page.getByLabel("Test operator email").count(), 0);
  await accepted.page.getByLabel("Title", { exact: true }).fill("Synthetic browser idea");
  await accepted.page.getByLabel("Idea and intended outcome").fill("Verify Test intake, retry and disposition from the browser.");
  await accepted.page.getByRole("button", { name: "Submit for review" }).click();
  await accepted.page.getByText(/submission could not be confirmed/).waitFor();
  await accepted.page.getByRole("button", { name: "Submit for review" }).click();
  await accepted.page.getByRole("heading", { name: "Synthetic browser idea" }).waitFor();
  const submissions = accepted.requests.filter(r => r.path.endsWith("operator_submit_agent_idea"));
  assert.equal(submissions.length, 2);
  assert.deepEqual(submissions[0].body, submissions[1].body);
  await accepted.page.getByLabel("Reason", { exact: true }).fill("Synthetic review accepted for planning.");
  await accepted.page.getByRole("button", { name: "Record disposition" }).click();
  await accepted.page.getByText("planning candidate", { exact: true }).waitFor();
  await mkdir("artifacts", { recursive: true });
  await accepted.page.screenshot({ path: "artifacts/agent-operations-browser.png", fullPage: true });
  assert.ok(await accepted.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile layout overflows");
  await accepted.page.reload();
  await accepted.page.getByRole("heading", { name: "Approval inbox" }).waitFor();
  await accepted.context.close();

  const rejected = await contextFor({ signedIn: true, denied: true });
  await rejected.page.getByText("Agent operations requires an authorized Test operator.", { exact: true }).waitFor();
  assert.equal(await rejected.page.getByRole("heading", { name: "Approval inbox" }).count(), 0);
  assert.equal(await rejected.page.getByRole("heading", { name: "Brainstorming intake" }).count(), 0);
  await rejected.context.close();
  console.log("PASS synthetic browser contract: email request, signed-in panels, reload, denied identity, retry, disposition and mobile layout");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
