# CGA-001 conversation scope reconciliation and deterministic C11 observation

Date: 2026-10-29
Issue: #299
Environment: Supabase Test and repository/isolated CI only
Production authority: false

## Purpose

Close the two prerequisites identified after the authoritative conversation-governance binding milestone: every assistant-capable conversation needs authoritative organization/project scope, and the RuleBook C11 trust-boundary gate needs structured runtime observations that do not place raw prompt content into governance evidence.

## Existing-data finding

Pre-change Supabase Test inspection found exactly 10 `comind.cm_conversation` rows with both `org_id` and `project_id` null. Every one is an explicit synthetic CFR proof record. Their source/title/metadata identify CFR-001, CFR-001C, CFR-001E, CFR-001F, or CFR-001G Test proof activity. No private/user conversation is in this set.

Canonical scope already exists:

- organization: `CoMind, Inc.` / slug `comind`;
- project: `CoMind` / slug `comind` / project code `COMIND`;
- RuleBook project key `COMIND` points to the same canonical project.

CGA-001 therefore reuses those identities. It does not create a new tenant or project and does not infer scope from message content.

## Bounded reconciliation contract

The reconciliation script identifies the synthetic CFR set using durable source and metadata predicates, requires exactly 10 matches, rejects partially scoped rows, rejects any existing conflicting scope, and updates only matches where both scope values are null. Running the script again is a no-op after the first successful application.

An isolated fixture contains the 10 expected records plus one unrelated unscoped synthetic row. Acceptance requires all 10 expected records to receive canonical CoMind scope while the unrelated row remains untouched.

## Future conversation creation

The server conversation-creation route now resolves project and organization together from `comind.cm_project`. The default project remains the existing canonical `comind` project when no explicit project ID is supplied. A requested/default project without an organization does not create a conversation and returns a visible conflict response.

This removes the previous behavior where the server populated `project_id` but left `org_id` null.

## Deterministic C11 observer

`server/src/c11-trust-boundary.ts` is a local, network-free observer. It emits only:

- `untrusted_input`
- `asks_for_secrets`
- `authority_escalation`
- `side_effect`
- `human_approved`

User and tool messages are treated as untrusted input. Secret-disclosure and authority-escalation signals are deterministic pattern checks. System/assistant content does not independently establish an untrusted-input signal. The observer never returns matched text, prompt excerpts, secrets, or evidence snippets.

The observer is deliberately conservative infrastructure, not a semantic security classifier. It is one input to the existing RuleBook C11 policy and does not replace provider safeguards, authorization, evidence validation, or human review.

## Cross-lane boundaries

- CHIST-K01 #244/#247 retains ownership of Conversation History retrieval, chunking, embeddings, and vector schema. CGA-001 does not modify those objects.
- Operator Console deployment issues #294-#297 remain separate. CGA-001 makes no Cloudflare, hostname, or production deployment change.
- Foundry runtime remains unchanged in this slice.
- Ordinary assistant provider routing remains unchanged in this slice.

## Acceptance

Repository acceptance requires:

1. two-pass isolated PostgreSQL 17 reconciliation;
2. exactly 10 expected synthetic records scoped to canonical CoMind org/project;
3. unrelated unscoped fixture remains unchanged;
4. no partial scope is created;
5. server-created conversations resolve org/project atomically or fail visibly;
6. ordinary user input is marked untrusted without invented secret/escalation flags;
7. system-only content is not marked untrusted;
8. secret-disclosure requests are detected without raw content in the result;
9. authority-escalation attempts are detected;
10. retrieved/tool content is treated as untrusted;
11. benign secret terminology without a disclosure request does not trigger `asks_for_secrets`;
12. exact-head CI and broad regressions remain green.

Live Test reconciliation is performed only after isolated acceptance. Production remains unchanged and no paid provider call is authorized or required.
