#!/usr/bin/env node
import {
  closeArchiveDerivationPool,
  prepareArchiveDerivationSession,
} from './archive-derivation-db.js';
import { deriveAndPersistArchiveConversation } from './archive-derivation-store.js';

function usage(): never {
  process.stderr.write('Usage:\n  archive-derive-cli --preflight\n  archive-derive-cli <import-id> <source-conversation-id>\n');
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const preflight = await prepareArchiveDerivationSession();
  if (args.length === 1 && args[0] === '--preflight') {
    process.stdout.write(JSON.stringify({ ok: true, preflight }, null, 2) + '\n');
    return;
  }
  if (args.length !== 2) usage();
  const [importId, sourceConversationId] = args;
  const result = await deriveAndPersistArchiveConversation(importId, sourceConversationId);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeArchiveDerivationPool().catch(() => undefined);
  });
