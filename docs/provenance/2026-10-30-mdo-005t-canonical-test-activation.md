# MDO-005T Canonical Test Activation Provenance

Date: 2026-10-30
Issue: #411
Parent milestone: MDO-005 / PR #410
Environment: canonical Supabase Test only
Production: unchanged
Paid provider execution: none
Implementation activation: not authorized

## Purpose

Activate the already merged MDO-005 governed module-maturity contract in canonical Test and prove one exact `conceived -> specified` transition for the accepted MDO Test plan without authorizing implementation.

## Authority

Standing L4A authorization: `a4d3728d-62a2-4f4f-bb4c-f40486984f76`.

Issue #126 durable history records that the historical PR #119 shared-schema reservation was reassigned and later released. A fresh collision scan found no newer shared-Test mutation owner and the canonical RunBook blocker view returned zero rows. MDO-005T claimed the sole bounded shared-Test mutation lane in Issue #411 comment `6528064750`.

The lane is bounded to Test DDL for merged MDO-005 migration `_029`, exact security and structural readback, bounded synthetic C2 Test authority, negative control proofs, one successful `conceived -> specified` transition, exact replay proof, side-effect verification, and durable evidence capture.

## Freshness blocker and repair

Immediately before the first Test DDL, `main` advanced through CFR-002 PR #388 and exposed a duplicate repository migration slot at `_026`. MDO-005T failed closed before mutating Test.

CFR-002R Issue #418 and PR #419 repaired the unapplied CFR migration by moving it to `_030`. A latent malformed CFR verification fixture was also repaired after an exact-head CI failure exposed it. The CFR migration SQL remained byte-identical.

PR #419 merged only after all 26 exact-head checks passed. Merge commit: `07e1f02d32c241fe30b50abeedb674aea7c1afbe`.

Post-merge repository namespace:

- `_026`: MDO-004 governed plan disposition
- `_027`: SEC-RLS-001 current schema hardening
- `_028`: RLIB-003 VE standards learning path
- `_029`: MDO-005 governed module maturity
- `_030`: CFR-002 dual acquisition foundation

No duplicate migration slots remain.

## Canonical Test pre-mutation state

Accepted plan: `2b7a4901-48de-45b4-9023-5e37b73da8ac`

Project: `e9e96ac1-bdf7-4a97-a94f-ddf16218a2cb`

Module: `d371d297-34a0-4150-8a32-64b3aae77594` (`MDO3-TEST`)

Plan status: `accepted`

Plan target: `specified`

Module status: `enabled`

Module lifecycle stage: `conceived`

MDO-004 acceptance event: `5d54d616-fcf2-40d4-a13b-b369bc49954f`

MDO-004 human actor: `4ce4eef8-18f3-484e-bfc0-6938301bd722`

Acceptance evidence: `cb9c5e9a-4517-496a-98ef-85e9c73a89fd`

Before activation, canonical Test contains MDO-004 and SEC-RLS-001 migration history but does not contain MDO-005 or CFR-002. The MDO-005 lifecycle tables and transition function are absent. RunBook open blocker count is zero.

## Locked MDO-005 repository artifacts

Migration: `db/migrations/20261030_029_mdo_005_governed_module_maturity.sql`

Git blob: `97036e15facf511b6473077021871400dbd8d8ba`

Structural verification: `db/migrations/verify_20261030_029_mdo_005_governed_module_maturity.sql`

Git blob: `da9c5e08f961e00fab260104685d1586f7a68786`

Behavior verification: `db/migrations/verify_20261030_029_mdo_005_behavior.sql`

Git blob: `a04d7f16f3a59f08933162e99f91e226bd4d8401`

## Pre-transition side-effect baseline

- project tasks: 40
- outbound project task links: 0
- inbound project task links: 0
- accepted-plan tasks: 10
- accepted-plan work leases: 10
- project execution contexts: 14
- accepted-plan contributions: 10
- contribution evidence links: 10

These counts must remain unchanged by MDO-005T maturity acceptance.

## Next operation

Immediately recheck `main`, migration namespace, live migration history, RunBook blockers, accepted-plan state, and absence of MDO-005 objects. If still clean, apply the exact merged `_029` migration to canonical Test only. Independent readback must pass before any maturity-transition DML.
