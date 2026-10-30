# CFR-002: CoMind Native Conversation Interface

Issue: #387

## Status

First implementation slice: repository architecture contract and synthetic dual-capture foundation. Production activation is excluded.

## Purpose

CFR-002 extends CFR-001 so CoMind can operate a first-class conversation interface whose recoverability does not depend on a third-party chat surface or a successfully completed client session.

CFR-002 does not create a second transcript model. It reuses the existing CoMind conversation, message, capture-event, assistant-generation, recovery-checkpoint, archive, reconciliation, analytics, retention, authority, and evidence lineage.

## Dual acquisition model

CFR-002 recognizes two independent live acquisition families:

1. `openai_api`: supported provider events obtained through CoMind's existing OpenAI Responses API execution path.
2. `chatgpt_browser_observed`: events observed from an authenticated real-browser ChatGPT session, including raw browser/network envelopes when separately authorized.

Neither source is authoritative merely because it was observed first. Source identity is retained through normalization and reconciliation.

The browser-observed adapter is experimental and separately governable. It must not bypass authentication, access another user's data, commit session material to GitHub, or silently depend on a stable undocumented endpoint shape.

## Eight-part program

### CFR-002A: Provider Event Fidelity
Preserve provider lifecycle, sequence identity, exposed reasoning-summary artifacts, tool lifecycle, incomplete/failed states, and source provenance in addition to ordinary assistant text deltas. Raw hidden chain of thought must never be claimed or fabricated.

### CFR-002B: Durable Stream Gateway
CoMind owns the upstream stream connection. User input is committed before inference. Observed events are persisted before downstream delivery where technically feasible. A client disconnect must not destroy already observed evidence.

### CFR-002C: Resumption and Recovery
Support replay from the last durable CoMind sequence, reconnect, interruption classification, and recovery without relying on browser memory.

### CFR-002D: CoMind Chat UI
Provide a mobile/desktop first-party conversation surface integrated with CoMind Home/Operator Console. Conversation state, recovery state, source provenance, model controls, branches, attachments, tool activity, and exposed reasoning summaries remain inspectable.

### CFR-002E: Dual Continuity
CoMind is the canonical evidence plane. Provider/browser foreign IDs and continuity handles are lineage, not the sole source of truth.

### CFR-002F: Reasoning Continuity
Preserve reasoning artifacts actually exposed by a source, including summary/recap and encrypted continuity items where supported. Such artifacts remain explicitly distinct from raw hidden reasoning.

### CFR-002G: Archive and Dual-Capture Reconciliation
Reuse CHIST/CFR reconciliation so supported API capture, browser-observed capture, and retrospective ChatGPT exports can be compared without overwriting one another. Completeness is evaluated across transcript, topology, interaction, and reasoning-artifact dimensions.

### CFR-002H: Failure and Drift Proof
Deliberately test browser reload/close, client disconnect, provider interruption, restart/reconnect, malformed or unknown envelopes, duplicate/out-of-order events, schema drift, and partial reasoning/tool output. Every failure must remain observable and recoverable.

## Raw plus normalized evidence contract

Each acquisition stream must be capable of retaining:

- source family and source event family
- source endpoint family or logical provider channel where known
- local sequence and source sequence where known
- observed timestamp
- provider/browser identifiers where available
- raw envelope digest
- raw object reference when retained outside PostgreSQL
- parser/normalizer version
- normalized CFR event references
- normalization state
- drift state
- reconciliation state

Raw source evidence and normalized CFR evidence are separate representations. Normalization success does not authorize deletion of the only raw copy.

Large raw envelopes should normally live outside the hot relational path. PostgreSQL retains the durable source identity, hashes, sequence, lineage, state, indexes, and reconciliation metadata. Temporary transport spools may be deleted only after durable raw and normalized verification succeeds.

## Initial event vocabulary

The existing CFR event ledger remains canonical for conversational events. CFR-002 adds source-acquisition lifecycle semantics through a separate acquisition ledger rather than overloading conversational message semantics.

Initial acquisition states:

- `observed`
- `normalized`
- `normalization_failed`
- `duplicate`
- `out_of_order`
- `schema_drift`
- `reconciled`

Initial normalization classes:

- `assistant_text_delta`
- `assistant_text_completed`
- `reasoning_summary_delta`
- `reasoning_summary_completed`
- `tool_call_started`
- `tool_call_completed`
- `response_started`
- `response_completed`
- `response_incomplete`
- `response_failed`
- `unknown`

These are source-neutral classes. A browser adapter and an API adapter map source-specific event shapes into the same vocabulary without discarding the raw envelope identity.

## Dual-source comparison

A deterministic comparison of two observations of the same logical turn may classify them as:

- `exact`: normalized event classes, sequence-compatible content, and terminal state agree.
- `compatible_extension`: one source contains additional non-conflicting events, for example a later completion or additional exposed reasoning-summary/tool activity.
- `conflict`: overlapping observations disagree materially.
- `ambiguous`: evidence is insufficient to select a single relationship.
- `unmatched`: no credible counterpart exists.

Reconciliation never overwrites source evidence.

## Drift handling

Undocumented browser/network event shapes are treated as versioned external observations, not stable contracts.

A normalizer must fail visibly when required fields disappear, change type, or become ambiguous. The raw envelope digest and source metadata remain durable even when normalization fails. Unknown fields may be preserved in raw evidence without being silently promoted into normalized meaning.

Drift findings are intended for Operator Console visibility and later governed parser updates.

## Cost boundary

Model execution cost and conversation capture/storage cost are separate.

Moving captured bytes between CoMind-controlled storage tiers does not require model inference. CoMind should minimize provider input through governed retrieval, salience, continuity, and context selection rather than replaying full stored history by default.

## Security boundary

- Production unchanged unless separately authorized.
- No credentials, cookies, browser session tokens, private payloads, or live raw captures in GitHub.
- No authentication bypass.
- No observation of another user's session.
- No public Data API exposure for private capture evidence.
- No automatic canonical-memory, Rulebook, architecture, decision, or task promotion.
- No raw hidden chain-of-thought claim.
- Supported API capture must remain independently usable if browser observation is disabled or broken.

## First implementation slice

The first slice establishes only the reusable source-neutral contract and synthetic proof:

1. append-only acquisition-envelope identity and state evidence;
2. deterministic source-neutral normalization interfaces;
3. deterministic dual-source comparison;
4. synthetic fixtures for supported API and browser-observed representations of the same turn;
5. visible preservation of duplicate, out-of-order, malformed, and drifted observations;
6. isolated tests proving source separation and non-destructive reconciliation;
7. no live private-account interception.

Later slices can activate the actual browser adapter only after the contract above is stable and separately authorized.
