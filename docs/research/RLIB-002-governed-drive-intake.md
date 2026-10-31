# RLIB-002: Governed Drive Research Intake Chute

Status: Engineering candidate
Production activation: false
Issue: https://github.com/jlhogarth/CoMind/issues/362
Predecessor: RLIB-001, merged in PR #361

## Purpose

RLIB-002 turns the existing Google Drive `Saved from Chrome` folder into a governed research intake chute. A founder or authorized employee can place a useful document there. CoMind records the detection, fingerprints the original bytes, checks the canonical Research Library for exact duplicates, evaluates potential version relationships separately, proposes classification and destination, preserves provenance, and allows only deterministic authorized moves.

The intake chute is a staging control, not a second research library. `comind.cm_research_refs` remains canonical.

## Bounded Drive topology

Intake folder:
- Name: `Saved from Chrome`
- Drive folder ID: `18I-qJ-MW40PybsxIkMbVo_hibh-3LgxG`

Default governed standards destination:
- Collection: `03_Research/Research/External Standards & Guidance`
- Drive folder ID: `1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz`

The source configuration is Test-only, `production=false`, enabled, automation-eligible, and limited to a minimum 60-minute polling interval.

## Governing rules

1. Exact duplicate means raw-byte SHA-256 equality with a canonical `cm_research_refs` record.
2. Drive ID, filename, byte size, extracted text, or semantic similarity cannot prove exact duplication.
3. A different SHA-256 does not establish a newer version.
4. Potential version or supersession relationships require document identifiers, publication/version metadata, or authoritative-source evidence.
5. Ambiguous classification or unavailable strong fingerprint fails closed. The file remains in intake and is reported as blocked.
6. Exact duplicates are not promoted into second canonical research records.
7. Real duplicate downloads are not silently deleted. Duplicate cleanup requires a separately governed decision. The only deleted duplicate in RLIB-002 acceptance was a synthetic copy created specifically for the reversible test.
8. Intake lifecycle evidence is append-only.
9. Production activation remains separately governed.

## Data model

### `cm_research_intake_source`

Registers an explicitly bounded Drive intake source, its authorized default destination, environment, production state, enablement, automation authority, polling floor, and governance metadata.

### `cm_research_intake`

Holds current governed state for one detected Drive file, including:
- Drive identity and observed metadata;
- raw SHA-256 and fingerprint status;
- exact-duplicate relationship;
- separate version-candidate relationship and version assessment;
- proposed source kind, authority, lifecycle, tags, capabilities, destination, confidence, and evidence basis;
- blocked reason and lifecycle timestamps;
- optional research-session and source-link lineage.

### `cm_research_intake_event`

Append-only evidence for detection, redetection, fingerprint success/failure, exact-duplicate finding, no-match finding, version-candidate proposal, classification proposal, move readiness, movement, blocking, rejection, failure, and synthetic cleanup.

## Lifecycle

Normal non-duplicate path:

`detected -> fingerprinted -> classification_proposed -> ready_to_move -> moved`

Exact duplicate path:

`detected -> exact_duplicate`

Blocked and failed states are available from the applicable stages. `cleaned_up` is retained for explicit governed cleanup evidence, not used as an automatic duplicate policy.

## Live Test acceptance

A reversible synthetic acceptance copy of the already governed final NIST AI 600-1 was created in `Saved from Chrome`.

Synthetic Drive file ID:
`1Atx_hZEGj53CT1of7rNbfRvxg6W7FkIV`

Intake ID:
`230a3729-0ae9-4666-afcf-c539f1e3a1c4`

Computed raw SHA-256:
`6e73620ab6b64e90ef2c04bf0e0d6246185a2f4b1b13cab0df494496cff89b6a`

Canonical matching Research Library record:
`cc780384-afcb-4708-9181-5db869b57887`

The computed fingerprint matched the one canonical final NIST AI 600-1 record. The intake control set `version_assessment=exact_duplicate`, linked the candidate to the canonical record, created no second `cm_research_refs` row, and left the authoritative governed Drive file unchanged.

Preserved event sequence:
1. `detected`
2. `fingerprint_verified`
3. `exact_duplicate_found`
4. `cleaned_up`

The synthetic copy was deleted only after evidence had been preserved because it existed solely for acceptance testing. The intake record and event history remain durable.

## Preservation verification after branch recovery

On 2026-10-30, after significant concurrent repository progress, live Supabase verification confirmed:
- RLIB-001 research session `fe8f95fc-aed5-4a03-bef9-126457bc3dd5` remains `complete`;
- all five first-corpus Research Library records remain;
- all five retain verified raw SHA-256 fingerprints;
- the NIST Initial Public Draft to final supersession relationship remains;
- RLIB-002 acceptance intake remains `cleaned_up`;
- all four acceptance events remain.

No recovery step depended on conversational recollection for these facts.

## Freshness and collision recovery

The RLIB-002 branch was originally stacked on an earlier RLIB-001 head. While RLIB-002 was paused, `main` advanced substantially through other accepted lanes, including DRULE-005 shared operational authority.

Freshness review found no changes to the three RLIB-002 intake files on current `main`, but the branch was stale. The lane was reconciled using a real two-parent merge that preserved both histories rather than force-resetting the branch.

Reconciliation commit:
`48ed56a93889ac7f47298b0bbc2b6164cee62e63`

After reconciliation the branch was zero commits behind the then-current `main` and differed only in the intended RLIB-002 files.

Several preliminary Git-data merge probes created unreferenced commits while reconstructing the merge tree. No branch ref was moved to them, no source commit was lost, and the final branch ref was advanced only after the correct combined tree was verified. Those orphaned probes are preserved as failure/correction evidence rather than represented as successful reconciliation.

## PostgreSQL portability

RLIB-001 exposed an isolated PostgreSQL portability issue when SQL assumed Supabase-specific `anon` and `authenticated` roles existed. RLIB-002 applies the corrected pattern from the start:
- revoke `PUBLIC` privileges unconditionally;
- revoke Supabase browser-role privileges only when those roles exist;
- preserve the same deny-by-default security posture in Supabase and plain PostgreSQL 17.

The intake tables and functions remain server-side. No new public RPC or browser grant is created.

## Historical LF-3 fixture preservation

The LF-3 readiness test intentionally reconstructs an accepted historical pre-migration-007 shape. RLIB-002 does not alter that historical invariant. Its disposable fixture removes the three later intake tables before measuring the historical 94-table / 19-RLS state:
- `cm_research_intake_event`
- `cm_research_intake`
- `cm_research_intake_source`

Expected LF-3 counts and security assertions remain unchanged.

## Security Advisor review

A post-DDL Supabase Security Advisor run reported no new RLIB intake-specific warning. Existing findings in unrelated subsystems remain outside this lane and must be handled by their owning controls rather than silently broadened into RLIB-002.

Relevant Supabase advisor references:
- RLS enabled without policy: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Mutable function search path: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- Anonymous SECURITY DEFINER execution: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Authenticated SECURITY DEFINER execution: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Acceptance boundary

Before RLIB-002 is accepted:
1. open the one-issue/one-branch/one-PR candidate;
2. run exact-head repository workflows against current `main`;
3. repair causal failures without weakening controls;
4. re-run live preservation and security checks if the candidate changes materially;
5. perform final freshness/collision reconciliation;
6. merge only on accepted exact-head evidence.

The scheduled intake detector is intentionally activated only after the accepted RLIB-002 implementation becomes canonical. This avoids an automation depending on unmerged repository behavior.

## Successor

RLIB-003 will create the first Virtual Employee Standards Learning Path from accepted canonical Research Library records and the current accepted VE engineering/governance standard. The learning path will reference source records rather than duplicate documents.