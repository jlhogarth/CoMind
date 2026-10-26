#!/usr/bin/env node
export {};

type ClosePool = () => Promise<void>;
let closePool: ClosePool = async () => undefined;

async function main() {
  process.env.COMIND_DATABASE_PURPOSE = 'chatgpt_archive';
  const database = await import('../db.js');
  closePool = database.closePool;
  const preflight = await database.prepareArchiveDatabaseSession();

  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--preflight') {
    process.stdout.write(JSON.stringify({ status: 'PASS', ...preflight }, null, 2) + '\n');
    return;
  }
  if (args.length !== 2) {
    throw new Error('Usage: chatgpt-export-diff-cli --preflight | <certified-baseline-import-id> <comparison-import-id>');
  }
  const { compareChatGptArchiveImports } = await import('./chatgpt-export-diff.js');
  const result = await compareChatGptArchiveImports(args[0], args[1]);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

try {
  await main();
} catch (error) {
  process.stderr.write(`ChatGPT archive PIT comparison failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await closePool();
}
