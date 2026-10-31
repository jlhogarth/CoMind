import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdtemp, mkdir, open, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { sha256Canonical } from './chatgpt-export.js';

const execFileAsync = promisify(execFile);
const MAX_NESTED_ZIP_DEPTH = 2;
const MAX_NESTED_ZIP_COUNT = 16;

export interface ChatGptSourceFileManifest {
  sourcePath: string;
  absolutePath: string;
  fileRole: 'conversation_json' | 'metadata_json' | 'html' | 'asset' | 'other';
  byteLength: number;
  sha256: string;
  mediaType: string | null;
}

export interface PreparedChatGptExport {
  sourceRoot: string;
  sourceArchiveName: string;
  sourceArchiveSha256: string;
  sourceArchiveBytes: number;
  sourceUri: string;
  files: ChatGptSourceFileManifest[];
  conversationFiles: ChatGptSourceFileManifest[];
  cleanup: () => Promise<void>;
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

function roleForFile(relativePath: string): ChatGptSourceFileManifest['fileRole'] {
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

async function listFiles(root: string, current = ''): Promise<ChatGptSourceFileManifest[]> {
  const directory = path.join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const manifests: ChatGptSourceFileManifest[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(current, entry.name);
    const absolute = path.join(root, relative);
    if (entry.isDirectory()) manifests.push(...await listFiles(root, relative));
    else if (entry.isFile()) {
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
    const normalized = entry.replaceAll('\\', '/');
    const segments = normalized.split('/');
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || segments.includes('..')) {
      throw new Error(`Unsafe ZIP entry rejected: ${entry}`);
    }
    entries.push(normalized);
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

export async function prepareChatGptExport(inputPath: string): Promise<PreparedChatGptExport> {
  const resolved = path.resolve(inputPath);
  const metadata = await stat(resolved);
  let sourceRoot: string;
  let sourceArchiveName: string;
  let sourceArchiveSha256: string;
  let sourceArchiveBytes: number;
  let cleanupRoot: string;

  if (metadata.isDirectory()) {
    const originalFiles = await listFiles(resolved);
    const manifestIdentity = originalFiles.map(({ sourcePath, byteLength, sha256 }) => ({ sourcePath, byteLength, sha256 }));
    cleanupRoot = await mkdtemp(path.join(tmpdir(), 'comind-chatgpt-diff-dir-'));
    sourceRoot = path.join(cleanupRoot, 'source');
    await cp(resolved, sourceRoot, { recursive: true, force: false, errorOnExist: true });
    sourceArchiveName = path.basename(resolved);
    sourceArchiveSha256 = sha256Canonical(manifestIdentity);
    sourceArchiveBytes = originalFiles.reduce((sum, file) => sum + file.byteLength, 0);
  } else {
    if (!metadata.isFile() || path.extname(resolved).toLowerCase() !== '.zip') {
      throw new Error('ChatGPT archive source must be a .zip file or extracted directory');
    }
    cleanupRoot = await mkdtemp(path.join(tmpdir(), 'comind-chatgpt-diff-'));
    sourceRoot = cleanupRoot;
    await unzipSafely(resolved, sourceRoot);
    sourceArchiveName = path.basename(resolved);
    sourceArchiveSha256 = await sha256File(resolved);
    sourceArchiveBytes = metadata.size;
  }

  try {
    await expandNestedExportZips(sourceRoot);
    const files = await listFiles(sourceRoot);
    const conversationFiles = files.filter((file) => file.fileRole === 'conversation_json').sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
    if (conversationFiles.length === 0) throw new Error('No ChatGPT conversation JSON files were detected in the export');
    return {
      sourceRoot,
      sourceArchiveName,
      sourceArchiveSha256,
      sourceArchiveBytes,
      sourceUri: resolved,
      files,
      conversationFiles,
      cleanup: async () => rm(cleanupRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(cleanupRoot, { recursive: true, force: true });
    throw error;
  }
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
        if (character === ']') { finished = true; continue; }
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

export async function* readChatGptConversationValues(filePath: string): AsyncGenerator<unknown> {
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
