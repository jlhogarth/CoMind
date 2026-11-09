// The public site is static. This separate Worker receives only explicitly consented data.
const consentVersion = 'web-curiosity-v1';
const maxBytes = 40_000; // Four 1,500-character fields, including UTF-8 and JSON escaping.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const uuidPattern = new RegExp('^' + uuid + '$');
const contributionPath = new RegExp('^/contributions/(' + uuid + ')$');
const tokenPattern = /^[0-9a-f]{64}$/;
const fields = ['question', 'why', 'known', 'unknown'];
const encoder = new TextEncoder();

function reply(status, body, origin, extra) {
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    vary: 'Origin',
    ...extra,
  });
  if (origin) headers.set('access-control-allow-origin', origin);
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

async function readJson(request) {
  if (Number(request.headers.get('content-length')) > maxBytes) return { error: 413 };
  if (!request.body) return { error: 400 };
  const reader = request.body.getReader();
  const bytes = new Uint8Array(maxBytes);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > maxBytes) {
        await reader.cancel();
        return { error: 413 };
      }
      bytes.set(value, size);
      size += value.length;
    }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
    return body && typeof body === 'object' && !Array.isArray(body) ? { body } : { error: 400 };
  } catch {
    return { error: 400 };
  } finally {
    reader.releaseLock();
  }
}

async function callStorage(env, operation, params) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const endpoint = new URL('/rest/v1/rpc/' + operation, env.SUPABASE_URL);
  if (endpoint.protocol !== 'https:') throw new Error('Invalid storage endpoint');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify(params),
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('Storage unavailable');
  return response.json();
}

async function verifyChallenge(token, env, hostname, ip) {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Challenge unavailable');
  const result = await response.json();
  return result.success === true && result.hostname === hostname && result.action === 'web_curiosity';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    if (!origin || origin !== env.ALLOWED_ORIGIN) return reply(403, { error: 'forbidden_origin' });
    const respond = (status, body, extra) => reply(status, body, origin, extra);
    const url = new URL(request.url);
    const id = contributionPath.exec(url.pathname)?.[1];
    const method = url.pathname === '/contributions' ? 'POST' : id ? 'DELETE' : null;
    if (!method || url.search) return respond(404, { error: 'not_found' });
    const allowed = { allow: method + ', OPTIONS' };
    if (request.method === 'OPTIONS') {
      if (request.headers.get('access-control-request-method') !== method) {
        return respond(405, { error: 'method_not_allowed' }, allowed);
      }
      return respond(204, null, {
        'access-control-allow-methods': method,
        'access-control-allow-headers': 'content-type, x-withdrawal-token, x-web001-test-access',
        'access-control-max-age': '600',
        vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      });
    }
    if (request.method !== method) return respond(405, { error: 'method_not_allowed' }, allowed);
    if (env.COLLECTION_MODE !== 'synthetic-test' || !env.TEST_ACCESS_TOKEN || !env.TURNSTILE_SECRET ||
        !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.VISITOR_RATE_LIMIT) {
      return respond(503, { error: 'not_configured' });
    }

    const testAccess = request.headers.get('x-web001-test-access');
    if (!tokenPattern.test(testAccess ?? '') || !tokenPattern.test(env.TEST_ACCESS_TOKEN) ||
        !crypto.subtle.timingSafeEqual(encoder.encode(testAccess), encoder.encode(env.TEST_ACCESS_TOKEN))) {
      return respond(403, { error: 'test_access_required' });
    }

    try {
      const ip = request.headers.get('cf-connecting-ip');
      if (!ip) return respond(503, { error: 'network_identity_unavailable' });
      const limit = await env.VISITOR_RATE_LIMIT.limit({ key: method + ':' + ip });
      if (!limit.success) return respond(429, { error: 'rate_limited' });

      let body;
      if (method === 'POST') {
        const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (mediaType !== 'application/json') return respond(415, { error: 'unsupported_media_type' });
        const decoded = await readJson(request);
        if (decoded.error) return respond(decoded.error, {
          error: decoded.error === 413 ? 'payload_too_large' : 'invalid_json',
        });
        body = decoded.body;
        if (body.consent !== true || body.consent_version !== consentVersion ||
            typeof body.contribution_id !== 'string' || !uuidPattern.test(body.contribution_id) ||
            fields.some(field => typeof body[field] !== 'string' || Array.from(body[field].trim()).length > 1500 ||
              /[\u0000\uD800-\uDFFF]/u.test(body[field])) || Array.from(body.question.trim()).length < 10) {
          return respond(422, { error: 'invalid_contribution_or_consent' });
        }
        if (typeof body.turnstile_token !== 'string' || !body.turnstile_token.trim() || body.turnstile_token.length > 2048) {
          return respond(422, { error: 'challenge_required' });
        }
      }

      const token = request.headers.get('x-withdrawal-token');
      if (!token || !tokenPattern.test(token)) return respond(403, { error: 'invalid_token' });
      const hash = await crypto.subtle.digest('SHA-256', encoder.encode(token));
      const tokenHash = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');

      if (method === 'DELETE') {
        const withdrawn = await callStorage(env, 'web001_withdraw', { p_id: id, p_hash: tokenHash });
        return withdrawn === true ? respond(200, { withdrawn: true }) : respond(404, { error: 'not_found' });
      }

      if (!(await verifyChallenge(body.turnstile_token, env, new URL(origin).hostname, ip))) {
        return respond(403, { error: 'challenge_failed' });
      }
      const receipt = await callStorage(env, 'web001_submit', {
        p_id: body.contribution_id, p_hash: tokenHash, p_consent_version: body.consent_version,
        p_question: body.question.trim(), p_why: body.why.trim() || null,
        p_known: body.known.trim() || null, p_unknown: body.unknown.trim() || null,
      });
      return receipt ? respond(201, receipt) : respond(409, { error: 'submission_conflict' });
    } catch {
      return respond(503, { error: 'temporarily_unavailable' });
    }
  },
};
