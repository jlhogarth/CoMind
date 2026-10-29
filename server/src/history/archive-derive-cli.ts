#!/usr/bin/env node
import {
  closeArchiveDerivationPool,
  computeArchiveConversationMetrics,
  listCertifiedArchiveConversationIds,
  prepareArchiveDerivationSession,
} from './archive-derivation-db.js';
import { deriveAndPersistArchiveConversation } from './archive-derivation-store.js';

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
    '  archive-derive-cli --preflight\n' +
    '  archive-derive-cli <import-id> <source-conversation-id>\n' +
    '  archive-derive-cli --all <import-id> [--limit <count>]\n',
  );
  process.exit(2);
}

function parsePositiveInt(raw: string | undefined, label: string): number {
  if (!raw || !/^\d+$/.test(raw)) throw new Error(`${label} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

async function deriveOne(importId: string, sourceConversationId: string) {
  const result = await deriveAndPersistArchiveConversation(importId, sourceConversationId);
  const insertedMetricFacts = await computeArchiveConversationMetrics(result.archiveDerivationRunId);
  return { ...result, insertedMetricFacts };
}

async function deriveAll(importId: string, limit?: number) {
  const ids = await listCertifiedArchiveConversationIds(importId, limit);
  const totals = {
    requestedConversationCount: ids.length,
    processedConversationCount: 0,
    completedCount: 0,
    partialCount: 0,
    ambiguousTopologyCount: 0,
    reusedExistingRunCount: 0,
    derivationCount: 0,
    promotionCandidateCount: 0,
    insertedMetricFactCount: 0,
  };

  for (let index = 0; index < ids.length; index += 1) {
    try {
      const result = await deriveOne(importId, ids[index]);
      totals.processedConversationCount += 1;
      totals.completedCount += result.resultState === 'completed' ? 1 : 0;
      totals.partialCount += result.resultState === 'partial' ? 1 : 0;
      totals.ambiguousTopologyCount += result.resultState === 'ambiguous_topology' ? 1 : 0;
      totals.reusedExistingRunCount += result.reusedExistingRun ? 1 : 0;
      totals.derivationCount += result.derivationCount;
      totals.promotionCandidateCount += result.promotionCandidateCount;
      totals.insertedMetricFactCount += result.insertedMetricFacts;

      if ((index + 1) % 25 === 0 || index + 1 === ids.length) {
        process.stderr.write(JSON.stringify({
          progress: {
            processed: index + 1,
            total: ids.length,
            completed: totals.completedCount,
            partial: totals.partialCount,
            ambiguousTopology: totals.ambiguousTopologyCount,
            reusedExistingRuns: totals.reusedExistingRunCount,
          },
        }) + '\n');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Archive bulk derivation failed at conversation ordinal ${index + 1} of ${ids.length}: ${message}`);
    }
  }

  return totals;
}

async function main() {
  const args = process.argv.slice(2);
  const preflight = await prepareArchiveDerivationSession();

  if (args.length === 1 && args[0] === '--preflight') {
    process.stdout.write(JSON.stringify({ ok: true, preflight }, null, 2) + '\n');
    return;
  }

  if (args[0] === '--all') {
    if (args.length !== 2 && args.length !== 4) usage();
    const importId = args[1];
    let limit: number | undefined;
    if (args.length === 4) {
      if (args[2] !== '--limit') usage();
      limit = parsePositiveInt(args[3], '--limit');
    }
    const result = await deriveAll(importId, limit);
    process.stdout.write(JSON.stringify({ ok: true, preflight, result }, null, 2) + '\n');
    return;
  }

  if (args.length !== 2) usage();
  const [importId, sourceConversationId] = args;
  const result = await deriveOne(importId, sourceConversationId);
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
