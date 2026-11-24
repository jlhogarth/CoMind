const TEST_AUTH_ORIGIN = "https://sbgfuanxiqepcoboxzcl.supabase.co";

export function tokenFromTestMagicLink(value: string): string {
  const link = new URL(value.trim());
  const keys = [...link.searchParams.keys()];
  const token = link.searchParams.get("token");
  if (link.origin !== TEST_AUTH_ORIGIN || link.pathname !== "/auth/v1/verify"
    || link.username || link.password || link.hash
    || link.searchParams.get("type") !== "magiclink"
    || !token || token.length > 512
    || keys.some(key => !["token", "type", "redirect_to"].includes(key))
    || new Set(keys).size !== keys.length) {
    throw new Error("Use the latest CoMind Test magic link from this sign-in request.");
  }
  return token;
}
