import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { Miniflare } = require('miniflare');
const { MockAgent } = createRequire(require.resolve('miniflare'))('undici');
const origin='https://preview.example.test';
const mock=new MockAgent();
mock.disableNetConnect();
mock.get('https://challenges.cloudflare.com').intercept({method:'POST',path:'/turnstile/v0/siteverify'})
  .reply(200,{success:true,hostname:'preview.example.test',action:'web_curiosity'});
const id='7c7baf39-a5c3-42cf-988b-1ed69bd501f3';
mock.get('https://database.example.test').intercept({method:'POST',path:'/rest/v1/rpc/web001_submit'})
  .reply(200,{contribution_id:id,expires_at:'2027-02-07T00:00:00Z'});
mock.get('https://database.example.test').intercept({method:'POST',path:'/rest/v1/rpc/web001_withdraw'}).reply(200,'true');
const access='a'.repeat(64);
const mf=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL('./worker.mjs', import.meta.url)),
  compatibilityDate:'2026-08-06', fetchMock:mock,
  ratelimits:{VISITOR_RATE_LIMIT:{namespace_id:'542001',simple:{limit:2,period:60}}},
  bindings:{ALLOWED_ORIGIN:origin,COLLECTION_MODE:'synthetic-test',TEST_ACCESS_TOKEN:access,
    SUPABASE_URL:'https://database.example.test',SUPABASE_SERVICE_ROLE_KEY:'test-only',TURNSTILE_SECRET:'test-only'}});
try {
  const headers={origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',
    'x-web001-test-access':access,'x-withdrawal-token':'b'.repeat(64)};
  const body=JSON.stringify({question:'Synthetic question for the Worker runtime?',why:'',known:'',unknown:'',
    contribution_id:id,consent:true,consent_version:'web-curiosity-v1',turnstile_token:'test-only'});
  let response=await mf.dispatchFetch('https://api.example.test/contributions',{method:'POST',headers,body});
  assert.equal(response.status,201,await response.clone().text());
  response=await mf.dispatchFetch('https://api.example.test/contributions/'+id,{method:'DELETE',headers});
  assert.equal(response.status,200,await response.clone().text());
  mock.assertNoPendingInterceptors();
  console.log('workerd: actual module execution, Test access, rate-limit binding invocation, submission and withdrawal passed with mocked provider responses.');
} finally {
  await mf.dispose();
  await mock.close();
}
