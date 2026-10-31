# TK-010 - Continuity Compatibility Gates and As-Of Reconstruction

Status: Accepted implementation  
Capability: ThreadKeeper  
Issue: #307  
Accepted PR: #314  
Merge commit: `189ef1ef9a273564db3a187d5573aa8d0b81acb5`  
Production activation: false  
Schema change: none in this slice

## 1. Purpose

TK-010 protects long-running CoMind work from unsafe resumption after RuleBook, policy, schema, tool, provider, or runtime contracts change. It also provides deterministic historical reconstruction of accepted continuity state from integrity-protected checkpoint lineage.

ThreadKeeper does not infer compatibility from version numbering and does not execute migrations, reconfiguration, replay, or resumed work.

## 2. Compatibility manifests

A `ContinuityCompatibilityManifest` is a compact, evidence-backed description of external contracts relevant to one continuity checkpoint.

Each referenced contract contains:

- contract kind: RuleBook, policy, schema, tool, provider, or runtime;
- opaque contract reference;
- exact version reference;
- whether the contract is required for safe continuation;
- evidence references establishing the observed version;
- source reference owned by the external system.

The manifest duplicates no canonical contract body. Contract identities are unique within a manifest and the manifest carries a deterministic integrity digest.

## 3. Compatibility rules

Version syntax carries no compatibility semantics.

For example, ThreadKeeper does not assume that `v7 -> v8`, `1.2 -> 1.3`, or a patch-level change is safe. A changed contract is compatible only when an explicit evidence-backed rule says so.

Rules bind an exact:

`contract kind + contract ref + from version + to version`

and classify that transition as:

- `CONTINUITY_COMPATIBLE`
- `REVALIDATION_REQUIRED`
- `MIGRATION_REQUIRED`
- `INCOMPATIBLE`

Every rule must be asserted through `explicit_evidence`, carry evidence provenance, and have a current/retired lifecycle. Migration and revalidation rules must include at least one action reference describing the governed next step. Rules do not perform that action.

Multiple current rules for the same exact transition are ambiguous and fail closed.

## 4. Evaluation policy

The evaluator compares a source manifest from the accepted work context to a current environment manifest.

Default rules are conservative:

- unchanged exact version: compatible;
- changed version with one current explicit rule: use the rule disposition;
- changed version with no rule: revalidation required;
- required source contract missing from the current environment: incompatible;
- optional source contract removed: revalidation required;
- new required current contract: revalidation required;
- new optional current contract: compatible unless another rule makes it consequential.

The overall result uses the strongest required disposition:

`INCOMPATIBLE > MIGRATION_REQUIRED > REVALIDATION_REQUIRED > CONTINUITY_COMPATIBLE`

The report preserves per-contract reasons, rule IDs, evidence references, action references, source/current manifest digests, and ruleset digest.

ThreadKeeper makes no migration, provider, RuleBook, schema, policy, or tool change from this result.

## 5. Historical as-of reconstruction

TK-010 reconstructs accepted continuity state from a supplied ordered history of TK-008 `ContinuityCapsule` records.

History must:

- contain only valid integrity-protected capsules;
- represent one semantic continuity scope;
- contain unique accepted checkpoints;
- form a direct parent-to-child accepted checkpoint lineage;
- increase chronologically.

`reconstructContinuityAsOf` returns the latest accepted checkpoint whose checkpoint acceptance and capsule issuance had both occurred by the requested timestamp.

This distinction prevents later-created continuity metadata from being projected backward into a time when it did not yet exist.

The reconstructed state includes:

- checkpoint and predecessor identity;
- accepted and issued timestamps;
- capsule expiry and digest;
- continuity digest and lineage;
- unresolved case references;
- objective, decision, assumption, obligation, prohibition, open-question and evidence references;
- authority/policy references;
- sensitivity and retention class.

No source payload is copied or reconstructed beyond what the governed capsule preserved.

## 6. Expiry semantics

Historical reconstruction and live usability are different questions.

A capsule that later expired may still be valid historical evidence of the accepted state that existed at a prior time. Therefore historical integrity verification does not discard an expired capsule.

The result separately reports `contextUsableAtAsOf`:

- true only when the selected capsule had been issued and had not yet expired at the requested timestamp;
- false when the state is historically reconstructable but the original capsule was no longer valid for a live handoff at that time.

Historical reconstruction never revives expired authority or context.

## 7. Exact checkpoint reconstruction

`reconstructContinuityAtCheckpoint` reconstructs one accepted checkpoint from the same validated lineage. This is read-only and preserves the protected continuity references associated with that checkpoint.

A missing checkpoint returns an explicit no-state result rather than guessing or falling back to a nearby checkpoint.

## 8. Ownership boundaries

TK-010 does not own:

- RuleBook content or authority;
- policy approval;
- schema migration;
- provider configuration;
- tool deployment;
- runtime deployment;
- Conversation History event storage;
- Foundry execution/replay;
- source contract versioning;
- historical source-system mutation.

It consumes references and explicit compatibility evidence only.

## 9. Failure posture

The system fails closed when:

- manifests or rulesets fail integrity validation;
- contract identities are duplicated;
- evidence is missing;
- compatibility is inferred rather than explicitly evidenced;
- multiple current rules claim the same exact transition;
- a required source contract disappears;
- compatibility manifests refer to different continuity scopes;
- historical capsule lineage is tampered, discontinuous, duplicated, cross-scope, or chronologically invalid.

Unknown changed versions produce `REVALIDATION_REQUIRED`, not guessed compatibility.

## 10. Acceptance

Repository acceptance requires:

1. deterministic manifest/ruleset integrity;
2. no compatibility inference from semantic version shape;
3. explicit evidence rules proven for compatible, migration, revalidation, and incompatible outcomes;
4. conservative missing/new contract behavior;
5. rejection of inferred, ambiguous, unevidenced, or unactionable rules;
6. deterministic as-of reconstruction with issue-time boundary;
7. historical state remains reconstructable after expiry while live-context usability remains false;
8. exact-checkpoint reconstruction preserves protected continuity references;
9. tampered/discontinuous/cross-scope histories fail closed;
10. TK-008/TK-009 and broad server regression suites remain green;
11. exact-head CI passes;
12. no schema/RLS/grant/Production mutation.
