import assert from "node:assert/strict";
import test from "node:test";
import { tokenFromTestMagicLink } from "../src/lib/ger-005-test/verification-link";

const base = "https://sbgfuanxiqepcoboxzcl.supabase.co/auth/v1/verify";
const link = `${base}?token=synthetic-token&type=magiclink&redirect_to=http%3A%2F%2Flocalhost%3A3000`;

test("extracts Test magic token without following the localhost redirect", () => {
  assert.equal(tokenFromTestMagicLink(link), "synthetic-token");
});

test("rejects wrong project, type, duplicate parameters and unexpected URLs", () => {
  for (const value of [
    link.replace("sbgfuanxiqepcoboxzcl", "other-project"),
    link.replace("magiclink", "recovery"),
    link.replace("https:", "http:"),
    link + "&token=second",
    link + "&next=https://outside.example",
    link + "#fragment",
    link.replace("/auth/v1/verify", "/auth/v1/logout"),
    "not a link",
  ]) assert.throws(() => tokenFromTestMagicLink(value));
});
