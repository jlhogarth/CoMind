import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { resolve } from 'node:path';

const LOCK_SUFFIX = '.comind-cbe-actuator-lock';
const OWNER_FILE = 'owner.json';

interface LockOwner {
  version: 1;
  host: string;
  pid: number;
  token: string;
  createdAt: string;
}

export type ChatgptProfileLockHandle = {
  lockPath: string;
  release(): Promise<void>;
};

export type ChatgptProfileLockDecision =
  | { acquired: true; handle: ChatgptProfileLockHandle }
  | { acquired: false; reason: 'profile_actuator_busy' };

type LockOptions = {
  host?: string;
  pid?: number;
  isProcessAlive?: (pid: number) => boolean | Promise<boolean>;
  now?: () => Date;
};

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

async function defaultProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== 'ESRCH';
  }
}

function validOwner(value: unknown): value is LockOwner {
  if (typeof value !== 'object' || value === null) return false;
  const owner = value as Partial<LockOwner>;
  return owner.version === 1
    && typeof owner.host === 'string'
    && owner.host.length > 0
    && Number.isSafeInteger(owner.pid)
    && Number(owner.pid) > 0
    && typeof owner.token === 'string'
    && owner.token.length > 0
    && typeof owner.createdAt === 'string'
    && Number.isFinite(Date.parse(owner.createdAt));
}

async function readOwner(lockPath: string): Promise<LockOwner | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(`${lockPath}/${OWNER_FILE}`, 'utf8'));
    return validOwner(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function chatgptProfileLockPath(profileDir: string): string {
  if (!profileDir.trim()) throw new Error('profileDir is required');
  return `${resolve(profileDir)}${LOCK_SUFFIX}`;
}

export async function acquireChatgptProfileLock(
  profileDir: string,
  options: LockOptions = {}
): Promise<ChatgptProfileLockDecision> {
  const lockPath = chatgptProfileLockPath(profileDir);
  const host = options.host ?? hostname();
  const pid = options.pid ?? process.pid;
  const isProcessAlive = options.isProcessAlive ?? defaultProcessAlive;
  const now = options.now ?? (() => new Date());

  if (!host.trim() || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('profile lock owner identity is invalid');
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      const existing = await readOwner(lockPath);
      if (
        attempt === 0
        && existing
        && existing.host === host
        && !(await isProcessAlive(existing.pid))
      ) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      return { acquired: false, reason: 'profile_actuator_busy' };
    }

    const token = randomUUID();
    const owner: LockOwner = {
      version: 1,
      host,
      pid,
      token,
      createdAt: now().toISOString(),
    };

    try {
      await writeFile(
        `${lockPath}/${OWNER_FILE}`,
        `${JSON.stringify(owner)}\n`,
        { encoding: 'utf8', mode: 0o600, flag: 'wx' }
      );
    } catch (error) {
      await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }

    return {
      acquired: true,
      handle: {
        lockPath,
        async release() {
          const current = await readOwner(lockPath);
          if (!current || current.token !== token) {
            throw new Error('profile_lock_ownership_lost');
          }
          await rm(lockPath, { recursive: true, force: false });
        },
      },
    };
  }

  return { acquired: false, reason: 'profile_actuator_busy' };
}
