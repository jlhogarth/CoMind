import {
  closeReconciliationPool,
  prepareReconciliationDatabaseSession,
} from './reconciliation-db.js';
import { reconcileArchiveConversation } from './chatgpt-live-reconcile-store.js';

interface Args {
  importId: string | null;
  sourceConversationId: string | null;
  cutoff: string | undefined;
  preflightOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    importId: null,
    sourceConversationId: null,
    cutoff: undefined,
    preflightOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--preflight-only') {
      args.preflightOnly = true;
    } else if (value === '--import-id') {
      args.importId = argv[++index] ?? null;
    } else if (value === '--source-conversation-id') {
      args.sourceConversationId = argv[++index] ?? null;
    } else if (value === '--cutoff') {
      args.cutoff = argv[++index];
    } else {
      throw new Error(`Unknown reconciliation argument: ${value}`);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

try {
  const preflight = await prepareReconciliationDatabaseSession();
  if (args.preflightOnly) {
    process.stdout.write(`${JSON.stringify({ preflight })}\n`);
  } else {
    if (!args.importId || !args.sourceConversationId) {
      throw new Error('--import-id and --source-conversation-id are required unless --preflight-only is used');
    }
    const reconciliation = await reconcileArchiveConversation(
      args.importId,
      args.sourceConversationId,
      args.cutoff
    );
    process.stdout.write(`${JSON.stringify({ preflight, reconciliation })}\n`);
  }
} finally {
  await closeReconciliationPool();
}
