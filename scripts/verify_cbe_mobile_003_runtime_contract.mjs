import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('server/package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('server/package-lock.json', 'utf8'));
const docker = fs.readFileSync('server/Dockerfile.cbe', 'utf8');
const env = fs.readFileSync('server/.env.example', 'utf8');
const workflow = fs.readFileSync('.github/workflows/cbe-mobile-003-deployable-runtime.yml', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.dependencies?.playwright === '1.64.1', 'playwright must be an exact runtime dependency');
assert(!Object.hasOwn(pkg.devDependencies ?? {}, 'playwright'), 'playwright must not remain a devDependency');
assert(lock.packages?.['']?.dependencies?.playwright === '1.64.1', 'lockfile root must bind playwright runtime dependency');
assert(lock.packages?.['node_modules/playwright']?.dev !== true, 'playwright lock entry must not be development-only');
assert(lock.packages?.['node_modules/playwright-core']?.dev !== true, 'playwright-core lock entry must not be development-only');
assert(docker.includes('FROM node:24.22.1-bookworm-slim AS node24'), 'runtime must pin the Node 24.22.1 source image');
assert(docker.includes('FROM mcr.microsoft.com/playwright:v1.64.1-noble'), 'runtime image must pin Playwright 1.64.1 noble');
assert(docker.includes('COPY --from=node24 /usr/local/ /usr/local/'), 'runtime must overlay the pinned Node 24 toolchain');
assert(docker.includes('WORKDIR /app/server'), 'runtime must preserve the server path beneath the repository root');
assert(docker.includes('USER pwuser'), 'runtime must execute as pwuser');
assert(docker.includes('CBE_PROFILE_DIR=/var/lib/comind/cbe-profile'), 'runtime must bind external profile path');
assert(docker.includes("/health'),") || docker.includes("/health')."), 'container must healthcheck /health');
assert(!docker.includes('playwright install'), 'runtime image must reuse pinned browser binaries instead of downloading browsers at startup');
assert(env.includes('CBE_CONTROL_TOKEN='), 'environment example must document bearer capability');
assert(env.includes('CBE_PROFILE_DIR=/var/lib/comind/cbe-profile'), 'environment example must document persistent profile path');
assert(env.includes('CBE_HUMAN_AUTH_URL='), 'environment example must document mobile human-auth handoff');
assert(env.includes('CBE_HEADLESS=true'), 'environment example must default deployed browser to headless');
assert(workflow.includes('docker build'), 'CI must build the CBE runtime image');
assert(workflow.includes('v24.22.1'), 'CI must verify the exact Node 24 runtime');
assert(workflow.includes('docker run'), 'CI must smoke-test the CBE runtime image');
assert(!workflow.includes('docker push'), 'CI must not publish the image');
assert(!workflow.includes('railway') && !workflow.includes('render.com'), 'CI must not deploy hosting');
console.log('CBE-MOBILE-003 deployment contract verified');
