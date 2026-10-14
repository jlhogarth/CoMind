import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

test("runtime and development dependencies are exact-version pinned", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageManifest;
  const versions = Object.values({ ...manifest.dependencies, ...manifest.devDependencies });

  assert.ok(versions.length > 0);
  for (const version of versions) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `dependency version must be exact: ${version}`);
  }
});
