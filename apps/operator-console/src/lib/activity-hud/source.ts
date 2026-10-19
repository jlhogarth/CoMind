export const ACTIVITY_HUD_TEST_PROJECT_REF = "sbgfuanxiqepcoboxzcl";

export function assertActivityHudTestProject(projectUrl: string): void {
  let url: URL;
  try {
    url = new URL(projectUrl);
  } catch {
    throw new Error("Activity HUD requires the CoMind Test Supabase project URL.");
  }

  const expectedHost = `${ACTIVITY_HUD_TEST_PROJECT_REF}.supabase.co`;
  if (url.protocol !== "https:" || url.hostname !== expectedHost) {
    throw new Error(`Activity HUD is restricted to the CoMind Test project (${ACTIVITY_HUD_TEST_PROJECT_REF}).`);
  }
}
