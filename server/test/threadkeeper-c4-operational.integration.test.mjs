import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';

const enabled = process.env.THREADKEEPER_C4_DB_TEST === '1';
const runKey = process.env.THREADKEEPER_C4_RUN_ID?.trim() || 'isolated';
const databaseUrl = process.env.THREADKEEPER_C4_DATABASE_URL || process.env.DATABASE_URL;

function uuidFor(label) {
  const hex = crypto.createHash('sha256').update(`${runKey}:${label}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function at(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

function observation(id, scopeBinding, evidenceRef, observedAt, options = {}) {
  return {
    observationId: id,
    eventType: options.eventType ?? 'threadkeeper.c4.synthetic',
    sourceSystem: 'tk-007-c4-proof',
    observedAt,
    scopeBinding,
    ...(options.priorCheckpointRef ? { priorCheckpointRef: options.priorCheckpointRef } : {}),
    currentStateRefs: options.currentStateRefs ?? ['state:stable'],
    ...(options.findingType ? { findingType: options.findingType } : {}),
    ...(options.findingSeverity ? { findingSeverity: options.findingSeverity } : {}),
    confidence: 0.95,
    uncertainty: 0.05,
    evidenceRefs: [evidenceRef],
    actorRef: 'actor:tk-007-test-runtime',
    authorityRef: options.authorityRef ?? 'authority:tk-007:test',
    policyRef: 'policy:tk-007:c4-test',
    correlationId: `correlation:${runKey}`,
    traceId: crypto.createHash('sha256').update(`${runKey}:${id}:trace`).digest('hex').slice(0, 32),
    spanId: crypto.createHash('sha256').update(`${runKey}:${id}:span`).digest('hex').slice(0, 16),
    sensitivity: 'synthetic_test',
    retentionClass: 'development_evidence',
  };
}

const availableResolver = {
  async resolve(ref) {
    return { status: 'available', ref: structuredClone(ref) };
  },
};

const failingResolver = {
  async resolve() {
    throw new Error('synthetic evidence resolver outage');
  },
};

test('TK-007 proves sustained Test operation, observability, authority, failure, recovery, and stale-head safety', {
  skip: !enabled,
}, async () => {
  if (!databaseUrl) throw new Error('THREADKEEPER_C4_DATABASE_URL or DATABASE_URL is required');

  const {
    InMemoryObservationReferenceRegistry,
    ThreadKeeperService,
  } = await import('../dist/threadkeeper/service.js');
  const { InMemoryThreadKeeperObservability } = await import('../dist/threadkeeper/observability.js');
  const {
    appendCaseTransition,
    getContinuityContext,
    openContinuityCase,
    persistAcceptedCheckpoint,
    persistAssessment,
    registerContinuityScope,
  } = await import('../dist/threadkeeper/repository.js');
  const {
    finishThreadKeeperOperation,
    getThreadKeeperOperationalHealth,
    startThreadKeeperOperation,
    verifyStoredThreadKeeperOperationEvent,
  } = await import('../dist/threadkeeper/operations.js');
  const { closePool } = await import('../dist/db.js');

  const directPool = new pg.Pool({ connectionString: databaseUrl });
  const runtimeClient = new pg.Client({ connectionString: databaseUrl });
  await runtimeClient.connect();
  await runtimeClient.query('SET ROLE comind_threadkeeper_runtime');
  const query = async (sql, params) => ({ rows: (await runtimeClient.query(sql, params)).rows });

  const baseMs = process.env.THREADKEEPER_C4_BASE_TIME
    ? Date.parse(process.env.THREADKEEPER_C4_BASE_TIME)
    : Date.now();
  if (!Number.isFinite(baseMs)) throw new Error('Invalid THREADKEEPER_C4_BASE_TIME');

  const scopeBinding = {
    scopeType: 'governed_workflow',
    namespace: 'tk-007-c4',
    subjectRef: `run:${runKey}`,
  };
  const evidenceRef = {
    provider: 'tk-007-test',
    kind: 'synthetic_fixture',
    ref: `fixture:${runKey}`,
    version: '1',
    digest: crypto.createHash('sha256').update(`fixture:${runKey}`).digest('hex'),
    sensitivity: 'synthetic_test',
  };
  const authority = {
    valid: true,
    source: 'external',
    actorRef: 'founder:tk-007-test-authority',
    evidenceRef: 'authority:tk-007:test-authorization',
    policyRef: 'policy:tk-007:c4-test',
  };

  const evidence = {
    runKey,
    scopeSemanticKey: null,
    checkpointIds: [],
    operationIds: [],
    caseId: null,
    health: null,
    negativeAccess: null,
    staleHeadRejected: false,
    restartIdempotency: false,
  };

  try {
    const identity = await runtimeClient.query(`SELECT session_user::text, current_user::text`);
    assert.equal(identity.rows[0].current_user, 'comind_threadkeeper_runtime');

    const privilegeShape = await runtimeClient.query(
      `SELECT has_table_privilege(current_user,'comind.cm_threadkeeper_operation_event','SELECT') AS op_select,
              has_table_privilege(current_user,'comind.cm_threadkeeper_operation_event','INSERT') AS op_insert,
              has_table_privilege(current_user,'comind.cm_threadkeeper_operation_event','UPDATE') AS op_update,
              has_table_privilege(current_user,'comind.cm_threadkeeper_operation_event','DELETE') AS op_delete,
              has_table_privilege(current_user,'comind.cm_archive_source','SELECT') AS archive_select`,
    );
    assert.equal(privilegeShape.rows[0].op_select, true);
    assert.equal(privilegeShape.rows[0].op_insert, true);
    assert.equal(privilegeShape.rows[0].op_update, false);
    assert.equal(privilegeShape.rows[0].op_delete, false);
    assert.equal(privilegeShape.rows[0].archive_select, false);
    evidence.negativeAccess = privilegeShape.rows[0];

    const scope = await registerContinuityScope(
      query,
      scopeBinding,
      'actor:tk-007-test-runtime',
      'synthetic_test',
      'development_evidence',
    );
    evidence.scopeSemanticKey = scope.semantic_key;

    const metrics = new InMemoryThreadKeeperObservability();
    const service = new ThreadKeeperService({
      observationRegistry: new InMemoryObservationReferenceRegistry(),
      evidenceResolver: availableResolver,
      observability: metrics,
    });

    const op1Id = uuidFor('operation-root');
    evidence.operationIds.push(op1Id);
    const op1Start = await startThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op1:start`,
      operationId: op1Id,
      scopeId: scope.scope_id,
      operationKind: 'continuity_cycle',
      actorRef: 'actor:tk-007-test-runtime',
      authorityEvidenceRef: authority.evidenceRef,
      policyRef: authority.policyRef,
      correlationId: `correlation:${runKey}`,
      serviceInstanceId: `test:${runKey}`,
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 0),
    });
    assert.equal(verifyStoredThreadKeeperOperationEvent(op1Start), true);
    const op1Replay = await startThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op1:start`,
      operationId: op1Id,
      scopeId: scope.scope_id,
      operationKind: 'continuity_cycle',
      actorRef: 'actor:tk-007-test-runtime',
      authorityEvidenceRef: authority.evidenceRef,
      policyRef: authority.policyRef,
      correlationId: `correlation:${runKey}`,
      serviceInstanceId: `test:${runKey}`,
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 0),
    });
    assert.equal(op1Replay.operation_event_id, op1Start.operation_event_id);

    const firstObservation = observation(`tk-007:${runKey}:obs:baseline`, scopeBinding, evidenceRef, at(baseMs, 100));
    const firstReceipt = await service.observe(firstObservation);
    const firstAssessment = await service.assess({
      observation: firstObservation,
      receipt: firstReceipt,
      checkpointId: null,
      acceptedBaselinePresent: false,
      checkpointIntegrityValid: true,
      checkpointAuthorityValid: true,
      predecessorStatus: 'valid',
      authoritativeConflict: false,
      authorizedChange: false,
      materialChange: false,
      incompatibilityProven: false,
    });
    assert.equal(firstAssessment.classification, 'BLOCKED');
    const storedFirstAssessment = await persistAssessment(query, {
      idempotencyKey: `tk-007:${runKey}:assessment:baseline`,
      assessment: firstAssessment,
      createdAt: at(baseMs, 200),
    });

    const rootProposal = service.proposeCheckpoint({
      proposalId: `tk-007:${runKey}:proposal:root`,
      scopeSemanticKey: scope.semantic_key,
      parentCheckpointId: null,
      currentAcceptedCheckpointId: null,
      proposedAt: at(baseMs, 300),
      proposedByRef: 'actor:tk-007-test-runtime',
      policyRef: authority.policyRef,
      state: {
        objectiveRefs: ['objective:tk-007-operational-proof'],
        decisionRefs: [],
        commitmentRefs: [],
        obligationRefs: ['obligation:preserve-lineage'],
        contextRefs: [`assessment:${storedFirstAssessment.assessment_id}`],
        evidenceRefs: [evidenceRef],
        sourceRefs: [evidenceRef],
        sensitivity: 'synthetic_test',
        retentionClass: 'development_evidence',
      },
    });
    const rejectedSelfAuthority = service.acceptCheckpoint(rootProposal, null, {
      valid: true,
      source: 'threadkeeper',
      actorRef: 'threadkeeper:self',
      evidenceRef: 'authority:self',
    }, at(baseMs, 350));
    assert.equal(rejectedSelfAuthority.accepted, false);

    const rootCheckpoint = await persistAcceptedCheckpoint(rootProposal, authority, at(baseMs, 400));
    evidence.checkpointIds.push(rootCheckpoint.checkpointId);

    const op1Terminal = await finishThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op1:success`,
      operationId: op1Id,
      startedEventId: op1Start.operation_event_id,
      status: 'SUCCEEDED',
      resultRef: `checkpoint:${rootCheckpoint.checkpointId}`,
      evidenceRefs: [evidenceRef],
      durationMs: 400,
      recordedAt: at(baseMs, 400),
    });
    assert.equal(verifyStoredThreadKeeperOperationEvent(op1Terminal), true);

    const op2Id = uuidFor('operation-divergence');
    evidence.operationIds.push(op2Id);
    const op2Start = await startThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op2:start`,
      operationId: op2Id,
      scopeId: scope.scope_id,
      operationKind: 'continuity_cycle',
      actorRef: 'actor:tk-007-test-runtime',
      authorityEvidenceRef: authority.evidenceRef,
      policyRef: authority.policyRef,
      correlationId: `correlation:${runKey}`,
      serviceInstanceId: `test:${runKey}`,
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 1000),
    });

    const changedObservation = observation(`tk-007:${runKey}:obs:changed`, scopeBinding, evidenceRef, at(baseMs, 1100), {
      priorCheckpointRef: rootCheckpoint.checkpointId,
      currentStateRefs: ['state:authorized-change'],
      findingType: 'plan_divergence',
      findingSeverity: 'material',
    });
    const changedReceipt = await service.observe(changedObservation);
    const suspected = await service.assess({
      observation: changedObservation,
      receipt: changedReceipt,
      checkpointId: rootCheckpoint.checkpointId,
      acceptedBaselinePresent: true,
      checkpointIntegrityValid: true,
      checkpointAuthorityValid: true,
      predecessorStatus: 'valid',
      authoritativeConflict: false,
      authorizedChange: false,
      materialChange: true,
      incompatibilityProven: false,
    });
    assert.equal(suspected.classification, 'SUSPECTED_BREAK');
    const storedSuspected = await persistAssessment(query, {
      idempotencyKey: `tk-007:${runKey}:assessment:suspected`,
      assessment: suspected,
      createdAt: at(baseMs, 1200),
    });
    const opened = await openContinuityCase({
      caseKey: `tk-007:${runKey}:case:divergence`,
      scopeSemanticKey: scope.semantic_key,
      openedFromAssessmentId: storedSuspected.assessment_id,
      openedAt: at(baseMs, 1250),
      openedByRef: 'actor:tk-007-test-runtime',
      evidenceRefs: [evidenceRef],
    });
    evidence.caseId = opened.case.case_id;
    const assessedTransition = await appendCaseTransition({
      transitionKey: `tk-007:${runKey}:transition:assessed`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: opened.transition.transition_id,
      toState: 'ASSESSED',
      actorRef: 'actor:tk-007-test-runtime',
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 1300),
    });
    const route = service.route(suspected);
    const routedTransition = await appendCaseTransition({
      transitionKey: `tk-007:${runKey}:transition:routed`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: assessedTransition.transition_id,
      toState: 'ROUTED',
      routeCode: route.routeCode,
      actorRef: 'actor:tk-007-test-runtime',
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 1350),
    });

    const authorizedAssessment = await service.assess({
      observation: changedObservation,
      receipt: changedReceipt,
      checkpointId: rootCheckpoint.checkpointId,
      acceptedBaselinePresent: true,
      checkpointIntegrityValid: true,
      checkpointAuthorityValid: true,
      predecessorStatus: 'valid',
      authoritativeConflict: false,
      authorizedChange: true,
      materialChange: true,
      incompatibilityProven: false,
    });
    assert.equal(authorizedAssessment.classification, 'CHANGED_WITH_LINEAGE');
    await persistAssessment(query, {
      idempotencyKey: `tk-007:${runKey}:assessment:authorized`,
      assessment: authorizedAssessment,
      createdAt: at(baseMs, 1400),
    });

    const successorProposal = service.proposeCheckpoint({
      proposalId: `tk-007:${runKey}:proposal:successor`,
      scopeSemanticKey: scope.semantic_key,
      parentCheckpointId: rootCheckpoint.checkpointId,
      currentAcceptedCheckpointId: rootCheckpoint.checkpointId,
      proposedAt: at(baseMs, 1450),
      proposedByRef: 'actor:tk-007-test-runtime',
      policyRef: authority.policyRef,
      state: {
        objectiveRefs: ['objective:tk-007-operational-proof'],
        decisionRefs: ['decision:authorized-divergence'],
        commitmentRefs: [],
        obligationRefs: ['obligation:preserve-lineage'],
        contextRefs: [`case:${opened.case.case_id}`],
        evidenceRefs: [evidenceRef],
        sourceRefs: [evidenceRef],
        sensitivity: 'synthetic_test',
        retentionClass: 'development_evidence',
      },
    });
    const competingProposal = service.proposeCheckpoint({
      ...successorProposal,
      proposalId: `tk-007:${runKey}:proposal:competing`,
    });
    const successorCheckpoint = await persistAcceptedCheckpoint(successorProposal, authority, at(baseMs, 1500));
    evidence.checkpointIds.push(successorCheckpoint.checkpointId);
    await assert.rejects(
      () => persistAcceptedCheckpoint(competingProposal, authority, at(baseMs, 1510)),
      /stale_head/,
    );
    evidence.staleHeadRejected = true;

    await appendCaseTransition({
      transitionKey: `tk-007:${runKey}:transition:accepted-divergence`,
      caseId: opened.case.case_id,
      expectedPriorTransitionId: routedTransition.transition_id,
      toState: 'ACCEPTED_DIVERGENCE',
      actorRef: authority.actorRef,
      authorityEvidenceRef: authority.evidenceRef,
      evidenceRefs: [evidenceRef],
      successorCheckpointId: successorCheckpoint.checkpointId,
      recordedAt: at(baseMs, 1550),
    });
    await finishThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op2:success`,
      operationId: op2Id,
      startedEventId: op2Start.operation_event_id,
      status: 'SUCCEEDED',
      resultRef: `checkpoint:${successorCheckpoint.checkpointId}`,
      evidenceRefs: [evidenceRef],
      durationMs: 550,
      recordedAt: at(baseMs, 1550),
    });

    const context = await getContinuityContext(query, scope.semantic_key);
    assert.equal(context.acceptedCheckpoint.checkpoint_id, successorCheckpoint.checkpointId);
    assert.equal(context.unresolvedCases.length, 0);

    const restartedService = new ThreadKeeperService({
      observationRegistry: new InMemoryObservationReferenceRegistry(),
      evidenceResolver: availableResolver,
      observability: new InMemoryThreadKeeperObservability(),
    });
    const replayReceipt = await restartedService.observe(changedObservation);
    assert.equal(replayReceipt.disposition, 'accepted');
    const replayAssessment = await restartedService.assess({
      observation: changedObservation,
      receipt: replayReceipt,
      checkpointId: rootCheckpoint.checkpointId,
      acceptedBaselinePresent: true,
      checkpointIntegrityValid: true,
      checkpointAuthorityValid: true,
      predecessorStatus: 'valid',
      authoritativeConflict: false,
      authorizedChange: true,
      materialChange: true,
      incompatibilityProven: false,
    });
    const replayStored = await persistAssessment(query, {
      idempotencyKey: `tk-007:${runKey}:assessment:authorized`,
      assessment: replayAssessment,
      createdAt: at(baseMs, 1400),
    });
    const priorStored = await runtimeClient.query(
      `SELECT assessment_id::text FROM comind.cm_threadkeeper_assessment WHERE idempotency_key=$1`,
      [`tk-007:${runKey}:assessment:authorized`],
    );
    assert.equal(replayStored.assessment_id, priorStored.rows[0].assessment_id);
    evidence.restartIdempotency = true;

    const op3Id = uuidFor('operation-failure');
    evidence.operationIds.push(op3Id);
    const op3Start = await startThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op3:start`,
      operationId: op3Id,
      scopeId: scope.scope_id,
      operationKind: 'continuity_cycle',
      actorRef: 'actor:tk-007-test-runtime',
      authorityEvidenceRef: authority.evidenceRef,
      policyRef: authority.policyRef,
      correlationId: `correlation:${runKey}`,
      serviceInstanceId: `test:${runKey}`,
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 2000),
    });
    const failedService = new ThreadKeeperService({
      observationRegistry: new InMemoryObservationReferenceRegistry(),
      evidenceResolver: failingResolver,
      observability: new InMemoryThreadKeeperObservability(),
    });
    const failureObservation = observation(`tk-007:${runKey}:obs:failure`, scopeBinding, evidenceRef, at(baseMs, 2050), {
      priorCheckpointRef: successorCheckpoint.checkpointId,
    });
    const failureReceipt = await failedService.observe(failureObservation);
    const failureAssessment = await failedService.assess({
      observation: failureObservation,
      receipt: failureReceipt,
      checkpointId: successorCheckpoint.checkpointId,
      acceptedBaselinePresent: true,
      checkpointIntegrityValid: true,
      checkpointAuthorityValid: true,
      predecessorStatus: 'valid',
      authoritativeConflict: false,
      authorizedChange: false,
      materialChange: false,
      incompatibilityProven: false,
    });
    assert.equal(failureAssessment.classification, 'BLOCKED');
    const op3Terminal = await finishThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op3:failed`,
      operationId: op3Id,
      startedEventId: op3Start.operation_event_id,
      status: 'FAILED',
      errorType: 'evidence_resolver_unavailable',
      errorCode: 'synthetic_failure',
      evidenceRefs: [evidenceRef],
      durationMs: 100,
      recordedAt: at(baseMs, 2100),
    });
    let health = await getThreadKeeperOperationalHealth(query, 5000, new Date(at(baseMs, 2200)));
    assert.equal(health.status, 'degraded');
    assert.equal(health.unrecoveredFailures, 1);

    const op4Id = uuidFor('operation-recovery');
    evidence.operationIds.push(op4Id);
    const op4Start = await startThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op4:start`,
      operationId: op4Id,
      recoveryOfEventId: op3Terminal.operation_event_id,
      scopeId: scope.scope_id,
      operationKind: 'recovery',
      actorRef: 'actor:tk-007-test-runtime',
      authorityEvidenceRef: authority.evidenceRef,
      policyRef: authority.policyRef,
      correlationId: `correlation:${runKey}`,
      serviceInstanceId: `test:${runKey}:replacement`,
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 2300),
    });
    await finishThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op4:success`,
      operationId: op4Id,
      startedEventId: op4Start.operation_event_id,
      status: 'SUCCEEDED',
      resultRef: `checkpoint:${successorCheckpoint.checkpointId}`,
      evidenceRefs: [evidenceRef],
      durationMs: 150,
      recordedAt: at(baseMs, 2450),
    });
    health = await getThreadKeeperOperationalHealth(query, 5000, new Date(at(baseMs, 2500)));
    assert.equal(health.status, 'healthy');
    assert.equal(health.unrecoveredFailures, 0);

    const op5Id = uuidFor('operation-stale');
    evidence.operationIds.push(op5Id);
    const op5Start = await startThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op5:start`,
      operationId: op5Id,
      scopeId: scope.scope_id,
      operationKind: 'continuity_cycle',
      actorRef: 'actor:tk-007-test-runtime',
      authorityEvidenceRef: authority.evidenceRef,
      policyRef: authority.policyRef,
      correlationId: `correlation:${runKey}`,
      serviceInstanceId: `test:${runKey}:stale-worker`,
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 3000),
    });
    health = await getThreadKeeperOperationalHealth(query, 1000, new Date(at(baseMs, 4500)));
    assert.equal(health.status, 'failed');
    assert.equal(health.staleInFlight, 1);
    const op5Terminal = await finishThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op5:blocked`,
      operationId: op5Id,
      startedEventId: op5Start.operation_event_id,
      status: 'BLOCKED',
      errorType: 'stale_operation',
      errorCode: 'stale_after_threshold',
      evidenceRefs: [evidenceRef],
      durationMs: 1500,
      recordedAt: at(baseMs, 4500),
    });

    const op6Id = uuidFor('operation-stale-recovery');
    evidence.operationIds.push(op6Id);
    const op6Start = await startThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op6:start`,
      operationId: op6Id,
      recoveryOfEventId: op5Terminal.operation_event_id,
      scopeId: scope.scope_id,
      operationKind: 'recovery',
      actorRef: 'actor:tk-007-test-runtime',
      authorityEvidenceRef: authority.evidenceRef,
      policyRef: authority.policyRef,
      correlationId: `correlation:${runKey}`,
      serviceInstanceId: `test:${runKey}:replacement-2`,
      evidenceRefs: [evidenceRef],
      recordedAt: at(baseMs, 4600),
    });
    await finishThreadKeeperOperation(query, {
      eventKey: `tk-007:${runKey}:op6:success`,
      operationId: op6Id,
      startedEventId: op6Start.operation_event_id,
      status: 'SUCCEEDED',
      resultRef: `checkpoint:${successorCheckpoint.checkpointId}`,
      evidenceRefs: [evidenceRef],
      durationMs: 200,
      recordedAt: at(baseMs, 4800),
    });

    health = await getThreadKeeperOperationalHealth(query, 1000, new Date(at(baseMs, 4900)));
    assert.equal(health.status, 'healthy');
    assert.equal(health.staleInFlight, 0);
    assert.equal(health.unrecoveredFailures, 0);
    assert.ok(health.succeeded >= 4);
    assert.ok(health.p95SuccessfulDurationMs >= 150);
    evidence.health = health;

    await assert.rejects(
      () => runtimeClient.query(
        `UPDATE comind.cm_threadkeeper_operation_event SET actor_ref=actor_ref WHERE operation_event_id=$1::uuid`,
        [op1Start.operation_event_id],
      ),
      /permission denied|row-level security|immutable/i,
    );

    const tkSnapshot = metrics.snapshot();
    assert.ok(tkSnapshot.observations.accepted >= 2);
    assert.ok((tkSnapshot.assessments.BLOCKED ?? 0) >= 1);
    assert.ok((tkSnapshot.assessments.SUSPECTED_BREAK ?? 0) >= 1);
    assert.ok((tkSnapshot.assessments.CHANGED_WITH_LINEAGE ?? 0) >= 1);
    assert.ok(tkSnapshot.checkpointAcceptances.authority_failure >= 1);

    const path = process.env.THREADKEEPER_C4_EVIDENCE_PATH?.trim();
    if (path) {
      await fs.mkdir(new URL('.', `file://${path}`).pathname, { recursive: true }).catch(() => {});
      await fs.writeFile(path, JSON.stringify({
        generatedAt: new Date().toISOString(),
        environment: process.env.THREADKEEPER_C4_ENVIRONMENT || 'isolated',
        ...evidence,
        metrics: tkSnapshot,
      }, null, 2));
    }
  } finally {
    await runtimeClient.end().catch(() => {});
    await directPool.end().catch(() => {});
    await closePool().catch(() => {});
  }
});
