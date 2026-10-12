import { closePool } from '../db.js';
import { ingestChatGptExport } from './chatgpt-export-ingest.js';

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node dist/archive/chatgpt-export-cli.js <chatgpt-export.zip|extracted-directory>');
  }

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
