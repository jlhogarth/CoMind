# OC-001 governance record

## Tier

T1 Reversible development.

## Justification

The milestone changes repository content on an isolated feature branch and establishes read-only application contracts. It does not authorize production deployment, live schema mutation, destructive database behavior, paid-provider execution, or consequential external writes.

## Resources and identities

Affected repository resource: `jlhogarth/CoMind`, Issue #112 feature branch. Intended database resource: CoMind Supabase/PostgreSQL, read-only for OC-001. No privileged runtime agent identity is introduced by this milestone.

## Authorization boundary

Repository development is authorized. Live Supabase mutation remains outside OC-001. Privileged credentials remain server-only and are not supplied by this change.

## Dependencies

OC-001 depends on a future least-privilege metadata provider to satisfy live schema discovery. The console fails closed until that provider exists.

## Failure and recovery

Repository changes can be abandoned by closing the PR and deleting the feature branch after confirming no active work depends on it. Database permission failures remain visible and do not trigger privilege escalation.

## Evidence

See `OC-001-EVIDENCE.md` and the Operator Console CI workflow. Acceptance requires actual test, typecheck, build, and CI evidence, not the presence of test source alone.

## Standards traceability

Architecture is informed by ISO/IEC 42001 governance traceability, ISO/IEC 23894 risk-management principles, NIST AI RMF, NIST SP 800-53 least-privilege concepts, and OWASP security guidance. This record does not claim certification, conformity, or complete control coverage.

## Cost and latency

No paid model/API call is introduced. Runtime database cost is limited to ordinary metadata/read traffic once a live provider is authorized and configured.
