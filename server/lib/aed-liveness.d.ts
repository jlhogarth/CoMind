export type ClearSafety = {
  l4aAuthorized: boolean;
  oneIssueOneBranchOnePr: boolean;
  noPlaceholder: boolean;
  collisionClear: boolean;
  freshnessClear: boolean;
  dependencyValid: boolean;
  costGuardrailClear: boolean;
  productionChange: boolean;
  productionAuthorized: boolean;
  secretsPresent: boolean;
};

export function clearForShock(input: ClearSafety): { clear: boolean; failed: string[] };
