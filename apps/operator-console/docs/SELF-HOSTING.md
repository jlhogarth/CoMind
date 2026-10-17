# Operator Console portable self-hosting

OC-002 supports a portable Next.js standalone runtime so the Operator Console can run on infrastructure controlled by CoMind without creating a dependency on a specific hosting vendor.

## Trust boundary

The container preserves the same authority separation as the application code:

- browser-safe configuration contains only the Supabase project URL and modern publishable key;
- privileged Supabase access is server-only;
- administrative execution is disabled by default;
- the Supabase secret key and Operator Console admin token must never be included as Docker build arguments, committed files, image layers, browser variables, or logs;
- exposing the container outside a trusted host or private network requires a reverse proxy and an authenticated access boundary.

The current bearer capability is an OC-002 bootstrap control. It is not the final production operator identity model.

## Build-time browser configuration

Next.js inlines `NEXT_PUBLIC_*` values into the browser bundle during the build. Only public values belong here.

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..." \
  --tag comind/operator-console:oc-002 \
  .
```

The publishable key is intentionally browser-safe. Never substitute `SUPABASE_SECRET_KEY`, a legacy service-role JWT, a database password, or an administrative token into a build argument.

## Fail-closed runtime

A runtime with no privileged credentials can serve the browser application while protected server functions remain unavailable.

```bash
docker run --rm \
  --publish 127.0.0.1:3000:3000 \
  --env SUPABASE_URL="https://<project-ref>.supabase.co" \
  --env OPERATOR_CONSOLE_ADMIN_ENABLED=false \
  comind/operator-console:oc-002
```

Expected behavior:

- `/` serves the Operator Console;
- browser reads use the publishable-key path embedded at build time;
- `/api/schema` returns a fail-closed service error until a server secret is provisioned;
- `/api/admin/mutations` returns a fail-closed service error while administrative execution is disabled.

## Privileged runtime configuration

When the runtime is deliberately authorized for server metadata and bounded administrative execution, inject these values from the host secret store or equivalent runtime secret mechanism:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=<modern sb_secret_ key>
OPERATOR_CONSOLE_ADMIN_ENABLED=true
OPERATOR_CONSOLE_ADMIN_TOKEN=<high-entropy operator capability>
```

Do not store these values in `.env` files that are committed, Docker build arguments, Dockerfiles, image labels, CI artifacts, or browser-visible variables.

The server secret authorizes the database role. The separate Operator Console admin token authorizes use of the HTTP mutation route. Both controls must be present for the bootstrap mutation route to operate.

## Network exposure

For local acceptance, bind the container to loopback as shown above. For a persistent host, place a reverse proxy in front of the Next.js runtime rather than exposing port 3000 directly to the public internet. The external boundary should provide TLS, request limits, authenticated access, and operational logging appropriate to the deployment environment.

## OC-002 live acceptance sequence

A live runtime is not accepted merely because the image builds. Acceptance requires evidence from an actually running instance:

1. build the image with the live Supabase URL and publishable key;
2. start with administrative execution disabled and verify fail-closed protected routes;
3. provision the modern server secret only in the runtime secret store;
4. verify `/api/schema` returns the registered live metadata;
5. provision the administrative capability and explicitly enable administrative execution;
6. exercise a verification-only insert, replay, update, denied ordinary-relation delete, and verification cleanup through the HTTP mutation route;
7. confirm the expected durable audit rows in live Supabase;
8. confirm browser authority remains unchanged and no privileged value appears in the browser bundle or response payloads;
9. record the exact image/source commit and acceptance evidence before declaring OC-002 end-to-end live.

## Recovery

The container is stateless with respect to application code. Rollback is performed by stopping the candidate image and starting the previously accepted image. Database recovery remains governed by the OC-002 migration and mutation controls; deployment rollback does not reverse database migrations automatically.
