import { createHash } from 'node:crypto';

export const CHATGPT_ARCHIVE_PARSER_VERSION = 'chatgpt-export-v0.4.0';
export const CHATGPT_ARCHIVE_SCHEMA_VERSION = 'comind-archive-v1';

export type IntegrityStatus = 'PASS' | 'WARN' | 'FAIL';
export type ParserSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface ParserEvent {
  severity: ParserSeverity;
  eventCode: string;
  sourceConversationId: string | null;
  sourceNodeId: string | null;
  sourceMessageId: string | null;
  detail: string;
  evidence: Record<string, unknown>;
  evidenceSha256: string;
}

export interface AttachmentReference {
  sourceNodeId: string;
  sourceMessageId: string | null;
  referenceKind: string;
  sourceReference: string;
  sourceMetadata: Record<string, unknown>;
  referenceHash: string;
}

export interface NodeObservation {
  sourceNodeId: string;
  parentSourceNodeId: string | null;
  childSourceNodeIds: string[];
  sourceMessageId: string | null;
  role: string | null;
  sourceCreatedAt: unknown;
  sourceUpdatedAt: unknown;
  createdAt: string | null;
  updatedAt: string | null;
  contentType: string | null;
  rawNodeHash: string;
  normalizedMessageHash: string | null;
  rawNode: Record<string, unknown>;
}

export interface ConversationAnalysis {
  sourceConversationId: string | null;
  title: string | null;
  currentNodeId: string | null;
  sourceCreatedAt: unknown;
  sourceUpdatedAt: unknown;
  createdAt: string | null;
  updatedAt: string | null;
  rawSourceHash: string;
  normalizedHash: string;
  topologyHash: string;
  nodeCount: number;
  messageCount: number;
  attachmentReferenceCount: number;
  nodes: NodeObservation[];
  attachments: AttachmentReference[];
  events: ParserEvent[];
  status: IntegrityStatus;
  rawConversation: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number cannot be canonicalized');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  throw new Error(`Unsupported canonical JSON value type: ${typeof value}`);
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Canonical(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

function rawTimestampToIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return rawTimestampToIso(numeric);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function makeEvent(
  severity: ParserSeverity,
  eventCode: string,
  detail: string,
  evidence: Record<string, unknown>,
  ids: {
    sourceConversationId?: string | null;
    sourceNodeId?: string | null;
    sourceMessageId?: string | null;
  } = {}
): ParserEvent {
  return {
    severity,
    eventCode,
    sourceConversationId: ids.sourceConversationId ?? null,
    sourceNodeId: ids.sourceNodeId ?? null,
    sourceMessageId: ids.sourceMessageId ?? null,
    detail,
    evidence,
    evidenceSha256: sha256Canonical({ severity, eventCode, detail, evidence, ids }),
  };
}

function recordUnknownFields(
  events: ParserEvent[],
  value: Record<string, unknown>,
  knownKeys: ReadonlySet<string>,
  eventCode: string,
  detail: string,
  ids: {
    sourceConversationId?: string | null;
    sourceNodeId?: string | null;
    sourceMessageId?: string | null;
  } = {}
): void {
  const fields = Object.keys(value).filter((key) => !knownKeys.has(key)).sort();
  if (fields.length === 0) return;
  events.push(makeEvent('INFO', eventCode, detail, { fields }, ids));
}

function normalizeChildren(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function duplicateStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function findParentCycles(nodes: NodeObservation[]): string[][] {
  const byId = new Map(nodes.map((node) => [node.sourceNodeId, node]));
  const completed = new Set<string>();
  const cycles: string[][] = [];
  const cycleKeys = new Set<string>();

  for (const start of nodes) {
    if (completed.has(start.sourceNodeId)) continue;
    const path: string[] = [];
    const localIndex = new Map<string, number>();
    let currentId: string | null = start.sourceNodeId;

    while (currentId && byId.has(currentId) && !completed.has(currentId)) {
      const repeatedAt = localIndex.get(currentId);
      if (repeatedAt !== undefined) {
        const cycle = path.slice(repeatedAt);
        const canonical = [...cycle].sort().join('|');
        if (!cycleKeys.has(canonical)) {
          cycleKeys.add(canonical);
          cycles.push(cycle);
        }
        break;
      }
      localIndex.set(currentId, path.length);
      path.push(currentId);
      currentId = byId.get(currentId)?.parentSourceNodeId ?? null;
    }

    path.forEach((nodeId) => completed.add(nodeId));
  }

  return cycles;
}

function collectAttachmentReferences(
  nodeId: string,
  messageId: string | null,
  message: Record<string, unknown>
): AttachmentReference[] {
  const found: AttachmentReference[] = [];
  const byReference = new Map<string, number>();
  const referenceKeys = new Set(['file_id', 'asset_pointer', 'attachment_id']);

  const add = (kind: string, reference: string, metadata: Record<string, unknown>) => {
    const normalizedReference = reference.trim();
    if (!normalizedReference) return;
    const candidate: AttachmentReference = {
      sourceNodeId: nodeId,
      sourceMessageId: messageId,
      referenceKind: kind,
      sourceReference: normalizedReference,
      sourceMetadata: metadata,
      referenceHash: sha256Canonical({ kind, reference: normalizedReference, metadata }),
    };
    const existingIndex = byReference.get(normalizedReference);
    if (existingIndex === undefined) {
      byReference.set(normalizedReference, found.length);
      found.push(candidate);
      return;
    }
    const existing = found[existingIndex]!;
    if (Object.keys(metadata).length > Object.keys(existing.sourceMetadata).length) {
      found[existingIndex] = candidate;
    }
  };

  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;

    for (const [key, nested] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (key === 'attachments' && Array.isArray(nested)) {
        nested.forEach((attachment, index) => {
          if (isRecord(attachment)) {
            const reference =
              stringOrNull(attachment.file_id) ??
              stringOrNull(attachment.asset_pointer) ??
              stringOrNull(attachment.attachment_id) ??
              stringOrNull(attachment.id) ??
              `${nextPath}[${index}]`;
            add('attachments', reference, attachment);
          }
        });
      } else if (referenceKeys.has(key) && typeof nested === 'string' && nested.length > 0) {
        add(key, nested, { path: nextPath });
      }
      walk(nested, nextPath);
    }
  };

  walk(message, 'message');
  return found;
}

export function topologyFingerprint(nodes: NodeObservation[]): string {
  const topology = nodes
    .map((node) => ({
      node: node.sourceNodeId,
      parent: node.parentSourceNodeId,
      children: [...node.childSourceNodeIds].sort(),
      message: node.sourceMessageId,
    }))
    .sort((a, b) => a.node.localeCompare(b.node));
  return sha256Canonical(topology);
}

export function analyzeChatGptConversation(value: unknown): ConversationAnalysis | null {
  if (!isRecord(value)) return null;

  const rawConversation = value;
  const sourceConversationId = stringOrNull(value.id) ?? stringOrNull(value.conversation_id);
  const title = stringOrNull(value.title);
  const currentNodeId = stringOrNull(value.current_node);
  const sourceCreatedAt = value.create_time ?? null;
  const sourceUpdatedAt = value.update_time ?? null;
  const createdAt = rawTimestampToIso(sourceCreatedAt);
  const updatedAt = rawTimestampToIso(sourceUpdatedAt);
  const events: ParserEvent[] = [];

  recordUnknownFields(
    events,
    value,
    new Set(['id', 'conversation_id', 'title', 'create_time', 'update_time', 'current_node', 'mapping']),
    'SCHEMA_DRIFT_CONVERSATION_FIELDS',
    'Conversation contains source fields outside the currently normalized structural contract.',
    { sourceConversationId }
  );

  if (!sourceConversationId) {
    events.push(
      makeEvent('ERROR', 'MISSING_CONVERSATION_ID', 'Conversation has no usable source identifier.', {
        rawSourceHash: sha256Canonical(value),
      })
    );
  }

  if (value.current_node !== undefined && value.current_node !== null && !currentNodeId) {
    events.push(
      makeEvent(
        'ERROR',
        'INVALID_CURRENT_NODE',
        'Conversation current_node is present but is not a usable string identifier.',
        { currentNode: value.current_node },
        { sourceConversationId }
      )
    );
  }

  const mapping = isRecord(value.mapping) ? value.mapping : null;
  if (!mapping) {
    events.push(
      makeEvent(
        'ERROR',
        'MISSING_CONVERSATION_MAPPING',
        'Conversation has no mapping object; topology and message reconciliation cannot be proven.',
        { mappingType: typeof value.mapping },
        { sourceConversationId }
      )
    );
  }

  const nodes: NodeObservation[] = [];
  const attachments: AttachmentReference[] = [];
  const messageIds = new Set<string>();
  const nodesWithExplicitChildren = new Set<string>();

  if (mapping) {
    for (const [nodeId, rawNodeValue] of Object.entries(mapping)) {
      if (!isRecord(rawNodeValue)) {
        events.push(
          makeEvent(
            'ERROR',
            'INVALID_MAPPING_NODE',
            'Mapping entry is not a JSON object and must be quarantined by the persistence layer.',
            { rawNodeValue },
            { sourceConversationId, sourceNodeId: nodeId }
          )
        );
        continue;
      }

      const rawNode = rawNodeValue;
      recordUnknownFields(
        events,
        rawNode,
        new Set(['id', 'parent', 'children', 'message']),
        'SCHEMA_DRIFT_NODE_FIELDS',
        'Mapping node contains source fields outside the currently normalized node contract.',
        { sourceConversationId, sourceNodeId: nodeId }
      );

      const embeddedNodeId = stringOrNull(rawNode.id);
      if (embeddedNodeId && embeddedNodeId !== nodeId) {
        events.push(
          makeEvent(
            'ERROR',
            'MAPPING_NODE_ID_MISMATCH',
            'Mapping key and embedded node id do not match.',
            { mappingKey: nodeId, embeddedNodeId },
            { sourceConversationId, sourceNodeId: nodeId }
          )
        );
      }

      const parentSourceNodeId = stringOrNull(rawNode.parent);
      const hasExplicitChildren = Object.prototype.hasOwnProperty.call(rawNode, 'children');
      if (hasExplicitChildren) nodesWithExplicitChildren.add(nodeId);
      const rawChildren = rawNode.children;
      const childSourceNodeIds = normalizeChildren(rawChildren);
      if (hasExplicitChildren && !Array.isArray(rawChildren)) {
        events.push(
          makeEvent(
            'ERROR',
            'INVALID_CHILDREN_SHAPE',
            'Node children field is present but is not an array.',
            { rawChildren },
            { sourceConversationId, sourceNodeId: nodeId }
          )
        );
      }
      if (Array.isArray(rawChildren) && rawChildren.some((child) => typeof child !== 'string')) {
        events.push(
          makeEvent(
            'ERROR',
            'INVALID_CHILD_REFERENCE_TYPE',
            'Node children array contains a non-string child reference.',
            { rawChildren },
            { sourceConversationId, sourceNodeId: nodeId }
          )
        );
      }
      const duplicateChildren = duplicateStrings(childSourceNodeIds);
      if (duplicateChildren.length > 0) {
        events.push(
          makeEvent(
            'ERROR',
            'DUPLICATE_CHILD_REFERENCE',
            'Node children list contains duplicate child references.',
            { duplicateChildren },
            { sourceConversationId, sourceNodeId: nodeId }
          )
        );
      }

      const message = isRecord(rawNode.message) ? rawNode.message : null;
      const sourceMessageId = message ? stringOrNull(message.id) : null;
      const author = message && isRecord(message.author) ? message.author : null;
      const role = author ? stringOrNull(author.role) : null;
      const sourceMessageCreatedAt = message?.create_time ?? null;
      const sourceMessageUpdatedAt = message?.update_time ?? null;
      const content = message && isRecord(message.content) ? message.content : null;
      const contentType = content ? stringOrNull(content.content_type) : null;

      if (message) {
        recordUnknownFields(
          events,
          message,
          new Set(['id', 'author', 'create_time', 'update_time', 'content', 'status', 'end_turn', 'weight', 'metadata', 'recipient', 'channel']),
          'SCHEMA_DRIFT_MESSAGE_FIELDS',
          'Message contains source fields outside the currently normalized message contract.',
          { sourceConversationId, sourceNodeId: nodeId, sourceMessageId }
        );
        if (author) {
          recordUnknownFields(
            events,
            author,
            new Set(['role', 'name', 'metadata']),
            'SCHEMA_DRIFT_AUTHOR_FIELDS',
            'Message author contains source fields outside the currently normalized author contract.',
            { sourceConversationId, sourceNodeId: nodeId, sourceMessageId }
          );
        }
        if (content) {
          recordUnknownFields(
            events,
            content,
            new Set(['content_type', 'parts']),
            'SCHEMA_DRIFT_CONTENT_FIELDS',
            'Message content contains source fields outside the currently normalized content contract.',
            { sourceConversationId, sourceNodeId: nodeId, sourceMessageId }
          );
        }
        if (isRecord(message.metadata)) {
          recordUnknownFields(
            events,
            message.metadata,
            new Set(['attachments', 'citations', 'content_references', 'model_slug', 'default_model_slug', 'finish_details', 'message_type', 'request_id', 'parent_id']),
            'SCHEMA_DRIFT_MESSAGE_METADATA_FIELDS',
            'Message metadata contains keys not yet modeled by the archive normalizer.',
            { sourceConversationId, sourceNodeId: nodeId, sourceMessageId }
          );
        }
      }

      if (message && !sourceMessageId) {
        events.push(
          makeEvent(
            'ERROR',
            'MISSING_MESSAGE_ID',
            'Message-bearing node has no usable source message identifier.',
            { rawNodeHash: sha256Canonical(rawNode) },
            { sourceConversationId, sourceNodeId: nodeId }
          )
        );
      }

      if (sourceMessageId) {
        if (messageIds.has(sourceMessageId)) {
          events.push(
            makeEvent(
              'ERROR',
              'DUPLICATE_MESSAGE_ID',
              'Source message identifier appears more than once within the conversation.',
              { sourceMessageId },
              { sourceConversationId, sourceNodeId: nodeId, sourceMessageId }
            )
          );
        }
        messageIds.add(sourceMessageId);
      }

      if (message && !role) {
        events.push(
          makeEvent(
            'WARNING',
            'MISSING_MESSAGE_ROLE',
            'Message role is absent. Raw source evidence is retained but normalized role is null.',
            {},
            { sourceConversationId, sourceNodeId: nodeId, sourceMessageId }
          )
        );
      }

      if (message && sourceMessageCreatedAt !== null && rawTimestampToIso(sourceMessageCreatedAt) === null) {
        events.push(
          makeEvent(
            'ERROR',
            'INVALID_MESSAGE_TIMESTAMP',
            'Message create_time cannot be normalized to an ISO timestamp.',
            { sourceMessageCreatedAt },
            { sourceConversationId, sourceNodeId: nodeId, sourceMessageId }
          )
        );
      }

      const normalizedMessage = message
        ? {
            id: sourceMessageId,
            role,
            createTime: sourceMessageCreatedAt,
            updateTime: sourceMessageUpdatedAt,
            contentType,
            content: message.content ?? null,
            recipient: message.recipient ?? null,
            channel: message.channel ?? null,
            status: message.status ?? null,
            endTurn: message.end_turn ?? null,
          }
        : null;

      const observation: NodeObservation = {
        sourceNodeId: nodeId,
        parentSourceNodeId,
        childSourceNodeIds,
        sourceMessageId,
        role,
        sourceCreatedAt: sourceMessageCreatedAt,
        sourceUpdatedAt: sourceMessageUpdatedAt,
        createdAt: rawTimestampToIso(sourceMessageCreatedAt),
        updatedAt: rawTimestampToIso(sourceMessageUpdatedAt),
        contentType,
        rawNodeHash: sha256Canonical(rawNode),
        normalizedMessageHash: normalizedMessage ? sha256Canonical(normalizedMessage) : null,
        rawNode,
      };
      nodes.push(observation);
      if (message) attachments.push(...collectAttachmentReferences(nodeId, sourceMessageId, message));
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.sourceNodeId));
  const nodesById = new Map(nodes.map((node) => [node.sourceNodeId, node]));

  let derivedEdgeCount = 0;
  const derivedParentIds = new Set<string>();
  for (const node of nodes) {
    if (!node.parentSourceNodeId) continue;
    const parent = nodesById.get(node.parentSourceNodeId);
    if (!parent || nodesWithExplicitChildren.has(parent.sourceNodeId)) continue;
    if (!parent.childSourceNodeIds.includes(node.sourceNodeId)) {
      parent.childSourceNodeIds.push(node.sourceNodeId);
      derivedEdgeCount += 1;
      derivedParentIds.add(parent.sourceNodeId);
    }
  }
  for (const parentId of derivedParentIds) {
    nodesById.get(parentId)?.childSourceNodeIds.sort((a, b) => a.localeCompare(b));
  }

  const nodesWithoutExplicitChildren = nodes.length - nodesWithExplicitChildren.size;
  if (nodesWithoutExplicitChildren > 0) {
    events.push(
      makeEvent(
        'INFO',
        'TOPOLOGY_CHILDREN_DERIVED_FROM_PARENT_LINKS',
        'Some mapping nodes omit children arrays; normalized child edges were derived from preserved parent links without modifying raw source evidence.',
        {
          nodesWithoutExplicitChildren,
          derivedParentCount: derivedParentIds.size,
          derivedEdgeCount,
        },
        { sourceConversationId }
      )
    );
  }

  if (currentNodeId && !nodeIds.has(currentNodeId)) {
    events.push(
      makeEvent(
        'ERROR',
        'MISSING_CURRENT_NODE',
        'Conversation current_node does not exist in the preserved mapping.',
        { currentNodeId },
        { sourceConversationId, sourceNodeId: currentNodeId }
      )
    );
  }

  for (const node of nodes) {
    if (node.parentSourceNodeId && !nodeIds.has(node.parentSourceNodeId)) {
      events.push(
        makeEvent(
          'ERROR',
          'MISSING_PARENT_NODE',
          'Node references a parent that does not exist in the conversation mapping.',
          { parentSourceNodeId: node.parentSourceNodeId },
          {
            sourceConversationId,
            sourceNodeId: node.sourceNodeId,
            sourceMessageId: node.sourceMessageId,
          }
        )
      );
    }
    for (const childId of node.childSourceNodeIds) {
      const child = nodesById.get(childId);
      if (!child) {
        events.push(
          makeEvent(
            'ERROR',
            'MISSING_CHILD_NODE',
            'Node references a child that does not exist in the conversation mapping.',
            { childSourceNodeId: childId },
            {
              sourceConversationId,
              sourceNodeId: node.sourceNodeId,
              sourceMessageId: node.sourceMessageId,
            }
          )
        );
      } else if (child.parentSourceNodeId !== node.sourceNodeId) {
        events.push(
          makeEvent(
            'ERROR',
            'ASYMMETRIC_TOPOLOGY',
            'Parent children list is not mirrored by the child parent link.',
            { childSourceNodeId: childId, childParentSourceNodeId: child.parentSourceNodeId },
            {
              sourceConversationId,
              sourceNodeId: node.sourceNodeId,
              sourceMessageId: node.sourceMessageId,
            }
          )
        );
      }
    }
  }

  for (const node of nodes) {
    if (!node.parentSourceNodeId) continue;
    const parent = nodesById.get(node.parentSourceNodeId);
    if (parent && !parent.childSourceNodeIds.includes(node.sourceNodeId)) {
      events.push(
        makeEvent(
          'ERROR',
          'ASYMMETRIC_TOPOLOGY',
          'Child parent link is not mirrored by the parent children list.',
          { parentSourceNodeId: node.parentSourceNodeId },
          {
            sourceConversationId,
            sourceNodeId: node.sourceNodeId,
            sourceMessageId: node.sourceMessageId,
          }
        )
      );
    }
  }

  for (const cycle of findParentCycles(nodes)) {
    events.push(
      makeEvent(
        'ERROR',
        'GRAPH_CYCLE_DETECTED',
        'Conversation mapping contains a parent cycle and cannot be treated as an acyclic conversation graph.',
        { cycle },
        { sourceConversationId, sourceNodeId: cycle[0] ?? null }
      )
    );
  }

  const topologyHash = topologyFingerprint(nodes);
  const normalizedHash = sha256Canonical({
    sourceConversationId,
    title,
    currentNodeId,
    sourceCreatedAt,
    sourceUpdatedAt,
    topologyHash,
    messages: nodes
      .filter((node) => node.sourceMessageId !== null)
      .map((node) => ({
        nodeId: node.sourceNodeId,
        messageId: node.sourceMessageId,
        normalizedMessageHash: node.normalizedMessageHash,
      }))
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
  });

  const hasErrors = events.some((event) => event.severity === 'ERROR');
  const hasWarnings = events.some((event) => event.severity === 'WARNING');

  return {
    sourceConversationId,
    title,
    currentNodeId,
    sourceCreatedAt,
    sourceUpdatedAt,
    createdAt,
    updatedAt,
    rawSourceHash: sha256Canonical(rawConversation),
    normalizedHash,
    topologyHash,
    nodeCount: nodes.length,
    messageCount: nodes.filter((node) => node.sourceMessageId !== null).length,
    attachmentReferenceCount: attachments.length,
    nodes,
    attachments,
    events,
    status: hasErrors ? 'FAIL' : hasWarnings ? 'WARN' : 'PASS',
    rawConversation,
  };
}

export function deriveIntegrityStatus(analyses: ConversationAnalysis[]): IntegrityStatus {
  if (analyses.some((analysis) => analysis.status === 'FAIL')) return 'FAIL';
  if (analyses.some((analysis) => analysis.status === 'WARN')) return 'WARN';
  return 'PASS';
}
