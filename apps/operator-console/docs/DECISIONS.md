# OC-001 decision record

## D-001 Keep Operator Console inside CoMind

Decision: implement under `apps/operator-console` rather than create a separate repository.

Reason: the console is initially a CoMind operational capability and needs close provenance with CoMind schema/governance work. The subsystem boundary preserves future extraction.

Revisit when: release lifecycle, ownership/security boundary, or non-CoMind reuse materially diverges.

## D-002 Separate browser reads from privileged metadata

Decision: browser row access uses a publishable key and remains RLS-bound. Rich PostgreSQL metadata discovery uses a separately protected server provider.

Reason: schema catalog access and future administration have different trust requirements from ordinary row reads.

## D-003 Fail closed until metadata provider is verified

Decision: `/api/schema` returns 503 rather than fake metadata or privileged browser fallback.

Reason: incomplete relationship metadata would undermine cascade and relational correctness, while browser privilege escalation would violate the security boundary.

## D-004 No live Supabase mutation in OC-001

Decision: do not create metadata RPCs, views, grants, or other live database objects as an implicit implementation detail.

Reason: production database mutation requires separate authorization and isolated verification under CoMind governance.
