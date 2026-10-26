#!/usr/bin/env node
import {
  closeBaselineCertificationPool,
  prepareBaselineCertificationSession,
} from './baseline-certification-db.js';
import { certifyConversationHistoryBaseline } from './baseline-certification.js';

function usage(): never {
  process.stderr.write(`Usage:\n  baseline-certify-cli --preflight\n  baseline-certify-cli <import-id> --certified-by <identity> --reason <reason>\n`);
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const preflight = await prepareBaselineCertificationSession();
  if (args.length === 1 && args[0] === '--preflight') {
    process.stdout.write(JSON.stringify({ ok: true, preflight }, null, 2) + '\n');
    return;
  }
  const importId = args[0];
  if (!importId) usage();
  let certifiedBy: string | undefined;
  let reason: string | undefined;
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) usage();
    if (flag === '--certified-by') certifiedBy = value;
    else if (flag === '--reason') reason = value;
    else usage();
  }
  if (!certifiedBy || !reason) usage();
  const result = await certifyConversationHistoryBaseline({ importId, certifiedBy, reason });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBaselineCertificationPool().catch(() => undefined);
  });
