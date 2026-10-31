import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const databaseUrl = new URL(process.env.DATABASE_URL);
assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol));
assert.ok(['localhost', '127.0.0.1', 'db'].includes(databaseUrl.hostname));
assert.equal(databaseUrl.pathname, '/comind_ci');

const { query, closePool } = await import('../../dist/db.js');

after(closePool);

function futureDate(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function createConversation(t, suffix) {
  const result = await query(
    `INSERT INTO comind.cm_conversation (source, title, metadata)
     VALUES ('live', $1, jsonb_build_object('fixture','CFR-001E'))
     RETURNING conv_id`,
    [`CFR-001E ${suffix} ${process.pid}`]
  );
  const convId = result.rows[0].conv_id;
  t.after(async () => {
    await query('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [convId]);
  });
  return convId;
}

async function appendUser(convId, content) {
  const message = await query(
    `INSERT INTO comind.cm_message (conv_id, role, content, meta)
     VALUES ($1, 'user', $2, jsonb_build_object('fixture','CFR-001E'))
     RETURNING msg_id`,
    [convId, content]
  );
  const msgId = message.rows[0].msg_id;
  await query(
    `SELECT comind.cm_record_conversation_capture_event(
       p_conv_id => $1,
       p_event_type => 'user_message_observed',
       p_role => 'user',
       p_content_delta => $2,
       p_msg_id => $3,
       p_source_system => 'cfr_001e_test',
       p_source_event_ref => $4,
       p_raw_payload => jsonb_build_object('fixture','CFR-001E')
     )`,
    [convId, content, msgId, `user:${msgId}`]
  );
  return msgId;
}

async function startGeneration(convId, userMsgId) {
  const generation = await query(
    `INSERT INTO comind.cm_assistant_generation (
       conv_id, user_msg_id, provider, model, metadata
     ) VALUES (
       $1, $2, 'synthetic_cfr_001e', 'none', jsonb_build_object('fixture','CFR-001E')
     )
     RETURNING generation_id`,
    [convId, userMsgId]
  );
  const generationId = generation.rows[0].generation_id;
  await query(
    `SELECT comind.cm_record_conversation_capture_event(
       p_conv_id => $1,
       p_event_type => 'assistant_generation_started',
       p_role => 'assistant',
       p_generation_id => $2,
       p_source_system => 'cfr_001e_test',
       p_source_event_ref => $3,
       p_raw_payload => jsonb_build_object('fixture','CFR-001E')
     )`,
    [convId, generationId, `generation:${generationId}:started`]
  );
  return generationId;
}

async function appendDelta(convId, generationId, sequence, delta) {
  await query(
    `SELECT comind.cm_record_conversation_capture_event(
       p_conv_id => $1,
       p_event_type => 'assistant_delta',
       p_role => 'assistant',
       p_content_delta => $2,
       p_generation_id => $3,
       p_source_system => 'cfr_001e_test',
       p_source_event_ref => $4,
       p_raw_payload => jsonb_build_object('fixture','CFR-001E','provider_sequence_number',$5::int)
     )`,
    [convId, delta, generationId, `generation:${generationId}:delta:${sequence}`, sequence]
  );
}

async function interruptGeneration(convId, generationId) {
  await query(
    `UPDATE comind.cm_assistant_generation
     SET status='interrupted',
         interruption_reason='synthetic_cfr_001e',
         interrupted_at=now(),
         last_activity_at=now()
     WHERE generation_id=$1 AND status='active'`,
    [generationId]
  );
  await query(
    `SELECT comind.cm_record_conversation_capture_event(
       p_conv_id => $1,
       p_event_type => 'assistant_generation_interrupted',
       p_role => 'assistant',
       p_generation_id => $2,
       p_source_system => 'cfr_001e_test',
       p_source_event_ref => $3,
       p_raw_payload => jsonb_build_object('fixture','CFR-001E','reason','synthetic_cfr_001e')
     )`,
    [convId, generationId, `generation:${generationId}:interrupted`]
  );
}

async function createCheckpoint(convId, generationId = null, reason = 'cfr_001e_test') {
  const result = await query(
    `WITH state AS (
       SELECT
         COALESCE((SELECT max(sequence_no) FROM comind.cm_conversation_capture_event WHERE conv_id=$1),0) AS last_sequence,
         (SELECT msg_id FROM comind.cm_message WHERE conv_id=$1 ORDER BY created_at DESC, msg_id DESC LIMIT 1) AS last_msg_id,
         CASE WHEN $2::uuid IS NULL THEN NULL ELSE (
           SELECT string_agg(COALESCE(content_delta,''), '' ORDER BY sequence_no)
           FROM comind.cm_conversation_capture_event
           WHERE generation_id=$2::uuid AND event_type='assistant_delta'
         ) END AS partial_content,
         CASE WHEN $2::uuid IS NULL THEN NULL ELSE (
           SELECT status FROM comind.cm_assistant_generation
           WHERE generation_id=$2::uuid AND conv_id=$1
         ) END AS generation_status
     ), snapshot AS (
       SELECT *, jsonb_build_object(
         'conversation_id',$1::uuid,
         'generation_id',$2::uuid,
         'generation_status',generation_status,
         'last_capture_sequence',last_sequence,
         'last_complete_message_id',last_msg_id,
         'partial_assistant_content',partial_content,
         'checkpoint_reason',$3::text
       ) AS body
       FROM state
     )
     INSERT INTO comind.cm_conversation_recovery_checkpoint (
       conv_id, generation_id, checkpoint_reason, last_capture_sequence,
       last_complete_msg_id, partial_assistant_content, snapshot, snapshot_sha256
     )
     SELECT
       $1, $2, $3, last_sequence, last_msg_id, partial_content, body,
       encode(digest(body::text,'sha256'),'hex')
     FROM snapshot
     RETURNING checkpoint_id`,
    [convId, generationId, reason]
  );
  return result.rows[0].checkpoint_id;
}

async function promote(convId, checkpointId, decision, ordinal, options = {}) {
  const result = await query(
    `INSERT INTO comind.cm_conversation_promotion_evaluation (
       conv_id, checkpoint_id, decision, evaluated_by, rationale,
       protected_until, promotions, evidence, evaluated_at
     ) VALUES (
       $1, $2, $3, 'CFR-001E integration test', $4,
       $5, $6::jsonb, $7::jsonb, now() + ($8::int * interval '1 second')
     )
     RETURNING evaluation_id`,
    [
      convId,
      checkpointId,
      decision,
      options.rationale ?? `Synthetic ${decision} evaluation`,
      options.protectedUntil ?? null,
      JSON.stringify(options.promotions ?? []),
      JSON.stringify(options.evidence ?? [{ type: 'synthetic_fixture', id: `eval-${ordinal}` }]),
      ordinal,
    ]
  );
  return result.rows[0].evaluation_id;
}

async function evaluate(convId, asOf) {
  const result = await query(
    `SELECT comind.cm_evaluate_conversation_prune_eligibility($1,$2) AS result`,
    [convId, asOf]
  );
  return result.rows[0].result;
}

function hasReason(result, reason) {
  return result.hold_reasons.includes(reason);
}

test('protected raw window blocks pruning before checkpoint and promotion exist', async (t) => {
  const convId = await createConversation(t, 'protected-window');
  await appendUser(convId, 'Protected-window fixture.');

  const result = await evaluate(convId, futureDate(1));
  assert.equal(result.eligible, false);
  assert.equal(result.policy.minimum_protected_hours, 36);
  assert.equal(result.destructive_pruning_enabled, false);
  assert.equal(hasReason(result, 'protected_window_active'), true);
  assert.equal(hasReason(result, 'recovery_checkpoint_missing'), true);
  assert.equal(hasReason(result, 'promotion_evaluation_missing'), true);
});

test('active generation blocks pruning even when retention and promotion proof otherwise pass', async (t) => {
  const convId = await createConversation(t, 'active-generation');
  const userMsgId = await appendUser(convId, 'Active-generation fixture.');
  const generationId = await startGeneration(convId, userMsgId);
  const checkpointId = await createCheckpoint(convId, generationId);
  await promote(convId, checkpointId, 'eligible_to_prune', 1);

  const result = await evaluate(convId, futureDate(40));
  assert.equal(result.eligible, false);
  assert.equal(result.active_generation_count, 1);
  assert.equal(hasReason(result, 'active_generation'), true);
});

test('retain_raw and extend_protection remain explicit governance holds', async (t) => {
  const convId = await createConversation(t, 'promotion-holds');
  await appendUser(convId, 'Promotion-hold fixture.');
  const checkpointId = await createCheckpoint(convId);

  await promote(convId, checkpointId, 'retain_raw', 1);
  let result = await evaluate(convId, futureDate(40));
  assert.equal(result.eligible, false);
  assert.equal(hasReason(result, 'promotion_decision_retain_raw'), true);

  await promote(convId, checkpointId, 'extend_protection', 2, {
    protectedUntil: futureDate(80),
  });
  result = await evaluate(convId, futureDate(40));
  assert.equal(result.eligible, false);
  assert.equal(hasReason(result, 'extended_protection_active'), true);

  await promote(convId, checkpointId, 'eligible_to_prune', 3);
  result = await evaluate(convId, futureDate(40));
  assert.equal(result.eligible, true);
  assert.deepEqual(result.hold_reasons, []);
});

test('interrupted partial requires exact checkpoint preservation before manifest eligibility', async (t) => {
  const convId = await createConversation(t, 'interrupted-partial');
  const userMsgId = await appendUser(convId, 'Interrupted-partial fixture.');
  const generationId = await startGeneration(convId, userMsgId);
  await appendDelta(convId, generationId, 1, 'Recovered ');
  await appendDelta(convId, generationId, 2, 'partial text.');
  await interruptGeneration(convId, generationId);

  const genericCheckpoint = await createCheckpoint(convId);
  await promote(convId, genericCheckpoint, 'eligible_to_prune', 1);

  let result = await evaluate(convId, futureDate(40));
  assert.equal(result.eligible, false);
  assert.equal(hasReason(result, 'interrupted_partial_not_checkpointed'), true);

  const recoveryCheckpoint = await createCheckpoint(convId, generationId, 'interrupted_recovery');
  await promote(convId, recoveryCheckpoint, 'eligible_to_prune', 2, {
    promotions: [{
      type: 'recovery_checkpoint',
      checkpoint_id: recoveryCheckpoint,
      purpose: 'preserve_unfinished_assistant_text',
    }],
  });

  const asOf = futureDate(40);
  result = await evaluate(convId, asOf);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.hold_reasons, []);
  assert.equal(result.uncovered_interrupted_generation_count, 0);
  assert.equal(result.checkpoint.checkpoint_id, recoveryCheckpoint);
  assert.equal(result.promotion.checkpoint_id, recoveryCheckpoint);
  assert.equal(result.source_range.first_sequence, 1);
  assert.equal(result.source_range.last_sequence, 5);
  assert.equal(result.source_range.event_count, 5);
  assert.match(result.source_range.source_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.destructive_pruning_enabled, false);

  const firstManifest = await query(
    `SELECT comind.cm_create_conversation_prune_manifest($1,$2,$3) AS manifest_id`,
    [convId, 'CFR-001E integration test', asOf]
  );
  const secondManifest = await query(
    `SELECT comind.cm_create_conversation_prune_manifest($1,$2,$3) AS manifest_id`,
    [convId, 'CFR-001E integration test', asOf]
  );
  const manifestId = firstManifest.rows[0].manifest_id;
  assert.equal(secondManifest.rows[0].manifest_id, manifestId);

  const manifest = await query(
    `SELECT
       manifest_id, first_sequence, last_sequence, event_count,
       source_digest, durable_destinations, manifest_snapshot,
       manifest_sha256, created_by
     FROM comind.cm_conversation_prune_manifest
     WHERE manifest_id=$1`,
    [manifestId]
  );
  assert.equal(manifest.rows.length, 1);
  assert.equal(Number(manifest.rows[0].first_sequence), 1);
  assert.equal(Number(manifest.rows[0].last_sequence), 5);
  assert.equal(Number(manifest.rows[0].event_count), 5);
  assert.match(manifest.rows[0].source_digest, /^[a-f0-9]{64}$/);
  assert.match(manifest.rows[0].manifest_sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.rows[0].created_by, 'CFR-001E integration test');
  assert.equal(manifest.rows[0].manifest_snapshot.eligibility.destructive_pruning_enabled, false);
  assert.equal(manifest.rows[0].durable_destinations[0].checkpoint_id, recoveryCheckpoint);

  const recomputed = await query(
    `SELECT encode(
       digest(string_agg(sequence_no::text || ':' || event_sha256::text, '|' ORDER BY sequence_no),'sha256'),
       'hex'
     ) AS source_digest
     FROM comind.cm_conversation_capture_event
     WHERE conv_id=$1`,
    [convId]
  );
  assert.equal(recomputed.rows[0].source_digest, manifest.rows[0].source_digest);

  await assert.rejects(
    () => query(
      `UPDATE comind.cm_conversation_prune_manifest
       SET created_by='mutated'
       WHERE manifest_id=$1`,
      [manifestId]
    ),
    /append-only/
  );
});

test('retention bindings separate raw source from compact continuity evidence', async () => {
  const rows = await query(
    `SELECT rp.name::text AS policy_name, rb.target_table
     FROM comind.cm_retention_policy rp
     JOIN comind.cm_retention_binding rb ON rb.rp_id=rp.rp_id
     WHERE rp.name IN (
       'conversation_raw_protected_36h',
       'conversation_continuity_evidence_retained'
     )
     ORDER BY policy_name, target_table`
  );

  const rawTargets = rows.rows
    .filter((row) => row.policy_name === 'conversation_raw_protected_36h')
    .map((row) => row.target_table);
  assert.deepEqual(rawTargets, ['comind.cm_conversation_capture_event']);

  const evidenceTargets = rows.rows
    .filter((row) => row.policy_name === 'conversation_continuity_evidence_retained')
    .map((row) => row.target_table);
  assert.deepEqual(evidenceTargets, [
    'comind.cm_conversation_promotion_evaluation',
    'comind.cm_conversation_prune_manifest',
    'comind.cm_conversation_recovery_checkpoint',
  ]);
});
