import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => /\.(ts|tsx)$/.test(path));
}

test("source contains no TODO/FIXME placeholder markers", () => {
  const root = new URL("../src", import.meta.url).pathname;
  for (const path of sourceFiles(root)) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /\b(TODO|FIXME)\b/, path);
  }
});
