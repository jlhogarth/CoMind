# IIC-002 Development Evidence

## Starting point

IIC-002 starts from current `main` commit `88c60a6da7bc7682ce41b5f8c5ed6d1502a2699b`, after HUD-STATE-001 merged.

Issue: #330.

Branch: `iic-002-no-false-success`.

## Collision and reuse review

Active development lanes were inspected before branching. The current open CE, Console/ThreadKeeper, MDO, Competitive, Conversation History, and older isolated PRs do not claim the IIC engine, IIC workflow, or `docs/integrity` paths used by this increment.

IIC-002 reuses IIC-001 directly. It does not create a second checker, workflow family, or evidence format.

## Local implementation evidence

The multi-control engine and synthetic suite were executed locally before repository write.

Result: 20 tests passed.

Coverage includes:

- NDT missing/present workflow paths;
- local action resolution;
- package-relative paths;
- generated TypeScript outputs;
- dynamic-path abstention;
- exact IIC-001 NDT fingerprint compatibility;
- `continue-on-error: true` candidate detection;
- `continue-on-error: false` non-detection;
- `|| true`, `|| :`, and `set +e` detection;
- `if: always()` cleanup non-detection;
- package-script failure masking;
- candidate non-blocking behavior in enforcement mode;
- verified-risk blocking behavior in enforcement mode;
- schema-v2 multi-control JSON output.

## Important decision

NFS-001 patterns are not automatically called violations. They are `candidate` findings requiring contextual review. This prevents an integrity checker from substituting a heuristic for evidence.

## NDT promotion boundary

NDT-001 remains shadow-only in this PR even though the engine now contains enforce semantics. Hard-gate promotion requires this successor PR's real repository evidence and a separate reviewed change.

## Cost and recovery

No paid provider, external Python dependency, database mutation, or runtime service is introduced. Cost is GitHub Actions runner time and short-retention evidence artifacts only.

Recovery is repository revert.
