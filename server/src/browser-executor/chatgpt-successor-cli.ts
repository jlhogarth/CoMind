import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { acquireChatgptProfileLock, type ChatgptProfileLockHandle } from './chatgpt-profile-lock.js';
import { createFoundryBrowserLeaseVerifier } from './lease.js';
import { createPlaywrightChatgptSuccessorDriver, type ChatgptSuccessorExecutionResult } from './chatgpt-successor.js';
import { promoteChatgptSuccessorBinding, type ChatgptSuccessorRegistryResult } from './chatgpt-successor-registry.js';
import { executeGovernedChatgptSuccessor, parseChatgptSuccessorJob } from './chatgpt-successor-runtime.js';
import type { QueryFunction } from '../db.js';

const DEFAULT_POLICY = Object.freeze({
  maxTimeoutMs: 60_000,
  maxMessageChars: 8_000,
  maxProvenanceRefs: 12,
});

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDir, '../../..');

function insideRepository(candidate: string): boolean {
  const rel = relative(repositoryRoot, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function parseHeadless(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('CBE_HEADLESS must be true or false');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function readJobInput(): Promise<string> {
  const fileArgument = process.argv[2]?.trim();
  if (!fileArgument) return readStdin();
  const absolutePath = resolve(fileArgument);
  if (insideRepository(absolutePath)) {
    throw new Error('Successor job files must remain outside the repository because they contain a lease capability reference');
  }
  return readFile(absolutePath, 'utf8');
}

function parseDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error('DATABASE_URL is required for canonical Foundry lease verification and successor registry promotion');
  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }
  return raw;
}

function parseProfileDir(): string {
  const raw = process.env.CBE_PROFILE_DIR?.trim();
  if (!raw) throw new Error('CBE_PROFILE_DIR is required');
  const absolutePath = resolve(raw);
  if (insideRepository(absolutePath)) {
    throw new Error('CBE_PROFILE_DIR must be outside the repository');
  }
  return absolutePath;
}

function parseBindingFile(): string {
  const raw = process.env.CBE_SUCCESSOR_BINDING_FILE?.trim();
  if (!raw) throw new Error('CBE_SUCCESSOR_BINDING_FILE is required');
  const absolutePath = resolve(raw);
  if (insideRepository(absolutePath)) {
    throw new Error('CBE_SUCCESSOR_BINDING_FILE must be outside the repository');
  }
  return absolutePath;
}

function redactedResult(result: ChatgptSuccessorExecutionResult): Omit<ChatgptSuccessorExecutionResult, 'successorConversationUrl'> {
  const { successorConversationUrl: _privateBinding, ...safe } = result;
  return safe;
}

function safeRegistryResult(registry: ChatgptSuccessorRegistryResult | null): ChatgptSuccessorRegistryResult | null {
  return registry ? { ...registry } : null;
}

function writeResult(result: ChatgptSuccessorExecutionResult, registry: ChatgptSuccessorRegistryResult | null = null): void {
  process.stdout.write(`${JSON.stringify({ ...redactedResult(result), registry: safeRegistryResult(registry) })}\n`);
}

async function preparePrivateBindingFile(path: string): Promise<void> {
  await writeFile(path, '', { encoding: 'utf8', mode: 0o600, flag: 'w' });
}

async function writePrivateBinding(
  path: string,
  successorConversationUrl: string,
  registry: ChatgptSuccessorRegistryResult
): Promise<void> {
  await writeFile(
    path,
    `${JSON.stringify({
      successorConversationUrl,
      bindingEventId: registry.bindingEventId ?? null,
      conversationGeneration: registry.conversationGeneration ?? null,
      desiredTitle: registry.desiredTitle ?? null,
    })}\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'w' }
  );
}

function unavailableResult(reason: string, detail?: string): ChatgptSuccessorExecutionResult {
  return {
    status: 'failed',
    reason,
    recoverable: true,
    evidence: Object.freeze(detail ? { detail } : {}),
  };
}

function registryFailureResult(
  browserResult: ChatgptSuccessorExecutionResult,
  registry: ChatgptSuccessorRegistryResult
): ChatgptSuccessorExecutionResult {
  return {
    status: 'failed',
    reason: registry.reason,
    recoverable: registry.recoverable,
    evidence: Object.freeze({
      ...browserResult.evidence,
      registryPromotion: {
        promoted: false,
        reason: registry.reason,
      },
    }),
  };
}

async function main(): Promise<void> {
  let pool: Pool | null = null;
  let profileLock: ChatgptProfileLockHandle | null = null;
  try {
    const input = await readJobInput();
    if (!input.trim()) throw new Error('A successor job JSON document is required on stdin or as an external file path');
    const job = parseChatgptSuccessorJob(JSON.parse(input));
    const profileDir = parseProfileDir();
    const bindingFile = parseBindingFile();
    const headless = parseHeadless(process.env.CBE_HEADLESS);
    const databaseUrl = parseDatabaseUrl();
    await preparePrivateBindingFile(bindingFile);

    const lockDecision = await acquireChatgptProfileLock(profileDir);
    if (!lockDecision.acquired) {
      writeResult(unavailableResult(
        'successor_actuator_unavailable',
        'The persistent ChatGPT browser profile is already owned by another governed actuator process.'
      ));
      process.exitCode = 2;
      return;
    }
    profileLock = lockDecision.handle;

    pool = new Pool({ connectionString: databaseUrl, max: 2, idleTimeoutMillis: 30_000 });
    const query: QueryFunction = async <Row>(text: string, params?: any[]) => {
      if (!pool) throw new Error('Database pool is unavailable');
      const result = await pool.query(text, params);
      return { rows: result.rows as Row[] };
    };

    const browserResult = await executeGovernedChatgptSuccessor(job, DEFAULT_POLICY, {
      leaseVerifier: createFoundryBrowserLeaseVerifier(query),
      driverFactory: () => createPlaywrightChatgptSuccessorDriver({
        persistentContextDir: profileDir,
        headless,
      }),
    });

    if (browserResult.status !== 'succeeded' || !browserResult.successorConversationUrl) {
      writeResult(browserResult);
      process.exitCode = 2;
      return;
    }

    const client = await pool.connect();
    let registry: ChatgptSuccessorRegistryResult;
    try {
      registry = await promoteChatgptSuccessorBinding(client, {
        workKey: job.capsule.workKey,
        continuityId: job.capsule.continuityId,
        successorConversationUrl: browserResult.successorConversationUrl,
        expectedPredecessorBindingEventId: job.capsule.predecessorBindingEventId,
        predecessorConversationRefSha256: job.capsule.predecessorRefSha256,
        registeredBy: 'aed-005-successor',
      });
    } finally {
      client.release();
    }

    if (!registry.promoted) {
      const failed = registryFailureResult(browserResult, registry);
      writeResult(failed, registry);
      process.exitCode = 2;
      return;
    }

    try {
      await writePrivateBinding(bindingFile, browserResult.successorConversationUrl, registry);
    } catch {
      writeResult({
        status: 'failed',
        reason: 'successor_binding_file_write_failed',
        recoverable: true,
        evidence: Object.freeze({
          ...browserResult.evidence,
          registryPromotion: {
            promoted: true,
            bindingEventId: registry.bindingEventId ?? null,
            conversationGeneration: registry.conversationGeneration ?? null,
            desiredTitle: registry.desiredTitle ?? null,
          },
        }),
      }, registry);
      process.exitCode = 2;
      return;
    }

    writeResult(browserResult, registry);
    process.exitCode = 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown successor actuator configuration error';
    writeResult(unavailableResult('successor_actuator_configuration_invalid', detail));
    process.exitCode = 2;
  } finally {
    if (pool) await pool.end().catch(() => undefined);
    if (profileLock) {
      await profileLock.release().catch(() => {
        process.exitCode = 2;
      });
    }
  }
}

await main();
