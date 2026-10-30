import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://ce002_test:ce002_test@127.0.0.1:65432/ce002_unit';

const {
  persistRecoveryOutcome,
  resolveRecovery,
} = await import('../dist/continuous-excellence/recovery.js');
const { ContinuityHandoffError } = await import('../dist/continuity/handoff.js');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const CAPSULE_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-10-30T07:30:00.000Z';

function capsule(overrides = {}) {
  return {
    capsule_id: CAPSULE_ID,
    project_id: PROJECT_ID,
    task_id: TASK_ID,
    capsule_key: 'CE-002',
    version: 2,
    predecessor_capsule_id: '44444444-4444-4444-8444-444444444444',
    objective: 'Recover safely',
    completion_criteria: ['deterministic recovery'],
    verification_method: ['exact-head CI'],
    acceptance_authority: { human: 'Joseph' },
    accepted_baseline: { base_sha: 'abc' },
    authoritative_sources: [],
    decisions: [],
    constraints: ['no production'],
    last_verified_action: 'branch created',
    active_work: ['adapter'],
    unresolved: [],
    blockers: [],
    pending_approvals: [],
    next_safe_action: 'continue implementation',
    rollback_point: 'retain CE-001',
    recovery_state: 'ready',
    confidence: 'verified',
    source_system: 'github',
    source_ref: 'https://example.invalid/branch',
    captured_by_actor_id: null,
    content_hash: 'a'.repeat(64),
    captured_at: NOW,
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    capsuleKey: 'CE-002',
    projectKey: 'COMIND',
    workKey: 'CE-002',
    now: NOW,
    continuationAuthority: 'authorized',
    interrupt: {
      interruptKey: 'interrupt-1',
      trigger: 'Lost context',
      sourceSystem: 'chatgpt',
      sourceRef: 'chat://ce-002',
      observedAt: NOW,
    },
    ...overrides,
  };
}

function resolverQuery({ currentCapsule = capsule(), taskStatus = 'in_progress', runBookStatus = 'in_progress' } = {}) {
  const sqlSeen = [];
  const query = async (sql) => {
    sqlSeen.push(sql);
    if (/\b(?:insert|update|delete|truncate)\b/i.test(sql)) {
      throw new Error(`Read-only resolver attempted mutation: ${sql}`);
    }
    if (sql.includes('FROM comind.v_ce_current_continuity_capsule')) {
      return { rows: currentCapsule ? [currentCapsule] : [] };
    }
    if (sql.includes('FROM comind.cm_task')) return { rows: taskStatus ? [{ status: taskStatus }] : [] };
    if (sql.includes('FROM comind_pm.pm_work_items wi')) {
      return { rows: runBookStatus ? [{ status: runBookStatus, current_summary: 'summary', last_event_at: NOW }] : [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { query, sqlSeen };
}

const noOpAdapters = {
  resolveThreadKeeper: async () => {
    throw new Error('ThreadKeeper adapter should not be called');
  },
  coordinateAcp: async () => {
    throw new Error('ACP adapter should not be called');
  },
};

test('complete recovery requires agreement between CE capsule, canonical task, and RunBook', async () => {
  const { query, sqlSeen } = resolverQuery({
    currentCapsule: capsule({ recovery_state: 'complete' }),
    taskStatus: 'done',
    runBookStatus: 'done',
  });
  const result = await resolveRecovery(query, request(), noOpAdapters);
  assert.equal(result.state, 'complete');
  assert.equal(result.confidence, 'verified');
  assert.equal(result.resumeAllowed, false);
  assert.equal(sqlSeen.some(sql => /\b(?:insert|update|delete|truncate)\b/i.test(sql)), false);
});

test('verified authoritative observations permit automatic continuation inside existing authority', async () => {
  const { query } = resolverQuery();
  const result = await resolveRecovery(query, request({
    authoritativeObservations: [{
      sourceSystem: 'github', sourceRef: 'github://main', subject: 'branch head', status: 'verified', summary: 'matches expected head',
    }, {
      sourceSystem: 'supabase', sourceRef: 'supabase://test', subject: 'durable state', status: 'verified', summary: 'matches RunBook',
    }],
  }), noOpAdapters);
  assert.equal(result.state, 'ready');
  assert.equal(result.resumeAllowed, true);
  assert.equal(result.reasons.length, 0);
});

test('one unavailable authoritative dependency produces partial recovery', async () => {
  const { query } = resolverQuery();
  const result = await resolveRecovery(query, request({
    authoritativeObservations: [{
      sourceSystem: 'github', sourceRef: 'github://ci', subject: 'CI', status: 'unavailable', summary: 'provider temporarily unavailable',
    }],
  }), noOpAdapters);
  assert.equal(result.state, 'partial');
  assert.equal(result.confidence, 'mixed');
  assert.equal(result.resumeAllowed, false);
});

test('known human authority boundary produces blocked recovery rather than guessed permission', async () => {
  const { query } = resolverQuery();
  const result = await resolveRecovery(query, request({ continuationAuthority: 'requires_approval' }), noOpAdapters);
  assert.equal(result.state, 'blocked');
  assert.equal(result.confidence, 'verified');
  assert.ok(result.reasons.includes('continuation_requires_approval'));
});

test('material authoritative source conflict produces uncertain recovery', async () => {
  const { query } = resolverQuery();
  const result = await resolveRecovery(query, request({
    authoritativeObservations: [{
      sourceSystem: 'github', sourceRef: 'github://main', subject: 'merge state', status: 'conflict', summary: 'conversation says open, GitHub says merged',
    }],
  }), noOpAdapters);
  assert.equal(result.state, 'uncertain');
  assert.equal(result.confidence, 'uncertain');
  assert.equal(result.resumeAllowed, false);
});

test('canonical task and RunBook terminal disagreement is treated as uncertain', async () => {
  const { query } = resolverQuery({ taskStatus: 'done', runBookStatus: 'in_progress' });
  const result = await resolveRecovery(query, request(), noOpAdapters);
  assert.equal(result.state, 'uncertain');
  assert.ok(result.reasons.includes('canonical_work_state_conflict'));
});

test('ThreadKeeper stale checkpoint is a conflict, not a plausible continuation', async () => {
  const { query } = resolverQuery();
  const adapters = {
    ...noOpAdapters,
    resolveThreadKeeper: async () => {
      throw new ContinuityHandoffError('stale_checkpoint', 'expected checkpoint is stale');
    },
  };
  const result = await resolveRecovery(query, request({
    threadKeeper: { scopeSemanticKey: 'project:comind:ce-002', expectedCheckpointId: 'stale' },
  }), adapters);
  assert.equal(result.state, 'uncertain');
  assert.ok(result.reasons.includes('threadkeeper_state_conflict'));
});

test('ThreadKeeper accepted handoff with no unresolved cases composes as verified recovery evidence', async () => {
  const { query } = resolverQuery();
  const adapters = {
    ...noOpAdapters,
    resolveThreadKeeper: async () => ({
      version: 'continuity-handoff-v1',
      scopeSemanticKey: 'project:comind:ce-002',
      currentCheckpoint: {
        checkpointId: '55555555-5555-4555-8555-555555555555', parentCheckpointId: null,
        persistenceSeq: '1', acceptedAt: NOW, acceptedByRef: 'human://joseph',
        authorityEvidenceRef: 'evidence://authority', policyRef: null,
        stateDigest: 'b'.repeat(64), proposalDigest: 'c'.repeat(64),
      },
      lineage: { checkpointIds: ['55555555-5555-4555-8555-555555555555'], depth: 1 },
      unresolvedCases: [],
      continuityDigest: 'd'.repeat(64),
      consumer: { consumerRef: 'ce-002-recovery-adapter', providerRef: null, actorRef: null, authorityMode: 'requires_independent_validation', resolvedAt: NOW },
    }),
  };
  const result = await resolveRecovery(query, request({ threadKeeper: { scopeSemanticKey: 'project:comind:ce-002' } }), adapters);
  assert.equal(result.state, 'ready');
  assert.equal(result.threadKeeper.currentCheckpoint.checkpointId, '55555555-5555-4555-8555-555555555555');
});

test('ACP degraded reconciliation produces partial recovery without replaying work', async () => {
  const { query } = resolverQuery();
  const adapters = {
    ...noOpAdapters,
    coordinateAcp: async () => ({ status: 'DEGRADED', state: { pending: [] }, reasons: ['dependency_unavailable'] }),
  };
  const result = await resolveRecovery(query, request({
    acp: { conversationId: 'conv-1', authority: { subjectId: 'system', capabilityIds: [], policyVersion: 'p1' } },
  }), adapters);
  assert.equal(result.state, 'partial');
  assert.ok(result.reasons.includes('acp_recovery_degraded'));
});

test('repeated material recovery friction recommends entry into CE improvement lifecycle', async () => {
  const { query } = resolverQuery();
  const result = await resolveRecovery(query, request({
    priorSimilarRecoveryCount: 2,
    authoritativeObservations: [{
      sourceSystem: 'ci', sourceRef: 'ci://run', subject: 'workflow', status: 'unavailable', summary: 'run data unavailable',
    }],
  }), noOpAdapters);
  assert.equal(result.state, 'partial');
  assert.equal(result.improvementRecommended, true);
});

function persistenceHarness({ currentCapsule = capsule(), existingCapsuleForRecovery = null } = {}) {
  const state = {
    signalWrites: 0,
    runBookWrites: 0,
    capsuleWrites: 0,
    existingRunBookId: null,
    existingCapsuleId: existingCapsuleForRecovery,
    sql: [],
  };
  const query = async (sql, params = []) => {
    state.sql.push(sql);
    if (sql.includes('record_ce_signal')) {
      state.signalWrites += 1;
      return { rows: [{ signal_id: '66666666-6666-4666-8666-666666666666' }] };
    }
    if (sql.includes('FROM comind_pm.pm_events e')) {
      return { rows: state.existingRunBookId ? [{ id: state.existingRunBookId }] : [] };
    }
    if (sql.includes('record_runbook_event')) {
      state.runBookWrites += 1;
      state.existingRunBookId = '77777777-7777-4777-8777-777777777777';
      return { rows: [{ runbook_event_id: state.existingRunBookId }] };
    }
    if (sql.includes('FROM comind.cm_ce_continuity_capsule') && sql.includes("source_system='continuous_excellence'")) {
      return { rows: state.existingCapsuleId ? [{ capsule_id: state.existingCapsuleId }] : [] };
    }
    if (sql.includes('capture_ce_continuity_capsule')) {
      state.capsuleWrites += 1;
      state.existingCapsuleId = '88888888-8888-4888-8888-888888888888';
      assert.equal(params[0], PROJECT_ID);
      assert.equal(params[1], TASK_ID);
      return { rows: [{ capsule_id: state.existingCapsuleId }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { query, state, currentCapsule };
}

test('material recovery persistence creates one successor capsule and replay creates no duplicate history', async () => {
  const harness = persistenceHarness();
  const req = request({
    nextSafeAction: 'inspect authoritative source',
    authoritativeObservations: [{
      sourceSystem: 'github', sourceRef: 'github://main', subject: 'state', status: 'conflict', summary: 'stale conversation',
    }],
  });
  const resolution = {
    version: 'ce-002-recovery-v1',
    state: 'uncertain', confidence: 'uncertain', reasons: ['external_conflict:github:state'],
    resumeAllowed: false, improvementRecommended: false, nextSafeAction: 'inspect authoritative source',
    currentCapsule: harness.currentCapsule, canonicalTaskStatus: 'in_progress', runBookStatus: 'in_progress',
    sources: [{ sourceSystem: 'github', sourceRef: 'github://main', status: 'conflict', summary: 'state: stale conversation' }],
    threadKeeper: null, acp: null,
  };

  const first = await persistRecoveryOutcome(harness.query, req, resolution);
  assert.equal(first.capsuleCreated, true);
  assert.equal(first.replayed, false);
  assert.equal(harness.state.runBookWrites, 1);
  assert.equal(harness.state.capsuleWrites, 1);

  const second = await persistRecoveryOutcome(harness.query, req, resolution);
  assert.equal(second.capsuleCreated, false);
  assert.equal(second.replayed, true);
  assert.equal(harness.state.runBookWrites, 1);
  assert.equal(harness.state.capsuleWrites, 1);
  assert.equal(harness.state.sql.some(sql => /^\s*(UPDATE|DELETE|TRUNCATE)\b/i.test(sql)), false);
});

test('non-material ready recovery records signal and RunBook evidence without manufacturing a capsule version', async () => {
  const current = capsule({
    authoritative_sources: [{ system: 'continuous_excellence', ref: 'ce://existing', status: 'verified', summary: 'existing' }],
  });
  const harness = persistenceHarness({ currentCapsule: current });
  const resolution = {
    version: 'ce-002-recovery-v1',
    state: 'ready', confidence: 'verified', reasons: [], resumeAllowed: true, improvementRecommended: false,
    nextSafeAction: current.next_safe_action,
    currentCapsule: current, canonicalTaskStatus: 'in_progress', runBookStatus: 'in_progress',
    sources: [], threadKeeper: null, acp: null,
  };
  const result = await persistRecoveryOutcome(harness.query, request(), resolution);
  assert.equal(result.capsuleCreated, false);
  assert.equal(harness.state.runBookWrites, 1);
  assert.equal(harness.state.capsuleWrites, 0);
});
