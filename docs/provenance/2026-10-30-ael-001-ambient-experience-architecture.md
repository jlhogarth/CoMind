# AEL-001 Governed Ambient Experience Architecture Provenance

Date: 2026-10-30
Issue: https://github.com/jlhogarth/CoMind/issues/416
Environment: Development architecture
Governance tier: T1 Reversible development
Production change: false
Live capture: false
Biometric identification: false
Paid commitment: false

## Authority

AEL-001 was started under the standing CoMind L4A Bounded Autonomous Development Authority after direct durable readback from `comind_pm.pm_authorizations`.

Verified active authorization:

- authorization id: `a4d3728d-62a2-4f4f-bb4c-f40486984f76`;
- decision: `granted`;
- authorized by: Joseph Hogarth;
- scope: all current and future CoMind development lanes unless explicitly narrowed or revoked;
- non-Production autonomy: true;
- autonomous issue/branch/PR progression and qualifying merge: true;
- Production and other mandatory human stops remain in force.

The current canonical Development Environment Contract v1.1 was read from the repository before consequential external writes. Composio was treated as the integration/authentication substrate, not as the authority source.

## Origin and product intent

The lane originated from a product concept for continuous or event-driven audio/video and contextual capture whose value comes from governed summarization, analysis, temporal reconstruction, retention/deprecation, and persistent cognition.

The concept was deliberately generalized into a source-neutral Ambient Experience Layer rather than tied to a specific camera, navigation, cloud-video, or sensor vendor.

## Freshness and collision review

Before creating AEL-001, the lane verified:

- no pre-existing GitHub issue named AEL-001;
- no existing AEL code/doc family in the repository search performed for the lane;
- no existing AEL implementation branch in the branch inventory;
- no open Durable RunBook blockers at the checked points;
- current open PR/issue inventory to avoid overlapping active work;
- GER-001 and GER-002 architecture to avoid creating a competing epistemic taxonomy;
- current RuleBook retention, residency, classification, and integration-gateway substrate.

The repository main branch advanced while the lane was being reconstructed. A final freshness check resolved `main` to exact commit:

`955e5acab148df1affbc42e0b6cbdec1d452430d`

The governed branch `ael-001-governed-ambient-experience-architecture` was created from that exact head before repository artifact writes.

## Durable RunBook evidence recovery

The AEL-001 Durable RunBook work item was created as:

- work key: `AEL-001`;
- work item id: `d8403ed4-5bb5-41d1-b16b-fd36090e08da`;
- status: `in_progress` at lane creation;
- area: Ambient Experience Layer;
- governance tier metadata: T1;
- Production change metadata: false.

Two initial evidence-write transactions were rejected by existing schema constraints and rolled back cleanly.

1. `pm_work_items_item_type_check` rejected the proposed value `architecture`.
   - Resolution: reused canonical `item_type = lane`.
2. `pm_events_actor_type_check` rejected the proposed value `assistant`.
   - Resolution: reused canonical `actor_type = agent`.

No schema constraint was weakened. A recovery event was then durably recorded:

- recovery event id: `24b2a709-a3b1-4864-ad35-99487af9a5af`;
- created event id: `c91029ce-9799-4061-ae08-2daf787b848d`.

This is intentional evidence that canonical vocabulary won over a convenient new value.

## Existing substrate reused

AEL-001 confirmed and reused the following current governance concepts:

### Retention profiles

- `EPHEMERAL`;
- `OPERATIONAL`;
- `DURABLE-EVIDENCE`.

The architecture does not assign a blanket retention duration to future ambient media. It requires each source/use case to bind an applicable profile and narrower product/legal policy where required.

### Residency

The current Test residency profile `COMIND-TEST-US` was observed as existing governance substrate. Its own metadata explicitly states that it is not a legal residency determination. AEL therefore treats residency profiles as policy inputs, not legal conclusions.

### Data classification

The current canonical classification vocabulary was observed as:

- `PUBLIC`;
- `INTERNAL`;
- `CONFIDENTIAL`;
- `RESTRICTED`;
- `SECRET`.

AEL creates no parallel classification model.

### RuleBook control families

The design composes existing control families including DRULE-C07, C11, C13, C17, C19, C24, and C27 plus current authority, evidence, secret-handling, and Production controls.

## GER reconciliation

GER-001 was read before AEL architecture was written.

AEL explicitly adopts GER's distinction among observation, claim, inference, assumption, hypothesis, conclusion, decision, authority, and action. AEL therefore does not introduce an independent epistemic level system.

The boundary selected is:

- AEL owns source evidence references, source provenance, temporal normalization, and attributed observations;
- GER owns claims, inference, hypotheses, conclusions, contradictions, uncertainty, and epistemic promotion;
- Digital Twin governance owns durable profile/identity promotion;
- separate authority governs decisions and actions.

This prevents inference laundering and avoids a second truth model.

## Principal architecture decisions

1. **Source neutrality**: vendor integrations are adapters, not core architecture.
2. **Authority before capture**: provider connectivity or device ownership is not CoMind capture authority.
3. **Temporal uncertainty is first-class**: source clocks, ingestion time, ordering uncertainty, gaps, and duplicates remain visible.
4. **Evidence and interpretation remain separate**: observations retain derivation provenance; inference is handed to GER.
5. **Progressive lifecycle without automatic permanence**: retention and deprecation reuse canonical profiles; salience may recommend review but cannot grant retention authority.
6. **Source expiration remains visible**: retained derivatives cannot imply that disposed source evidence is still inspectable.
7. **Identification disabled by default**: AEL-001 does not implement or authorize biometric/person identification.
8. **Sensitive payload minimization**: ordinary logs and governance evidence should remain metadata-focused.
9. **Fail closed**: missing authority, classification, residency/egress context, or required human approval blocks consequential execution.
10. **No premature vendor or schema lock-in**: storage vendor, provider, codec, event bus, permanent schema, model provider, and live-retention defaults remain future decisions.

## Artifacts created by this lane

- `docs/architecture/ael-001-governed-ambient-experience-layer.md`;
- `docs/governance/ael-001-capture-authority-contract.md`;
- `docs/provenance/2026-10-30-ael-001-ambient-experience-architecture.md`.

These artifacts are documentation/governance only and create no runtime capture or Production side effect.

## Verification method

AEL-001 is verified through inspectable repository and provider state rather than narrative assertion:

- branch existence and exact base head;
- committed artifact presence on the governed branch;
- branch/main comparison for unexpected overlap;
- pull-request diff and exact-head status checks;
- Durable RunBook readback for issue/branch/PR/verification/merge events;
- post-merge main readback if the PR qualifies for autonomous merge.

Commit, PR, status-check, and merge identifiers are recorded as Durable RunBook execution evidence when those states exist. This provenance document intentionally does not guess identifiers that are created only after the document itself is committed.

## Successor path

The architecture proposes these separately governed successors:

- AEL-002 Synthetic Event Envelope and Local Simulator;
- AEL-003 Governed Capture Authority Preflight;
- AEL-004 Single-Source Bounded Test Adapter;
- AEL-005 Multi-Source Temporal Synchronization;
- AEL-006 GER Episodic Handoff;
- AEL-007 Retention and Deprecation Lifecycle Proof;
- AEL-008 Operator Console Ambient Operations;
- AEL-009 Bounded Live Pilot Readiness.

AEL-009 is not Production authorization. Any Production activation remains separately governed and requires the applicable explicit human authority.