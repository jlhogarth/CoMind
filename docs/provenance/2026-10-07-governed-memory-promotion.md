# Governed Conversation Memory Promotion

Date: 2026-10-07

Issue: https://github.com/jlhogarth/CoMind/issues/40

Pull request: https://github.com/jlhogarth/CoMind/pull/41

## Purpose

Issue #40 adds the first application write path into `comind.cm_memory_node` so durable memory is not limited to manually seeded database rows. The initial policy is deliberately explicit and user-governed rather than automatic memory extraction.

## Behavior

`POST /api/messages/:id/promote-memory` promotes an existing persisted user or assistant message into durable memory.

The route:

- validates bounded title, kind, subtype, priority, and visibility input;
- derives project identity only from the source conversation;
- copies the persisted source message content exactly;
- records non-secret source provenance in `json_payload`;
- defaults to active/internal memory with priority 5 and weight 1.0;
- serializes promotion with the existing conversation advisory lock;
- detects prior promotion by promotion method plus source message ID and returns the existing memory instead of creating a duplicate;
- rejects missing messages, projectless sources, unsupported roles, invalid requests, and concurrent promotion safely.

Promotion provenance version: `conversation_message_explicit_v1`.

## Provenance fields

The durable memory `json_payload` records:

- `promotion_method`
- `source_conversation_id`
- `source_message_id`
- `source_role`
- `source_created_at`

Source message text is stored once as the memory `content`; it is not duplicated into provenance metadata.

## Verification

Deterministic route tests cover creation, defaults, duplicate idempotency, validation, unsupported source cases, and lock conflict behavior.

An isolated PostgreSQL integration test creates a project and conversation, persists a source message, promotes it, repeats promotion to prove a single durable row remains, then appends a retrieval query and generates an assistant response. The Issue #38 retrieval path must inject the newly promoted memory into provider context and persist its memory ID in retrieval telemetry.

The first full integration run on head `e2b841d87c17afcbd15dc70ca24d17ac88a55cba` passed the new promotion-to-retrieval PostgreSQL test as part of `conversation-lifecycle-integration`.

## Safety and cost

- No automatic remember-everything behavior was added.
- No OpenAI or other paid provider call is required for promotion.
- No embedding API call is required.
- No live Supabase mutation is required or performed during development verification.
- No credentials or secret values are recorded in durable memory provenance by this route.

## Follow-on direction

Future milestones can add reviewed extraction, deduplication beyond exact source-message identity, memory lifecycle controls, embedding generation, and human approval workflows without weakening this explicit provenance boundary.