import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QueryFunction } from '../db.js';
import { createFoundryBrowserLeaseVerifier } from '../browser-executor/lease.js';
import { acquireChatgptProfileLock } from '../browser-executor/chatgpt-profile-lock.js';
import { createPlaywrightChatgptHandoffDriver, type ChatgptHandoffDriver, type ChatgptHandoffJob } from '../browser-executor/chatgpt-handoff.js';
import { executeGovernedChatgptConversationReturn, parseChatgptHandoffJob } from '../browser-executor/chatgpt-handoff-runtime.js';
import { CbeControlUnavailableError, type CbeRecoveryExecutor } from './executor.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const maxJobBytes = 32_768;

function unavailable(reason: string): never {
  throw new CbeControlUnavailableError(reason, `Original-conversation return unavailable: ${reason}.`);
}

function externalPath(path: string): boolean {
  const rel = relative(repositoryRoot, path);
  return rel !== '' && (rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel));
}

/** Only the recovery controller may stage this existing capability-bearing job. */
export async function readPrivateHandoffJob(path: string): Promise<unknown> {
  const absolute = resolve(path);
  if (!externalPath(absolute) || !externalPath(await realpath(absolute))) unavailable('handoff_job_path_invalid');
  const file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > maxJobBytes) unavailable('handoff_job_file_invalid');
    const buffer = Buffer.alloc(maxJobBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxJobBytes) unavailable('handoff_job_file_invalid');
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await file.close();
  }
}

type Options = {
  query: QueryFunction;
  jobFile: string;
  profileDir: string;
  headless?: boolean;
  readJob?: (path: string) => Promise<unknown>;
  driverFactory?: () => ChatgptHandoffDriver;
  acquireLock?: typeof acquireChatgptProfileLock;
};

export function createStagedRecoveryExecutor(options: Options): CbeRecoveryExecutor {
  const verifyLease = createFoundryBrowserLeaseVerifier(options.query);
  return async (request) => {
    if (request.action !== 'wake_conversation') unavailable('semantic_recovery_executor_unavailable');
    if (!request.work_key || !request.recovery_id) unavailable('recovery_identity_required');
    if (request.environment !== 'development-test' || request.production_change !== false) unavailable('environment_invalid');
    let job: ChatgptHandoffJob;
    try {
      job = parseChatgptHandoffJob(await (options.readJob ?? readPrivateHandoffJob)(options.jobFile));
    } catch {
      // Never return parser/file errors: they may contain private job values or paths.
      unavailable('handoff_job_unavailable');
    }
    if (job.handoff.workKey !== request.work_key || job.handoff.recoveryId !== request.recovery_id) unavailable('recovery_job_mismatch');

    async function verifyBinding(): Promise<void> {
      const result = await options.query<{ binding: { status?: string; registeredConversationUrl?: string } }>(
        'SELECT comind_pm.resolve_lane_conversation_binding($1) AS binding', [request.work_key]
      );
      const binding = result.rows[0]?.binding;
      if (binding?.status !== 'active') unavailable('conversation_binding_unavailable');
      if (binding.registeredConversationUrl !== job.registeredConversationUrl
        || binding.registeredConversationUrl !== job.targetUrl) unavailable('conversation_binding_changed');
    }

    try { await verifyBinding(); } catch (error) {
      if (error instanceof CbeControlUnavailableError) throw error;
      unavailable('conversation_binding_lookup_failed');
    }
    const decision = await (options.acquireLock ?? acquireChatgptProfileLock)(options.profileDir);
    if (!decision.acquired) unavailable('browser_profile_busy');
    try {
      const outcome = await executeGovernedChatgptConversationReturn(job,
        { maxTimeoutMs: 60_000, maxMessageChars: 8_000 }, {
          leaseVerifier: async (lease, now) => {
            await verifyBinding();
            return verifyLease(lease, now);
          },
          driverFactory: options.driverFactory ?? (() => createPlaywrightChatgptHandoffDriver({
            persistentContextDir: options.profileDir, headless: options.headless ?? true,
          })),
        });
      return {
        status: outcome.returnStatus,
        message: `${outcome.returnReason}: ${outcome.returnWhy}`,
        correlation_id: job.jobId,
        human_action_required: outcome.returnReason === 'authentication_required',
        human_action_url: null,
      };
    } finally {
      try { await decision.handle.release(); } catch { unavailable('browser_profile_release_failed'); }
    }
  };
}
