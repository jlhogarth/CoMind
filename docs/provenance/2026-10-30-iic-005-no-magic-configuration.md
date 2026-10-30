# IIC-005 Development Evidence

Issue: #349  
Branch: `iic-005-no-magic-configuration`  
Starting main: `f1ab149b121471a8aa57a7a52dab6cbaf3731bf6`

## Collision and reuse review

Open development lanes were inspected before branching. The active VE standard, CE-002, MDO-002, Competitive CP-04, Conversation History K01, and older isolated branches do not own the NMC detector/test/documentation paths.

IIC-005 reuses the existing Implementation Integrity workflow and canonical Integrity Registry. It does not create a new governance workflow or database authority.

## Detector posture

The initial NMC detector is intentionally narrow and candidate-only. It inspects runtime JavaScript/TypeScript-family source and reports:

- consequential environment variables with literal fallbacks;
- literal HTTP/HTTPS endpoints.

Tests, fixtures, documentation, repository scripts, generated output, and explicit configuration-file surfaces are excluded from this first detector version.

## Local verification before real repository scan

Nine deterministic tests cover operational and non-operational environment fallbacks, required variables without defaults, literal endpoints, test/fixture/config exclusions, stable fingerprints, and nonblocking JSON output.

NMC remains `DEFINED` in the canonical registry until exact-head real-repository evidence is produced and reviewed. Registry promotion to `SHADOW` must cite actual evidence rather than anticipated success.

## Cost and recovery

No paid provider, database mutation, Production action, or external dependency. Cost is GitHub Actions runner time only. Recovery is repository revert.
