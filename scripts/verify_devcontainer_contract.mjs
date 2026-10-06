#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(repositoryRoot, relativePath), 'utf8');

const [devcontainerText, compose, dockerfile, readme] = await Promise.all([
  read('.devcontainer/devcontainer.json'),
  read('.devcontainer/compose.yaml'),
  read('.devcontainer/Dockerfile'),
  read('README.md'),
]);

const devcontainer = JSON.parse(devcontainerText);
const expectedPostCreate =
  'cd server && npm ci && cd .. && bash scripts/bootstrap_dev_runtime.sh';

assert.equal(devcontainer.dockerComposeFile, 'compose.yaml');
assert.equal(devcontainer.service, 'workspace');
assert.equal(devcontainer.workspaceFolder, '/workspaces/CoMind');
assert.ok(devcontainer.forwardPorts?.includes(3000), 'port 3000 must be forwarded');
assert.equal(devcontainer.postCreateCommand, expectedPostCreate);

assert.match(dockerfile, /^FROM mcr\.microsoft\.com\/devcontainers\/javascript-node:24$/m);
assert.match(dockerfile, /postgresql-client/);

assert.match(compose, /image:\s*pgvector\/pgvector:0\.8\.6-pg17-bookworm/);
assert.match(compose, /DATABASE_URL:\s*postgresql:\/\/postgres:postgres@db:5432\/comind_runtime/);
assert.match(compose, /POSTGRES_DB:\s*comind_runtime/);
assert.match(compose, /condition:\s*service_healthy/);
assert.match(compose, /3000/);

assert.match(readme, /postCreateCommand/);
assert.match(readme, /bash scripts\/bootstrap_dev_runtime\.sh/);
assert.match(readme, /forwarded port 3000/i);
assert.match(readme, /\/chat/);
assert.match(readme, /must not be used to mutate live Supabase/);
assert.match(readme, /not part of ordinary CI/);

console.log('Devcontainer contract validation passed.');
