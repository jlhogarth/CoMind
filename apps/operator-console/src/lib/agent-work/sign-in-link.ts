const testAuthOrigin = "https://sbgfuanxiqepcoboxzcl.supabase.co";

export function validateOperatorSignInLink(value: string, applicationOrigin: string): string {
  const link = new URL(value.trim());
  const redirect = link.searchParams.get("redirect_to");
  const expectedRedirect = new URL("/agent-work", applicationOrigin).href;
  const keys = [...link.searchParams.keys()];
  if (link.origin !== testAuthOrigin || link.pathname !== "/auth/v1/verify"
    || link.username || link.password || link.hash
    || link.searchParams.get("type") !== "magiclink"
    || !link.searchParams.get("token")
    || keys.some(key => !["token", "type", "redirect_to"].includes(key))
    || new Set(keys).size !== keys.length || redirect !== expectedRedirect) {
    throw new Error("Use the latest CoMind Test sign-in link requested from this page.");
  }
  return link.href;
}
