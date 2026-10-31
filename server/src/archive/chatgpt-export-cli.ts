export {};

type ClosePool = () => Promise<void>;

let closePool: ClosePool = async () => undefined;

const usage = [
  'Usage:',
  '  node dist/archive/chatgpt-export-cli.js --preflight',
  '  node dist/archive/chatgpt-export-cli.js --recover <interrupted-import-id> <reason>',
  '  node dist/archive/chatgpt-export-cli.js --establish-baseline <archive-stream-key> <certified-import-id>',
  '  node dist/archive/chatgpt-export-cli.js --differential <archive-stream-key> <chatgpt-export.zip|extracted-directory>',
  '  node dist/archive/chatgpt-export-cli.js <chatgpt-export.zip|extracted-directory>',
].join('\n');

async function main(): Promise<void> {
  process.env.COMIND_DATABASE_PURPOSE = 'chatgpt_archive';

  const database = await import('../db.js');
  closePool = database.closePool;

  const preflight = await database.prepareArchiveDatabaseSession();
  const command = process.argv[2];

  if (command === '--preflight') {
    process.stdout.write(`${JSON.stringify({ status: 'PASS', ...preflight }, null, 2)}\n`);
    return;
  }

  if (command === '--recover') {
    const importId = process.argv[3];
    const reason = process.argv[4];
    if (!importId || !reason) throw new Error(usage);
    const { recoverInterruptedArchiveImport } = await import('./chatgpt-archive-recovery.js');
    const result = await recoverInterruptedArchiveImport(importId, reason);
    process.stdout.write(`${JSON.stringify({ status: 'PASS', ...result }, null, 2)}\n`);
    return;
  }

  if (command === '--establish-baseline') {
    const sourceIdentityKey = process.argv[3];
    const importId = process.argv[4];
    if (!sourceIdentityKey || !importId) throw new Error(usage);
    const { establishChatGptBaselineCheckpoint } = await import('./chatgpt-differential-ingest.js');
    const result = await establishChatGptBaselineCheckpoint({ sourceIdentityKey, importId });
    process.stdout.write(`${JSON.stringify({ status: 'PASS', ...result }, null, 2)}\n`);
    return;
  }

  if (command === '--differential') {
    const sourceIdentityKey = process.argv[3];
    const inputPath = process.argv[4];
    if (!sourceIdentityKey || !inputPath) throw new Error(usage);
    const { ingestChatGptDifferentialExport } = await import('./chatgpt-differential-ingest.js');
    const result = await ingestChatGptDifferentialExport({ sourceIdentityKey, inputPath });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'FAIL') process.exitCode = 2;
    return;
  }

  if (!command || command.startsWith('--')) throw new Error(usage);

  const { ingestChatGptExport } = await import('./chatgpt-export-ingest.js');
  const result = await ingestChatGptExport(command);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'FAIL') process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`ChatGPT archive import failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await closePool();
}
