# AEL-001 Capture Authority Contract

Status: architecture contract
Issue: #416
Environment: Development architecture
Production authority: false
Runtime enforcement implemented by AEL-001: false

## 1. Purpose

This contract defines the governance information a future Ambient Experience Layer, AEL, runtime must resolve before consequential capture, durable ingestion, processing, retrieval, external disclosure, or disposition of ambient audio, video, location, vehicle/navigation, device, wearable, sensor, or comparable observational data.

It is a design contract, not a deployed authorization gate. AEL-001 does not create a recording capability or assert legal sufficiency for any jurisdiction or use case.

## 2. Governing principle

**Connectivity is capability, not authority.**

A device connection, OAuth grant, API permission, account ownership, physical possession of a sensor, or ability to retrieve a stream does not by itself authorize CoMind to capture, retain, analyze, identify, disclose, or permanently learn from that stream.

Capture authority must be independently established and bound to the intended purpose and scope.

## 3. Relationship to existing CoMind governance

This contract composes, rather than replaces, the RuleBook and authority systems.

Applicable controls include:

- DRULE-C07 Episodic Edit and Selective Forget;
- DRULE-C11 Prompt Injection and Exfiltration;
- DRULE-C13 Network and Egress Control;
- DRULE-C17 Multi-Tenancy and Isolation;
- DRULE-C19 Export, Portability and Data Residency;
- DRULE-C24 Fairness, Bias and Sensitive Use;
- DRULE-C27 Research, Logging and Privacy;
- existing data-classification, retention, residency, secret-handling, authority, evidence, and Production controls.

A future AEL runtime must use the common RuleBook preflight instead of cloning these controls into a separate policy engine.

## 4. Logical capture-authority object

A future machine-addressable authority object should resolve at least the following fields.

| Field | Meaning |
| --- | --- |
| `authority_id` | Stable identifier for the governed authority decision. |
| `authority_holder_ref` | Human or governed authority actor responsible for the grant. |
| `authority_basis` | Evidence or policy basis supporting the grant. |
| `subject_scope` | Primary person, asset, space, device, or source to which the grant applies. |
| `source_scope` | Specific source identifiers or governed source class. |
| `tenant_id` / `project_id` | Isolation boundary for the data and operation. |
| `modalities` | Audio, video, location, sensor, navigation, device state, or other allowed modalities. |
| `location_scope` | Bounded location/environment condition where material. |
| `purpose` | Explicit authorized use. |
| `bystander_policy_ref` | Handling rule for incidental third parties or unrelated data. |
| `classification` | CoMind data-classification level or rule for deriving it. |
| `retention_profile_ref` | Applicable canonical retention profile. |
| `residency_profile_ref` | Applicable canonical residency policy. |
| `identification_policy` | Whether identity/biometric processing is prohibited, review-required, or separately authorized. |
| `processing_policy` | Permitted local, CoMind-hosted, or external processing classes. |
| `agent_access_policy` | Authorized roles/agents and whether originals or only derivatives are accessible. |
| `egress_policy_ref` | Allowed destinations/purposes or RuleBook destination decision. |
| `disclosure_policy_ref` | External sharing/export boundary. |
| `disposition_authority_ref` | Actor/process allowed to change retention or dispose of material. |
| `effective_at` | Start of authority validity. |
| `expires_at` | End of authority validity where applicable. |
| `revocation_state` | Current revocation/suspension state. |
| `evidence_refs` | Inspectable references supporting the decision. |
| `conditions` | Additional bounded requirements that do not fit another field. |

The object may be implemented through existing RuleBook and authority substrates rather than as a dedicated table. AEL-001 intentionally does not prescribe a physical schema.

## 5. Required decision context

Before consequential capture or provider execution, a future preflight should resolve:

- operation type;
- source and source class;
- modality;
- intended purpose;
- tenant/project scope;
- subject and location/environment scope where material;
- current capture-authority decision;
- classification;
- retention profile;
- residency profile;
- external destination if any;
- identification/biometric state;
- requesting actor/agent and clearance;
- required human approval state;
- relevant hold, revocation, exception, or incident state.

Raw media and secret credentials are not preflight context unless a specific control genuinely requires content-level inspection through a separately governed path. Ordinary governance evidence should remain metadata-focused.

## 6. Decision outcomes

The future authority evaluator should use explicit outcomes compatible with the RuleBook operating model.

### ALLOW

The operation is within current authority and applicable controls.

### DENY

A hard constraint prohibits the operation. The denial should preserve a non-sensitive machine reason and applicable authority/control references.

### REVIEW

A human or separately authorized reviewer must resolve a condition before execution.

### AUTH_REQUIRED

No applicable authority record can be resolved.

### SCOPE_REQUIRED

Authority exists but source, modality, location, tenant/project, purpose, or destination scope is incomplete or does not match.

### EXPIRED

The applicable authority has expired.

### REVOKED

The applicable authority has been revoked or suspended.

### HUMAN_CONFIRMATION_REQUIRED

The platform or CoMind governance requires an explicit human confirmation that the runtime cannot substitute.

Unknown or malformed context fails closed for consequential capture, durable ingestion, external processing, or disclosure.

## 7. Authority is operation-specific

A single grant must not be interpreted as universal permission.

The following are distinct operations and may require different authority:

1. opening or buffering a source;
2. durably retaining original media;
3. creating a transcript or derivative;
4. extracting structured observations;
5. sending content to an external model/provider;
6. identifying a person;
7. inferring sensitive attributes or behavior;
8. exposing an original to an Agent or Virtual Employee;
9. exposing only an observation/summary to an Agent or VE;
10. exporting or sharing material externally;
11. promoting a derived claim into Digital Twin state;
12. extending retention;
13. deleting or otherwise disposing of material.

Authority for one operation does not imply authority for another.

## 8. Modality separation

Audio, video, location, navigation, device state, and other modalities must be separately enumerable so an authority grant can enable only what is necessary.

For example, an authorized navigation-context use does not silently authorize microphone capture. A video source does not silently authorize audio if the purpose requires video only. Purpose minimization should prefer the smallest modality set that achieves the authorized objective.

## 9. Bystander and incidental-data boundary

Ambient capture can include people, screens, conversations, locations, documents, devices, and activities outside the primary subject scope.

The authority object therefore requires a bystander/incidental-data policy. A future implementation may support policies such as:

- no incidental third-party retention;
- local transformation/redaction before durable storage;
- bounded transient handling only;
- restricted original access;
- purpose-limited derivative retention;
- review-required handling for a defined context.

The exact policy must come from applicable governance and current legal/privacy review. AEL does not infer that device ownership establishes rights over every person or data item the device can capture.

## 10. Identification and biometric boundary

The default AEL state is:

`identification_policy = disabled`

This means a capture source may produce authorized non-identifying evidence or observations, but the system must not silently perform or request person identification, face recognition, voice recognition, biometric-template generation, re-identification, emotion inference, or comparable sensitive identity processing.

Any future enabling of such processing requires a separate milestone and governance decision. The review must address at least purpose, necessity, subjects, bystanders, provider, data classification, retention, access, jurisdiction, threat model, testing, correction/challenge process, and Production authority.

## 11. Sensitive inference boundary

Even when capture itself is authorized, a technically possible inference may remain prohibited or review-required.

AEL supplies evidence and observations. GER and applicable sensitive-use controls govern whether CoMind may infer a sensitive condition, trait, identity, motive, behavior pattern, or other higher-order proposition.

An inference must never be back-written into the raw observation record as though it was directly captured.

## 12. Classification and logging

The future runtime must bind canonical classification before durable or external handling when required.

Current CoMind classification behavior includes stronger encryption, purpose, logging, and external-transfer constraints at higher classifications. AEL uses that canonical model rather than defining its own labels.

Ordinary logs should store operational metadata, authority decision identifiers, source/event identifiers, error codes, lifecycle transitions, and evidence handles. They should not duplicate raw media, transcripts, precise location traces, or other sensitive payload unless a separately governed logging use requires it.

## 13. Retention and disposition authority

Capture authority must bind a canonical retention profile or an explicitly non-durable future buffer state.

A model-generated salience score cannot independently extend retention.

Retention changes, promotion to durable evidence, selective forgetting, legal/evidence holds, and hard deletion follow DRULE-C07 and the canonical retention substrate. Existing hold precedence and disposition-authority requirements remain in force.

Deletion must not create false history. When a source artifact is disposed but a permitted derivative remains, the derivative retains an explicit source-unavailable/disposed lineage state.

## 14. Residency and egress

External storage, external inference, export, cross-region movement, cross-jurisdiction movement, or provider-side processing are governed egress decisions.

A future source integration must declare its destination and processing topology sufficiently for RuleBook to evaluate destination, classification, tenancy, purpose, residency, and required review.

A provider's managed OAuth or API permission is not a residency or egress approval.

## 15. Agent and Virtual Employee access

An Agent or VE must have explicit purpose-appropriate access to AEL material.

Access scopes should distinguish:

- source metadata only;
- structured observations;
- transcripts/selected derivatives;
- bounded clips;
- original media;
- export capability;
- disposition capability.

Access to a derived observation does not imply access to the original. Access to originals does not grant authority to infer identity, disclose externally, or retain beyond policy.

## 16. Revocation and expiry

A future runtime must make revocation and expiry operationally meaningful.

At minimum:

- new capture under revoked/expired authority stops or fails closed according to the approved bounded-buffer policy;
- new external processing/egress stops;
- existing retained data transitions according to its retention/disposition obligations rather than being silently deleted or silently retained;
- outstanding jobs must re-evaluate authority before consequential continuation when feasible;
- audit evidence records the authority transition without storing unnecessary sensitive payload.

Revocation does not authorize destruction of evidence subject to a higher-priority hold.

## 17. Failure behavior

| Condition | Required decision posture |
| --- | --- |
| No authority record | `AUTH_REQUIRED` or deny |
| Authority cannot be matched to source | `SCOPE_REQUIRED` or deny |
| Modality not permitted | deny |
| Purpose absent where required | deny/review according to RuleBook |
| Tenant/project mismatch | deny |
| Authority expired | `EXPIRED` |
| Authority revoked | `REVOKED` |
| Identification disabled but identity processing requested | deny |
| Classification missing where required | deny/review |
| Destination not allowed | deny |
| Residency conflict | deny/review |
| Human approval required but absent | `HUMAN_CONFIRMATION_REQUIRED` or review |
| RuleBook unavailable for consequential action | fail closed |
| Platform confirmation required | preserve checkpoint; never bypass |

## 18. Audit evidence

A consequential authority decision should be inspectable without persisting raw chain-of-thought or unnecessary capture content.

Minimum decision evidence should include:

- operation identifier;
- source/source class;
- actor/agent identity;
- authority reference;
- purpose;
- tenant/project scope;
- classification;
- applicable control identifiers;
- outcome and machine reason;
- human approval reference when applicable;
- timestamp;
- provider/destination metadata when relevant;
- result or failure state.

## 19. Human stop boundaries

AEL-001 does not change the standing L4A human stops. In particular, L4A does not authorize:

- Production activation or consequential Production modification;
- destructive Production actions;
- canonical evidence deletion/corruption;
- material security/governance weakening;
- unauthorized credential changes;
- new paid subscriptions/material recurring commitments;
- material departure from approved architecture;
- consequential legal, contractual, regulatory, or corporate commitments;
- separately governed external publication;
- bypass of platform-enforced human confirmation.

A future live ambient pilot also requires a dedicated readiness milestone that resolves privacy, legal, security, provider, cost, and operational boundaries for its actual use case.

## 20. Synthetic acceptance examples

These are design examples only and do not describe real capture.

### Example A: synthetic navigation event

- modality: location/navigation;
- source: synthetic simulator;
- purpose: AEL temporal-envelope Test;
- retention: synthetic fixture policy;
- identification: disabled;
- egress: none;
- expected result: allow under bounded Test authority.

### Example B: microphone request without authority

- modality: audio;
- source: local microphone;
- purpose: unspecified;
- capture authority: missing;
- expected result: `AUTH_REQUIRED`, no consequential capture.

### Example C: authorized video but identity request disabled

- modality: video;
- source: bounded Test fixture;
- capture authority: video processing permitted;
- identification policy: disabled;
- requested operation: identify a person;
- expected result: deny identity operation while preserving the independent video-processing authority boundary.

### Example D: derivative retention extension from salience alone

- source clip: authorized but time-bounded;
- model salience: high;
- separate retention-promotion authority: absent;
- expected result: no automatic extension. Salience may create a review recommendation only.

## 21. Implementation boundary

AEL-001 establishes this logical authority contract only. It creates no database table, capture service, provider integration, stream, microphone/camera permission, identity service, Production rule, or paid provider request.

AEL-003 is the proposed milestone for implementing a Test-only capture-authority preflight after AEL-002 has established the synthetic event envelope.