import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext } from 'playwright';
import {
  acquireChatgptProfileLock,
  type ChatgptProfileLockHandle,
} from '../browser-executor/chatgpt-profile-lock.js';

export const CBE_CONTROL_ACTIONS = [
  'start_browser',
  'stop_browser',
  'retry_recovery',
  'open_auth',
  'wake_conversation',
] as const;

export type CbeControlAction = (typeof CBE_CONTROL_ACTIONS)[number];

export type CbeControlRequest = {
  action: CbeControlAction;
  work_key: string | null;
  recovery_id: string | null;
  environment: 'development-test';
  production_change: false;
  requested_at: string;
};

export type CbeControlResult = {
  status: string;
  message: string;
  correlation_id: string;
  human_action_required: boolean;
  human_action_url: string | null;
};

export class CbeControlUnavailableError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
  }
}

export type CbeRecoveryExecutor = (
  request: CbeControlRequest
) => Promise<CbeControlResult>;

export interface CbeControlExecutor {
  execute(request: CbeControlRequest): Promise<CbeControlResult>;
  close(): Promise<void>;
}

type BrowserContextHandle = Pick<BrowserContext, 'close'>;
type BrowserLauncher = (profileDir: string, headless: boolean) => Promise<BrowserContextHandle>;
type ProfileLockDecision =
  | { acquired: true; handle: ChatgptProfileLockHandle }
  | { acquired: false };
type ProfileLockAcquire = (profileDir: string) => Promise<ProfileLockDecision>;

export type CbeControlExecutorOptions = {
  profileDir?: string | null;
  headless?: boolean;
  humanAuthUrl?: string | null;
  recoveryExecutor?: CbeRecoveryExecutor | null;
  launcher?: BrowserLauncher;
  acquireProfileLock?: ProfileLockAcquire;
};

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDir, '../../..');

function outsideRepository(path: string): boolean {
  const rel = relative(repositoryRoot, path);
  return rel !== '' && (rel.startsWith('..') || isAbsolute(rel));
}

function normalizeProfileDir(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const absolute = resolve(value.trim());
  if (!outsideRepository(absolute)) {
    throw new CbeControlUnavailableError(
      'profile_path_inside_repository',
      'CBE profile directory must remain outside the repository.'
    );
  }
  return absolute;
}

function normalizeHumanAuthUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CbeControlUnavailableError('human_auth_url_invalid', 'Human authentication URL is invalid.');
  }
  if (parsed.protocol !== 'https:') {
    throw new CbeControlUnavailableError('human_auth_url_invalid', 'Human authentication URL must use HTTPS.');
  }
  return parsed.toString();
}

function result(
  status: string,
  message: string,
  options: { humanActionRequired?: boolean; humanActionUrl?: string | null } = {}
): CbeControlResult {
  return {
    status,
    message,
    correlation_id: randomUUID(),
    human_action_required: options.humanActionRequired ?? false,
    human_action_url: options.humanActionUrl ?? null,
  };
}

export function createCbeControlExecutor(options: CbeControlExecutorOptions = {}): CbeControlExecutor {
  const profileDir = normalizeProfileDir(options.profileDir);
  const humanAuthUrl = normalizeHumanAuthUrl(options.humanAuthUrl);
  const headless = options.headless ?? true;
  const recoveryExecutor = options.recoveryExecutor ?? null;
  const launcher: BrowserLauncher = options.launcher
    ?? ((dir, browserHeadless) => chromium.launchPersistentContext(dir, { headless: browserHeadless }));
  const lockAcquire: ProfileLockAcquire = options.acquireProfileLock
    ?? (async (dir) => {
      const decision = await acquireChatgptProfileLock(dir);
      return decision.acquired
        ? { acquired: true, handle: decision.handle }
        : { acquired: false };
    });

  let browserContext: BrowserContextHandle | null = null;
  let profileLock: ChatgptProfileLockHandle | null = null;

  async function stopBrowser(): Promise<'stopped' | 'already_stopped'> {
    if (!browserContext && !profileLock) return 'already_stopped';
    let closeFailed = false;
    try {
      if (browserContext) await browserContext.close();
    } catch {
      closeFailed = true;
    } finally {
      browserContext = null;
      if (profileLock) {
        try {
          await profileLock.release();
        } catch {
          closeFailed = true;
        }
        profileLock = null;
      }
    }
    if (closeFailed) {
      throw new CbeControlUnavailableError(
        'browser_stop_failed',
        'The CBE browser could not be closed cleanly.'
      );
    }
    return 'stopped';
  }

  return {
    async execute(request) {
      if (request.production_change !== false || request.environment !== 'development-test') {
        throw new CbeControlUnavailableError(
          'authority_boundary_invalid',
          'CBE mobile execution is limited to Development/Test with production_change=false.'
        );
      }

      if (request.action === 'start_browser') {
        if (browserContext) {
          return result('already_running', 'The governed CBE browser is already running.');
        }
        if (!profileDir) {
          throw new CbeControlUnavailableError(
            'profile_not_configured',
            'No external persistent CBE profile directory is configured.'
          );
        }
        const lockDecision = await lockAcquire(profileDir);
        if (!lockDecision.acquired) {
          throw new CbeControlUnavailableError(
            'profile_locked',
            'The persistent CBE profile is already owned by another governed actuator process.'
          );
        }
        profileLock = lockDecision.handle;
        try {
          browserContext = await launcher(profileDir, headless);
        } catch {
          await profileLock.release().catch(() => undefined);
          profileLock = null;
          throw new CbeControlUnavailableError(
            'browser_start_failed',
            'The governed CBE browser could not be started.'
          );
        }
        return result('started', 'The governed CBE browser started with the external persistent profile.');
      }

      if (request.action === 'stop_browser') {
        const state = await stopBrowser();
        return state === 'stopped'
          ? result('stopped', 'The governed CBE browser stopped and released its profile lock.')
          : result('already_stopped', 'The governed CBE browser is already stopped.');
      }

      if (request.action === 'open_auth') {
        if (!humanAuthUrl) {
          throw new CbeControlUnavailableError(
            'human_auth_unavailable',
            'No governed human-authentication surface is configured for this runtime.'
          );
        }
        return result(
          'human_action_required',
          'Interactive authentication is required in the governed human-authentication surface.',
          { humanActionRequired: true, humanActionUrl: humanAuthUrl }
        );
      }

      if (request.action === 'retry_recovery' || request.action === 'wake_conversation') {
        if (!request.work_key) {
          throw new CbeControlUnavailableError(
            'work_key_required',
            `${request.action} requires an explicit canonical work key.`
          );
        }
        if (!recoveryExecutor) {
          throw new CbeControlUnavailableError(
            'recovery_resolver_unavailable',
            'The canonical recovery work/lease resolver is not bound to this runtime.'
          );
        }
        return recoveryExecutor(request);
      }

      throw new CbeControlUnavailableError('action_unsupported', 'The requested CBE action is not supported.');
    },
    async close() {
      await stopBrowser();
    },
  };
}
