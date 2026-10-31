import { closeDerivationPool, prepareDerivationDatabaseSession } from './derivation-db.js';
import { deriveAndPersistConversation } from './conversation-derivation-store.js';

function parseArgs(argv: string[]): { convId: string | null; preflightOnly: boolean } {
  let convId: string | null = null;
  let preflightOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--preflight-only') preflightOnly = true;
    else if (arg === '--conversation-id') convId = argv[index + 1] ?? null;
  }
  return { convId, preflightOnly };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const preflight = await prepareDerivationDatabaseSession();
  if (args.preflightOnly) {
    process.stdout.write(`${JSON.stringify({ ok: true, preflight })}\n`);
    return;
  }
  if (!args.convId) throw new Error('--conversation-id is required unless --preflight-only is used');
  const result = await deriveAndPersistConversation(args.convId);
  process.stdout.write(`${JSON.stringify({ ok: true, preflight, result })}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDerivationPool().catch(() => undefined);
  });
