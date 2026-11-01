"use client";

import { useMemo, useState } from "react";
import { filterConversations, orderConversationEvents, recoveryLabel, exposedReasoningLabel, type ConversationEvent, type ConversationSummary } from "@/lib/conversation-ui/model";
import styles from "./conversation.module.css";

const conversations: ConversationSummary[] = [
  { conversationId: "cfr-002d-synthetic-1", title: "Durable recovery proof", updatedAt: "2026-11-01T04:00:00Z", branchCount: 2, attachmentCount: 1, health: "recovering", model: "governed-local" },
  { conversationId: "cfr-002d-synthetic-2", title: "Continuity control", updatedAt: "2026-11-01T03:40:00Z", branchCount: 1, attachmentCount: 0, health: "complete", model: "governed-local" },
];

const events: ConversationEvent[] = [
  { eventId: "evt-2", sequence: 2, role: "assistant", content: "The response resumed from the last durable CoMind event.", durable: true, recovered: true, reasoningSummary: "Recovery resumed without replaying inference.", source: "comind" },
  { eventId: "evt-1", sequence: 1, role: "user", content: "Resume the interrupted conversation from durable state.", durable: true, source: "comind" },
];

export default function ConversationsPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(conversations[0].conversationId);
  const visible = useMemo(() => filterConversations(conversations, query), [query]);
  const current = conversations.find((row) => row.conversationId === selected) ?? conversations[0];

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/">CoMind <span>Operator Console</span></a>
      <a className={styles.back} href="/management-plane">L4A Management</a>
      <h1>Conversations</h1>
      <input aria-label="Search conversations" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, model, status" />
      <div className={styles.list}>{visible.map((row) => <button key={row.conversationId} className={row.conversationId === current.conversationId ? styles.selected : ""} onClick={() => setSelected(row.conversationId)}>
        <b>{row.title}</b><span>{row.health} · {row.model}</span><small>{row.branchCount} branches · {row.attachmentCount} attachments</small>
      </button>)}</div>
    </aside>
    <section className={styles.content}>
      <header><div><p className={styles.eyebrow}>CFR-002D · canonical conversation projection</p><h2>{current.title}</h2></div><div className={styles.status}>{current.health}</div></header>
      <div className={styles.controls}><span>Model: <b>{current.model}</b></span><span>Branches: <b>{current.branchCount}</b></span><span>Attachments: <b>{current.attachmentCount}</b></span><span>Production: <b>unchanged</b></span></div>
      <section className={styles.timeline} aria-label="Durable conversation events">{orderConversationEvents(events).map((event) => <article key={event.eventId} className={styles.message}>
        <div className={styles.messageHead}><b>{event.role}</b><span>#{event.sequence} · {event.source}</span></div>
        <p>{event.content}</p>
        <footer><span>{recoveryLabel(event)}</span>{exposedReasoningLabel(event) && <span>{exposedReasoningLabel(event)}: {event.reasoningSummary}</span>}</footer>
      </article>)}</section>
      <section className={styles.activity}><h3>Recovery and reasoning activity</h3><p>Durable capture and recovery state are explicit. Reasoning text is shown only when the provider exposes a summary artifact. Raw hidden reasoning is never claimed.</p></section>
    </section>
  </main>;
}
