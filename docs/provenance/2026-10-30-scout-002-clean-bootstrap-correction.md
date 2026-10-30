# SCOUT-002 Clean-Bootstrap Acceptance Correction

Control: SCOUT-002  
Issue: #409  
Pull request: #412  
Environment: isolated CI only

## Failure preserved

The first dedicated SCOUT-002 acceptance run reached package validation successfully, then failed before SCOUT-002 runtime assertions while replaying the historical SCOUT-001 Test provisioning script on a minimal v2 clean bootstrap.

The historical SCOUT-001 script queries `comind.cm_project.project_code`. That column is a later project-identity enrichment and is not present in the canonical v2 base schema, whose canonical CoMind project identity is `slug='comind'`.

This was a clean-bootstrap portability mismatch in predecessor setup, not a failure of the SCOUT-002 capability contract, package validator, or authority model.

## Correction

The SCOUT-002 acceptance harness no longer treats the historical Test provisioning script as a clean-bootstrap constructor. Instead it creates the minimum canonical SCOUT-001 draft baseline directly from the accepted v2 and Foundry substrate in the disposable `comind_ci` database:

- canonical CoMind org and accountable human come from the v2 seed;
- canonical CoMind project is resolved by `slug='comind'`;
- a disposable canonical Scout actor, agent, and draft Foundry profile are created with the accepted C0-C1 and no-paid/no-Production boundaries;
- no capability grant, lifecycle activation, external provider resource, budget authority, delegation, or developmental mutation is created.

The SCOUT-002 registration contract also resolves the canonical project by slug and treats the external-resource projection table as an optional later-substrate surface during minimal clean bootstrap. If that table exists, zero resources are enforced. If it does not exist, the lane cannot create provider resources and live Test readback remains the authoritative resource-boundary verification.

The runtime acceptance test was aligned to the same canonical project slug.

## Governance consequence

The failed run remains evidence. It was not reclassified as success and no acceptance criterion was removed. The corrected head must pass the complete exact-head acceptance matrix before merge consideration.
