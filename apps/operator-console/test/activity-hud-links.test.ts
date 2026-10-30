import assert from "node:assert/strict";
import test from "node:test";
import { resolveActivityReference } from "../src/lib/activity-hud/links";

const repo = "https://github.com/jlhogarth/CoMind";

test("preserves literal HTTP and HTTPS destinations", () => {
  assert.equal(
    resolveActivityReference("github", "https://github.com/jlhogarth/CoMind/pull/345")?.href,
    "https://github.com/jlhogarth/CoMind/pull/345",
  );
  assert.equal(
    resolveActivityReference("external", "http://example.test/evidence")?.href,
    "http://example.test/evidence",
  );
});

test("resolves canonical CoMind GitHub shorthand without inventing adjacent destinations", () => {
  assert.equal(resolveActivityReference("github", "github:issue:302")?.href, `${repo}/issues/302`);
  assert.equal(resolveActivityReference("github", "github:pr/269@0d1e3b650f9ea91")?.href, `${repo}/pull/269`);
  assert.equal(resolveActivityReference("github", "PR #209")?.href, `${repo}/pull/209`);
  assert.equal(resolveActivityReference("github", "PR#177")?.href, `${repo}/pull/177`);
  assert.equal(
    resolveActivityReference("github", "github:merge/2e6004165d532742c9f3415d1db4a30679efafed")?.href,
    `${repo}/commit/2e6004165d532742c9f3415d1db4a30679efafed`,
  );
});

test("leaves opaque or non-GitHub references as provenance text", () => {
  assert.equal(resolveActivityReference("supabase", "supabase://project/check"), null);
  assert.equal(resolveActivityReference("drive", "CINT-CP04-FRESHNESS-20261028:research-source-runbook-sync"), null);
  assert.equal(resolveActivityReference("chatgpt", "PR #209"), null);
  assert.equal(resolveActivityReference("github", "not-a-provable-reference"), null);
  assert.equal(resolveActivityReference("github", "javascript:alert(1)"), null);
});
