# OC-001 threat model

## Protected assets

CoMind relational data, schema metadata, database credentials, authorization policy, and provenance.

## Primary threats

- Privileged key leakage into browser bundles.
- RLS bypass through secret/service-role use in client code.
- Unsafe dynamic identifiers in relation/filter/sort requests.
- Incomplete FK metadata producing incorrect relationship or future cascade decisions.
- Confusing an RLS-denied result with an empty relation.
- Introducing destructive behavior before impact analysis exists.

## OC-001 mitigations

- Public-prefixed privileged configuration fails closed.
- Browser uses publishable-key client only.
- Identifier validation precedes dynamic read construction.
- Schema graph rejects FKs referencing undiscovered relations.
- Access-state/error model distinguishes policy denial from empty results.
- Mutation, cascade execution, raw SQL, and privileged browser access remain disabled.

## Residual risk

Live metadata discovery and live read behavior are not yet verified. They remain disabled until provider implementation and execution evidence exist.
