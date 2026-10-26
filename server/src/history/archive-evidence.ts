export interface ArchiveTopologyNode {
  sourceNodeId: string;
  parentSourceNodeId: string | null;
  childSourceNodeIds: string[];
}

export interface ActiveArchiveBranch {
  nodeIds: Set<string>;
  terminalNodeId: string | null;
  ambiguous: boolean;
  reason: string | null;
}

export function extractArchiveContentText(rawNode: unknown): string {
  if (!rawNode || typeof rawNode !== 'object') return '';
  const node = rawNode as Record<string, unknown>;
  const message = node.message;
  if (!message || typeof message !== 'object') return '';
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return typeof msg.text === 'string' ? msg.text : '';
  const object = content as Record<string, unknown>;
  const texts: string[] = [];
  if (Array.isArray(object.parts)) {
    for (const part of object.parts) {
      if (typeof part === 'string') texts.push(part);
      else if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        texts.push((part as Record<string, unknown>).text as string);
      }
    }
  }
  if (texts.length === 0 && typeof object.text === 'string') texts.push(object.text);
  return texts.join('\n');
}

export function resolveActiveArchiveBranch(
  nodes: ArchiveTopologyNode[],
  currentNode: string | null,
): ActiveArchiveBranch {
  if (nodes.length === 0) return { nodeIds: new Set(), terminalNodeId: null, ambiguous: false, reason: null };
  const byId = new Map(nodes.map((node) => [node.sourceNodeId, node]));
  let terminal = currentNode && byId.has(currentNode) ? currentNode : null;
  if (!terminal) {
    const leaves = nodes.filter((node) => node.childSourceNodeIds.length === 0);
    if (leaves.length === 1) terminal = leaves[0].sourceNodeId;
    else {
      return {
        nodeIds: new Set(),
        terminalNodeId: null,
        ambiguous: true,
        reason: currentNode
          ? 'Archive current_node does not resolve and topology has multiple possible leaves.'
          : 'Archive has no resolvable current_node and topology has multiple possible leaves.',
      };
    }
  }

  const nodeIds = new Set<string>();
  let cursor: string | null = terminal;
  while (cursor) {
    if (nodeIds.has(cursor)) {
      return { nodeIds, terminalNodeId: terminal, ambiguous: true, reason: 'Archive topology contains a parent cycle.' };
    }
    nodeIds.add(cursor);
    const node = byId.get(cursor);
    if (!node) {
      return { nodeIds, terminalNodeId: terminal, ambiguous: true, reason: 'Archive active branch references a missing parent node.' };
    }
    cursor = node.parentSourceNodeId;
  }
  return { nodeIds, terminalNodeId: terminal, ambiguous: false, reason: null };
}
