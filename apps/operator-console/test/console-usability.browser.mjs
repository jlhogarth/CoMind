import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, firefox, webkit } from "playwright";

const port = Number(process.env.CUX_BROWSER_PORT ?? 3174);
const localBaseUrl = `http://127.0.0.1:${port}`;
const targetBaseUrl = process.env.CUX_TARGET_URL ?? localBaseUrl;
const ownsServer = !process.env.CUX_TARGET_URL;
const reportPath = process.env.CUX_REPORT_PATH ?? "test-results/cux-001/console-usability-report.json";
const screenshotDir = process.env.CUX_SCREENSHOT_DIR;
const browserNames = (process.env.CUX_BROWSERS ?? "chromium")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const requiredBrowsers = new Set(
  (process.env.CUX_REQUIRED_BROWSERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const failOn = new Set(
  (process.env.CUX_FAIL_ON ?? "blocker")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const browserTypes = { chromium, firefox, webkit };
const initialRoutes = ["/", "/activity", "/rulebook"];
const profiles = [
  { id: "desktop_1440", width: 1440, height: 1000, mobile: false },
  { id: "laptop_1280", width: 1280, height: 800, mobile: false },
  { id: "desktop_reduced_motion", width: 1440, height: 1000, mobile: false, reducedMotion: "reduce" },
  { id: "phone_narrow_375", width: 375, height: 812, mobile: true },
  { id: "iphone_class_390", width: 390, height: 844, mobile: true },
  { id: "phone_wide_430", width: 430, height: 932, mobile: true },
  { id: "phone_landscape", width: 844, height: 390, mobile: true },
];

const report = {
  schemaVersion: "comind.cux-001.usability-report.v1",
  generatedAt: new Date().toISOString(),
  sourceRef: process.env.GITHUB_SHA ?? null,
  target: targetBaseUrl,
  mode: ownsServer ? "local-development" : "configured-read-only-target",
  browsersRequested: browserNames,
  profiles: profiles.map(({ id, width, height, mobile, reducedMotion }) => ({ id, width, height, mobile, reducedMotion: reducedMotion ?? "no-preference" })),
  runs: [],
  findings: [],
  limitations: [],
};

function addFinding(finding) {
  report.findings.push({
    severity: finding.severity,
    category: finding.category,
    browser: finding.browser,
    profile: finding.profile,
    route: finding.route,
    control: finding.control ?? null,
    message: finding.message,
    evidence: finding.evidence ?? null,
  });
}

function normalizePath(href) {
  try {
    const url = new URL(href, targetBaseUrl);
    const base = new URL(targetBaseUrl);
    if (url.origin !== base.origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

async function waitForServer(server, getOutput) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`Next dev server exited early.\n${getOutput()}`);
    try {
      const response = await fetch(localBaseUrl);
      if (response.ok) return;
    } catch {
      // Continue waiting for the local development server.
    }
    await delay(500);
  }
  throw new Error(`Next dev server did not start within 90 seconds.\n${getOutput()}`);
}

function labelForElement(element) {
  return element.getAttribute("aria-label")
    || element.getAttribute("title")
    || element.getAttribute("name")
    || element.textContent?.trim()
    || "";
}

async function inspectRoute({ page, browserName, profile, route, remoteReadOnly }) {
  const requestedUrl = new URL(route, targetBaseUrl).href;
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];

  const onPageError = (error) => pageErrors.push(String(error));
  const onConsole = (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  const onRequestFailed = (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });

  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("requestfailed", onRequestFailed);

  let response;
  try {
    response = await page.goto(requestedUrl, { waitUntil: "networkidle", timeout: 60_000 });
  } catch (error) {
    addFinding({
      severity: "blocker",
      category: "route_reachability",
      browser: browserName,
      profile: profile.id,
      route,
      message: `Route could not be loaded: ${String(error)}`,
    });
    return { route, requestedUrl, finalUrl: page.url(), status: null, links: [], controls: [], headings: [] };
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
  }

  const finalUrl = page.url();
  const finalHost = new URL(finalUrl).hostname;
  if (remoteReadOnly && finalHost.endsWith("cloudflareaccess.com")) {
    report.limitations.push({
      browser: browserName,
      profile: profile.id,
      route,
      code: "cloudflare_access_authentication_required",
      message: "Remote target redirected to Cloudflare Access. Authenticated production interaction requires an authorized reviewer session and is not fabricated by CUX-001.",
    });
    return { route, requestedUrl, finalUrl, status: response?.status() ?? null, links: [], controls: [], headings: [] };
  }

  const status = response?.status() ?? null;
  if (status !== null && status >= 400) {
    addFinding({
      severity: "blocker",
      category: "route_reachability",
      browser: browserName,
      profile: profile.id,
      route,
      message: `Route returned HTTP ${status}.`,
    });
  }

  await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });

  const snapshot = await page.evaluate(({ mobile }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };

    const textSelector = "p,span,a,button,label,td,th,li,small,strong,kbd";
    const textSamples = Array.from(document.querySelectorAll(textSelector))
      .filter((element) => visible(element) && (element.textContent?.trim().length ?? 0) > 0)
      .slice(0, 400)
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 120),
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: style.lineHeight,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          interactive: element.matches("a,button,label"),
        };
      });

    const controls = Array.from(document.querySelectorAll("a[href],button,input,select,textarea,summary,[role='button'],[role='link'],[role='menuitem'],[role='tab'],[aria-expanded]"))
      .filter((element) => visible(element))
      .slice(0, 300)
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const labelledBy = element.getAttribute("aria-labelledby");
        let labelledText = "";
        if (labelledBy) {
          labelledText = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
            .filter(Boolean)
            .join(" ");
        }
        const labels = "labels" in element && element.labels ? Array.from(element.labels).map((label) => label.textContent?.trim() ?? "").filter(Boolean).join(" ") : "";
        return {
          index,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          type: element.getAttribute("type"),
          href: element.getAttribute("href"),
          ariaExpanded: element.getAttribute("aria-expanded"),
          name: element.getAttribute("aria-label") || labelledText || labels || element.getAttribute("title") || element.getAttribute("name") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) || "",
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          inNavigation: Boolean(element.closest("nav")),
        };
      });

    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter(visible)
      .map((element) => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 160) ?? "" }));

    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter(visible)
      .map((element) => ({ href: element.href, text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "" }));

    return {
      viewport: { width: innerWidth, height: innerHeight, mobile },
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      textSamples,
      controls,
      headings,
      links,
      selectCount: document.querySelectorAll("select").length,
      expandedControlCount: document.querySelectorAll("[aria-expanded]").length,
    };
  }, { mobile: profile.mobile });

  const effectiveWidth = Math.max(snapshot.documentWidth, snapshot.bodyWidth);
  if (effectiveWidth > profile.width + 2) {
    addFinding({
      severity: profile.mobile ? "major" : "moderate",
      category: "horizontal_overflow",
      browser: browserName,
      profile: profile.id,
      route,
      message: `Rendered page width ${effectiveWidth}px exceeds viewport width ${profile.width}px.`,
      evidence: { documentWidth: snapshot.documentWidth, bodyWidth: snapshot.bodyWidth, viewportWidth: profile.width },
    });
  }

  let readabilityFindings = 0;
  for (const sample of snapshot.textSamples) {
    if (readabilityFindings >= 24) break;
    if (sample.fontSize >= 12) continue;
    const severity = sample.interactive && sample.fontSize < 11 ? "major" : sample.fontSize < 10 ? "moderate" : "minor";
    addFinding({
      severity,
      category: "readability_font_size",
      browser: browserName,
      profile: profile.id,
      route,
      control: `${sample.tag}: ${sample.text.slice(0, 80)}`,
      message: `Visible text renders at ${sample.fontSize}px, below the 12px baseline review threshold.`,
      evidence: { fontSize: sample.fontSize, width: sample.width, height: sample.height },
    });
    readabilityFindings += 1;
  }

  for (const control of snapshot.controls) {
    if (!control.name) {
      addFinding({
        severity: "major",
        category: "accessible_control_name",
        browser: browserName,
        profile: profile.id,
        route,
        control: `${control.tag}[${control.index}]`,
        message: "Visible interactive control has no detectable accessible label or text.",
      });
    }
    if (profile.mobile && (control.inNavigation || ["button", "input", "select", "textarea", "summary"].includes(control.tag))) {
      if (control.width < 44 || control.height < 44) {
        addFinding({
          severity: control.height < 36 || control.width < 36 ? "major" : "moderate",
          category: "mobile_touch_target",
          browser: browserName,
          profile: profile.id,
          route,
          control: control.name || `${control.tag}[${control.index}]`,
          message: `Touch target is ${control.width}x${control.height}px; primary mobile controls should target at least 44x44 CSS px where practical.`,
          evidence: { width: control.width, height: control.height },
        });
      }
    }
  }

  for (let index = 1; index < snapshot.headings.length; index += 1) {
    const previous = snapshot.headings[index - 1];
    const current = snapshot.headings[index];
    if (current.level > previous.level + 1) {
      addFinding({
        severity: "moderate",
        category: "heading_hierarchy",
        browser: browserName,
        profile: profile.id,
        route,
        control: current.text,
        message: `Heading level jumps from h${previous.level} to h${current.level}.`,
      });
    }
  }

  if (pageErrors.length > 0) {
    addFinding({
      severity: "blocker",
      category: "browser_runtime_error",
      browser: browserName,
      profile: profile.id,
      route,
      message: `${pageErrors.length} page error(s) were emitted.`,
      evidence: pageErrors.slice(0, 10),
    });
  }
  if (consoleErrors.length > 0) {
    addFinding({
      severity: "major",
      category: "browser_console_error",
      browser: browserName,
      profile: profile.id,
      route,
      message: `${consoleErrors.length} console error(s) were emitted.`,
      evidence: consoleErrors.slice(0, 10),
    });
  }
  if (failedRequests.length > 0) {
    addFinding({
      severity: "major",
      category: "failed_request",
      browser: browserName,
      profile: profile.id,
      route,
      message: `${failedRequests.length} network request(s) failed while rendering the route.`,
      evidence: failedRequests.slice(0, 10),
    });
  }

  const internalLinks = [];
  const externalLinks = [];
  for (const link of snapshot.links) {
    const path = normalizePath(link.href);
    if (path) internalLinks.push({ ...link, path });
    else externalLinks.push(link);
  }

  if (!remoteReadOnly) {
    for (const link of internalLinks.slice(0, 60)) {
      const check = await page.request.get(new URL(link.path, targetBaseUrl).href, { failOnStatusCode: false, timeout: 30_000 });
      if (check.status() >= 400) {
        addFinding({
          severity: "major",
          category: "broken_internal_link",
          browser: browserName,
          profile: profile.id,
          route,
          control: link.text || link.path,
          message: `Internal link ${link.path} returned HTTP ${check.status()}.`,
        });
      }
    }
  }

  if (!remoteReadOnly) {
    const selects = page.locator("select:visible");
    const selectCount = await selects.count();
    for (let index = 0; index < Math.min(selectCount, 20); index += 1) {
      const select = selects.nth(index);
      const options = await select.locator("option").evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, disabled: node.disabled })));
      const enabled = options.filter((option) => !option.disabled);
      if (enabled.length > 1) {
        const original = await select.inputValue();
        const alternate = enabled.find((option) => option.value !== original);
        if (alternate) {
          await select.selectOption(alternate.value);
          await select.selectOption(original);
        }
      }
    }

    const expandable = page.locator("[aria-expanded]:visible");
    const expandableCount = await expandable.count();
    for (let index = 0; index < Math.min(expandableCount, 20); index += 1) {
      const control = expandable.nth(index);
      const before = await control.getAttribute("aria-expanded");
      await control.click({ timeout: 5_000 }).catch(() => null);
      const after = await control.getAttribute("aria-expanded");
      if (before === after) {
        addFinding({
          severity: "moderate",
          category: "expandable_control_state",
          browser: browserName,
          profile: profile.id,
          route,
          control: (await control.getAttribute("aria-label")) || (await control.textContent())?.trim().slice(0, 100) || `[aria-expanded][${index}]`,
          message: "Expandable control did not update aria-expanded after activation.",
        });
      }
      if (after === "true") await control.click({ timeout: 5_000 }).catch(() => null);
    }
  }

  const focusSequence = [];
  await page.locator("body").click({ position: { x: 1, y: 1 } }).catch(() => null);
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return "body";
      return element.getAttribute("aria-label") || element.getAttribute("name") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || element.tagName.toLowerCase();
    });
    focusSequence.push(focused);
  }
  const distinctFocus = new Set(focusSequence.filter((value) => value !== "body"));
  if (snapshot.controls.length >= 4 && distinctFocus.size < 3) {
    addFinding({
      severity: "major",
      category: "keyboard_navigation",
      browser: browserName,
      profile: profile.id,
      route,
      message: "Keyboard Tab traversal reached fewer than three distinct controls on a route with multiple interactive elements.",
      evidence: focusSequence,
    });
  }

  if (screenshotDir) {
    const safeRoute = route === "/" ? "home" : route.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]+/g, "_");
    const path = `${screenshotDir}/${browserName}-${profile.id}-${safeRoute}.png`;
    await mkdir(dirname(path), { recursive: true });
    await page.screenshot({ path, fullPage: true });
  }

  return {
    route,
    requestedUrl,
    finalUrl,
    status,
    documentWidth: snapshot.documentWidth,
    bodyWidth: snapshot.bodyWidth,
    headings: snapshot.headings,
    controls: snapshot.controls,
    internalLinks,
    externalLinks,
    selectCount: snapshot.selectCount,
    expandedControlCount: snapshot.expandedControlCount,
  };
}

let server;
let serverOutput = "";
let missingRequiredBrowser = false;

try {
  if (ownsServer) {
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
      {
        cwd: new URL("..", import.meta.url),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-8000); });
    server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-8000); });
    await waitForServer(server, () => serverOutput);
  }

  for (const browserName of browserNames) {
    const browserType = browserTypes[browserName];
    if (!browserType) {
      report.limitations.push({ browser: browserName, code: "unknown_browser", message: `Unsupported browser engine requested: ${browserName}` });
      if (requiredBrowsers.has(browserName)) missingRequiredBrowser = true;
      continue;
    }

    let browser;
    try {
      browser = await browserType.launch({ headless: true, args: browserName === "chromium" ? ["--no-sandbox"] : [] });
    } catch (error) {
      report.limitations.push({ browser: browserName, code: "browser_launch_failed", message: String(error) });
      if (requiredBrowsers.has(browserName)) missingRequiredBrowser = true;
      continue;
    }

    try {
      for (const profile of profiles) {
        const context = await browser.newContext({
          viewport: { width: profile.width, height: profile.height },
          hasTouch: profile.mobile,
          isMobile: profile.mobile && browserName !== "firefox",
          reducedMotion: profile.reducedMotion ?? "no-preference",
        });
        const page = await context.newPage();
        const remoteReadOnly = !ownsServer;
        const routeQueue = [...initialRoutes];
        const visited = new Set();
        const run = { browser: browserName, profile: profile.id, routes: [] };

        while (routeQueue.length > 0 && visited.size < 40) {
          const route = routeQueue.shift();
          if (!route || visited.has(route)) continue;
          visited.add(route);
          const result = await inspectRoute({ page, browserName, profile, route, remoteReadOnly });
          run.routes.push(result);

          if (!remoteReadOnly) {
            for (const link of result.internalLinks ?? []) {
              if (!visited.has(link.path) && !routeQueue.includes(link.path)) routeQueue.push(link.path);
            }
          }
        }

        report.runs.push(run);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(5_000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
}

const severityCounts = report.findings.reduce((counts, finding) => {
  counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
  return counts;
}, {});
report.summary = {
  runCount: report.runs.length,
  findingCount: report.findings.length,
  severityCounts,
  limitationCount: report.limitations.length,
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`CUX-001 report: ${report.summary.runCount} browser/profile runs, ${report.summary.findingCount} findings, ${report.summary.limitationCount} limitations.`);
console.log(`Severity counts: ${JSON.stringify(severityCounts)}`);
console.log(`Report written to ${reportPath}`);

if (missingRequiredBrowser) process.exitCode = 2;
if (report.findings.some((finding) => failOn.has(finding.severity))) process.exitCode = Math.max(process.exitCode ?? 0, 1);
