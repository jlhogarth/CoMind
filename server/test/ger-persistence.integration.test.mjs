import test from 'node:test';
import assert from 'node:assert/strict';

const databaseUrl = process.env.DATABASE_URL?.trim();
const integrationTest = databaseUrl ? test : test.skip;

integrationTest('GER persistence reconstructs governed case lineage and rejects unsafe writes', async () => {
  const {
    openEpistemicCase,
    recordEpistemicObject,
    recordEpistemicRelationship,
    transitionEpistemicObject,
    appendEpistemicCaseEvent,
    readEpistemicCaseSnapshot,
  } = await import('../dist/epistemic/persistence.js');

  const prefix = `ger002-it-${process.pid}-${Date.now()}`;
  const openedAt = '2026-10-30T14:00:00.000Z';
  const sourceRefs = ['test:source:one'];
  const evidenceRefs = ['test:evidence:one'];

  const opened = await openEpistemicCase({
    caseKey: `${prefix}:case`,
    subjectRef: 'test:subject',
    purpose: 'GER-002 isolated persistence integration proof',
    environment: 'test',
    initialRigorClass: 2,
    dataClassification: 'INTERNAL',
    retentionProfileKey: 'DURABLE-EVIDENCE',
    sourceRefs,
    openedAt,
    openedByRef: 'test:actor',
    eventKey: `${prefix}:open`,
    casePayload: { synthetic: true },
  });

  const openedReplay = await openEpistemicCase({
    caseKey: `${prefix}:case`,
    subjectRef: 'test:subject',
    purpose: 'GER-002 isolated persistence integration proof',
    environment: 'test',
    initialRigorClass: 2,
    dataClassification: 'INTERNAL',
    retentionProfileKey: 'DURABLE-EVIDENCE',
    sourceRefs,
    openedAt,
    openedByRef: 'test:actor',
    eventKey: `${prefix}:open`,
    casePayload: { synthetic: true },
  });
  assert.equal(openedReplay.case.case_id, opened.case.case_id);
  assert.equal(openedReplay.event.event_id, opened.event.event_id);

  const claim = await recordEpistemicObject({
    caseId: opened.case.case_id,
    expectedPriorEventId: opened.event.event_id,
    eventKey: `${prefix}:claim:event`,
    objectKey: `${prefix}:claim`,
    objectType: 'claim',
    initialState: 'observed',
    summary: 'Synthetic claim',
    sourceRefs,
    content: { statement: 'Synthetic claim' },
    createdAt: '2026-10-30T14:00:01.000Z',
    createdByRef: 'test:actor',
    rationale: 'Record the claim without promoting it to fact.',
  });

  const claimReplay = await recordEpistemicObject({
    caseId: opened.case.case_id,
    expectedPriorEventId: opened.event.event_id,
    eventKey: `${prefix}:claim:event`,
    objectKey: `${prefix}:claim`,
    objectType: 'claim',
    initialState: 'observed',
    summary: 'Synthetic claim',
    sourceRefs,
    content: { statement: 'Synthetic claim' },
    createdAt: '2026-10-30T14:00:01.000Z',
    createdByRef: 'test:actor',
    rationale: 'Record the claim without promoting it to fact.',
  });
  assert.equal(claimReplay.object.object_id, claim.object.object_id);
  assert.equal(claimReplay.event.event_id, claim.event.event_id);

  const evidence = await recordEpistemicObject({
    caseId: opened.case.case_id,
    expectedPriorEventId: claim.event.event_id,
    eventKey: `${prefix}:evidence:event`,
    objectKey: `${prefix}:evidence`,
    objectType: 'evidence',
    initialState: 'observed',
    summary: 'Pointer to canonical evidence owned elsewhere',
    canonicalRef: 'cm_evidence:test-proof',
    sourceRefs,
    content: { referenceOnly: true },
    createdAt: '2026-10-30T14:00:02.000Z',
    createdByRef: 'test:actor',
    rationale: 'Reference canonical evidence without copying raw evidence.',
    evidenceRefs,
  });

  const relationship = await recordEpistemicRelationship({
    caseId: opened.case.case_id,
    expectedPriorEventId: evidence.event.event_id,
    eventKey: `${prefix}:support:event`,
    relationshipKey: `${prefix}:support`,
    subjectObjectId: evidence.object.object_id,
    predicate: 'supports',
    objectObjectId: claim.object.object_id,
    evidenceRefs,
    sourceRefs,
    validFrom: '2026-10-30T14:00:03.000Z',
    createdAt: '2026-10-30T14:00:03.000Z',
    createdByRef: 'test:actor',
    rationale: 'Record explicit support polarity.',
  });

  const investigated = await transitionEpistemicObject({
    caseId: opened.case.case_id,
    expectedPriorEventId: relationship.event.event_id,
    eventKey: `${prefix}:claim:investigate`,
    targetObjectId: claim.object.object_id,
    from: 'observed',
    to: 'investigated',
    actorRef: 'test:actor',
    rationale: 'Investigate the claim.',
    evidenceRefs,
    recordedAt: '2026-10-30T14:00:04.000Z',
  });

  await assert.rejects(
    transitionEpistemicObject({
      caseId: opened.case.case_id,
      expectedPriorEventId: investigated.event_id,
      eventKey: `${prefix}:claim:stale`,
      targetObjectId: claim.object.object_id,
      from: 'observed',
      to: 'challenged',
      actorRef: 'test:actor',
      rationale: 'This uses a stale object state and must fail.',
      evidenceRefs,
      recordedAt: '2026-10-30T14:00:05.000Z',
    }),
    /stale object state/i,
  );

  const connection = await recordEpistemicObject({
    caseId: opened.case.case_id,
    expectedPriorEventId: investigated.event_id,
    eventKey: `${prefix}:connection:event`,
    objectKey: `${prefix}:connection`,
    objectType: 'connection_candidate',
    initialState: 'observed',
    summary: 'Synthetic novel connection',
    sourceRefs,
    content: { candidate: true },
    createdAt: '2026-10-30T14:00:06.000Z',
    createdByRef: 'test:actor',
    rationale: 'Record a novel connection as a candidate only.',
  });

  const connectionInvestigated = await transitionEpistemicObject({
    caseId: opened.case.case_id,
    expectedPriorEventId: connection.event.event_id,
    eventKey: `${prefix}:connection:investigate`,
    targetObjectId: connection.object.object_id,
    from: 'observed',
    to: 'investigated',
    actorRef: 'test:actor',
    rationale: 'Investigate the novel connection.',
    evidenceRefs,
    recordedAt: '2026-10-30T14:00:07.000Z',
  });

  const connectionSupported = await transitionEpistemicObject({
    caseId: opened.case.case_id,
    expectedPriorEventId: connectionInvestigated.event_id,
    eventKey: `${prefix}:connection:support`,
    targetObjectId: connection.object.object_id,
    from: 'investigated',
    to: 'supported',
    actorRef: 'test:actor',
    rationale: 'Support the connection as a candidate, not a conclusion.',
    evidenceRefs,
    recordedAt: '2026-10-30T14:00:08.000Z',
  });

  await assert.rejects(
    transitionEpistemicObject({
      caseId: opened.case.case_id,
      expectedPriorEventId: connectionSupported.event_id,
      eventKey: `${prefix}:connection:conclude`,
      targetObjectId: connection.object.object_id,
      from: 'supported',
      to: 'concluded',
      actorRef: 'test:actor',
      rationale: 'Direct candidate conclusion must be blocked.',
      evidenceRefs,
      recordedAt: '2026-10-30T14:00:09.000Z',
    }),
    /connection candidate cannot be concluded directly/i,
  );

  const concluded = await appendEpistemicCaseEvent({
    caseId: opened.case.case_id,
    expectedPriorEventId: connectionSupported.event_id,
    eventKey: `${prefix}:case:concluded`,
    eventType: 'case_concluded',
    actorRef: 'test:actor',
    rationale: 'Conclude the synthetic case for reopening proof.',
    evidenceRefs,
    sourceRefs,
    recordedAt: '2026-10-30T14:00:10.000Z',
  });

  const reopened = await appendEpistemicCaseEvent({
    caseId: opened.case.case_id,
    expectedPriorEventId: concluded.event_id,
    eventKey: `${prefix}:case:reopened`,
    eventType: 'case_reopened',
    actorRef: 'test:actor',
    rationale: 'Material new evidence reopens the case.',
    evidenceRefs: ['test:evidence:new'],
    sourceRefs,
    recordedAt: '2026-10-30T14:00:11.000Z',
  });
  assert.equal(reopened.event_type, 'case_reopened');

  await assert.rejects(
    appendEpistemicCaseEvent({
      caseId: opened.case.case_id,
      expectedPriorEventId: reopened.event_id,
      eventKey: `${prefix}:case:reopened`,
      eventType: 'monitoring_recorded',
      actorRef: 'test:actor',
      rationale: 'Same event key with different material must fail.',
      evidenceRefs,
      sourceRefs,
      recordedAt: '2026-10-30T14:00:12.000Z',
    }),
    /reused with different content/i,
  );

  const snapshot = await readEpistemicCaseSnapshot(opened.case.case_id);
  assert.ok(snapshot);
  assert.equal(snapshot.status.case_status, 'reopened');
  assert.equal(Number(snapshot.status.object_count), 3);
  assert.equal(Number(snapshot.status.relationship_count), 1);
  assert.equal(snapshot.objects.find((row) => row.object_id === claim.object.object_id)?.current_state, 'investigated');
  assert.equal(snapshot.relationships[0]?.predicate, 'supports');
  assert.equal(snapshot.events[0]?.event_type, 'case_opened');
  assert.equal(snapshot.events.at(-1)?.event_type, 'case_reopened');
});

integrationTest('GER relationships cannot cross epistemic case boundaries', async () => {
  const {
    openEpistemicCase,
    recordEpistemicObject,
    recordEpistemicRelationship,
  } = await import('../dist/epistemic/persistence.js');

  const prefix = `ger002-cross-${process.pid}-${Date.now()}`;
  const sourceRefs = ['test:source:cross'];
  const a = await openEpistemicCase({
    caseKey: `${prefix}:a`, subjectRef: 'test:a', purpose: 'Cross-case proof A', environment: 'test',
    initialRigorClass: 1, dataClassification: 'INTERNAL', retentionProfileKey: 'DURABLE-EVIDENCE',
    sourceRefs, openedAt: '2026-10-30T14:10:00.000Z', openedByRef: 'test:actor', eventKey: `${prefix}:a:open`,
  });
  const b = await openEpistemicCase({
    caseKey: `${prefix}:b`, subjectRef: 'test:b', purpose: 'Cross-case proof B', environment: 'test',
    initialRigorClass: 1, dataClassification: 'INTERNAL', retentionProfileKey: 'DURABLE-EVIDENCE',
    sourceRefs, openedAt: '2026-10-30T14:10:00.000Z', openedByRef: 'test:actor', eventKey: `${prefix}:b:open`,
  });
  const aObject = await recordEpistemicObject({
    caseId: a.case.case_id, expectedPriorEventId: a.event.event_id, eventKey: `${prefix}:a:object:event`,
    objectKey: `${prefix}:a:object`, objectType: 'claim', initialState: 'observed', summary: 'A claim',
    sourceRefs, createdAt: '2026-10-30T14:10:01.000Z', createdByRef: 'test:actor', rationale: 'Record A object.',
  });
  const bObject = await recordEpistemicObject({
    caseId: b.case.case_id, expectedPriorEventId: b.event.event_id, eventKey: `${prefix}:b:object:event`,
    objectKey: `${prefix}:b:object`, objectType: 'claim', initialState: 'observed', summary: 'B claim',
    sourceRefs, createdAt: '2026-10-30T14:10:01.000Z', createdByRef: 'test:actor', rationale: 'Record B object.',
  });

  await assert.rejects(
    recordEpistemicRelationship({
      caseId: a.case.case_id,
      expectedPriorEventId: aObject.event.event_id,
      eventKey: `${prefix}:cross:event`,
      relationshipKey: `${prefix}:cross`,
      subjectObjectId: aObject.object.object_id,
      predicate: 'supports',
      objectObjectId: bObject.object.object_id,
      evidenceRefs: ['test:evidence:cross'],
      sourceRefs,
      validFrom: '2026-10-30T14:10:02.000Z',
      createdAt: '2026-10-30T14:10:02.000Z',
      createdByRef: 'test:actor',
      rationale: 'Cross-case edge must fail at the database boundary.',
    }),
    /foreign key|violates/i,
  );
});
