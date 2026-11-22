import type OpenAI from 'openai';
import { sha256, type AdapterReceipt, type ReturnAdapter, type ReturnEnvelope } from './core.js';

type ProviderItem = { id: string; type: string; role?: string; status?: string;
  content?: Array<{ type: string; text?: string }> };

export interface ConversationItemsClient {
  list(conversationId: string): AsyncIterable<ProviderItem>;
  create(conversationId: string, text: string): Promise<ProviderItem>;
  retrieve(conversationId: string, itemId: string): Promise<ProviderItem>;
}

export function returnMessage(envelope: ReturnEnvelope): string {
  return `CoMind AED return\nReturn-ID: ${envelope.returnId}\nResult-SHA256: ${envelope.resultDigest}\n\n${envelope.resultText}`;
}

function verifiedItem(item: ProviderItem, expected: string): AdapterReceipt | null {
  if (item.type !== 'message' || item.role !== 'user' || item.status !== 'completed') return null;
  const text = item.content?.filter(part => part.type === 'input_text').map(part => part.text ?? '').join('');
  if (text !== expected || !item.id) return null;
  return { itemId: item.id, receiptDigest: sha256(expected) };
}

export function createOpenAIItemsClient(client: OpenAI): ConversationItemsClient {
  return {
    async *list(conversationId) {
      const pages = client.conversations.items.list(conversationId, { limit: 100, order: 'desc' });
      for await (const item of pages) yield item as ProviderItem;
    },
    async create(conversationId, text) {
      const result = await client.conversations.items.create(conversationId, {
        items: [{ type: 'message', role: 'user', content: text }],
      }, { maxRetries: 0 });
      if (result.data.length !== 1) throw new Error('item_create_receipt_ambiguous');
      return result.data[0] as ProviderItem;
    },
    async retrieve(conversationId, itemId) {
      return await client.conversations.items.retrieve(itemId, { conversation_id: conversationId }) as ProviderItem;
    },
  };
}

export function createOpenAIAdapter(client: ConversationItemsClient, ownerBinding: string): ReturnAdapter {
  if (!ownerBinding.trim()) throw new Error('owner_binding_required');
  return {
    ownerBinding,
    async findReceipt(envelope) {
      const expected = returnMessage(envelope);
      let count = 0;
      let found: AdapterReceipt | null = null;
      for await (const item of client.list(envelope.destinationRef)) {
        count++;
        if (count > 500) throw new Error('readback_incomplete');
        const receipt = verifiedItem(item, expected);
        if (receipt) {
          if (found) throw new Error('duplicate_provider_items');
          found = receipt;
        }
      }
      return found;
    },
    async send(envelope) {
      const expected = returnMessage(envelope);
      const created = await client.create(envelope.destinationRef, expected);
      if (!created.id) throw new Error('item_id_missing');
      const reread = await client.retrieve(envelope.destinationRef, created.id);
      const receipt = verifiedItem(reread, expected);
      if (!receipt || receipt.itemId !== created.id) throw new Error('item_readback_mismatch');
      return receipt;
    },
  };
}
