export interface OperatorConsoleError {
  title: string;
  detail: string;
  permissionRelated: boolean;
}

export function toOperatorConsoleError(error: unknown): OperatorConsoleError {
  const detail = error instanceof Error ? error.message : "An unknown database error occurred.";
  const permissionRelated = /permission|row-level security|rls|not authorized|forbidden/i.test(detail);

  return {
    title: permissionRelated ? "Access denied by database policy" : "Database operation failed",
    detail,
    permissionRelated,
  };
}
