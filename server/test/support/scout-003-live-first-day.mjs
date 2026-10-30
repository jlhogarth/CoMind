import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';

const { FoundryAdapterRegistry, FoundryRuntimeOrchestrator, FoundryRuntimeError } = await import('../../dist/foundry-runtime.js');
const { createLocalOllamaFoundryAdapter } = await import('../../dist/providers/ollama-foundry-adapter.js');
const { createLiveLifecycleHarness, liveTestDatabaseConfig } = await import('./ve-lifecycle-live-harness.mjs');

const ISSUE = 427;
const CONTROL_ID = 'SCOUT-003';
const ORG_ID = '997bfcdf-e42f-4757-8d1c-d0da44d26482';
const PROJECT_ID = '8ac9fab3-35df-48fb-b1df-95285fee9dc0';
const FOUNDER_ACTOR_ID = '78c69f2f-0d0d-4551-8c37-3007263e3ce9';
const SCOUT_ACTOR_ID = '262090af-c3ae-4eb0-9771-0fa050ac44d3';
const SCOUT_AGENT_ID = 'f1545f02-4616-4fe5-952c-1f6de66ce967';
const SCOUT_PROFILE_ID = 'cc67411c-1da0-4b15-8c8a-4d4d7533bc7c';
const LEARNING_PATH_ID = '3dec10d9-032e-42c3-abcb-608e0b275a7d';
const CAPABILITY_CODE = 'research.evidence.synthesize';
const TARGET_REF = 'scout-r001:ve-standards-operational-readiness';
const MODEL = 'qwen3:0.6b';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const packet = JSON.parse(readFileSync(new URL('../../../docs/ve/scout/SCOUT-R001-EVIDENCE-PACKET.v0.1.json', import.meta.url), 'utf8'));
const artifactPath = process.env.SCOUT_FIRST_DAY_ARTIFACT ?? 'artifacts/scout-003-first-day-evidence.json';
const attestationAuditId = process.env.SCOUT_ATTESTATION_AUDIT_ID;
if (!attestationAuditId || !UUID_RE.test(attestationAuditId)) throw new Error('SCOUT_ATTESTATION_AUDIT_ID must be the exact durable human-attestation audit UUID');
const pool = new Pool(liveTestDatabaseConfig(process.env.SUPABASE_SESSION_DATABASE_URL, 'comind-scout-003-first-day'));

async function query(text, params = []) { const result = await pool.query(text, params); return { rows: result.rows }; }
async function one(text, params = []) { const result = await query(text, params); assert.equal(result.rows.length, 1); return result.rows[0]; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function writeEvidence(value) {
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '# Scout first day', '',
      `- Outcome: ${value.outcome}`,
      `- Scout lifecycle: ${value.scout_status ?? 'unknown'}`,
      `- Assignment: SCOUT-R001`,
      `- Provider/model: ollama_local / ${MODEL}`,
      `- Paid cost: USD 0`,
      `- Active research grants after completion: ${value.active_research_grants_after ?? 'n/a'}`,
      `- Production: not touched`, '',
    ].join('\n'), { flag: 'a' });
  }
}

async function verifyAttestationAndSources() {
  const att = await one(`SELECT a.audit_id::text,a.actor_id::text,a.action,a.target_table,a.target_id::text,a.details,a.created_at FROM comind.cm_audit_log a WHERE a.audit_id=$1::uuid`, [attestationAuditId]);
  assert.equal(att.actor_id, FOUNDER_ACTOR_ID);
  assert.equal(att.action, 'scout.learning_path.activation_attested');
  assert.equal(att.target_table, 'comind.cm_learning_path');
  assert.equal(att.target_id, LEARNING_PATH_ID);
  assert.equal(att.details?.control_id, CONTROL_ID);
  assert.equal(Number(att.details?.issue), ISSUE);
  assert.equal(att.details?.attested, true);
  assert.equal(att.details?.activation_status, 'active');
  const path = await one(`SELECT path_id::text,slug,status,metadata FROM comind.cm_learning_path WHERE path_id=$1::uuid`, [LEARNING_PATH_ID]);
  assert.equal(path.slug, 'virtual-employee-standards-v0-1');
  assert.equal(path.status, 'active');
  const rows = (await query(`SELECT lpi.sequence_no,lpi.required,rr.ref_id::text,rr.authority_level,rr.lifecycle_status,rr.drive_file_id,rr.content_sha256::text,rr.freshness_due_at,rr.superseded_by_ref_id::text FROM comind.cm_learning_path_item lpi JOIN comind.cm_research_refs rr ON rr.ref_id=lpi.ref_id WHERE lpi.path_id=$1::uuid ORDER BY lpi.sequence_no`, [LEARNING_PATH_ID])).rows;
  assert.equal(rows.length, packet.sources.length);
  for (const expected of packet.sources) {
    const actual = rows.find((row) => Number(row.sequence_no) === expected.sequence_no);
    assert.ok(actual, `Missing RLIB source sequence ${expected.sequence_no}`);
    assert.equal(actual.ref_id, expected.ref_id);
    assert.equal(actual.drive_file_id, expected.drive_file_id);
    assert.equal(actual.authority_level, expected.authority_level);
    assert.equal(actual.lifecycle_status, expected.lifecycle_status);
    assert.equal(actual.content_sha256, expected.content_sha256);
    if (expected.required) {
      assert.equal(actual.required, true);
      assert.ok(actual.freshness_due_at && new Date(actual.freshness_due_at).getTime() > Date.now(), `Required source ${expected.sequence_no} is stale`);
    }
    if (expected.lifecycle_status === 'withdrawn') assert.equal(actual.superseded_by_ref_id, expected.superseded_by_ref_id);
  }
  return { attestation: att, path, source_rows: rows };
}

async function verifyScout() {
  const row = await one(`SELECT a.actor_id::text,ag.agent_id::text,p.profile_id::text,p.status,p.authority_floor,p.authority_ceiling,p.activated_at,p.retired_at,(SELECT count(*)::int FROM comind.cm_actor_external_resource r WHERE r.actor_id=a.actor_id AND r.lifecycle_status NOT IN ('revoked','retired')) AS external_resources FROM comind.cm_actor a JOIN comind.cm_foundry_agent_profile p ON p.actor_id=a.actor_id JOIN comind.cm_agent ag ON ag.agent_id=p.agent_id WHERE a.handle::text='agent.scout'`);
  assert.equal(row.actor_id, SCOUT_ACTOR_ID); assert.equal(row.agent_id, SCOUT_AGENT_ID); assert.equal(row.profile_id, SCOUT_PROFILE_ID);
  assert.equal(row.authority_floor, 'C0'); assert.equal(row.authority_ceiling, 'C1'); assert.equal(row.retired_at, null); assert.equal(Number(row.external_resources), 0);
  assert.ok(['draft','active'].includes(row.status), `Unexpected Scout state ${row.status}`);
  return row;
}

async function ensureCapability() {
  await query(`INSERT INTO comind.cm_foundry_capability(capability_code,description,action,target_kind,max_authority,risk_class,cost_bearing,adapter) VALUES($1,'Synthesize a bounded supplied evidence packet into an evidence-grounded research work product for governed human review.','synthesize_evidence','research_assignment','C1','low',false,'ollama_local') ON CONFLICT (capability_code) DO NOTHING`, [CAPABILITY_CODE]);
  const cap = await one(`SELECT capability_id::text,capability_code,description,action,target_kind,max_authority,risk_class,cost_bearing,adapter FROM comind.cm_foundry_capability WHERE capability_code=$1`, [CAPABILITY_CODE]);
  assert.equal(cap.action, 'synthesize_evidence'); assert.equal(cap.target_kind, 'research_assignment'); assert.equal(cap.max_authority, 'C1'); assert.equal(cap.risk_class, 'low'); assert.equal(cap.cost_bearing, false); assert.equal(cap.adapter, 'ollama_local');
  return cap;
}

async function existingExecution(capabilityId) {
  return (await query(`SELECT ec.execution_context_id::text,ec.task_id::text,ec.authorization_decision_id::text,ec.idempotency_key,ec.created_at,eo.execution_outcome_id::text,eo.terminal_status,eo.summary,ar.result_ref,ar.result_fingerprint FROM comind.cm_foundry_execution_context ec JOIN comind.cm_foundry_execution_outcome eo ON eo.execution_context_id=ec.execution_context_id JOIN comind.cm_foundry_adapter_operation_result ar ON ar.adapter_operation_result_id=eo.adapter_operation_result_id WHERE ec.profile_id=$1::uuid AND ec.capability_id=$2::uuid AND ec.environment='isolated' AND ec.context->>'target_ref'=$3 ORDER BY ec.created_at`, [SCOUT_PROFILE_ID, capabilityId, TARGET_REF])).rows;
}

async function lifecycleAuthorization() {
  const capability = await one(`SELECT capability_id::text FROM comind.cm_foundry_capability WHERE capability_code='ve.lifecycle.activate'`);
  const request = await one(`INSERT INTO comind.cm_foundry_authorization_request(requesting_profile_id,requesting_actor_id,capability_id,project_id,task_id,authority_level,environment,target_kind,target_ref,reason,evidence_refs,expires_at) VALUES(NULL,$1::uuid,$2::uuid,$3::uuid,NULL,'C2','isolated','foundry_agent_profile',$4,'SCOUT-003 founder-authorized Test activation',jsonb_build_array('github:issue:427','control:SCOUT-003','attestation:' || $5::text),clock_timestamp()+interval '30 minutes') RETURNING authorization_request_id::text`, [FOUNDER_ACTOR_ID, capability.capability_id, PROJECT_ID, SCOUT_PROFILE_ID, attestationAuditId]);
  const decision = await one(`INSERT INTO comind.cm_foundry_authorization_decision(authorization_request_id,decision,decided_by_actor_id,decision_basis,policy_refs,effective_until) VALUES($1::uuid,'approved',$2::uuid,'SCOUT-003 bounded activation after explicit learning-path attestation',jsonb_build_array('github:issue:427','control:SCOUT-003'),clock_timestamp()+interval '30 minutes') RETURNING authorization_decision_id::text`, [request.authorization_request_id, FOUNDER_ACTOR_ID]);
  return { ...request, ...decision };
}

async function activateScoutIfNeeded(scout) {
  if (scout.status === 'active') return { outcome: 'already_active', before: scout, after: scout };
  const auth = await lifecycleAuthorization();
  const harness = createLiveLifecycleHarness({ connectionString: process.env.SUPABASE_SESSION_DATABASE_URL, applicationName: 'comind-scout-003-lifecycle', artifactPath });
  try {
    const result = await harness.execute({ action:'activate', profileId:SCOUT_PROFILE_ID, requestedByActorId:FOUNDER_ACTOR_ID, authorizationDecisionId:auth.authorization_decision_id, reason:'SCOUT-003 governed first-day activation', idempotencyKey:'scout-003-activate-v1', expectedFromState:'draft', expectedToState:'active', requireNoExternalResources:true });
    return { ...result, lifecycle_authorization_request_id: auth.authorization_request_id, lifecycle_authorization_decision_id: auth.authorization_decision_id };
  } finally { await harness.close(); }
}

async function ensureTask() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('SCOUT-003:SCOUT-R001'))`);
    let result = await client.query(`SELECT task_id::text,title,status FROM comind.cm_task WHERE project_id=$1::uuid AND title='SCOUT-R001: VE Standards Operational-Readiness Synthesis' ORDER BY created_at LIMIT 2`, [PROJECT_ID]);
    if (result.rows.length > 1) throw new Error('Multiple SCOUT-R001 task rows detected');
    if (result.rows.length === 0) result = await client.query(`INSERT INTO comind.cm_task(project_id,title,description,status,priority) VALUES($1::uuid,'SCOUT-R001: VE Standards Operational-Readiness Synthesis','SCOUT-003 canonical first assignment; exact target scout-r001:ve-standards-operational-readiness','todo',1) RETURNING task_id::text,title,status`, [PROJECT_ID]);
    await client.query('COMMIT'); return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function ensureGrant(capabilityId) {
  const active = (await query(`SELECT grant_id::text,scope,expires_at FROM comind.cm_foundry_capability_grant WHERE profile_id=$1::uuid AND capability_id=$2::uuid AND org_id=$3::uuid AND project_id=$4::uuid AND environment='isolated' AND revoked_at IS NULL AND expires_at>clock_timestamp() ORDER BY granted_at`, [SCOUT_PROFILE_ID, capabilityId, ORG_ID, PROJECT_ID])).rows;
  if (active.length > 1) throw new Error('Multiple active Scout research grants detected');
  if (active.length === 1) {
    assert.deepEqual(active[0].scope?.target_refs, [TARGET_REF]); assert.equal(Number(active[0].scope?.max_tasks), 1); assert.equal(active[0].scope?.delegation_allowed, false); return active[0];
  }
  return one(`INSERT INTO comind.cm_foundry_capability_grant(profile_id,capability_id,org_id,project_id,environment,authority_ceiling,scope,granted_by_actor_id,grant_reason,expires_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'isolated','C1',$5::jsonb,$6::uuid,'SCOUT-003 exact-target first-day grant',clock_timestamp()+interval '2 hours') RETURNING grant_id::text,scope,expires_at`, [SCOUT_PROFILE_ID, capabilityId, ORG_ID, PROJECT_ID, JSON.stringify({ target_refs:[TARGET_REF], max_tasks:1, delegation_allowed:false, assignment_id:'SCOUT-R001' }), FOUNDER_ACTOR_ID]);
}

async function workAuthorization(capabilityId, taskId, reason) {
  const request = await one(`INSERT INTO comind.cm_foundry_authorization_request(requesting_profile_id,requesting_actor_id,capability_id,project_id,task_id,authority_level,environment,target_kind,target_ref,reason,evidence_refs,expires_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'C1','isolated','research_assignment',$6,$7,jsonb_build_array('github:issue:427','control:SCOUT-003','assignment:SCOUT-R001','attestation:' || $8::text),clock_timestamp()+interval '30 minutes') RETURNING authorization_request_id::text`, [SCOUT_PROFILE_ID, SCOUT_ACTOR_ID, capabilityId, PROJECT_ID, taskId, TARGET_REF, reason, attestationAuditId]);
  const decision = await one(`INSERT INTO comind.cm_foundry_authorization_decision(authorization_request_id,decision,decided_by_actor_id,decision_basis,policy_refs,effective_until) VALUES($1::uuid,'approved',$2::uuid,'SCOUT-003 bounded C1 first-assignment decision',jsonb_build_array('github:issue:427','control:SCOUT-003'),clock_timestamp()+interval '30 minutes') RETURNING authorization_decision_id::text`, [request.authorization_request_id, FOUNDER_ACTOR_ID]);
  return { ...request, ...decision };
}

function buildPrompt() {
  const lines = ['You are Scout, a governed C1 research analyst. Use only the evidence below. Produce a compact evidence-grounded readiness synthesis for human review. Do not recommend authority expansion. State uncertainty explicitly. Distinguish current primary guidance, secondary non-normative guidance, and withdrawn history. Cover GOVERN, MAP, MEASURE, MANAGE, generative-AI governance, provenance, pre-deployment testing, incident disclosure, Scout boundaries, freshness, and prohibited actions.'];
  for (const source of packet.sources) {
    lines.push(`SOURCE ${source.sequence_no}: ${source.title} | authority=${source.authority_level} | lifecycle=${source.lifecycle_status}`);
    for (const point of source.material_points) lines.push(`- ${point}`);
    if (source.caveat) lines.push(`CAVEAT: ${source.caveat}`);
  }
  lines.push('Return concise prose with explicit evidence limits.');
  const prompt = lines.join('\n'); assert.ok(prompt.length <= 6000, `Prompt too long: ${prompt.length}`); return prompt;
}

async function preserveWorkProduct({ capability, grant, task, auth, execution, summary }) {
  const workProduct = {
    schema_version:'comind.ve.research-work-product.v0.1', assignment_id:'SCOUT-R001', research_objective:'VE Standards Operational-Readiness Synthesis',
    source_provenance: packet.sources.map((s) => ({ ref_id:s.ref_id, drive_file_id:s.drive_file_id, content_sha256:s.content_sha256 })),
    source_authority: packet.sources.map((s) => ({ ref_id:s.ref_id, authority_level:s.authority_level })), source_lifecycle: packet.sources.map((s) => ({ ref_id:s.ref_id, lifecycle_status:s.lifecycle_status, superseded_by_ref_id:s.superseded_by_ref_id ?? null })),
    retrieval_or_observation_time:new Date().toISOString(), material_sources_consulted:packet.sources.map((s) => s.ref_id), findings:summary,
    uncertainty:'Model synthesis is bounded to the supplied packet. It does not establish full standards coverage or authority beyond SCOUT-R001.', contradictory_or_negative_evidence:'Withdrawn NIST draft is retained as historical evidence and superseded by final NIST AI 600-1. Secondary ISO checklist is non-normative.',
    source_currentness_caveats:packet.sources.filter((s)=>s.caveat).map((s)=>s.caveat), material_tool_use:['FoundryRuntimeOrchestrator','ollama_local'], provider_model_provenance:{provider:'ollama_local',model:MODEL,result_ref:execution.resultRef},
    capability_code:CAPABILITY_CODE, capability_grant_id:grant.grant_id, authorization_decision_id:auth.authorization_decision_id, authority_used:'C1', environment:'isolated', target_kind:'research_assignment', target_ref:TARGET_REF, cost:{currency:'USD',actual:0,maximum:0},
    work_product_ref:`foundry-execution://${execution.executionContextId}`, review_status:'pending_human_review', failures_blocks_and_escalations:[], material_developmental_change:false,
    prohibited_actions:['authority expansion','open-web discovery','external resource mutation','delegation','paid provider use','Production mutation']
  };
  const serialized = JSON.stringify(workProduct);
  const digest = sha256(serialized);
  const existing = (await query(`SELECT evidence_id::text FROM comind.cm_evidence WHERE source_ref=$1`, [workProduct.work_product_ref])).rows;
  if (existing.length > 1) throw new Error('Duplicate SCOUT-R001 evidence records detected');
  const evidenceId = existing.length === 1 ? existing[0].evidence_id : (await one(`INSERT INTO comind.cm_evidence(title,source_type,source_ref,checksum,metadata) VALUES('SCOUT-R001 governed research work product','foundry_execution',$1,$2,$3::jsonb) RETURNING evidence_id::text`, [workProduct.work_product_ref, `sha256:${digest}`, JSON.stringify(workProduct)])).evidence_id;
  await query(`UPDATE comind.cm_task SET status='done',updated_at=clock_timestamp() WHERE task_id=$1::uuid`, [task.task_id]);
  await query(`INSERT INTO comind.cm_audit_log(actor_id,action,target_table,target_id,details) SELECT $1::uuid,'scout.first_day.completed','comind.cm_foundry_execution_context',$2::uuid,$3::jsonb WHERE NOT EXISTS (SELECT 1 FROM comind.cm_audit_log WHERE action='scout.first_day.completed' AND target_id=$2::uuid)`, [SCOUT_ACTOR_ID, execution.executionContextId, JSON.stringify({ issue:ISSUE, control_id:CONTROL_ID, assignment_id:'SCOUT-R001', evidence_id:evidenceId, work_product_sha256:digest, grant_id:grant.grant_id, authorization_decision_id:auth.authorization_decision_id, cost_usd:0, review_status:'pending_human_review' })]);
  return { workProduct, digest, evidenceId };
}

async function revokeGrant(grantId) { await query(`UPDATE comind.cm_foundry_capability_grant SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE grant_id=$1::uuid`, [grantId]); }

async function main() {
  const preflight = await verifyAttestationAndSources();
  let scout = await verifyScout();
  const capability = await ensureCapability();
  const prior = await existingExecution(capability.capability_id);
  if (prior.length > 1) throw new Error('More than one authoritative SCOUT-R001 execution exists');
  if (prior.length === 1) {
    assert.equal(prior[0].terminal_status, 'succeeded'); assert.equal(scout.status, 'active');
    const activeGrants = Number((await one(`SELECT count(*)::int AS n FROM comind.cm_foundry_capability_grant WHERE profile_id=$1::uuid AND capability_id=$2::uuid AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [SCOUT_PROFILE_ID, capability.capability_id])).n);
    const evidence = { outcome:'replay_verified', issue:ISSUE, control_id:CONTROL_ID, scout_status:scout.status, execution:prior[0], attestation_audit_id:attestationAuditId, active_research_grants_after:activeGrants, external_resources:Number(scout.external_resources), paid_cost_usd:0, production:false };
    writeEvidence(evidence); console.log(JSON.stringify(evidence)); return;
  }
  const activation = await activateScoutIfNeeded(scout); scout = await verifyScout(); assert.equal(scout.status, 'active');
  const task = await ensureTask();
  const grant = await ensureGrant(capability.capability_id);
  const auth = await workAuthorization(capability.capability_id, task.task_id, 'SCOUT-003 first authorized research assignment');
  const registry = new FoundryAdapterRegistry();
  registry.register('ollama_local', createLocalOllamaFoundryAdapter({ baseUrl:process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434', model:MODEL, maxOutputTokens:256 }));
  const orchestrator = new FoundryRuntimeOrchestrator(query, registry);
  const execution = await orchestrator.execute({ profileId:SCOUT_PROFILE_ID, capabilityCode:CAPABILITY_CODE, authorizationDecisionId:auth.authorization_decision_id, authorityLevel:'C1', environment:'isolated', targetKind:'research_assignment', targetRef:TARGET_REF, projectId:PROJECT_ID, taskId:task.task_id, budgetBindingId:null, idempotencyKey:'scout-003-r001-v1', input:{ assignment_id:'SCOUT-R001', evidence_contract:'SCOUT-002-EVIDENCE', evidence_packet_id:packet.packet_id, provider:'ollama_local', model:MODEL, supplied_evidence_only:true, cost_usd_max:0, prompt:buildPrompt() } });
  assert.equal(execution.terminalStatus, 'succeeded'); assert.match(execution.resultRef, /^ollama-local:\/\/qwen3:0\.6b\/[0-9a-f]{64}$/);
  const work = await preserveWorkProduct({ capability, grant, task, auth, execution, summary:execution.summary });
  const ceilingAuth = await workAuthorization(capability.capability_id, task.task_id, 'SCOUT-003 one-task ceiling verification only');
  let ceilingCode = null;
  try { await orchestrator.execute({ profileId:SCOUT_PROFILE_ID, capabilityCode:CAPABILITY_CODE, authorizationDecisionId:ceilingAuth.authorization_decision_id, authorityLevel:'C1', environment:'isolated', targetKind:'research_assignment', targetRef:TARGET_REF, projectId:PROJECT_ID, taskId:task.task_id, budgetBindingId:null, idempotencyKey:`scout-003-r001-ceiling-${randomUUID()}`, input:{ assignment_id:'SCOUT-R001', evidence_contract:'SCOUT-002-EVIDENCE', provider:'ollama_local', model:MODEL, supplied_evidence_only:true, cost_usd_max:0, prompt:buildPrompt() } }); } catch (error) { if (error instanceof FoundryRuntimeError) ceilingCode=error.code; else throw error; }
  assert.equal(ceilingCode, 'grant_task_limit_exceeded');
  await query(`UPDATE comind.cm_foundry_authorization_request SET status='cancelled' WHERE authorization_request_id=$1::uuid`, [ceilingAuth.authorization_request_id]);
  await revokeGrant(grant.grant_id);
  const finalScout = await verifyScout();
  const activeResearchGrants = Number((await one(`SELECT count(*)::int AS n FROM comind.cm_foundry_capability_grant WHERE profile_id=$1::uuid AND capability_id=$2::uuid AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [SCOUT_PROFILE_ID, capability.capability_id])).n);
  assert.equal(activeResearchGrants, 0); assert.equal(Number(finalScout.external_resources), 0);
  const authoritativeExecutions = await existingExecution(capability.capability_id); assert.equal(authoritativeExecutions.length, 1);
  const evidence = { outcome:'first_day_succeeded', issue:ISSUE, control_id:CONTROL_ID, scout_status:finalScout.status, lifecycle:activation, assignment_id:'SCOUT-R001', task_id:task.task_id, capability_id:capability.capability_id, grant_id:grant.grant_id, work_authorization_request_id:auth.authorization_request_id, work_authorization_decision_id:auth.authorization_decision_id, execution_context_id:execution.executionContextId, execution_outcome_id:execution.executionOutcomeId, result_ref:execution.resultRef, work_product_evidence_id:work.evidenceId, work_product_sha256:work.digest, review_status:'pending_human_review', one_task_ceiling_proof:ceilingCode, attestation_audit_id:attestationAuditId, source_count:preflight.source_rows.length, active_research_grants_after:activeResearchGrants, external_resources:Number(finalScout.external_resources), paid_cost_usd:0, production:false };
  writeEvidence(evidence); console.log(JSON.stringify(evidence));
}

try { await main(); } catch (error) {
  try { const capability = (await query(`SELECT capability_id::text FROM comind.cm_foundry_capability WHERE capability_code=$1`, [CAPABILITY_CODE])).rows[0]; if (capability) await query(`UPDATE comind.cm_foundry_capability_grant SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE profile_id=$1::uuid AND capability_id=$2::uuid AND revoked_at IS NULL`, [SCOUT_PROFILE_ID, capability.capability_id]); } catch {}
  const failure = { outcome:'failed', issue:ISSUE, control_id:CONTROL_ID, error:error instanceof Error ? error.message : String(error), attestation_audit_id:attestationAuditId, production:false, paid_cost_usd:0 };
  writeEvidence(failure); throw error;
} finally { await pool.end(); }
