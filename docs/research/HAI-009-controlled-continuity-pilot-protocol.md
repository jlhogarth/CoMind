# HAI-009: Controlled Continuity Pilot Protocol and Instrumentation Map

Status: Implementation candidate, Test-only
Issue: https://github.com/jlhogarth/CoMind/issues/408
Predecessor: HAI-008 Issue #397 / PR #401
Production activation: false
Real participant collection: false
Paid provider execution: false
Schema mutation: none

## Purpose

HAI-009 converts the HAI-008 continuity measurement architecture into a protocol that can actually be executed, inspected, challenged, replayed, and later preregistered.

The first pilot domain is Continuity: preservation of relevant state, intent, commitments, corrections, provenance, and unresolved work across interruptions or sessions.

HAI-009 does not attempt to validate the complete Human-AI Relationship Development Framework. Its immediate job is narrower: prove that CoMind can define a continuity experiment precisely enough that a result means what we say it means.

## First-domain decision

Continuity was selected ahead of the other HAI domains for six reasons:

1. Objective ground truth can be seeded directly into fictional task histories.
2. Correction, staleness, unresolved work, and provenance are measurable without relying on self-report.
3. The three HAI-008 comparator conditions are cleanly distinguishable.
4. CoMind already has continuity, evidence, recovery, and provenance substrate that can later be evaluated rather than recreated.
5. Synthetic preflight requires no real participant data and no paid inference.
6. Continuity is a prerequisite for many later longitudinal tests without being treated as a universal mandatory causal stage.

This is a pilot-selection decision, not a scientific claim that every human-AI relationship must develop in a fixed order.

## Protocol identity

Machine-readable protocol ID: `HAI-009-CONTINUITY-PILOT-v1`

Protocol version: `1.0.0`

Canonical machine-readable contract: `config/hai-009-continuity-pilot.v1.json`

Validator and scorer: `scripts/hai_009_continuity_pilot.mjs`

Adversarial tests: `server/test/hai-009-continuity-pilot.test.mjs`

Dedicated CI: `.github/workflows/hai-009-continuity-pilot.yml`

## Two-phase design

### Phase A: Synthetic instrumentation preflight

Phase A is executable inside HAI-009. It uses only fictional, non-sensitive task state and deterministic scoring.

Its purpose is to validate:

- protocol structure;
- fixture integrity;
- condition isolation;
- ground-truth completeness;
- telemetry completeness;
- deterministic scoring;
- stale-state and correction handling;
- provenance accounting;
- missingness behavior;
- evidence lineage;
- failure behavior.

Phase A explicitly does not establish human benefit, psychological validity, product efficacy, or superiority of a live CoMind implementation.

### Phase B: Human feasibility pilot

HAI-009 specifies the Phase B protocol but does not activate it.

The provisional design uses 24 participants in a within-subject three-condition crossover. All six possible condition orders appear four times. The three matched fictional scenario families are also balanced across their six possible orders.

The Phase B purpose is feasibility, participant burden, instrumentation quality, variance estimation, and preliminary effect-size estimation. The proposed sample size is not presented as confirmatory statistical power.

Real participant execution requires a separate authorization after the human-subject, privacy, consent, retention, instrument-rights, and study-operations gates are resolved.

## Comparator conditions

| Condition | Longitudinal state | Currentness | Corrections | Provenance | Unresolved state |
| --- | --- | --- | --- | --- | --- |
| `FRESH_SESSION` | None beyond standardized resumption prompt | No | No | No | No |
| `MEMORY_ONLY` | Retained but ungoverned history | Not guaranteed | Not guaranteed | Not required | Not guaranteed |
| `GOVERNED_CONTINUITY` | Governed retained state | Required | Required | Required | Required |

The conditions are intentionally architectural. They do not assume a particular model provider or UI.

## Preregisterable hypotheses

### Primary hypotheses

H1. `GOVERNED_CONTINUITY` produces higher resume accuracy than `FRESH_SESSION` and `MEMORY_ONLY` on seeded resumption tasks.

H2. `GOVERNED_CONTINUITY` produces higher correction-persistence accuracy and lower stale-assumption persistence than `MEMORY_ONLY` when prior state contains a superseded fact.

H3. `GOVERNED_CONTINUITY` produces higher unresolved-commitment recovery and provenance coverage than the comparator conditions.

### Secondary hypotheses

H4. `GOVERNED_CONTINUITY` reduces context-reconstruction effort relative to `FRESH_SESSION` without increasing stale-assumption persistence relative to `MEMORY_ONLY`.

H5. Retained memory volume alone is insufficient. A condition can retain more historical material while performing worse on relevance, currentness, correction, and provenance quality.

## Outcome definitions

No global HAI maturity score is authorized.

### Primary outcomes

| Metric | Definition | Direction |
| --- | --- | --- |
| Resume accuracy | Correctly recovered required resumable state divided by all required resumable state | Higher is better |
| Correction persistence rate | Correction targets represented with their current corrected value divided by all seeded corrections | Higher is better |
| Stale-assumption persistence rate | Seeded superseded elements incorrectly carried forward as current divided by all seeded superseded elements | Lower is better |
| Unresolved-commitment recovery rate | Required unresolved items recovered divided by all required unresolved items | Higher is better |
| Provenance coverage | Required current-state elements carrying expected provenance divided by all provenance-required elements | Higher is better |
| Context-reconstruction effort | Additional standardized human reconstruction turns after resumption prompt | Lower is better |

### Secondary outcomes

- relevance precision;
- relevance recall;
- contradiction rate;
- source-to-state traceability;
- completion time where meaningful;
- task errors and rework;
- instrumentation completeness.

Performance and governance remain separable. A high task score cannot cancel an authority, provenance, privacy, or evidence failure.

## Ground-truth contract

Each Phase A fixture includes an immutable versioned reference state containing:

- required resumable state IDs;
- current values;
- corrections;
- superseded values;
- unresolved items;
- provenance requirements;
- relevant historical entries;
- irrelevant historical entries.

The reference state receives a SHA-256 digest from canonical sorted JSON. The validator recomputes the digest and rejects a fixture whose content changed without a corresponding identity update.

Every primary metric is computed from deterministic ground truth. No LLM judge is used for Phase A scoring.

## Synthetic scenario corpus

Three fictional scenario families exercise the same continuity constructs without reusing identical content:

1. `ATLAS_RELEASE`: a product release with a corrected launch date and unresolved security/vendor commitments.
2. `MERIDIAN_MIGRATION`: a data migration with a corrected cutover window and unresolved validation/DNS work.
3. `HARBOR_EVENT`: a conference-planning task with a corrected attendee cap and unresolved accessibility/catering work.

Each scenario also contains irrelevant history so relevance precision is measurable rather than assumed.

The observation cases embedded in the protocol are scorer-validation fixtures. They are deliberately constructed to exercise known metric values. They are not empirical pilot results and must never be cited as evidence that one real system performs better than another.

## Scoring contract

The scorer is deterministic and reports every metric separately.

Important rules:

1. Missing retained history makes relevance precision unavailable rather than silently perfect.
2. Missing provenance receives zero provenance credit.
3. A stale value can be penalized even when the semantic item itself was resumed.
4. Resume coverage and correction accuracy are distinct metrics.
5. Missing required telemetry fails validation.
6. Unknown conditions fail closed.
7. Identical evidence replays to identical metric values.
8. No overall score, maturity score, or hidden weighted aggregate is produced.

## Telemetry envelope

Every scored observation must preserve at least:

- protocol ID and version;
- fixture ID and version;
- condition;
- synthetic actor or future pseudonymous participant ID;
- session, task, and trial IDs;
- timestamp and sequence;
- system version;
- model provider and model version when applicable;
- policy version;
- toolchain version;
- continuity-state version;
- authority profile;
- event type;
- source references;
- correction links;
- expected-outcome reference;
- observed-outcome reference;
- instrumentation-quality state;
- evidence reference.

Phase A acceptance requires 100 percent presence of required telemetry fields in the canonical synthetic fixtures. This is an engineering acceptance threshold for the harness, not a research claim about real-world data completeness.

## Evidence architecture map

HAI-009 deliberately does not add a research event database.

| Evidence | Canonical owner | HAI-009 use |
| --- | --- | --- |
| Operational evidence identity | `comind.cm_evidence` | Receipt/reference for consequential Test run evidence |
| Development entity identity | `comind_development.entity` | Protocol, fixture, decision, and milestone identity |
| Development relationships | `comind_development.relationship` | Links among protocol, predecessor, artifacts, tests, and decisions |
| Development artifacts | `comind_development.artifact` | Repository/Drive/CI artifact identities and checksums |
| Development chronology | `comind_development.journal_entry` | Lane decisions, validation, failures, acceptance history |
| Machine-readable protocol and fixtures | GitHub repository | Immutable versioned contract and scorer inputs |
| Raw Phase A telemetry | CI/run artifact | Full run evidence referenced by canonical evidence receipt |
| Human-readable protocol | Google Drive HAI center | Research narrative, governance, and continuity documentation |

`comind.cm_evidence` is not overloaded into a high-volume event log. Raw run telemetry may remain an immutable artifact with checksum and canonical evidence pointer. A later relational study schema requires a demonstrated queryability or integrity gap and separate governance.

## Phase A adversarial acceptance

The repository tests prove at minimum:

- canonical manifest validation;
- exact reference-state hash verification;
- deterministic replay;
- no global maturity score;
- fresh-session history leakage rejection;
- memory-only governance leakage rejection;
- governed-condition annotation requirement;
- tampered ground-truth detection;
- missing telemetry rejection;
- missing provenance receives zero credit;
- stale-state penalty remains independent from resume coverage;
- governed scoring fixture preserves corrections, unresolved state, and provenance;
- unknown conditions are rejected;
- Phase B cannot be activated by flipping a manifest flag;
- Production, paid-provider, real-participant, and private-data permissions fail the HAI-009 contract.

## Phase B participant protocol

### Population and inclusion assumptions

Participants are adults able to provide informed consent and complete the fictional knowledge-work tasks in the study language. Prior AI experience is measured but is not required.

### Exclusion assumptions

- inability to provide informed consent;
- introduction of real sensitive work data despite instructions to use only fictional study content;
- technical failure preventing exposure to all three crossover conditions.

These are pilot protocol assumptions, not a final institutional eligibility determination.

### Counterbalancing

There are six possible orders for the three conditions. Each order is assigned to four of the 24 participant slots.

There are also six possible orders for the three scenario families. The machine-readable manifest defines a deterministic 24-slot pairing rule that gives every condition order four uses and every scenario order four uses.

Participant identity remains pseudonymous in analytical data.

### Task boundary

All tasks are fictional. No participant or AI system sends external communication, purchases goods, changes an account, deploys code, modifies Production, or performs another consequential real-world action as part of the pilot.

### Measurement timing

T0 baseline:

- prior AI use;
- relevant task familiarity;
- baseline task skill;
- baseline confidence.

Each trial:

- objective continuity metrics;
- completion time;
- errors/rework;
- instrumentation quality.

After each condition:

- NASA-TLX workload;
- brief failure/surprise note.

Endpoint:

- novel transfer task;
- study burden assessment;
- qualitative causal debrief.

Trust is not a primary continuity outcome. A trust instrument should be added only if a later question requires it and reproduction/adaptation rights are verified.

## Phase B missingness and withdrawal

- no silent imputation;
- every missing value receives a reason where observable;
- instrumentation failures remain part of quality evidence;
- metric-specific analyses report actual denominators;
- withdrawal handling follows the consent and study policy actually approved for execution;
- participants are not replaced merely to hide systematic instrumentation failure.

## Phase B analysis posture

Primary estimands are within-participant contrasts:

- `GOVERNED_CONTINUITY - FRESH_SESSION`;
- `GOVERNED_CONTINUITY - MEMORY_ONLY`.

The pilot reports raw distributions, unstandardized within-participant differences, effect sizes, confidence intervals, order/period effects, and instrumentation missingness.

An exploratory mixed-effects model may include participant and scenario effects when the observed data support that analysis. The model family must match the outcome distribution and be documented before analysis.

No confirmatory statistical-power claim is made for 24 participants.

## Phase B quality stop rules

Collection should be suspended and reviewed on:

1. any privacy or authority incident;
2. required telemetry missingness above 5 percent among the first six participants;
3. systematic condition leakage;
4. evidence that a fixture or scorer no longer matches the frozen protocol;
5. an unrecorded system/model/policy change that prevents clean epoch separation.

The 5 percent threshold is an operational pilot-quality trigger, not a validated scientific threshold.

## Human-subject and privacy gate

HAI-009 makes no IRB determination.

Before Phase B execution, resolve as applicable:

- institutional or IRB determination;
- informed consent;
- disclosure of retained task history and adaptation behavior;
- correction and withdrawal mechanisms;
- data minimization;
- identity separation;
- access controls;
- retention and deletion rules;
- instrument rights;
- debriefing requirements;
- study-operations authority;
- handling of adverse or unexpected system behavior.

Longitudinal interaction data must not be repurposed for identity, personality, protected-trait, or Digital Twin inference merely because it exists.

## Relationship to existing CoMind systems

HAI-009 measures continuity. It does not take ownership of continuity runtime.

ThreadKeeper, CFR/Conversation History, retrieval systems, and other continuity-capable components may become implementation targets in a successor execution lane. Their existing authorities and evidence contracts remain intact.

The Phase A protocol is provider-neutral. A later runtime comparison must pin actual versions, configurations, retrieval/memory policies, prompts, tools, and authority state before a result can be interpreted.

## Acceptance boundary

HAI-009 is accepted when:

- the first-domain decision is durable;
- the machine-readable protocol is frozen and validated;
- three fixture families and three comparator conditions exist;
- deterministic ground truth and hashes are complete;
- the scorer computes every primary metric separately;
- adversarial tests pass;
- the dedicated CI gate passes on exact head;
- the evidence map reuses canonical CoMind systems;
- the Phase B feasibility protocol is fully specified but not activated;
- HAI-008A and current-main freshness are reconciled;
- Drive and repository documentation agree;
- Production remains unchanged;
- no paid provider executes;
- no real participant data is collected.

## Successor direction

The next lane should execute the frozen Phase A protocol against selected actual continuity implementations rather than changing the measurement rules after results are observed. Only after that execution and the separate human-subject gates should CoMind authorize a Phase B human feasibility pilot.
