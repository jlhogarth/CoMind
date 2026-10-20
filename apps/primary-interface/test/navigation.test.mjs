import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFor, parseRoute } from '../src/navigation.mjs';
test('stable opaque identifiers and filters round trip for all entity types',()=>{
 for(const entity of ['attention','lanes','ves','runbook','evidence']) {
  const filters={q:'a & b/😃',state:'needs_refresh'};
  assert.deepEqual(parseRoute(routeFor(entity,'id/?#%😃',filters)),{entity,id:'id/?#%😃',filters});
 }
});
test('malformed and unknown routes stay unavailable',()=>{
 for(const path of ['/unknown','/attention/','/attention/a/b','/attention/%ZZ']) assert.equal(parseRoute(path),null);
 assert.throws(()=>routeFor('admin','id'));
});
