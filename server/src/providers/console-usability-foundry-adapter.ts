import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FoundryAdapter, FoundryAdapterRequest, FoundryAdapterResult } from '../foundry-runtime.js';

const ALLOWED_BROWSERS = new Set(['chromium', 'firefox', 'webkit']);
const ALLOWED_CAPABILITIES = new Set([
  'console.usability.inspect',
  'console.usability.browser_test',
  'console.usability.review',
]);
const ALLOWED_ACTIONS = new Set(['inspect', 'browser_test', 'review']);
const DEFAULT_TIMEOUT_MS = 180_000;

export interface ConsoleUsabilityHarnessRequest {
  readonly consoleDirectory: string;
  readonly reportPath: string;
  readonly browsers: readonly string[];
  readonly timeoutMs: number;
}

export interface ConsoleUsabilityHarnessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly report: unknown | null;
}

export type ConsoleUsabilityHarnessRunner = (
  request: ConsoleUsabilityHarnessRequest
) => Promise<ConsoleUsabilityHarnessResult>;

export interface ConsoleUsabilityFoundryAdapterOptions {
  readonly repositoryRoot?: string;
  readonly browsers?: readonly string[];
  readonly timeoutMs?: number;
  readonly runHarness?: ConsoleUsabilityHarnessRunner;
}

interface UsabilityReportSummary {
  readonly runCount: number;
  readonly findingCount: number;
  readonly limitationCount: number;
  readonly severityCounts: Readonly<Record<string, number>>;
}

interface UsabilityReport {
  readonly schemaVersion: string;
  readonly summary: UsabilityReportSummary;
}

function defaultRepositoryRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDirectory, '../../..');
}

function validateBrowsers(browsers: readonly string[]): readonly string[] {
  if (browsers.length === 0) throw new Error('At least one browser engine is required');
  const normalized = browsers.map((browser) => browser.trim());
  if (normalized.some((browser) => !ALLOWED_BROWSERS.has(browser))) {
    throw new Error('Console usability adapter received an unsupported browser engine');
  }
  return Object.freeze([...new Set(normalized)]);
}

function validateTimeout(timeoutMs: number): number {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 600_000) {
    throw new Error('Console usability adapter timeout must be between 10 seconds and 10 minutes');
  }
  return timeoutMs;
}

function safeHarnessEnvironment(request: ConsoleUsabilityHarnessRequest): NodeJS.ProcessEnv {
  const safeKeys = [
    'CI',
    'HOME',
    'PATH',
    'PLAYWRIGHT_BROWSERS_PATH',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const key of safeKeys) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.CUX_BROWSERS = request.browsers.join(',');
  env.CUX_REQUIRED_BROWSERS = request.browsers.join(',');
  env.CUX_FAIL_ON = 'blocker';
  env.CUX_REPORT_PATH = request.reportPath;
  return env;
}

export async function runConsoleUsabilityHarness(
  request: ConsoleUsabilityHarnessRequest
): Promise<ConsoleUsabilityHarnessResult> {
  const scriptPath = join(request.consoleDirectory, 'test', 'console-usability.browser.mjs');
  const env = safeHarnessEnvironment(request);

  const child = spawn(process.execPath, [scriptPath], {
    cwd: request.consoleDirectory,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-32_000); });
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-32_000); });

  const exitCode = await new Promise<number>((resolveExit, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 5_000).unref();
      settled = true;
      reject(new Error(`Console usability harness exceeded ${request.timeoutMs}ms`));
    }, request.timeoutMs);

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) {
        reject(new Error(`Console usability harness terminated by signal ${signal}`));
        return;
      }
      resolveExit(code ?? 1);
    });
  });

  let report: unknown | null = null;
  try {
    report = JSON.parse(await readFile(join(request.consoleDirectory, request.reportPath), 'utf8')) as unknown;
  } catch {
    report = null;
  }

  return { exitCode, stdout, stderr, report };
}

function parseReport(value: unknown): UsabilityReport | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (report.schemaVersion !== 'comind.cux-001.usability-report.v1') return null;
  if (report.summary === null || typeof report.summary !== 'object' || Array.isArray(report.summary)) return null;
  const summary = report.summary as Record<string, unknown>;
  if (!Number.isSafeInteger(summary.runCount) || (summary.runCount as number) < 0) return null;
  if (!Number.isSafeInteger(summary.findingCount) || (summary.findingCount as number) < 0) return null;
  if (!Number.isSafeInteger(summary.limitationCount) || (summary.limitationCount as number) < 0) return null;
  if (summary.severityCounts === null || typeof summary.severityCounts !== 'object' || Array.isArray(summary.severityCounts)) return null;

  const severityCounts: Record<string, number> = {};
  for (const [key, count] of Object.entries(summary.severityCounts as Record<string, unknown>)) {
    if (!Number.isSafeInteger(count) || (count as number) < 0) return null;
    severityCounts[key] = count as number;
  }

  return {
    schemaVersion: report.schemaVersion,
    summary: {
      runCount: summary.runCount as number,
      findingCount: summary.findingCount as number,
      limitationCount: summary.limitationCount as number,
      severityCounts,
    },
  };
}

function assertBoundedRequest(request: FoundryAdapterRequest): void {
  if (!ALLOWED_CAPABILITIES.has(request.capabilityCode)) {
    throw new Error('Console usability adapter received an unsupported capability');
  }
  if (!ALLOWED_ACTIONS.has(request.action)) {
    throw new Error('Console usability adapter received an unsupported action');
  }
  if (request.targetKind !== 'operator_console') {
    throw new Error('Console usability adapter only accepts operator_console targets');
  }
  if (request.authorityLevel !== 'C0' && request.authorityLevel !== 'C1') {
    throw new Error('Console usability adapter only accepts C0 or C1 authority');
  }
  if (request.targetRef !== null && request.targetRef !== 'apps/operator-console') {
    throw new Error('Console usability adapter target reference is outside the Operator Console');
  }
  if (Object.keys(request.input).length !== 0) {
    throw new Error('Console usability adapter does not accept runtime command or target overrides');
  }
}

export function createConsoleUsabilityFoundryAdapter(
  options: ConsoleUsabilityFoundryAdapterOptions = {}
): FoundryAdapter {
  const repositoryRoot = resolve(options.repositoryRoot ?? defaultRepositoryRoot());
  const consoleDirectory = join(repositoryRoot, 'apps', 'operator-console');
  const browsers = validateBrowsers(options.browsers ?? ['chromium']);
  const timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const runHarness = options.runHarness ?? runConsoleUsabilityHarness;

  return async (request: FoundryAdapterRequest): Promise<FoundryAdapterResult> => {
    assertBoundedRequest(request);

    const reportPath = join('test-results', 'cux-001', 'foundry', `${request.executionContextId}.json`);
    const run = await runHarness({ consoleDirectory, reportPath, browsers, timeoutMs });
    const report = parseReport(run.report);
    const resultRef = relative(repositoryRoot, join(consoleDirectory, reportPath)).replaceAll('\\', '/');

    if (!report) {
      return {
        status: 'failed',
        resultRef,
        errorCode: 'cux_report_missing',
        summary: 'Console usability harness did not produce a valid governed report.',
      };
    }

    const blockerCount = report.summary.severityCounts.blocker ?? 0;
    const majorCount = report.summary.severityCounts.major ?? 0;
    const summary = [
      `CUX completed ${report.summary.runCount} browser/profile runs.`,
      `${report.summary.findingCount} findings: ${blockerCount} blocker, ${majorCount} major.`,
      `${report.summary.limitationCount} execution limitations recorded.`,
    ].join(' ');

    if (run.exitCode === 2) {
      return {
        status: 'blocked',
        resultRef,
        errorCode: 'cux_browser_unavailable',
        summary,
      };
    }
    if (run.exitCode !== 0 || blockerCount > 0) {
      return {
        status: 'failed',
        resultRef,
        errorCode: 'cux_blocker_found',
        summary,
      };
    }

    return { status: 'succeeded', resultRef, summary };
  };
}
