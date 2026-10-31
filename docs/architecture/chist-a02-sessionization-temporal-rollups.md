# CHIST-A02 Sessionization and Temporal Rollups

**Status:** Implementing v0.1  
**Date:** 2026-10-26  
**Issue:** #235  
**Governance tier:** T1 Reversible development  
**Parent:** `docs/architecture/chist-a01-personal-analytics.md`

## In this document

- [Purpose](#purpose)
- [Why sessionization is policy](#why-sessionization-is-policy)
- [Reference policy](#reference-policy)
- [Evidence model](#evidence-model)
- [Ordering and boundary semantics](#ordering-and-boundary-semantics)
- [Temporal rollups](#temporal-rollups)
- [Local-time projection](#local-time-projection)
- [Security and authority](#security-and-authority)
- [Acceptance](#acceptance)
- [Limitations](#limitations)
- [External references](#external-references)
- [Related artifacts](#related-artifacts)

## Purpose

CHIST-A02 extends the accepted archive-native A01 metric foundation with deterministic sessionization across conversations in one certified Conversation History baseline.

A02 answers factual questions such as:

- which timestamped source messages fall into the same gap-defined session;
- when a session starts and ends;
- how many conversations and messages it spans;
- what UTC hours, days, months, and years contain activity;
- how much timestamped evidence is missing because source messages lack timestamps.

It deliberately does not answer whether a session was creative, productive, focused, healthy, or important. Those are interpretive derivations that may consume A02 evidence later.

## Why sessionization is policy

A source export contains timestamps. It does not contain an objective statement that two messages separated by 29 minutes belong to one human work session while messages separated by 31 minutes belong to different sessions.

The inactivity threshold is therefore derivation policy.

A02 preserves the exact policy key, version, threshold, boundary rule, policy definition hash, source archive hash, import receipt hash, and certification hash used to create a sessionization run.

Different policies may produce different session partitions from the same source evidence without either policy rewriting history.

## Reference policy

The v1 reference policy is `session_gap / 30m-v1`:

- inactivity threshold: 1,800 seconds;
- an exact 1,800-second gap starts a new session;
- the threshold is explicitly an analytics convention, not a psychological boundary.

Two comparison policies are also defined:

- `session_gap / 60m-v1`;
- `session_gap / 120m-v1`.

The 30-minute default is adaptation of established analytics practice rather than an invention specific to CoMind. Google Analytics, Snowplow, and PostHog all document 30-minute inactivity defaults while allowing session timeout configuration.

## Evidence model

### Session policy

`cm_archive_session_policy` stores immutable versioned session semantics.

### Sessionization run

`cm_archive_sessionization_run` is scoped to one certified import-wide baseline and one session policy. It records:

- source archive identity;
- import receipt identity;
- certification identity;
- policy identity;
- source message count;
- timestamped event count;
- excluded untimestamped message count;
- deterministic run identity.

The run is import-scoped because sessions may cross conversation boundaries.

### Session observation

`cm_archive_session_observation` records one deterministic session with:

- ordinal and identity hash;
- start/end timestamps and span;
- gap that opened the session;
- event and conversation counts;
- role counts;
- first and last source conversation/node/message references.

### Session event

`cm_archive_session_event` preserves event-by-event membership. This table is essential provenance for future topic, streak, visualization, and Digital Twin derivations because every session can be reconstructed back to exact source messages.

### UTC rollup

`cm_archive_temporal_rollup` persists deterministic UTC activity buckets at hour, day, month, and year grain.

## Ordering and boundary semantics

Only nodes containing a source message and a preserved `created_at` timestamp participate in sessionization.

Events are ordered by:

1. `created_at`;
2. `source_conversation_id`;
3. `source_node_id`;
4. `source_message_id`.

The source identifiers are deterministic tiebreakers only. They do not imply semantic priority.

For the reference policy, a new session starts when the elapsed time from the immediately preceding ordered event is **greater than or equal to 1,800 seconds**.

Therefore:

- 1,799 seconds remains in the current session;
- 1,800 seconds starts a new session;
- 1,801 seconds starts a new session.

The first event always begins session 1.

Untimestamped source messages remain preserved archive evidence but are excluded from session membership. Their count is explicitly recorded in the run rather than silently interpolated.

## Temporal rollups

UTC is the durable evidence frame for persisted temporal rollups.

Persisted grains are:

- `hour_utc`;
- `day_utc`;
- `month_utc`;
- `year_utc`.

Each rollup contains event, session, conversation, and known-role counts plus a deterministic identity hash.

A rollup is a projection of session events. It is not source evidence.

## Local-time projection

A02 provides `cm_archive_local_hour_distribution(run_id, timezone)` as a read projection for explicit IANA timezone names.

This function supports questions such as "At what local clock hour do I historically interact most?" without altering canonical UTC evidence.

The timezone is an input to the projection and is never inferred from the archive.

For daylight-saving fall-back, repeated local clock hours are intentionally combined because this function returns an hour-of-day distribution. It is not a durable chronological bucket identity.

## Security and authority

A02 reuses the existing Conversation History roles:

- `comind_conversation_history_deriver` may execute the governed session calculator and read derived evidence;
- `comind_conversation_history_reader` may read certified A02 evidence and use the local-hour projection;
- neither role receives direct table mutation authority;
- ordinary Data API roles receive no A02 table access;
- A02 remains in private `comind` and is not exposed through ordinary Data API paths.

All A02 evidence tables are immutable after insert and use forced RLS.

Production remains outside v0.1 scope.

## Acceptance

The v0.1 acceptance corpus contains three conversations with:

- seven timestamped messages;
- one untimestamped message;
- a 29-minute-59-second gap;
- an exact 30-minute gap;
- a 31-minute gap;
- a cross-conversation timestamp tie.

Acceptance requires evidence that:

1. the 30-minute reference policy creates exactly three sessions;
2. the 1,799-second gap remains in session 1;
3. the exact 1,800-second gap starts session 2;
4. the 1,860-second gap starts session 3;
5. the timestamp tie is ordered deterministically by source identifiers;
6. the 60-minute comparison policy creates one session from the same seven timestamped events;
7. one untimestamped message is excluded and explicitly counted;
8. UTC hour/day/month/year rollups have exact expected counts;
9. an explicit `America/Indiana/Indianapolis` local-hour projection produces the expected clock-hour distribution for the fixture date;
10. repeating the same source/policy calculation under a different database session timezone returns the same run identity;
11. an uncertified PASS import cannot create A02 evidence;
12. the history reader can read but cannot mutate A02 evidence;
13. the derivation role cannot bypass the governed calculator with direct table INSERT;
14. Data API roles have no A02 SELECT privilege;
15. exact-head dedicated CI and broad CI pass;
16. Supabase Test receives bounded readback plus security/performance advisor review before merge.

A successful synthetic proof does not establish any real user session statistics. Real outputs require a reviewed and certified native OpenAI export baseline.

## Limitations

Session span is elapsed time between first and last timestamped message in a gap-defined session. It is not a claim that the user was continuously active during every second of that interval.

Messages lacking timestamps cannot be placed into chronological sessions without fabrication and are excluded.

Cross-conversation source identifiers are used only as deterministic tie breakers when timestamps are equal. They do not reveal the original user-interface ordering of truly simultaneous events unless the source itself provides such an ordering field.

The local-hour projection combines repeated daylight-saving clock hours by design. Durable chronological comparisons continue to use UTC rollups.

The 30-minute reference threshold is useful precedent, not validated evidence of a person's cognitive or creative session boundary.

## External references

- Google Analytics dimensions and metrics, session timeout behavior: https://support.google.com/analytics/table/13948007
- Snowplow user/session identification and configurable inactivity timeout: https://docs.snowplow.io/docs/events/ootb-data/user-and-session-identification/
- PostHog sessions and configurable idle timeout: https://posthog.com/docs/data/sessions

## Related artifacts

- `docs/architecture/conversation-history-platform.md`
- `docs/architecture/chist-a01-personal-analytics.md`
- `db/migrations/20261026_011_conversation_history_sessionization.sql`
- `scripts/test_chist_a02_sessionization.sh`
- GitHub Issue #235
