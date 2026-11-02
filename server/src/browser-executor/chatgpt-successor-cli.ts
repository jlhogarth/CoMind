import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { acquireChatgptProfileLock, type ChatgptProfileLockHandle } from './chatgpt-profile-lock.js';
import { createFoundryBrowserLeaseVerifier } from './lease.js';
import { createPlaywrightChatgptSuccessorDriver, type ChatgptSuccessorExecutionResult } from './chatgpt-successor.js';
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
  if (!raw) throw new Error('DATABASE_URL is required for canonical Foundry lease verification');
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

function writeResult(result: ChatgptSuccessorExecutionResult): void {
  process.stdout.write(`${JSON.stringify(redactedResult(result))}\n`);
}

async function writePrivateBinding(path: string, successorConversationUrl: string): Promise<void> {
  await writeFile(
    path,
    `${JSON.stringify({ successorConversationUrl })}\n`,
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

    const result = await executeGovernedChatgptSuccessor(job, DEFAULT_POLICY, {
      leaseVerifier: createFoundryBrowserLeaseVerifier(query),
      driverFactory: () => createPlaywrightChatgptSuccessorDriver({
        persistentContextDir: profileDir,
        headless,
      }),
    });

    if (result.status === 'succeeded' && result.successorConversationUrl) {
      await writePrivateBinding(bindingFile, result.successorConversationUrl);
    }

    writeResult(result);
    process.exitCode = result.status === 'succeeded' ? 0 : 2;
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
