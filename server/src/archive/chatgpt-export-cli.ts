type ClosePool = () => Promise<void>;

let closePool: ClosePool = async () => undefined;

async function main(): Promise<void> {
  process.env.COMIND_DATABASE_PURPOSE = 'chatgpt_archive';

  const database = await import('../db.js');
  closePool = database.closePool;

  const preflight = await database.prepareArchiveDatabaseSession();
  const inputPath = process.argv[2];

  if (inputPath === '--preflight') {
    process.stdout.write(`${JSON.stringify({ status: 'PASS', ...preflight }, null, 2)}\n`);
    return;
  }

  if (!inputPath) {
    throw new Error(
      'Usage: node dist/archive/chatgpt-export-cli.js --preflight | <chatgpt-export.zip|extracted-directory>'
    );
  }

  const { ingestChatGptExport } = await import('./chatgpt-export-ingest.js');
  const result = await ingestChatGptExport(inputPath);
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
