import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdtemp, mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { PoolClient } from 'pg';

import { assertArchiveDatabaseSessionPrepared, pool } from '../db.js';
import {
  CHATGPT_ARCHIVE_PARSER_VERSION,
  CHATGPT_ARCHIVE_SCHEMA_VERSION,
  analyzeChatGptConversation,
  canonicalJson,
  sha256Canonical,
  sha256Text,
  type AttachmentReference,
  type ConversationAnalysis,
  type IntegrityStatus,
  type ParserEvent,
} from './chatgpt-export.js';

const execFileAsync = promisify(execFile);
const MAX_NESTED_ZIP_DEPTH = 2;
const MAX_NESTED_ZIP_COUNT = 16;

export interface SourceFileManifest {
  sourcePath: string;
  absolutePath: string;
  fileRole: 'conversation_json' | 'metadata_json' | 'html' | 'asset' | 'other';
  byteLength: number;
  sha256: string;
  mediaType: string | null;
}

export interface ArchiveImportResult {
  importId: string;
  sourceArchiveId: string;
  status: IntegrityStatus;
  receiptSha256: string;
  receipt: Record<string, unknown>;
  reused: boolean;
}

interface PreparedSource {
  sourceRoot: string;
  sourceArchiveName: string;
  sourceArchiveSha256: string;
  sourceArchiveBytes: number;
  sourceUri: string;
  cleanup: () => Promise<void>;
}

type DriftCategory = 'conversation' | 'node' | 'message' | 'author' | 'content' | 'metadata';
type DriftSets = Record<DriftCategory, Set<string>>;

interface AttachmentCoverage {
  references: number;
  resolved: number;
  unresolved: number;
  ambiguous: number;
}

interface ObservationTelemetry {
  schemaDrift: DriftSets;
  contentTypes: Set<string>;
  roles: Set<string>;
  attachmentCoverage: AttachmentCoverage;
}

function mediaTypeFor(filePath: string): string | null {
  switch (path.extname(filePath).toLowerCase()) {
    case '.json': return 'application/json';
    case '.html': return 'text/html';
    case '.txt': return 'text/plain';
    case '.csv': return 'text/csv';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.pdf': return 'application/pdf';
    case '.mp3': return 'audio/mpeg';
    case '.mp4': return 'video/mp4';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    case '.zip': return 'application/zip';
    default: return null;
  }
}

function roleForFile(relativePath: string): SourceFileManifest['fileRole'] {
  const base = path.basename(relativePath).toLowerCase();
  const extension = path.extname(base);
  if (/^conversations(?:[-_.]\d+)?\.json$/.test(base) || base === 'conversations.json') return 'conversation_json';
  if (extension === '.json') return 'metadata_json';
  if (extension === '.html') return 'html';
  if (extension === '.zip') return 'other';
  if (extension === '.dat' || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.mp3', '.mp4', '.wav', '.m4a'].includes(extension)) return 'asset';
  return 'other';
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function listFiles(root: string, current = ''): Promise<SourceFileManifest[]> {
  const directory = path.join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests: SourceFileManifest[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(current, entry.name);
    const absolute = path.join(root, relative);
    if (entry.isDirectory()) {
      manifests.push(...await listFiles(root, relative));
    } else if (entry.isFile()) {
      const metadata = await stat(absolute);
      manifests.push({
        sourcePath: relative.split(path.sep).join('/'),
        absolutePath: absolute,
        fileRole: roleForFile(relative),
        byteLength: metadata.size,
        sha256: await sha256File(absolute),
        mediaType: mediaTypeFor(relative),
      });
    }
  }
  return manifests;
}

async function safeZipEntries(zipPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('unzip', ['-Z1', zipPath], { maxBuffer: 16 * 1024 * 1024 });
  const entries: string[] = [];
  for (const rawEntry of stdout.split(/\r?\n/)) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const slashNormalized = entry.replaceAll('\\', '/');
    const segments = slashNormalized.split('/');
    if (slashNormalized.startsWith('/') || /^[A-Za-z]:\//.test(slashNormalized) || segments.includes('..')) {
      throw new Error(`Unsafe ZIP entry rejected: ${entry}`);
    }
    entries.push(slashNormalized);
  }
  return entries;
}

async function unzipSafely(zipPath: string, destination: string): Promise<void> {
  await safeZipEntries(zipPath);
  await mkdir(destination, { recursive: true });
  await execFileAsync('unzip', ['-q', zipPath, '-d', destination]);
}

async function looksLikeNestedExportZip(zipPath: string): Promise<boolean> {
  const entries = await safeZipEntries(zipPath);
  return entries.some((entry) => {
    const base = path.posix.basename(entry).toLowerCase();
    return /^conversations(?:[-_.]\d+)?\.json$/.test(base)
      || /^conversations?.*\.zip$/.test(base)
      || base === 'export_manifest.json';
  });
}

async function expandNestedExportZips(root: string): Promise<void> {
  let expanded = 0;
  const seen = new Set<string>();
  for (let depth = 0; depth < MAX_NESTED_ZIP_DEPTH; depth += 1) {
    const files = await listFiles(root);
    const candidates = files.filter((file) => path.extname(file.sourcePath).toLowerCase() === '.zip' && !seen.has(file.absolutePath));
    if (candidates.length === 0) return;
    let expandedAtDepth = 0;
    for (const candidate of candidates) {
      seen.add(candidate.absolutePath);
      if (!await looksLikeNestedExportZip(candidate.absolutePath)) continue;
      if (expanded >= MAX_NESTED_ZIP_COUNT) throw new Error(`Nested export ZIP count exceeds ${MAX_NESTED_ZIP_COUNT}`);
      const destination = path.join(root, '__nested_exports', `${depth}-${expanded}-${candidate.sha256.slice(0, 12)}`);
      await unzipSafely(candidate.absolutePath, destination);
      expanded += 1;
      expandedAtDepth += 1;
    }
    if (expandedAtDepth === 0) return;
  }
}

async function prepareSource(inputPath: string): Promise<PreparedSource> {
  const resolved = path.resolve(inputPath);
  const metadata = await stat(resolved);
  if (metadata.isDirectory()) {
    const originalFiles = await listFiles(resolved);
    const manifestIdentity = originalFiles.map(({ sourcePath, byteLength, sha256 }) => ({ sourcePath, byteLength, sha256 }));
    const stagingRoot = await mkdtemp(path.join(tmpdir(), 'comind-chatgpt-export-dir-'));
    const destination = path.join(stagingRoot, 'source');
    await cp(resolved, destination, { recursive: true, force: false, errorOnExist: true });
    try {
      await expandNestedExportZips(destination);
    } catch (error) {
      await rm(stagingRoot, { recursive: true, force: true });
      throw error;
    }
    return {
      sourceRoot: destination,
      sourceArchiveName: path.basename(resolved),
      sourceArchiveSha256: sha256Canonical(manifestIdentity),
      sourceArchiveBytes: originalFiles.reduce((sum, file) => sum + file.byteLength, 0),
      sourceUri: resolved,
      cleanup: async () => rm(stagingRoot, { recursive: true, force: true }),
    };
  }

  if (!metadata.isFile() || path.extname(resolved).toLowerCase() !== '.zip') {
    throw new Error('ChatGPT archive source must be a .zip file or an extracted directory');
  }

  const destination = await mkdtemp(path.join(tmpdir(), 'comind-chatgpt-export-'));
  try {
    await unzipSafely(resolved, destination);
    await expandNestedExportZips(destination);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw new Error(`Unable to extract ChatGPT export safely: ${String(error)}`);
  }

  return {
    sourceRoot: destination,
    sourceArchiveName: path.basename(resolved),
    sourceArchiveSha256: await sha256File(resolved),
    sourceArchiveBytes: metadata.size,
    sourceUri: resolved,
    cleanup: async () => rm(destination, { recursive: true, force: true }),
  };
}

async function firstNonWhitespaceCharacter(filePath: string): Promise<string | null> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString('utf8');
    return [...text].find((character) => !/\s/.test(character)) ?? null;
  } finally {
    await handle.close();
  }
}

async function* streamTopLevelArray(filePath: string): AsyncGenerator<unknown> {
  let started = false;
  let finished = false;
  let inString = false;
  let escaped = false;
  let depth = 0;
  let current = '';

  for await (const chunk of createReadStream(filePath, { encoding: 'utf8' })) {
    for (const character of chunk) {
      if (!started) {
        if (/\s/.test(character)) continue;
        if (character !== '[') throw new Error(`Expected top-level JSON array in ${filePath}`);
        started = true;
        continue;
      }
      if (finished) {
        if (!/\s/.test(character)) throw new Error(`Unexpected data after top-level JSON array in ${filePath}`);
        continue;
      }
      if (depth === 0) {
        if (/\s/.test(character) || character === ',') continue;
        if (character === ']') {
          finished = true;
          continue;
        }
        if (character !== '{') throw new Error(`Expected conversation object in ${filePath}`);
        current = character;
        depth = 1;
        inString = false;
        escaped = false;
        continue;
      }

      current += character;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }

      if (character === '"') inString = true;
      else if (character === '{' || character === '[') depth += 1;
      else if (character === '}' || character === ']') {
        depth -= 1;
        if (depth === 0) {
          yield JSON.parse(current) as unknown;
          current = '';
        }
      }
    }
  }

  if (!started || !finished || depth !== 0 || current !== '') throw new Error(`Incomplete top-level JSON array in ${filePath}`);
}

async function* readConversationValues(filePath: string): AsyncGenerator<unknown> {
  const first = await firstNonWhitespaceCharacter(filePath);
  if (first === '[') {
    yield* streamTopLevelArray(filePath);
    return;
  }
  if (first === '{') {
    const chunks: Buffer[] = [];
    for await (const chunk of createReadStream(filePath)) chunks.push(chunk as Buffer);
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (Array.isArray(value)) for (const item of value) yield item;
    else yield value;
    return;
  }
  throw new Error(`Conversation JSON file ${filePath} does not contain an object or array`);
}

function makeParserEvent(
  severity: ParserEvent['severity'],
  eventCode: string,
  detail: string,
  evidence: Record<string, unknown>,
  ids: Partial<Pick<ParserEvent, 'sourceConversationId' | 'sourceNodeId' | 'sourceMessageId'>> = {}
): ParserEvent {
  const normalizedIds = {
    sourceConversationId: ids.sourceConversationId ?? null,
    sourceNodeId: ids.sourceNodeId ?? null,
    sourceMessageId: ids.sourceMessageId ?? null,
  };
  return {
    severity,
    eventCode,
    detail,
    evidence,
    ...normalizedIds,
    evidenceSha256: sha256Canonical({ severity, eventCode, detail, evidence, ids: normalizedIds }),
  };
}

function emptyTelemetry(): ObservationTelemetry {
  return {
    schemaDrift: {
      conversation: new Set<string>(),
      node: new Set<string>(),
      message: new Set<string>(),
      author: new Set<string>(),
      content: new Set<string>(),
      metadata: new Set<string>(),
    },
    contentTypes: new Set<string>(),
    roles: new Set<string>(),
    attachmentCoverage: { references: 0, resolved: 0, unresolved: 0, ambiguous: 0 },
  };
}

const SCHEMA_DRIFT_EVENT_CATEGORY: Record<string, DriftCategory> = {
  SCHEMA_DRIFT_CONVERSATION_FIELDS: 'conversation',
  SCHEMA_DRIFT_NODE_FIELDS: 'node',
  SCHEMA_DRIFT_MESSAGE_FIELDS: 'message',
  SCHEMA_DRIFT_AUTHOR_FIELDS: 'author',
  SCHEMA_DRIFT_CONTENT_FIELDS: 'content',
  SCHEMA_DRIFT_MESSAGE_METADATA_FIELDS: 'metadata',
};

function mergeTelemetry(target: ObservationTelemetry, analysis: ConversationAnalysis): void {
  for (const event of analysis.events) {
    const category = SCHEMA_DRIFT_EVENT_CATEGORY[event.eventCode];
    if (!category || event.severity !== 'INFO') continue;
    const fields = event.evidence.fields;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) if (typeof field === 'string') target.schemaDrift[category].add(field);
  }
  for (const node of analysis.nodes) {
    if (node.contentType) target.contentTypes.add(node.contentType);
    if (node.role) target.roles.add(node.role);
  }
}

function telemetryReceipt(telemetry: ObservationTelemetry): Record<string, unknown> {
  return {
    unmodeledFields: Object.fromEntries(
      (Object.keys(telemetry.schemaDrift) as DriftCategory[])
        .map((category) => [category, [...telemetry.schemaDrift[category]].sort()])
    ),
    observedContentTypes: [...telemetry.contentTypes].sort(),
    observedRoles: [...telemetry.roles].sort(),
  };
}

function referenceTokens(attachment: AttachmentReference): string[] {
  const metadata = attachment.sourceMetadata;
  const candidates: unknown[] = [
    attachment.sourceReference,
    metadata.file_id,
    metadata.asset_pointer,
    metadata.attachment_id,
    metadata.id,
    metadata.name,
    metadata.filename,
    metadata.file_name,
  ];
  return [...new Set(candidates.filter((value): value is string => typeof value === 'string' && value.trim() !== '').flatMap((value) => {
    const normalized = value.trim().toLowerCase();
    const withoutScheme = normalized.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    return [normalized, withoutScheme, path.basename(withoutScheme)];
  }))];
}

function reconcileAttachmentAssets(analysis: ConversationAnalysis, files: SourceFileManifest[]): AttachmentCoverage {
  const assets = files.filter((file) => file.fileRole === 'asset');
  const coverage: AttachmentCoverage = { references: analysis.attachments.length, resolved: 0, unresolved: 0, ambiguous: 0 };
  for (const attachment of analysis.attachments) {
    const tokens = referenceTokens(attachment);
    const matches = assets.filter((asset) => {
      const sourcePath = asset.sourcePath.toLowerCase();
      const base = path.basename(sourcePath);
      const stem = base.replace(/\.[^.]+$/, '');
      return tokens.some((token) => token === sourcePath || token === base || token === stem || sourcePath.endsWith(`/${token}`) || base.startsWith(`${token}.`));
    });
    if (matches.length === 1) {
      coverage.resolved += 1;
      attachment.sourceMetadata = {
        ...attachment.sourceMetadata,
        asset_resolution: 'resolved',
        resolved_source_path: matches[0]!.sourcePath,
        resolved_sha256: matches[0]!.sha256,
      };
    } else if (matches.length === 0) {
      coverage.unresolved += 1;
      attachment.sourceMetadata = {
        ...attachment.sourceMetadata,
        asset_resolution: 'missing_in_export',
        candidate_tokens: tokens,
      };
    } else {
      coverage.ambiguous += 1;
      attachment.sourceMetadata = {
        ...attachment.sourceMetadata,
        asset_resolution: 'ambiguous',
        candidate_paths: matches.map((match) => match.sourcePath),
      };
    }
  }
  return coverage;
}

async function beginArchiveAttempt(
  client: PoolClient,
  source: PreparedSource,
  files: SourceFileManifest[]
): Promise<{ sourceArchiveId: string; importId: string; existingStatus: string | null; existingReceipt: unknown; existingReceiptSha256: string | null }> {
  await client.query('BEGIN');
  try {
    // Serialize attempt selection by immutable source identity without granting
    // UPDATE on the append-only archive source table merely to obtain a row lock.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [source.sourceArchiveSha256]
    );

    await client.query(
      `INSERT INTO comind.cm_archive_source
         (source_system, source_archive_name, source_archive_sha256, source_archive_bytes, source_uri, source_metadata)
       VALUES ('chatgpt', $1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (source_system, source_archive_sha256) DO NOTHING`,
      [source.sourceArchiveName, source.sourceArchiveSha256, source.sourceArchiveBytes, source.sourceUri, JSON.stringify({ inventoryVersion: 2 })]
    );
    const sourceResult = await client.query<{ source_archive_id: string }>(
      `SELECT source_archive_id
         FROM comind.cm_archive_source
        WHERE source_system='chatgpt' AND source_archive_sha256=$1`,
      [source.sourceArchiveSha256]
    );
    const sourceArchiveId = sourceResult.rows[0]?.source_archive_id;
    if (!sourceArchiveId) throw new Error('Archive source identity could not be established');

    for (const file of files) {
      await client.query(
        `INSERT INTO comind.cm_archive_source_file
           (source_archive_id, source_path, file_role, byte_length, sha256, media_type, source_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)
         ON CONFLICT (source_archive_id, source_path) DO NOTHING`,
        [sourceArchiveId, file.sourcePath, file.fileRole, file.byteLength, file.sha256, file.mediaType]
      );
    }

    let importResult = await client.query<{ import_id: string; status: string; receipt: unknown; receipt_sha256: string | null }>(
      `SELECT import_id,status,receipt,receipt_sha256
         FROM comind.cm_archive_import
        WHERE source_archive_id=$1 AND parser_version=$2 AND schema_version=$3
        ORDER BY attempt_number DESC
        LIMIT 1`,
      [sourceArchiveId, CHATGPT_ARCHIVE_PARSER_VERSION, CHATGPT_ARCHIVE_SCHEMA_VERSION]
    );

    if (importResult.rows.length === 0) {
      importResult = await client.query<{ import_id: string; status: string; receipt: unknown; receipt_sha256: string | null }>(
        `INSERT INTO comind.cm_archive_import
           (source_archive_id, parser_version, schema_version, attempt_number)
         VALUES ($1, $2, $3, 1)
         RETURNING import_id,status,receipt,receipt_sha256`,
        [sourceArchiveId, CHATGPT_ARCHIVE_PARSER_VERSION, CHATGPT_ARCHIVE_SCHEMA_VERSION]
      );
    }

    const row = importResult.rows[0];
    if (!row) throw new Error('Archive import attempt could not be established');
    if (row.status === 'ABANDONED') {
      throw new Error('Latest archive import attempt is ABANDONED without a successor; recovery lineage is inconsistent');
    }

    await client.query('COMMIT');
    return {
      sourceArchiveId,
      importId: row.import_id,
      existingStatus: row.status,
      existingReceipt: row.receipt,
      existingReceiptSha256: row.receipt_sha256,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function insertParserEvent(client: PoolClient, importId: string, event: ParserEvent, sourcePath: string): Promise<void> {
  await client.query(
    `INSERT INTO comind.cm_archive_parser_event
       (import_id,severity,event_code,source_path,source_conversation_id,source_node_id,source_message_id,detail,evidence,evidence_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [importId, event.severity, event.eventCode, sourcePath, event.sourceConversationId, event.sourceNodeId, event.sourceMessageId, event.detail, JSON.stringify(event.evidence), event.evidenceSha256]
  );
}

async function quarantineConversation(
  client: PoolClient,
  importId: string,
  sourcePath: string,
  rawConversation: unknown,
  reasonCode: string,
  detail: string,
  sourceConversationId: string | null = null
): Promise<void> {
  const rawFragment = isJsonObject(rawConversation) ? rawConversation : { value: rawConversation };
  const hash = sha256Canonical(rawFragment);
  await client.query(
    `INSERT INTO comind.cm_archive_quarantine
       (import_id,fragment_kind,source_path,source_conversation_id,raw_fragment,raw_fragment_sha256,reason_code,detail)
     VALUES ($1,'conversation',$2,$3,$4::jsonb,$5,$6,$7)
     ON CONFLICT (import_id,fragment_kind,raw_fragment_sha256,reason_code) DO NOTHING`,
    [importId, sourcePath, sourceConversationId, JSON.stringify(rawFragment), hash, reasonCode, detail]
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function persistConversation(client: PoolClient, importId: string, sourcePath: string, analysis: ConversationAnalysis): Promise<void> {
  if (!analysis.sourceConversationId) {
    await quarantineConversation(client, importId, sourcePath, analysis.rawConversation, 'MISSING_CONVERSATION_ID', 'Conversation retained losslessly because source ID is missing');
    for (const event of analysis.events) await insertParserEvent(client, importId, event, sourcePath);
    return;
  }

  const branchAwareTopologyHash = sha256Canonical({
    graphTopologyHash: analysis.topologyHash,
    currentNodeId: analysis.currentNodeId,
  });

  await client.query(
    `INSERT INTO comind.cm_archive_conversation_observation
       (import_id,source_conversation_id,title,source_created_at,source_updated_at,created_at,updated_at,
        raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
    [
      importId, analysis.sourceConversationId, analysis.title, JSON.stringify(analysis.sourceCreatedAt), JSON.stringify(analysis.sourceUpdatedAt),
      analysis.createdAt, analysis.updatedAt, analysis.rawSourceHash, analysis.normalizedHash, branchAwareTopologyHash,
      analysis.nodeCount, analysis.messageCount, analysis.attachmentReferenceCount, JSON.stringify(analysis.rawConversation),
    ]
  );

  for (const node of analysis.nodes) {
    await client.query(
      `INSERT INTO comind.cm_archive_node_observation
         (import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,
          source_message_id,role,source_created_at,source_updated_at,created_at,updated_at,content_type,
          raw_node_hash,normalized_message_hash,raw_node)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb)`,
      [
        importId, analysis.sourceConversationId, node.sourceNodeId, node.parentSourceNodeId, JSON.stringify(node.childSourceNodeIds),
        node.sourceMessageId, node.role, JSON.stringify(node.sourceCreatedAt), JSON.stringify(node.sourceUpdatedAt), node.createdAt,
        node.updatedAt, node.contentType, node.rawNodeHash, node.normalizedMessageHash, JSON.stringify(node.rawNode),
      ]
    );
  }

  for (const attachment of analysis.attachments) {
    await client.query(
      `INSERT INTO comind.cm_archive_attachment_reference
         (import_id,source_conversation_id,source_node_id,source_message_id,reference_kind,source_reference,source_metadata,reference_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [importId, analysis.sourceConversationId, attachment.sourceNodeId, attachment.sourceMessageId, attachment.referenceKind, attachment.sourceReference, JSON.stringify(attachment.sourceMetadata), attachment.referenceHash]
    );
  }
  for (const event of analysis.events) await insertParserEvent(client, importId, event, sourcePath);
}

async function finalizeImport(
  client: PoolClient,
  importId: string,
  sourceArchiveId: string,
  sourceCounts: { conversations: number; messages: number; nodes: number; assets: number },
  telemetry: ObservationTelemetry,
  conversationFiles: SourceFileManifest[]
): Promise<ArchiveImportResult> {
  const counts = await client.query<{
    conversations: string; messages: string; nodes: string; assets: string; errors: string; warnings: string; quarantined: string;
  }>(
    `SELECT
       (SELECT count(*) FROM comind.cm_archive_conversation_observation WHERE import_id=$1)::text AS conversations,
       (SELECT count(*) FROM comind.cm_archive_node_observation WHERE import_id=$1 AND source_message_id IS NOT NULL)::text AS messages,
       (SELECT count(*) FROM comind.cm_archive_node_observation WHERE import_id=$1)::text AS nodes,
       (SELECT count(*) FROM comind.cm_archive_source_file WHERE source_archive_id=$2 AND file_role='asset')::text AS assets,
       (SELECT count(*) FROM comind.cm_archive_parser_event WHERE import_id=$1 AND severity='ERROR')::text AS errors,
       (SELECT count(*) FROM comind.cm_archive_parser_event WHERE import_id=$1 AND severity='WARNING')::text AS warnings,
       (SELECT count(*) FROM comind.cm_archive_quarantine WHERE import_id=$1)::text AS quarantined`,
    [importId, sourceArchiveId]
  );
  const row = counts.rows[0];
  if (!row) throw new Error('Reconciliation counts could not be read');
  const imported = {
    conversations: Number(row.conversations), messages: Number(row.messages), nodes: Number(row.nodes), assets: Number(row.assets),
    errors: Number(row.errors), warnings: Number(row.warnings), quarantined: Number(row.quarantined),
  };
  const reconciliation = {
    conversationsAccounted: sourceCounts.conversations === imported.conversations + imported.quarantined,
    messagesAccounted: sourceCounts.messages === imported.messages,
    nodesAccounted: sourceCounts.nodes === imported.nodes,
    assetsInventoried: sourceCounts.assets === imported.assets,
    parserErrors: imported.errors,
    parserWarnings: imported.warnings,
    quarantinedFragments: imported.quarantined,
  };
  const countsMatch = reconciliation.conversationsAccounted && reconciliation.messagesAccounted && reconciliation.nodesAccounted && reconciliation.assetsInventoried;
  const status: IntegrityStatus = !countsMatch || imported.errors > 0 ? 'FAIL' : imported.warnings > 0 ? 'WARN' : 'PASS';
  const completedAt = new Date().toISOString();
  const receipt = {
    version: 2,
    importId,
    sourceArchiveId,
    parserVersion: CHATGPT_ARCHIVE_PARSER_VERSION,
    schemaVersion: CHATGPT_ARCHIVE_SCHEMA_VERSION,
    completedAt,
    status,
    sourceCounts,
    imported,
    reconciliation,
    sourceConversationFiles: conversationFiles.map((file) => ({ sourcePath: file.sourcePath, byteLength: file.byteLength, sha256: file.sha256 })),
    schemaDriftTelemetry: telemetryReceipt(telemetry),
    attachmentAssetCoverage: telemetry.attachmentCoverage,
  };
  const receiptSha256 = sha256Text(canonicalJson(receipt));

  await client.query(
    `UPDATE comind.cm_archive_import
     SET status=$2,completed_at=$3,source_conversation_count=$4,source_message_count=$5,source_node_count=$6,source_attachment_count=$7,
         imported_conversation_count=$8,imported_message_count=$9,imported_node_count=$10,imported_attachment_count=$11,
         parser_error_count=$12,parser_warning_count=$13,reconciliation=$14::jsonb,receipt=$15::jsonb,receipt_sha256=$16
     WHERE import_id=$1`,
    [
      importId, status, completedAt, sourceCounts.conversations, sourceCounts.messages, sourceCounts.nodes, sourceCounts.assets,
      imported.conversations, imported.messages, imported.nodes, imported.assets, imported.errors, imported.warnings,
      JSON.stringify(reconciliation), JSON.stringify(receipt), receiptSha256,
    ]
  );
  return { importId, sourceArchiveId, status, receiptSha256, receipt, reused: false };
}

export async function ingestChatGptExport(inputPath: string): Promise<ArchiveImportResult> {
  assertArchiveDatabaseSessionPrepared();
  const prepared = await prepareSource(inputPath);
  const client = await pool.connect();
  try {
    const files = await listFiles(prepared.sourceRoot);
    const conversationFiles = files.filter((file) => file.fileRole === 'conversation_json').sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
    if (conversationFiles.length === 0) throw new Error('No ChatGPT conversation JSON files were detected in the export');

    const attempt = await beginArchiveAttempt(client, prepared, files);
    if (attempt.existingStatus && attempt.existingStatus !== 'PENDING') {
      if (attempt.existingStatus === 'ABANDONED') {
        throw new Error('Abandoned archive import cannot be reused as a finalized import');
      }
      if (!attempt.existingReceipt || !attempt.existingReceiptSha256) throw new Error('Existing finalized import is missing its integrity receipt');
      return {
        importId: attempt.importId,
        sourceArchiveId: attempt.sourceArchiveId,
        status: attempt.existingStatus as IntegrityStatus,
        receiptSha256: attempt.existingReceiptSha256,
        receipt: attempt.existingReceipt as Record<string, unknown>,
        reused: true,
      };
    }

    const existingObservation = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM comind.cm_archive_conversation_observation WHERE import_id=$1`,
      [attempt.importId]
    );
    if (Number(existingObservation.rows[0]?.count ?? '0') > 0) {
      throw new Error('Existing PENDING import contains observations; explicit recovery is required before retry');
    }

    const sourceCounts = { conversations: 0, messages: 0, nodes: 0, assets: files.filter((file) => file.fileRole === 'asset').length };
    const telemetry = emptyTelemetry();
    const seenConversationIds = new Map<string, string>();

    for (const conversationFile of conversationFiles) {
      try {
        for await (const value of readConversationValues(conversationFile.absolutePath)) {
          sourceCounts.conversations += 1;
          const analysis = analyzeChatGptConversation(value);
          await client.query('BEGIN');
          try {
            if (!analysis) {
              await quarantineConversation(client, attempt.importId, conversationFile.sourcePath, value, 'INVALID_CONVERSATION_SHAPE', 'Top-level conversation value is not an object');
              await insertParserEvent(client, attempt.importId, makeParserEvent(
                'ERROR', 'INVALID_CONVERSATION_SHAPE', 'Top-level conversation value is not an object.',
                { rawFragmentSha256: sha256Canonical(value) }
              ), conversationFile.sourcePath);
            } else {
              sourceCounts.messages += analysis.messageCount;
              sourceCounts.nodes += analysis.nodeCount;
              mergeTelemetry(telemetry, analysis);
              const coverage = reconcileAttachmentAssets(analysis, files);
              telemetry.attachmentCoverage.references += coverage.references;
              telemetry.attachmentCoverage.resolved += coverage.resolved;
              telemetry.attachmentCoverage.unresolved += coverage.unresolved;
              telemetry.attachmentCoverage.ambiguous += coverage.ambiguous;

              const conversationId = analysis.sourceConversationId;
              if (conversationId && seenConversationIds.has(conversationId)) {
                const firstSourcePath = seenConversationIds.get(conversationId)!;
                await quarantineConversation(
                  client,
                  attempt.importId,
                  conversationFile.sourcePath,
                  analysis.rawConversation,
                  'DUPLICATE_CONVERSATION_ID',
                  `Conversation ID already appeared in ${firstSourcePath}`,
                  conversationId
                );
                await insertParserEvent(client, attempt.importId, makeParserEvent(
                  'ERROR',
                  'DUPLICATE_CONVERSATION_ID',
                  'Source conversation identifier appears more than once across export shards.',
                  { sourceConversationId: conversationId, firstSourcePath, duplicateSourcePath: conversationFile.sourcePath },
                  { sourceConversationId: conversationId }
                ), conversationFile.sourcePath);
              } else {
                if (conversationId) seenConversationIds.set(conversationId, conversationFile.sourcePath);
                await persistConversation(client, attempt.importId, conversationFile.sourcePath, analysis);
              }
            }
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        }
      } catch (error) {
        await client.query('BEGIN');
        try {
          await insertParserEvent(client, attempt.importId, makeParserEvent(
            'ERROR',
            'CONVERSATION_FILE_PARSE_FAILURE',
            String(error),
            { sourcePath: conversationFile.sourcePath, fileSha256: conversationFile.sha256 }
          ), conversationFile.sourcePath);
          await client.query('COMMIT');
        } catch (persistError) {
          await client.query('ROLLBACK');
          throw persistError;
        }
        break;
      }
    }

    return await finalizeImport(client, attempt.importId, attempt.sourceArchiveId, sourceCounts, telemetry, conversationFiles);
  } finally {
    client.release();
    await prepared.cleanup();
  }
}
