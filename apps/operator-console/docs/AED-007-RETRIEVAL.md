# AED-007 Operator Console retrieval

Issue [#540](https://github.com/jlhogarth/CoMind/issues/540), draft PR [#541](https://github.com/jlhogarth/CoMind/pull/541). CoMind Test project `sbgfuanxiqepcoboxzcl`. This repository change is T1 reversible development. The private table migration was separately approved and applied under C4. This change does not deploy the Console or modify database grants.

## Architecture and authorization

The `/aed` client uses the existing Supabase browser client for a Supabase Auth email link and obtains its own session access token. The Next.js server verifies that token with Supabase Auth `getUser(token)` on each request. A valid user UUID must also be present in server-only `OPERATOR_CONSOLE_AED_OPERATOR_IDS`. This is explicit AED authorization, independent of the perimeter. Anonymous, invalid, and unlisted identities are rejected before the database reader is created. The server-only `SUPABASE_SECRET_KEY` then reads fixed selections from `comind_pm.pm_aed_monitor_execution` and `comind_pm.pm_aed_monitor_event` through the Supabase Data API. Browser roles still have no direct table SELECT grant. No arbitrary relation name, SQL, sort expression or write method is accepted.

This path requires the trusted runtime to supply the existing CoMind Test project URL, publishable key and secret key. It also requires the `comind_pm` schema to be reachable through the project's Data API by the server credential. This API exposure has **not** been independently verified. Do not broaden API schema exposure solely to make the UI work without a separate security review. If it is unavailable, the endpoint returns 503 and live acceptance remains blocked. A dedicated least-privilege read credential or governed fixed RPC can be designed in a subsequent approved database change.

`OPERATOR_CONSOLE_AED_ACCESS_MODE=enabled` activates the route; disabled or incomplete configuration returns 503. The operator UUID allowlist must be populated with verified Supabase Auth identities, never email guesses. The browser bundles only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The server must remain behind the established Console deployment perimeter. Supabase email-link redirect URLs must be configured for the intended Test Console origin. Tokens are carried in Authorization headers and are never placed in query strings. Responses use private no-store headers.

## Endpoint contract

| Method and route | Parameters | Response | Bounds |
| --- | --- | --- | --- |
| GET `/api/aed/executions` | `page`, `pageSize` | Execution IDs, lane, first/last event, count, run URL, source and artifact hashes | Last timestamp descending, ID ascending; 1 to 100 rows |
| GET `/api/aed/executions/{id}` | `page`, `pageSize`, optional `kind`, `state` | Execution summary and ordered event fields | Sequence ascending; 1 to 100 rows |

Pages are positive integers at most 10,000, page size at most 100, ID is exactly 24 lowercase hex characters, filters are bounded identifiers. Invalid input returns 400, missing execution 404, missing/invalid identity 401, unlisted identity 403, and unavailable configuration, identity provider or data source 503. Only approved fields are returned. Raw `payload` is withheld. The response includes `payload_sha256`, elapsed time, and the recorded cost value when present. A null cost means unmeasured. No derived status is asserted from the stored events. Run links render only if their host/path matches the CoMind GitHub Actions run pattern.

The current allowlist is a server runtime configuration, not a database authorization ledger. Updating it requires a trusted deployment configuration change. Authentication lookup and server-side reads are bounded but do not yet include an operator access audit record or request rate limit. The identity and reader currently share the Supabase project, while the reader's secret credential retains broader project authority outside this feature. The fixed query contract narrows application behavior, but a dedicated reader identity would further reduce credential blast radius.

## Verification and limits

Run `cd apps/operator-console && npm ci && npm run test && npm run typecheck && npm run build`. The deterministic route tests exercise invalid configuration, invalid and unauthorized identity, authorized fixed selections, bounds, ordering, filtering and upstream denial with injected clients. They do not prove a live user session or actual Data API access. Check the exact CI head before accepting this branch.

For live acceptance, configure the trusted Test runtime, verify the operator identity and Data API access, sign into `/aed`, and retrieve every page of the three baseline IDs. Compare sequences 1..65, 1..122 and 1..59 and their recorded hashes against direct database readback and the preserved forensic archive. Record the exact timestamp, deployed revision, operator identity (non-secret identifier), HTTP statuses, page totals, database counts and browser trace. Do not treat unit-test fixtures as live evidence. The known baseline totals are 65, 122 and 59, or 246 events. The archive SHA-256 is `d88aea8be00f1959b85d9f18941562a84eaf1ddcce9752737d6a0358d2d68e95`; that is the ZIP digest, not a verification of every event payload returned by this endpoint.

## Executed development checkpoint, 2026-11-05

On the AED branch, `npm ci --ignore-scripts --no-audit --no-fund` installed 51 packages in approximately 56 seconds. `npm run test` passed 96/96 tests in 4.18 seconds after the final server change. `npm run typecheck` passed. `npm run build` compiled and generated `/aed` and the two dynamic API routes. `npm audit --audit-level=high --omit=dev` reported zero vulnerabilities. A local `next start` HTTP request without Authorization returned 401 and `{"error":"Authentication required"}`. A browser-bundle text inspection found references to forbidden environment variable *names* in the pre-existing browser config guard, but found no AED operator allowlist identifier or fixture server credential value in `.next/static`. These are local development measurements, not provider Work credit data.

A read-only direct SQL baseline query on the primary CoMind Test project returned execution counts 65, 122 and 59, each with sequence ranges starting at 1 and ending at its count, total 246. Source hashes were respectively `20c8cb5e98411d906d0a7bf6019d1e70180959507089f40459ffe6b7718e48f5`, `99b51c0ad111e0c98e3df02c68182f94a4b01d0c8cf688f87ff804f8f06b1a23`, and `8ea539e6eb426ae1bffa607f9c3bffaf299fd371e9496d12cab4e55333972ed8`. This direct SQL result does not prove an authenticated Console read. Live authorized and unauthorized-user application requests, all Console pages, browser acceptance, and actual Data API schema access remain unexecuted. ChatGPT Work credits and provider tokens are unavailable.

Rollback is a revert of this PR and removal of the AED runtime variables. The private monitoring tables and forensic archive remain unchanged. No app deployment, new paid service, or conversation wake is included.
