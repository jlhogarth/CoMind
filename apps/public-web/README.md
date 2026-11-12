# WEB-001 Public Headquarters

This isolated static frontend is the first CoMind public headquarters implementation. It consumes the canonical BRAND-001 CSS runtime and semantic tokens without editing BRAND-001. The site is not an internal console.

## Dependency and branch strategy

BRAND-001 is currently in open PR #139 on branch `issue-138-brand-runtime-foundation`. WEB-001 branches from that source and targets it in its initial PR, avoiding duplicate brand CSS and avoiding premature changes to `main`. Once BRAND-001 is merged, WEB-001 can be retargeted to `main` after a freshness and conflict review.

## Local preview

Run `python3 -m http.server 8080 --directory apps/public-web/public` from the repository root, then open localhost port 8080. The source files under `brand/` are copied into `public/brand/` by `node apps/public-web/prepare.mjs` before preview. The prepare script copies the canonical files verbatim and verifies the entrypoint exists. It does not edit the brand source.

## Cloudflare preview

`node apps/public-web/prepare.mjs` then use the pinned/approved Cloudflare CLI to create an isolated Worker preview from `apps/public-web` after validating the Cloudflare account's build and deployment permissions, limits and preview isolation. No live zone routing or production binding is authorized.

## Content status

This is an informational site foundation, not a claim of published research, available paid services, or launched commercial apps. Contact intake and publications require separate reviewed implementation. All content is provisional until editorial approval.

## Tests and release

Verify local HTTP response, no broken assets, keyboard focus, reduced motion, responsive layouts, semantic landmarks, contrast, CSP/security headers and privacy review. Capture exact branch SHA and CI evidence. Production deployment, DNS changes, billing, and publication require explicit human approval.
