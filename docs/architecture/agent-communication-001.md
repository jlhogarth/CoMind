# Agent Communication 001: GitHub-managed Supabase handoff

Status: design contract, repository-only  
Issue: [#156](https://github.com/jlhogarth/CoMind/issues/156)  
Scope: human-initiated ChatGPT sessions using the connected Supabase integration, with GitHub as the work and evidence authority  
Model API calls: excluded from the first pilot

## Purpose

Prove that one ChatGPT agent role can leave a durable, attributable handoff for a second ChatGPT agent role, and that the second role can read it and return a linked response through the Supabase integration.

This first step is human-assisted. Each session is started by a person. Supabase holds the shared handoff records. GitHub holds the versioned contract, task, implementation, review, and evidence. The ChatGPT model is used inside each interactive session. No GitHub Actions workflow invokes a model in this milestone.

## System boundary

| Component | Responsibility | Does not establish |
| --- | --- | --- |
| GitHub repository and issue | Versioned contract, canonical agent-role references, task scope, review, CI and evidence links | A ChatGPT model invocation |
| Supabase | Shared persisted handoff and response records | Which ChatGPT identity authored a row when sessions share one connector credential |
| ChatGPT session | Reads an assigned handoff, reasons over its contents, writes a response | Background execution or a wake-up of another session |

The same connected Supabase tool may be available in this ChatGPT work session. Availability to a different ChatGPT session or custom GPT has not been established. The pilot must test the actual intended recipient session. A handoff record does not wake or invoke that recipient.

A Supabase connector used interactively is distinct from an OpenAI API call. The first pilot is intended to avoid API calls and paid model execution. If we later require GitHub Actions to invoke a model unattended, that is a separate design and authorization milestone.

## Current substrate findings

Read-only inspection of Supabase project `sbgfuanxiqepcoboxzcl`, initially on 2026-10-20 and rechecked on 2026-10-21, found:

- The project has existing `comind.cm_agent`, `cm_agent_run`, `cm_agent_step`, Foundry deliberation, participant, event and outcome relations, plus `comind_pm.pm_agent_runs`.
- The 2026-10-21 query returned no rows from `comind.cm_agent` or `comind.cm_foundry_agent_profile`. Repository search found a planned descriptive role directory but no authoritative role records to select sender and recipient identities from. Do not guess names or identifiers.
- The 2026-10-21 privilege query confirmed `anon` and `authenticated` have no `USAGE` on `comind`, no table access to `comind.cm_agent`, and no SELECT on `cm_foundry_agent_profile`. `service_role` has schema usage and profile SELECT. This does not establish access for a separate ChatGPT session.
- The inspected agent/run/step/profile/deliberation and PM agent-run relations contained no records. The project had one `comind.cm_project` row and no `cm_task` or execution-context rows.
- `cm_agent_run` and `cm_agent_step` did not grant table access to `service_role`. Foundry deliberation relations had RLS enabled and `service_role` SELECT/INSERT grants, with no UPDATE or DELETE grant.
- The Foundry deliberation event type is constrained. It is intended for deliberation evidence and outcomes, not a general-purpose private mailbox.
- `comind_pm.pm_agent_runs` records run summaries and references but has no recipient/thread messaging contract.
- The Supabase SQL connector can perform privileged management queries. This does not prove a separate ChatGPT session has equivalent connector access or that a sender identity is authenticated.

These facts favor defining the handoff contract first. Do not reinterpret an existing deliberation, PM run, or task record as a chat message without an explicit contract review.

## Handoff contract

Each message is immutable and carries:

- `contract_version`: version of this contract;
- `message_id`: stable message identifier;
- `thread_id`: identifier shared by all messages in one handoff thread;
- `reply_to_message_id`: prior message identifier for a response, null only for the initial request;
- `sender_agent_id` and `recipient_agent_id`: canonical CoMind identifiers resolved from an authoritative role directory;
- `github_repository` and `github_issue_number`: the work authority for the request;
- `message_kind`: one of `request`, `response`, `evidence`, or `blocker`;
- `body`: bounded JSON content with a short summary, explicit claims, and evidence references;
- `created_at`: database assigned timestamp;
- `idempotency_key`: stable key that prevents duplicate creation on retry.

The record must not contain credentials, private ChatGPT archives, unrelated personal content, or unbounded transcripts. An agent's stated identity is descriptive unless the eventual transport gives each agent a separately authenticated database identity. The pilot must not imply stronger attribution than the connector provides.

Human approval is not an agent message kind. An agent response cannot grant itself authority or authorize an external action.

## Round-trip procedure

1. Joseph selects a GitHub issue and the two canonical agent roles.
2. The sender session reads this contract and writes one synthetic `request` linked to that issue.
3. A person starts or switches to the recipient ChatGPT session and asks it to retrieve the message by its GitHub issue/thread reference.
4. The recipient reads and analyzes the request, then writes a `response`, `evidence`, or `blocker` message replying to the original `message_id`.
5. The sender session reads the reply through Supabase and confirms both messages and their provenance.
6. The test result is recorded in GitHub with message identifiers, query evidence, and any connector limitation. Do not copy sensitive content into the issue.

This proves persisted, human-mediated handoff only. It does not prove independent agent authentication, automatic delivery, autonomous task execution, or continuous operation.

## Gate before any shared Supabase write

PR #119 remains open and draft, with no submitted reviews, unresolved review threads, and all 11 returned exact-head workflow runs successful. Its latest fetched metadata reports `mergeable: false`; the remaining application runtime acceptance is still documented on that PR. On 2026-10-21 Joseph directed this work to resolve the #119 gate. The explicit reassignment is recorded on [issue #126](https://github.com/jlhogarth/CoMind/issues/126#issuecomment-6310204197): #156 is now the sole active shared-Supabase schema lane for this bounded pilot, while #119 remains open for its Operator Console runtime work.

This reassignment permits repository implementation and disposable isolated PostgreSQL verification for the pilot. It does not authorize shared Supabase DDL or DML yet. Before a live write, recheck the authoritative migration ledger and effective grants, finish the handoff contract and recovery review, identify the canonical sender and recipient, and verify Supabase access in the actual recipient session. Do not treat the privileged SQL connector as a reason to bypass those checks.

If implementation requires a new relation, first add its migration and rollback/recovery design to GitHub and test it in disposable PostgreSQL 17. A future shared Test write requires the schema lane and exact test scope to be clear. Keep all records synthetic, bounded, attributable, and idempotent. Do not delete evidence as routine cleanup; prefer an explicit synthetic test lifecycle and preserve its record.

## Acceptance

- The canonical sender and recipient roles are resolved from repository-controlled agent records without renaming or inventing identities.
- A separate recipient ChatGPT session can access the connected Supabase integration, or the limitation is explicitly recorded.
- One synthetic request and one linked response are written and read back through the intended interactive sessions.
- The records point to the same GitHub issue and thread; duplicate retry does not create duplicate logical messages.
- Agent identity attribution is stated at the level the transport actually proves.
- The test includes an unavailable-recipient or denied-access path and reports it without claiming success.
- No OpenAI API call, unattended worker, production action, deployment, or production-readiness claim is included.
- GitHub stores the contract, code, CI results and evidence references. Supabase stores the test handoff records.

## Recovery

Stop on unexpected schema, privilege, migration, identity, or connector state. Preserve evidence and report the exact blocker. Do not broaden grants, create guessed agent identifiers, bypass issue #126, or remove test rows destructively.
