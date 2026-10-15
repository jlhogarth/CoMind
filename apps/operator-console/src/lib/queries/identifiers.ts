const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertSafeIdentifier(identifier: string, label = "identifier"): void {
  if (!IDENTIFIER.test(identifier)) throw new Error(`Invalid ${label}: ${identifier}`);
}
