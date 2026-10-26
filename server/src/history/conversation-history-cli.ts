#!/usr/bin/env node
import {
  closeHistoryPool,
  prepareHistoryDatabaseSession,
} from './history-db.js';
import {
  getConversationHistoryStatus,
  getHistoryConversation,
  listHistoryConversations,
  searchHistoryConversations,
} from './conversation-history.js';

type Parsed = {
  command: 'preflight' | 'status' | 'list' | 'search' | 'show';
  query?: string;
  sourceConversationId?: string;
  importId?: string;
  limit?: number;
  offset?: number;
};

function usage(): never {
  process.stderr.write(`Usage:\n  conversation-history-cli --preflight\n  conversation-history-cli status\n  conversation-history-cli list [--import <uuid>] [--limit <1-100>] [--offset <n>]\n  conversation-history-cli search <text> [--import <uuid>] [--limit <1-100>]\n  conversation-history-cli show <source-conversation-id> [--import <uuid>]\n`);
  process.exit(2);
}

function parseArgs(argv: string[]): Parsed {
  if (argv.length === 1 && argv[0] === '--preflight') return { command: 'preflight' };
  if (argv.length < 1) usage();
  const command = argv[0];
  if (!['status', 'list', 'search', 'show'].includes(command)) usage();

  let position = 1;
  let query: string | undefined;
  let sourceConversationId: string | undefined;
  if (command === 'search') {
    query = argv[position++];
    if (!query) usage();
  } else if (command === 'show') {
    sourceConversationId = argv[position++];
    if (!sourceConversationId) usage();
  }

  let importId: string | undefined;
  let limit: number | undefined;
  let offset: number | undefined;
  while (position < argv.length) {
    const flag = argv[position++];
    const value = argv[position++];
    if (!value) usage();
    if (flag === '--import') importId = value;
    else if (flag === '--limit') limit = Number(value);
    else if (flag === '--offset') offset = Number(value);
    else usage();
  }

  return {
    command: command as Parsed['command'],
    query,
    sourceConversationId,
    importId,
    limit,
    offset,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const preflight = await prepareHistoryDatabaseSession();

  if (args.command === 'preflight') {
    process.stdout.write(JSON.stringify({ ok: true, preflight }, null, 2) + '\n');
    return;
  }

  if (args.command === 'status') {
    process.stdout.write(JSON.stringify(await getConversationHistoryStatus(), null, 2) + '\n');
    return;
  }

  if (args.command === 'list') {
    process.stdout.write(JSON.stringify(await listHistoryConversations({
      importId: args.importId,
      limit: args.limit,
      offset: args.offset,
    }), null, 2) + '\n');
    return;
  }

  if (args.command === 'search') {
    process.stdout.write(JSON.stringify(await searchHistoryConversations({
      query: args.query!,
      importId: args.importId,
      limit: args.limit,
    }), null, 2) + '\n');
    return;
  }

  process.stdout.write(JSON.stringify(await getHistoryConversation({
    sourceConversationId: args.sourceConversationId!,
    importId: args.importId,
  }), null, 2) + '\n');
}

main()
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeHistoryPool().catch(() => undefined);
  });
