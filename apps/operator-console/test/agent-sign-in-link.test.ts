import assert from "node:assert/strict";
import test from "node:test";
import { validateOperatorSignInLink } from "../src/lib/agent-work/sign-in-link";

const app = "https://synthetic-preview.example";
const base = "https://sbgfuanxiqepcoboxzcl.supabase.co/auth/v1/verify";
const valid = base + "?token=synthetic-test-token&type=magiclink&redirect_to=" + encodeURIComponent(app + "/agent-work");
test("accepts only the Test project's magic link bound to this Agent Work origin", () => {
  assert.equal(validateOperatorSignInLink(valid, app), valid);
  for (const value of [
    valid.replace("sbgfuanxiqepcoboxzcl", "other-project"),
    valid.replace("https:", "http:"),
    valid.replace("magiclink", "recovery"),
    valid + "&token=second-token",
    valid + "&next=https://outside.example",
    valid + "#secret",
    valid.replace("/auth/v1/verify", "/auth/v1/logout"),
    valid.replace("synthetic-preview.example", "other-preview.example"),
    base + "?type=magiclink",
    "not a link",
  ]) assert.throws(() => validateOperatorSignInLink(value, app));
});
