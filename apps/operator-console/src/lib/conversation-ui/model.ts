export type ConversationHealth = "active" | "recovering" | "interrupted" | "complete";

export type ConversationSummary = {
  conversationId: string;
  title: string;
  updatedAt: string;
  branchCount: number;
  attachmentCount: number;
  health: ConversationHealth;
  model: string;
};

export type ConversationEvent = {
  eventId: string;
  sequence: number;
  role: "user" | "assistant" | "system";
  content: string;
  durable: boolean;
  recovered?: boolean;
  reasoningSummary?: string | null;
  source: "comind" | "provider" | "browser-observed";
};

export function filterConversations(rows: ConversationSummary[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => [row.title, row.model, row.health].some((value) => value.toLowerCase().includes(needle)));
}

export function orderConversationEvents(events: ConversationEvent[]) {
  return [...events].sort((a, b) => a.sequence - b.sequence || a.eventId.localeCompare(b.eventId));
}

export function recoveryLabel(event: ConversationEvent) {
  if (!event.durable) return "Pending durable capture";
  if (event.recovered) return "Recovered from durable event";
  return "Durably captured";
}

export function exposedReasoningLabel(event: ConversationEvent) {
  return event.reasoningSummary ? "Provider-exposed reasoning summary" : null;
}
