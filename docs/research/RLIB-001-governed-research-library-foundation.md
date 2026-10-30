# RLIB-001: Governed Research Library Foundation

Status: Engineering candidate
Production activation: false
Issue: https://github.com/jlhogarth/CoMind/issues/360
Research session: `RLIB-001-STANDARDS-20261030`
Research session ID: `fe8f95fc-aed5-4a03-bef9-126457bc3dd5`
Drive collection: `03_Research/Research/External Standards & Guidance`
Drive folder ID: `1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz`

## Purpose

RLIB-001 turns the existing `comind.cm_research_refs` bookmark table into the canonical governed Research Library reference layer. It does not create another document store. Google Drive remains the durable human-facing file location, the Research Source RunBook remains the human-readable research ledger, and `comind_pm` remains the governed write-through research-session/evidence substrate.

The Library adds authority, version, lifecycle, supersession, Drive identity, fingerprint semantics, freshness, source lineage, capability relationships, and learning-path composition to the existing reference record.

## Architecture

### Canonical research record

`comind.cm_research_refs` remains the single canonical reference table. RLIB-001 adds:

- publisher and document identifier;
- source kind and authority level;
- lifecycle state;
- version label and publication date;
- Drive file, folder, URL, MIME type, and byte-size observations;
- raw file SHA-256 field and separately scoped observed-fingerprint fields;
- ingestion, verification, and freshness dates;
- self-referential supersession;
- governed research-session and source-link lineage;
- related CoMind capabilities;
- extensible metadata.

Raw `content_sha256` means SHA-256 of the original bytes. It must remain null unless those bytes were actually hashed. Drive identity, byte size, extracted text, or another observation may be stored separately but may not be represented as raw-file SHA-256.

### Lifecycle

Allowed lifecycle states are:

- `candidate`
- `current`
- `superseded`
- `withdrawn`
- `retired`
- `historical`
- `rejected`

Ordinary API deletion now retires a record instead of physically deleting research provenance. Destructive purge is not part of the ordinary Research Library API.

### Authority

Allowed authority classifications are:

- `official_standard`
- `primary_authoritative`
- `secondary_guidance`
- `internal_canonical`
- `community`
- `unverified`

An implementation guide about a standard is not equivalent to the standard. RLIB-001 proved this rule with the downloaded GSDC ISO 42001 checklist, which is classified as secondary guidance rather than ISO normative text.

### Supersession

A predecessor record points to its replacement using `superseded_by_ref_id`. The predecessor remains durable.

The first real case is:

`NIST AI 600-1 Initial Public Draft` -> `NIST AI 600-1 Final`

The withdrawn draft itself states that it was withdrawn on July 26, 2024 and superseded by the final NIST AI 600-1 publication.

### Learning paths

`comind.cm_learning_path` and `comind.cm_learning_path_item` provide ordered educational compositions over canonical research records. A learning path never copies or owns the underlying source. This permits one standard to appear in multiple curricula without creating duplicate truth.

The first production candidate curriculum is intentionally deferred to RLIB-003 so it can consume the accepted VE-STD-001 crosswalk and the accepted RLIB records without colliding with the active VE standard lane.

## First governed corpus

Five Drive records establish the initial corpus:

| Document | Authority | Lifecycle | Freshness |
| --- | --- | --- | --- |
| NIST AI RMF 1.0 / NIST AI 100-1 | primary_authoritative | current, revision in progress | review due 2026-11-30 |
| NIST AI RMF Playbook | primary_authoritative | current, update expected after AI RMF revision | review due 2026-11-30 |
| NIST AI 600-1 Initial Public Draft | primary_authoritative | withdrawn | superseded by final |
| NIST AI 600-1 Final | primary_authoritative | current | review due 2027-01-30 |
| GSDC ISO 42001 Implementation Checklist | secondary_guidance | candidate | review due 2027-01-30 |

NIST currently states that AI RMF 1.0 is being revised and that the Playbook will update after the framework revision. The Library therefore treats currentness and freshness as different concepts.

## Evidence integration

The five corpus records link to:

- governed research session `RLIB-001-STANDARDS-20261030`;
- write-through `comind_pm.pm_links` source records;
- Google Drive source copies;
- the `CoMind Research Source RunBook` projection;
- authoritative publisher URLs where available.

The research session completed only after 23 source records were captured and the Drive projection was marked synced.

## Security boundary

RLIB-001:

- grants no browser access to private research tables;
- revokes direct `PUBLIC`, `anon`, and `authenticated` table privileges;
- uses SECURITY INVOKER update triggers with fixed search paths;
- creates no new public RPC;
- adds no provider credentials;
- adds no paid API authority;
- does not activate Production.

## Failures preserved

1. A Drive revision read using revision ID `1` returned 404. The connector-supported `head` revision path was then used successfully.
2. The first corpus upsert returned PostgreSQL `42P10` because the conflict target did not include the predicate of the partial unique Drive-file index. No seed rows were committed. The corrected upsert uses `ON CONFLICT (drive_file_id) WHERE drive_file_id IS NOT NULL`.
3. Supabase Security Advisor exposed pre-existing search-path drift on `comind.set_updated_at_research_refs`. RLIB-001 added a dedicated hardening migration and verified fixed `search_path` plus SECURITY INVOKER semantics.

## Successor sequence

1. RLIB-002: governed `Saved from Chrome` intake chute.
2. RLIB-003: first Virtual Employee Standards Learning Path.
3. Later Console work may project Library and learning state through the existing CoMind Home navigation once active Console lanes reconcile. No parallel Console surface should be created.
