# Lane Health Sentinel Controlled Failure Proof

This file exists only to produce one deterministic, reversible CI failure for Issue #187 and must never be merged to `main`.

The single prohibited marker below is intentional acceptance-test input for the existing No Placeholder Policy:

TODO

Expected result: the No Placeholder Policy rejects this pull request, while the trusted Lane Health Sentinel Background workflow on `main` observes and classifies that failure without exercising write or remediation authority.
