# CIG-001 Composio Integration Gateway Canonicalization

Date: 2026-10-30
Issue: https://github.com/jlhogarth/CoMind/issues/414
Environment: Development/Test governance and integration proof
Production change: false

## Authority

Joseph Hogarth explicitly requested that the new Composio process be integrated into the canonical CoMind application/development contract so RunBook, RuleBook, Operator Console, and all Development Lanes share the same operating model. Standing L4A Bounded Autonomous Development Authority applies subject to its mandatory human stops.

## Verified integration proof

Composio connections for GitHub and Supabase were verified ACTIVE on 2026-10-30. Through the connected integration path, the lane successfully:

- resolved `jlhogarth/CoMind` with administrative repository permissions;
- resolved the active CoMind Supabase project `sbgfuanxiqepcoboxzcl`;
- read current GitHub pull-request and commit state;
- enumerated the live `comind_pm` evidence schema;
- read `comind_pm.v_runbook_lane_state`;
- read the durable L4A authorization from `comind_pm.pm_authorizations`;
- confirmed zero rows from `comind_pm.v_open_blockers` at the proof point.

No raw OAuth token, refresh token, password, API key, authorization header, service-role key, or equivalent secret was placed in CoMind evidence. Connection metadata and proof results only were retained.

## Canonical operating model

Composio is an integration and authentication substrate. It does not confer CoMind authority. A consequential external action must resolve current durable authority, confirm connection state and scope, apply applicable RuleBook controls, execute least privilege, verify the provider result, and preserve non-secret evidence.

Authentication interruption is checkpointed as an operational state such as `AUTH_REQUIRED`, `SCOPE_REQUIRED`, `EXPIRED`, `HUMAN_CONFIRMATION_REQUIRED`, or `BLOCKED`. It is not permission to bypass provider or platform controls. Dependency-independent authorized work should continue when safe.

The ChatGPT plugin path is procedurally governed because the plugin execution occurs outside CoMind server interception. Future CoMind-hosted runtime use of Composio or another broker must call the common RuleBook operational preflight before consequential external execution.

## Durable evidence

The canonical RunBook contains work item `CIG-001` and a verification event with source reference `github:issue:414:cig-001:connection-proof`. The event records the verified toolkits, repository/project identities, L4A readback, RunBook readback, blocker readback, and Production=false without storing credentials.

## Acceptance boundary

CIG-001 canonicalization is accepted only after the repository patch passes relevant Operator Console tests, typecheck/build, repository CI, freshness checks against current `main`, and L4A merge criteria. Production activation is explicitly out of scope.
