export interface CheckpointLineageNode {
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
}

export function validateCheckpointLineage<T extends CheckpointLineageNode>(nodes: T[]): T[] {
  if (!Array.isArray(nodes)) throw new Error('Invalid ThreadKeeper checkpoint lineage');
  if (nodes.length === 0) return [];

  const seen = new Set<string>();
  let expectedParent: string | null = null;

  for (const node of nodes) {
    if (!node || typeof node.checkpoint_id !== 'string' || node.checkpoint_id.length === 0) {
      throw new Error('Invalid ThreadKeeper checkpoint lineage node');
    }
    if (seen.has(node.checkpoint_id)) {
      throw new Error('ThreadKeeper checkpoint lineage cycle or duplicate detected');
    }
    if (node.parent_checkpoint_id !== expectedParent) {
      throw new Error('ThreadKeeper checkpoint lineage is broken');
    }
    seen.add(node.checkpoint_id);
    expectedParent = node.checkpoint_id;
  }

  return nodes;
}
