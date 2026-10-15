# Dependency verification

Operator Console package versions are exact-pinned in `package.json`, and `.npmrc` requires npm to generate a package lock.

A generated `package-lock.json` must be produced by npm and committed before OC-001 can be accepted. It must not be handwritten. Until an execution environment runs `npm install` successfully, dependency installation, tests, type checking, and the Next.js build remain unverified acceptance items.
