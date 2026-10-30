# AEL-001 Governed Ambient Experience Layer

Status: architecture candidate
Issue: #416
Environment: Development architecture
Governance tier: T1 Reversible development
Production activated: false
Live capture activated: false
Biometric identification activated: false
Paid provider commitment: false

## 1. Purpose

The Ambient Experience Layer, AEL, defines how CoMind may eventually accept governed physical-world context from source-neutral observational channels such as audio, video, location, vehicle/navigation context, devices, sensors, wearables, and future capture systems.

AEL is not a surveillance product and AEL-001 does not implement recording. The architectural purpose is to establish the contracts required before any capture implementation can be considered: authority, source attribution, temporal synchronization, provenance, data classification, retention and disposition, epistemic separation, privacy, security, recovery, and downstream integration.

The product hypothesis is that CoMind can extend persistent cognition from digital interaction history into governed physical experience by treating multimodal sources as time-correlated evidence channels. The architectural value comes from the governed interpretation and lifecycle of those channels, not from recording alone.

## 2. Canonical invariant

**Capture is evidence. Interpretation is not evidence merely because it was generated from capture.**

AEL must preserve a durable distinction among:

1. source evidence or a source-evidence reference;
2. an attributed observation extracted from that evidence;
3. a claim or inference derived from one or more observations;
4. an episodic synthesis that organizes observations in time;
5. a durable Digital Twin or profile candidate proposed from longitudinal evidence;
6. a decision or action authorized under a separate governance boundary.

AEL owns the first two categories and the temporal/provenance envelope needed to hand material into GER. Governed Epistemic Reasoning, GER, owns the epistemic treatment of claims, inference, assumptions, hypotheses, conclusions, uncertainty, contradiction, and promotion. Digital Twin persistence owns durable identity/profile state under its own promotion contract. Action authority remains separate from all of them.

This preserves GER-001's canonical rule that observation, inference, interpretation, assumption, hypothesis, conclusion, decision, authority, and action remain distinguishable.

## 3. Reuse before reinvention

AEL composes existing CoMind capabilities. It must not create parallel policy or evidence systems when a canonical capability already exists.

AEL reuses:

- the RuleBook control plane and common operational preflight;
- the CoMind Development Environment Contract and standing L4A authority for development work;
- GER terminology, evidence relationships, uncertainty, contradiction, and conclusion governance;
- Conversation History temporal and provenance patterns where applicable;
- canonical CoMind evidence and Durable RunBook patterns for development provenance;
- existing data classification levels: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`, and `SECRET`;
- existing retention profiles: `EPHEMERAL`, `OPERATIONAL`, and `DURABLE-EVIDENCE`;
- existing residency profile machinery, including the current Test profile where applicable;
- DRULE-C07 Episodic Edit and Selective Forget;
- DRULE-C11 Prompt Injection and Exfiltration;
- DRULE-C13 Network and Egress Control;
- DRULE-C17 Multi-Tenancy and Isolation;
- DRULE-C19 Export, Portability and Data Residency;
- DRULE-C24 Fairness, Bias and Sensitive Use;
- DRULE-C27 Research, Logging and Privacy;
- existing authority, evidence, secret-handling, Production, and human-review controls.

AEL does not infer that existing profiles are automatically suitable for a future live capture deployment. The applicable product, legal, privacy, security, and jurisdictional policy must bind those profiles before capture is activated.

## 4. Responsibility boundary

### AEL owns

- source adapter contracts;
- capture-authority references and capture-scope enforcement inputs;
- source identity and provenance;
- temporal normalization and synchronization metadata;
- raw evidence references and integrity metadata;
- extracted observation records with transformation provenance;
- lifecycle state of source evidence and derivatives;
- retention/deprecation orchestration inputs;
- source-level retrieval boundaries;
- governed handoff of observations to GER and other authorized consumers;
- capture health, gaps, duplicates, clock uncertainty, and lineage visibility.

### AEL does not own

- truth determination;
- causal conclusions;
- user identity claims derived from observation;
- general Digital Twin profile promotion;
- agent action authority;
- legal consent determinations;
- Production activation;
- a vendor-specific cloud-video architecture;
- a vendor-specific camera, navigation, wearable, vehicle, or sensor API.

Vendor-specific adapters are future implementation lanes. Their API availability, terms, permissions, cost, data classes, and supported operations must be verified at the time each adapter is proposed.

## 5. Logical system context

```text
Physical or digital source
        |
        v
Source Adapter
        |
        v
Capture Authority Preflight
        |
        v
Temporal Event Envelope
        |
        +----> Evidence/Object Storage Reference
        |
        v
Observation Extraction
        |
        v
Attributed Observation Stream
        |
        +----> GER case / claim / hypothesis processing
        |
        +----> Episodic retrieval and timeline reconstruction
        |
        +----> Authorized Agent or VE context
        |
        +----> Digital Twin promotion candidate
        |
        v
Retention, Deprecation, Disposition and Hold Controls
```

A source adapter does not become an authority source. Device possession, connection state, API authentication, or platform permission does not by itself establish CoMind capture authority or downstream disclosure authority.

## 6. Source-neutral adapter contract

Every future adapter must translate provider-specific data into a bounded AEL source contract. The provider payload remains attributable to its original source and must not be treated as an AEL-native fact merely because it was normalized.

Minimum adapter contract fields in design:

- `source_id`: CoMind identifier for the configured source;
- `source_kind`: camera, microphone, navigation, vehicle, wearable, environmental sensor, device event, imported clip, or another governed type;
- `provider_ref`: non-secret provider or connector identity where applicable;
- `tenant_id` and `project_id` or equivalent scope;
- `capture_authority_ref`;
- `modalities`;
- `classification`;
- `residency_profile_ref`;
- `retention_profile_ref`;
- `clock_source` and clock-quality metadata;
- `source_sequence` or provider event identity where available;
- `content_ref` or event payload reference;
- `content_integrity` metadata where supported;
- adapter version and transformation version;
- health and gap state.

Credentials, tokens, passwords, API keys, authorization headers, and equivalent secret material are never fields in the AEL event envelope or provenance record.

## 7. Capture authority as a governed object

No capture event is valid for governed ingestion without an applicable capture-authority decision or a narrowly defined future buffer policy that itself has explicit authority.

The AEL capture-authority contract is defined in `docs/governance/ael-001-capture-authority-contract.md`.

At minimum, authority must bind:

- authority holder and authority basis;
- subject/source scope;
- permitted modalities;
- location or environment scope when material;
- purpose;
- bystander handling policy;
- data classification;
- retention and residency profiles;
- identification policy;
- agent or role access boundary;
- disclosure/egress policy;
- disposition or deletion authority;
- effective and expiry conditions;
- revocation state;
- evidence references.

Unknown, ambiguous, expired, revoked, or materially out-of-scope authority fails closed for consequential capture or egress.

## 8. Canonical temporal event envelope

AEL needs a common time-oriented envelope so heterogeneous sources can be reconstructed without pretending their clocks are exact.

The logical envelope includes:

- `event_id`;
- `source_id` and provider/source event identity;
- `capture_authority_ref`;
- `tenant_id` and `project_id`;
- `modality`;
- `occurred_at_start`;
- `occurred_at_end` where meaningful;
- `observed_at` where it differs from source time;
- `ingested_at`;
- `clock_source`;
- `clock_uncertainty_ms` or an equivalent bounded uncertainty representation;
- `source_sequence` where available;
- `classification`;
- `residency_profile_ref`;
- `retention_profile_ref`;
- `content_ref`;
- `content_hash` or integrity evidence where available;
- `derivative_of` references;
- transformation/model identity and version for derived observations;
- `provenance`;
- `salience` metadata when computed;
- lifecycle state;
- gap, duplicate, corruption, or partial-capture flags.

These are logical architecture fields, not a new implemented database schema in AEL-001.

### 8.1 Time is evidence with uncertainty

AEL must not silently collapse all timestamps into a single exact timeline. Each event may have provider time, device time, reception time, and normalized CoMind time. The source clock and uncertainty remain inspectable.

When ordering is ambiguous, the system must represent the ambiguity rather than fabricate precision. Cross-source synchronization may use sequence identifiers, trusted clock sources, calibration events, or bounded correlation windows in later milestones.

### 8.2 Duplicate and gap semantics

Adapters should support idempotent ingestion when a provider supplies stable event identity. If stable identity is unavailable, a future implementation may use bounded content hashes plus temporal/source keys, but must retain collision risk as an explicit design consideration.

Missing intervals are evidence of missingness, not evidence that nothing happened. AEL should expose capture gaps to GER and consumers when the gap could materially affect an inference.

## 9. Evidence and observation lineage

AEL must preserve the difference between a source artifact and an observation extracted from it.

### 9.1 Source evidence

Source evidence is the original artifact or an integrity-preserving reference to it, such as a video segment, audio segment, sensor sample, provider event, or imported file.

Required provenance should identify:

- source;
- acquisition/capture context;
- temporal scope;
- applicable authority;
- classification;
- integrity evidence where available;
- lifecycle/retention state;
- access boundary.

### 9.2 Extracted observation

An extracted observation is an attributed record of something perceived or measured from evidence. It must include:

- source evidence reference;
- extraction method and version;
- temporal scope;
- structured observation payload;
- quality/uncertainty metadata where available;
- any transformation steps needed to reproduce or challenge it;
- classification inherited or strengthened according to policy.

Examples include transcription, detected sound event, detected object, speed sample, location sample, device state, or measured environmental value. An observation does not become a conclusion about intent, cause, identity, or importance.

### 9.3 GER handoff

If CoMind proposes that an observation means something beyond what was directly measured, AEL creates or supplies evidence to a GER process. Examples include:

- "three voices are present" may be an extracted observation if supported by the method;
- "these are three specific people" is an identity claim and is separately governed;
- "this is a family dinner" is an inference or interpretation;
- "Friday family dinners are important to this user" is a longitudinal profile claim;
- "schedule future activity around Friday dinner" is a downstream decision/action question.

GER remains responsible for the claim, evidence, contradiction, uncertainty, alternative-hypothesis, and conclusion lifecycle.

## 10. Episodic reconstruction

AEL enables a governed temporal window to be reconstructed from multiple sources without claiming that the reconstruction itself is raw evidence.

An episodic reconstruction consists of:

- a bounded time window;
- source events and observations included in the window;
- gaps and clock uncertainty;
- source-level provenance;
- transformation versions;
- any GER assertions or conclusions linked to the episode;
- retention state of original evidence;
- explicit indication when an original source has expired or been disposed.

A synthesized episode must never hide that its source evidence has expired, become unavailable, or was only partially captured.

## 11. Retention, deprecation, and selective forgetting

AEL reuses the RuleBook retention substrate rather than defining a competing retention engine.

Current canonical profiles include:

- `EPHEMERAL`: temporary material, currently bounded by the canonical profile and subject to applicable narrower policy;
- `OPERATIONAL`: operational material whose duration must be assigned by applicable product/legal policy;
- `DURABLE-EVIDENCE`: governed evidence with disposition authority and no arbitrary deletion period asserted by the profile.

The existence of a profile does not assign it to a future capture source. Binding occurs through capture authority and applicable policy.

### 11.1 Logical lifecycle tiers

AEL distinguishes logical processing tiers from canonical retention profiles:

1. **Transient buffer**: short-lived capture needed to form segments or survive transient connectivity failures.
2. **Original source artifact**: bounded original audio, video, sensor, or provider material.
3. **Selected derivative**: clips, transcripts, frames, normalized samples, or other derivatives justified by purpose and policy.
4. **Event/observation record**: structured temporal metadata and attributed observations.
5. **Epistemic or profile output**: claims, conclusions, or durable profile candidates owned by GER/Digital Twin governance rather than AEL.

Each tier requires an explicit retention profile or an explicitly non-durable state in a future implementation. A later tier does not automatically justify keeping the earlier tier.

### 11.2 Salience-weighted deprecation

Salience may influence retention recommendations, but salience is not authority. A model may recommend preserving a clip, transcript, or event because it appears significant, but retention beyond the currently authorized profile requires the applicable promotion/disposition process.

Sensitive, dramatic, or unusual content must not become permanently retained merely because a model scores it highly.

### 11.3 Source expiration and derivative lineage

When source evidence expires or is lawfully disposed:

- the system records that the source is unavailable or disposed;
- derivatives may remain only if their own authority and retention permit it;
- derivatives must retain a lineage reference and source-lifecycle state;
- a summary must not be presented as though the original remains inspectable;
- deletion or disposition must respect legal/evidence hold precedence in the canonical retention controls;
- AEL must not reconstruct deleted content from prohibited hidden copies.

## 12. Data classification and logging

AEL uses the canonical CoMind classification model.

Continuous audio, video, location, and sensor streams are expected to frequently require controlled classification. A future implementation must classify the asset or fail closed before external transfer or durable logging when policy requires classification.

Logging should default to metadata sufficient for operations, governance, and audit. Raw media, transcripts, location traces, or other sensitive payloads must not be copied into ordinary application logs merely for observability.

## 13. Residency, egress, and tenancy

Every durable AEL asset or derivative must carry tenant/project context and an applicable residency policy where required.

Cross-jurisdiction movement, external provider processing, model inference, export, or third-party storage is an egress decision. Provider connectivity never creates authority for that transfer.

Future external processing must pass RuleBook controls for destination, purpose, classification, tenancy, residency, secret handling, and human review as applicable.

## 14. Identity, biometrics, and sensitive inference

AEL-001 does not authorize or implement face recognition, voice identification, biometric templates, person re-identification, emotion inference, or other identity-sensitive processing.

The default design state is **identification disabled**.

A future identity or biometric capability requires a separate milestone with its own governance tier, authority, threat model, legal/privacy review, purpose limitation, data classification, retention, user/bystander handling, tests, and Production decision. AEL may carry an `identification_policy` reference so adapters can fail closed when such processing is not authorized.

Repeated correlation must not silently harden into identity. This follows GER's Digital Twin rule that inference must not silently become identity.

## 15. Privacy and bystander minimization

Capture authority must distinguish the authorized primary subject/source from other people or data that may appear incidentally.

Future implementations should support policy-driven minimization such as:

- disabling unnecessary modalities;
- source-local preprocessing when appropriate;
- bounded buffers rather than indefinite originals;
- redaction or transformation where justified;
- restricted retrieval of sensitive originals;
- purpose-specific derivative generation;
- explicit bystander handling and disclosure constraints;
- deletion/disposition receipts where required by the owning lifecycle.

AEL-001 makes no claim that any single policy satisfies all jurisdictions or contexts. Capture deployment requires current legal/privacy review appropriate to its actual location, use, subjects, provider, and data handling.

## 16. Security model

Future AEL runtime must assume source content is untrusted input.

Security requirements include:

- least-privilege source and consumer access;
- encryption according to classification policy;
- credential custody outside event/evidence payloads;
- tenant/project isolation;
- provider destination allowlisting through RuleBook controls;
- integrity metadata where practical;
- append-only audit of consequential authority and lifecycle transitions;
- bounded retrieval links or equivalent access mediation for raw objects;
- no raw payload leakage into logs;
- prompt-injection resistance when captured text or speech is supplied to models;
- explicit model/tool version provenance for derived observations;
- revocation and incident containment paths.

Captured speech, signs, screens, documents, QR codes, or other environmental content are evidence payload, not instruction authority.

## 17. Failure and recovery semantics

AEL must fail visibly and preserve uncertainty rather than manufacture continuity.

| Failure | Required behavior |
| --- | --- |
| Capture authority missing, expired, revoked, or ambiguous | Do not begin consequential capture/egress. Record governed denial or review state without sensitive payload. |
| RuleBook preflight unavailable | Fail closed for consequential provider action. |
| Source connection unavailable | Mark source unavailable; do not infer that no event occurred. |
| Clock drift or clock source unknown | Preserve timing uncertainty and avoid fabricated exact ordering. |
| Duplicate provider delivery | Apply idempotency strategy and preserve collision diagnostics. |
| Segment loss or corruption | Mark gap/corruption; do not silently synthesize missing evidence. |
| Object storage unavailable | Follow future bounded-buffer policy only if separately authorized; otherwise stop durable capture. |
| Classification unresolved | Fail closed for durable/external handling where classification is required. |
| Residency or egress conflict | Deny or require review under RuleBook. |
| Retention conflict | Apply stricter applicable requirement and preserve review/hold state. |
| Source expires while derivative remains | Keep explicit unavailable/disposed source state in derivative provenance. |
| Model extraction fails | Preserve source state and extraction failure; do not create an observation from an absent result. |

## 18. Cost and resource model

AEL-001 creates no paid service commitment.

Future feasibility work must measure at least:

- source ingest bytes per unit time;
- object storage by retention tier;
- transcoding or media transformation cost;
- transcription/inference cost;
- embedding/indexing cost where applicable;
- database metadata growth;
- network egress cost;
- retrieval/cache cost;
- local-device compute and power where relevant;
- cost avoided by progressive deprecation and local preprocessing.

Paid providers remain subject to the canonical paid-provider approval and budget controls.

## 19. Integration boundaries

### 19.1 GER

AEL supplies evidence, observations, provenance, temporal scope, missingness, and source lifecycle. GER owns reasoning and epistemic promotion.

### 19.2 Digital Twin and persistent cognition

AEL may supply observed evidence and longitudinal candidates. It cannot directly write inferred identity or durable profile truth. Promotion follows the Digital Twin/GER contract.

### 19.3 Conversation History

Conversation History and AEL share useful temporal/provenance patterns, but AEL is not an alternate conversation archive. Cross-linking must preserve source class and authority.

### 19.4 Moment / shared attention

A future shared-attention capability may consume AEL timing and source references to represent what was being heard, watched, or attended to. AEL-001 reserves the integration boundary but does not establish Moment as an implemented runtime dependency.

### 19.5 Agents and Virtual Employees

Agents may receive AEL observations only within their data, purpose, clearance, tenancy, and authority boundary. Access to an observation does not imply access to the original media. Agent conclusions remain subject to GER and action authority.

### 19.6 Operator Console

A later milestone should expose source health, capture authority state, gaps, retention state, storage/cost measures, denied/reviewed actions, and source-to-observation lineage without exposing sensitive payload by default.

## 20. Missingness scan and costly-to-reverse decisions

The following are deliberately not fixed by AEL-001 because premature commitment would be costly to reverse:

- cloud object-storage vendor;
- camera/home platform vendor;
- navigation/vehicle provider;
- media codec/container;
- streaming transport;
- event bus;
- vector store;
- transcription/model provider;
- biometric/identity provider;
- permanent schema for capture events;
- legal consent workflow for any specific jurisdiction;
- raw-media default retention duration;
- Production region topology.

The architecture fixes only the boundaries that should remain stable across those choices: authority, provenance, temporal uncertainty, epistemic separation, classification, retention/disposition, tenancy, residency/egress, security, and inspectable lifecycle state.

## 21. Successor milestone sequence

The dependency-valid successor path is:

1. **AEL-002 Synthetic Event Envelope and Local Simulator**: implement the logical event model using synthetic data only, with no personal capture.
2. **AEL-003 Governed Capture Authority Preflight**: implement Test-only authority evaluation and fail-closed decision evidence.
3. **AEL-004 Single-Source Bounded Test Adapter**: use a synthetic source or an explicitly authorized local test source with no Production activation.
4. **AEL-005 Multi-Source Temporal Synchronization**: prove clock uncertainty, duplicates, gaps, and cross-source reconstruction.
5. **AEL-006 GER Episodic Handoff**: prove observation-to-GER lineage without inference laundering.
6. **AEL-007 Retention and Deprecation Lifecycle Proof**: prove progressive disposition, derivative lineage, hold precedence, and deletion receipts with synthetic fixtures.
7. **AEL-008 Operator Console Ambient Operations**: expose bounded health, authority, lifecycle, cost, and provenance projections.
8. **AEL-009 Bounded Live Pilot Readiness**: perform provider, security, privacy, legal, cost, and human-authority review before any real-world pilot. Production remains separately C4-governed.

Vendor adapters for camera/home, navigation, vehicle, wearable, or other providers should be separate issues under the appropriate AEL milestone so provider-specific permissions and risks remain isolated.

## 22. AEL-001 acceptance boundary

AEL-001 is complete when:

- this architecture exists in the canonical repository;
- capture authority is separately specified and references current RuleBook controls;
- the source-neutral temporal event contract is defined;
- source evidence, observation, inference, conclusion, identity/profile promotion, decision, and action remain distinct;
- current retention, residency, classification, and governance substrates are reused by reference;
- privacy, security, bystander, sensitive-inference, failure, recovery, and cost boundaries are explicit;
- no live recording, Production activation, paid provider commitment, or biometric identity capability is enabled;
- provenance and verification evidence are preserved under issue #416 and the AEL-001 Durable RunBook lane.

## 23. Production boundary

AEL-001 is architecture only. It does not authorize Production changes, live capture, collection of personal media, cross-jurisdiction transfer, identity/biometric processing, new paid services, or provider deployment. Those transitions require the applicable future milestone and authority decision.