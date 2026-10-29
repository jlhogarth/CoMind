import { createDecipheriv, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pool, prepareArchiveDatabaseSession, query } from '../db.js';

const CANONICAL_BYTES = 535654634;
const CANONICAL_SHA256 = '125f79141e7aa8c046e6c8f3c6a12c0dd5507ec4f58d261af697fa62fdf87b2e';
const EXPECTED_CHUNKS = 11;
const WORK_ROOT = '/tmp/comind-chist-pita';
const CHUNK_ROOT = `${WORK_ROOT}/chunks`;
const CIPHERTEXT_PATH = `${WORK_ROOT}/openai-export.enc`;
const ZIP_PATH = `${WORK_ROOT}/openai-export.zip`;

type TransferRow = {
  transfer_id: string;
  purpose: string;
  expected_source_sha256: string;
  expected_source_bytes: string | number;
  cipher_sha256: string;
  chunk_hashes: unknown;
  signed_urls: unknown;
  key_hex: string | null;
  iv_hex: string | null;
  expires_at: string | Date;
};

function requireUuid(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error('CHIST_PITA_TRANSFER_ID must be a valid UUID');
  }
  return normalized;
}

function requireHex(value: unknown, length: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
    throw new Error(`${label} has an invalid hexadecimal shape`);
  }
  return value;
}

function requireStringArray(value: unknown, count: number, label: string): string[] {
  if (!Array.isArray(value) || value.length !== count || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${label} must contain exactly ${count} strings`);
  }
  return value as string[];
}

function validateTransferUrl(raw: string): URL {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') throw new Error('Transfer URL must use HTTPS');
  if (!(parsed.hostname === 'oaiusercontent.com' || parsed.hostname.endsWith('.oaiusercontent.com'))) {
    throw new Error('Transfer URL host is outside the approved private file-delivery domain');
  }
  if (!parsed.pathname.startsWith('/files/')) {
    throw new Error('Transfer URL path is outside the approved private file-delivery path');
  }
  return parsed;
}

async function fetchWithBoundedRedirects(raw: string): Promise<Response> {
  let current = validateTransferUrl(raw).toString();
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Transfer redirect omitted Location');
      current = validateTransferUrl(new URL(location, current).toString()).toString();
      continue;
    }
    if (!response.ok || !response.body) {
      throw new Error(`Transfer download failed with HTTP ${response.status}`);
    }
    return response;
  }
  throw new Error('Transfer download exceeded redirect limit');
}

async function downloadVerified(rawUrl: string, outputPath: string, expectedHash: string): Promise<void> {
  const response = await fetchWithBoundedRedirects(rawUrl);
  const hash = createHash('sha256');
  const tap = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as never),
    tap,
    createWriteStream(outputPath, { mode: 0o600 }),
  );
  const actual = hash.digest('hex');
  if (actual !== expectedHash) {
    throw new Error('Encrypted transfer chunk failed SHA-256 verification');
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function verifyFileIdentity(path: string, expectedBytes: number, expectedHash: string): Promise<void> {
  const metadata = await stat(path);
  if (metadata.size !== expectedBytes) {
    throw new Error(`Canonical source byte count mismatch: expected ${expectedBytes}, received ${metadata.size}`);
  }
  const actualHash = await sha256File(path);
  if (actualHash !== expectedHash) {
    throw new Error('Canonical source SHA-256 mismatch');
  }
}

async function consumeTransfer(transferId: string): Promise<void> {
  const result = await query<{ transfer_id: string }>(
    `UPDATE comind.cm_archive_transfer_stage
        SET signed_urls = NULL,
            key_hex = NULL,
            iv_hex = NULL,
            consumed_at = now()
      WHERE transfer_id = $1::uuid
        AND purpose = 'CHIST_PITA'
        AND consumed_at IS NULL
      RETURNING transfer_id`,
    [transferId],
  );
  if (result.rows.length !== 1) {
    throw new Error('Transfer row could not be atomically consumed and scrubbed');
  }
}

async function main(): Promise<void> {
  const transferId = requireUuid(process.env.CHIST_PITA_TRANSFER_ID);
  await mkdir(CHUNK_ROOT, { recursive: true, mode: 0o700 });
  await rm(CIPHERTEXT_PATH, { force: true });
  await rm(ZIP_PATH, { force: true });

  const identity = await prepareArchiveDatabaseSession();
  if (identity.currentUser !== 'comind_archive_ingestor') {
    throw new Error('Transfer acquisition requires the governed archive capability role');
  }

  const transferResult = await query<TransferRow>(
    `SELECT transfer_id::text,
            purpose,
            expected_source_sha256,
            expected_source_bytes,
            cipher_sha256,
            chunk_hashes,
            signed_urls,
            key_hex,
            iv_hex,
            expires_at
       FROM comind.cm_archive_transfer_stage
      WHERE transfer_id = $1::uuid
        AND purpose = 'CHIST_PITA'
        AND consumed_at IS NULL
        AND expires_at > now()`,
    [transferId],
  );
  if (transferResult.rows.length !== 1) {
    throw new Error('No active governed CHIST transfer row is available');
  }

  const transfer = transferResult.rows[0];
  let transferConsumed = false;
  try {
    const expectedBytes = Number(transfer.expected_source_bytes);
    if (transfer.expected_source_sha256 !== CANONICAL_SHA256 || expectedBytes !== CANONICAL_BYTES) {
      throw new Error('Transfer manifest does not identify the independently verified canonical source');
    }
    const expiresAt = new Date(transfer.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error('Transfer manifest is expired');
    }

    const cipherHash = requireHex(transfer.cipher_sha256, 64, 'cipher_sha256');
    const chunkHashes = requireStringArray(transfer.chunk_hashes, EXPECTED_CHUNKS, 'chunk_hashes')
      .map((value, index) => requireHex(value, 64, `chunk_hashes[${index}]`));
    const signedUrls = requireStringArray(transfer.signed_urls, EXPECTED_CHUNKS, 'signed_urls');
    const keyHex = requireHex(transfer.key_hex, 64, 'key_hex');
    const ivHex = requireHex(transfer.iv_hex, 32, 'iv_hex');

    await Promise.all(signedUrls.map((url, index) =>
      downloadVerified(url, `${CHUNK_ROOT}/part-${String(index).padStart(2, '0')}`, chunkHashes[index])
    ));

    for (let index = 0; index < EXPECTED_CHUNKS; index += 1) {
      const chunk = await readFile(`${CHUNK_ROOT}/part-${String(index).padStart(2, '0')}`);
      await appendFile(CIPHERTEXT_PATH, chunk, { mode: 0o600 });
    }
    const actualCipherHash = await sha256File(CIPHERTEXT_PATH);
    if (actualCipherHash !== cipherHash) {
      throw new Error('Reconstructed ciphertext failed SHA-256 verification');
    }

    const decipher = createDecipheriv(
      'aes-256-ctr',
      Buffer.from(keyHex, 'hex'),
      Buffer.from(ivHex, 'hex'),
    );
    await pipeline(
      createReadStream(CIPHERTEXT_PATH),
      decipher,
      createWriteStream(ZIP_PATH, { mode: 0o600 }),
    );
    await verifyFileIdentity(ZIP_PATH, CANONICAL_BYTES, CANONICAL_SHA256);
  } finally {
    try {
      await consumeTransfer(transferId);
      transferConsumed = true;
    } finally {
      await rm(CHUNK_ROOT, { recursive: true, force: true });
      await rm(CIPHERTEXT_PATH, { force: true });
    }
  }

  console.log(JSON.stringify({
    status: 'PASS',
    transferId,
    transferConsumed,
    sessionUser: identity.sessionUser,
    currentUser: identity.currentUser,
    sourceBytes: CANONICAL_BYTES,
    sourceSha256: CANONICAL_SHA256,
    sourcePath: ZIP_PATH,
  }));
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`CHIST PIT-A transfer failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
