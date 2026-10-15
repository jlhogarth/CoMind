import { timingSafeEqual } from "node:crypto";

export function isAuthorizedAdminBearer(
  authorization: string | null,
  expectedToken: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;

  const supplied = authorization.slice("Bearer ".length);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expectedToken);

  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}
