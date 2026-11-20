# CBE-MOBILE-004 Original Conversation Return Bridge

Issue: #530. Status: implementation candidate. Environment: Development/Test.

## Behavior and authority

The existing authenticated `POST /api/cbe-control` endpoint can execute
`wake_conversation` when both `CBE_HANDOFF_JOB_FILE` and `CBE_PROFILE_DIR` are
configured. Without that configuration the existing unavailable behavior remains.
The request must include the exact `work_key` and `recovery_id` of the staged job.
The phone cannot supply a URL, authority decision, browser profile, or lease token.

An authorized recovery controller stages the existing CBE-003 strict handoff job
outside the repository, only after semantic recovery, CLEAR, freshness, collision,
and cost checks. The file is an execution input, not an authority registry. No new
job schema or capability minting mechanism is introduced. Stage one job per
runtime at a time using atomic file replacement; retain a recovery ID on retries.
Use an owner-only regular file (0600), a private parent directory, and the existing
host secret-handling process. The file reader rejects final-component symlinks,
repository paths (including resolved paths), group/other access and inputs over
32 KiB. Credentials and profile state remain outside the job and repository.

The bridge strictly parses the job, checks its work and recovery identity, resolves
the current MP-007 registered conversation, acquires the existing profile-global
lock, rechecks the binding, and invokes the existing canonical Foundry lease
verifier and CBE handoff actuator. It never acquires, steals, extends or releases a
Foundry work lease. The supplying controller owns that lease lifecycle. The bridge
releases only its browser profile lock. A stale capability fails before browser
construction. Registry checks do not lock the registry across a browser operation;
concurrent registry changes after the last check remain a live-acceptance risk.

Only the registered original conversation is eligible. The existing actuator
requires exact handoff observation and a response correlated with that recovery
turn, including retries. The HTTP result returns the MP-006 status/reason and job
correlation ID without private URL or capability material. Authentication failures
request human action without inventing an authentication URL. Explicit profile-lock
release failure cannot report successful return.

`retry_recovery` stays unavailable: this executor delivers a verified repair
handoff; it does not implement semantic repair. The approved handoff includes the
existing instruction to proceed under the CoMind Application Development Contract.
No successor conversation is created by this bridge.

## Verification and recovery

Run `npm run build` in `server`, then the CBE-003 workflow's listed test command.
Its path filter and test list include this bridge and the control route. Tests use
synthetic jobs and browser doubles. They do not establish live ChatGPT acceptance.

Rollback removes the application binding, environment field, executor and its
tests, restoring explicit unavailable behavior. No database migration or user-data
rollback is needed. Unset `CBE_HANDOFF_JOB_FILE` to disable dispatch operationally.

Live acceptance requires an authenticated external profile on an invokable host,
a real controller-approved job with a valid lease, and an active canonical binding.
After delivery, verify subsequent lane progress separately from response start.
Retain Issue #489 as the existing NOTEBOOK-001 live-return acceptance reference.
