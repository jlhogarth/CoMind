#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');

const read = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');

const devcontainer = JSON.parse(read('.devcontainer/devcontainer.json'));
const compose = read('.devcontainer/compose.yaml');
const dockerfile = read('.devcontainer/Dockerfile');
const bootstrap = read('scripts/bootstrap_dev_runtime.sh');
const readme = read('README.md');

function includesAll(text, requiredValues, sourceName) {
  for (const value of requiredValues) {
    assert.ok(
      text.includes(value),
      `${sourceName} must include ${JSON.stringify(value)}.`
    );
  }
}

assert.equal(devcontainer.name, 'CoMind Codespace');
assert.equal(devcontainer.dockerComposeFile, 'compose.yaml');
assert.equal(devcontainer.service, 'workspace');
assert.equal(devcontainer.workspaceFolder, '/workspaces/CoMind');
assert.deepEqual(devcontainer.forwardPorts, [3000]);
includesAll(
  devcontainer.postCreateCommand,
  [
    'cd server',
    'npm ci',
    'node scripts/verify_devcontainer_config.mjs',
    'bash scripts/bootstrap_dev_runtime.sh'
  ],
  '.devcontainer/devcontainer.json postCreateCommand'
);

includesAll(
  compose,
  [
    'dockerfile: .devcontainer/Dockerfile',
    'DATABASE_URL: postgresql://postgres:postgres@db:5432/comind_runtime',
    'PORT: "3000"',
    'condition: service_healthy',
    'image: pgvector/pgvector:0.8.6-pg17-bookworm',
    'POSTGRES_DB: comind_runtime',
    'pg_isready -U postgres -d comind_runtime',
    'comind_runtime_pgdata:/var/lib/postgresql/data'
  ],
  '.devcontainer/compose.yaml'
);

includesAll(
  dockerfile,
  [
    'FROM mcr.microsoft.com/devcontainers/javascript-node:24',
    'postgresql-client'
  ],
  '.devcontainer/Dockerfile'
);

includesAll(
  bootstrap,
  [
    'DATABASE_URL is required for the isolated development runtime.',
    "['postgres:', 'postgresql:']",
    "['db', 'localhost', '127.0.0.1']",
    "parsed.pathname !== '/comind_runtime'",
    'pg_isready --dbname="${DATABASE_URL}"',
    'current_setting(\'server_version_num\')::int >= 170000',
    "extname='vector'"
  ],
  'scripts/bootstrap_dev_runtime.sh'
);

includesAll(
  readme,
  [
    'Node.js 24',
    'PostgreSQL 17 with pgvector',
    'PostgreSQL client tools',
    'comind_runtime',
    'forwarded port 3000',
    '/chat',
    'bash scripts/bootstrap_dev_runtime.sh',
    'bash scripts/verify_openai_live.sh',
    'must not be used to mutate live Supabase'
  ],
  'README.md'
);

console.log('Devcontainer configuration verification passed.');
