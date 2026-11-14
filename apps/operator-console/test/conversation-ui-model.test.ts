import assert from "node:assert/strict";
import test from "node:test";
import { exposedReasoningLabel, filterConversations, orderConversationEvents, recoveryLabel, type ConversationEvent, type ConversationSummary } from "../src/lib/conversation-ui/model";

const rows: ConversationSummary[] = [
  { conversationId:"a", title:"Recovery proof", updatedAt:"2026-11-01T00:00:00Z", branchCount:2, attachmentCount:1, health:"recovering", model:"local-a" },
  { conversationId:"b", title:"Control", updatedAt:"2026-11-01T00:00:00Z", branchCount:1, attachmentCount:0, health:"complete", model:"local-b" },
];

test("conversation search covers title, model and durable health", () => {
  assert.deepEqual(filterConversations(rows, "recovery").map(x => x.conversationId), ["a"]);
  assert.deepEqual(filterConversations(rows, "local-b").map(x => x.conversationId), ["b"]);
  assert.deepEqual(filterConversations(rows, "complete").map(x => x.conversationId), ["b"]);
});

test("durable event ordering is deterministic", () => {
  const events: ConversationEvent[] = [
    { eventId:"b", sequence:2, role:"assistant", content:"two", durable:true, source:"comind" },
    { eventId:"a", sequence:1, role:"user", content:"one", durable:true, source:"comind" },
  ];
  assert.deepEqual(orderConversationEvents(events).map(x => x.eventId), ["a","b"]);
});

test("recovery status never implies durability when capture is pending", () => {
  const event: ConversationEvent = { eventId:"x", sequence:1, role:"assistant", content:"x", durable:false, recovered:true, source:"provider" };
  assert.equal(recoveryLabel(event), "Pending durable capture");
});

test("reasoning label exists only for an actually exposed summary", () => {
  const base: ConversationEvent = { eventId:"x", sequence:1, role:"assistant", content:"x", durable:true, source:"provider" };
  assert.equal(exposedReasoningLabel(base), null);
  assert.equal(exposedReasoningLabel({ ...base, reasoningSummary:"Provider summary" }), "Provider-exposed reasoning summary");
});
