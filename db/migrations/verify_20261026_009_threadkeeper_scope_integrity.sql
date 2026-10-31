\set ON_ERROR_STOP on

DO $$
DECLARE
  trigger_count integer;
BEGIN
  SELECT count(*)
    INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='comind'
     AND t.tgname IN (
       'trg_cm_threadkeeper_checkpoint_scope_validate',
       'trg_cm_threadkeeper_assessment_scope_validate',
       'trg_cm_threadkeeper_case_open_validate'
     )
     AND NOT t.tgisinternal;
  IF trigger_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 ThreadKeeper scope-integrity triggers, found %', trigger_count;
  END IF;
END;
$$;

BEGIN;

INSERT INTO comind.cm_threadkeeper_scope (
  scope_id, scope_type, namespace, subject_ref, semantic_key,
  sensitivity_class, retention_class, created_by_ref
) VALUES
  ('71000000-0000-4000-8000-000000000001','plan','tk004.verify','plan:scope-1','tk-scope:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','internal','durable','verify:tk004'),
  ('71000000-0000-4000-8000-000000000002','plan','tk004.verify','plan:scope-2','tk-scope:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','internal','durable','verify:tk004');

DO $$
BEGIN
  BEGIN
    INSERT INTO comind.cm_threadkeeper_checkpoint (
      checkpoint_id, scope_id, parent_checkpoint_id, proposal_id, checkpoint_version,
      scope_semantic_key, proposed_at, proposed_by_ref, accepted_at, accepted_by_ref,
      authority_evidence_ref, policy_ref, state_digest, digest, proposal
    ) VALUES (
      '72000000-0000-4000-8000-000000000099',
      '71000000-0000-4000-8000-000000000001',NULL,'proposal:wrong-scope',1,
      'tk-scope:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '2026-10-26T22:00:00Z','verify:actor','2026-10-26T22:01:00Z','verify:authority',
      'verify:authority:evidence','verify:policy',repeat('c',64),repeat('d',64),
      jsonb_build_object(
        'version',1,'proposalId','proposal:wrong-scope',
        'scopeSemanticKey','tk-scope:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'parentCheckpointId',NULL,'currentAcceptedCheckpointId',NULL,
        'proposedAt','2026-10-26T22:00:00.000Z','proposedByRef','verify:actor',
        'policyRef','verify:policy','stateDigest',repeat('c',64),'digest',repeat('d',64),'state','{}'::jsonb
      )
    );
    RAISE EXCEPTION 'Wrong-scope ThreadKeeper checkpoint was not rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%checkpoint semantic scope mismatch%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

INSERT INTO comind.cm_threadkeeper_checkpoint (
  checkpoint_id, scope_id, parent_checkpoint_id, proposal_id, checkpoint_version,
  scope_semantic_key, proposed_at, proposed_by_ref, accepted_at, accepted_by_ref,
  authority_evidence_ref, policy_ref, state_digest, digest, proposal
) VALUES
  (
    '72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',NULL,'proposal:scope-1',1,
    'tk-scope:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '2026-10-26T22:00:00Z','verify:actor','2026-10-26T22:01:00Z','verify:authority',
    'verify:authority:evidence','verify:policy',repeat('c',64),repeat('d',64),
    jsonb_build_object(
      'version',1,'proposalId','proposal:scope-1',
      'scopeSemanticKey','tk-scope:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'parentCheckpointId',NULL,'currentAcceptedCheckpointId',NULL,
      'proposedAt','2026-10-26T22:00:00.000Z','proposedByRef','verify:actor',
      'policyRef','verify:policy','stateDigest',repeat('c',64),'digest',repeat('d',64),'state','{}'::jsonb
    )
  ),
  (
    '72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002',NULL,'proposal:scope-2',1,
    'tk-scope:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '2026-10-26T22:00:00Z','verify:actor','2026-10-26T22:01:00Z','verify:authority',
    'verify:authority:evidence','verify:policy',repeat('e',64),repeat('f',64),
    jsonb_build_object(
      'version',1,'proposalId','proposal:scope-2',
      'scopeSemanticKey','tk-scope:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'parentCheckpointId',NULL,'currentAcceptedCheckpointId',NULL,
      'proposedAt','2026-10-26T22:00:00.000Z','proposedByRef','verify:actor',
      'policyRef','verify:policy','stateDigest',repeat('e',64),'digest',repeat('f',64),'state','{}'::jsonb
    )
  );

DO $$
BEGIN
  BEGIN
    INSERT INTO comind.cm_threadkeeper_assessment (
      assessment_id,idempotency_key,scope_id,checkpoint_id,observation_id,classification,
      reason_codes,break_types,confidence,uncertainty,evidence_refs,trace_id,assessor_version,
      assessment_digest,assessment,created_at
    ) VALUES (
      '73000000-0000-4000-8000-000000000099','assessment:wrong-scope',
      '71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',
      'observation:wrong-scope','SUSPECTED_BREAK','["material_change"]'::jsonb,'[]'::jsonb,
      0.7,0.3,'[]'::jsonb,NULL,'tk-assessor.v1',repeat('1',64),
      jsonb_build_object(
        'scopeSemanticKey','tk-scope:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'checkpointId','72000000-0000-4000-8000-000000000001','observationId','observation:wrong-scope',
        'classification','SUSPECTED_BREAK','reasonCodes','["material_change"]'::jsonb,
        'breakTypes','[]'::jsonb,'confidence',0.7,'uncertainty',0.3,'evidenceRefs','[]'::jsonb,
        'assessorVersion','tk-assessor.v1'
      ),'2026-10-26T22:10:00Z'
    );
    RAISE EXCEPTION 'Wrong-scope ThreadKeeper assessment was not rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%assessment semantic scope mismatch%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

INSERT INTO comind.cm_threadkeeper_assessment (
  assessment_id,idempotency_key,scope_id,checkpoint_id,observation_id,classification,
  reason_codes,break_types,confidence,uncertainty,evidence_refs,trace_id,assessor_version,
  assessment_digest,assessment,created_at
) VALUES
  (
    '73000000-0000-4000-8000-000000000001','assessment:actionable',
    '71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',
    'observation:actionable','SUSPECTED_BREAK','["material_change"]'::jsonb,'[]'::jsonb,
    0.7,0.3,'[]'::jsonb,NULL,'tk-assessor.v1',repeat('1',64),
    jsonb_build_object(
      'scopeSemanticKey','tk-scope:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'checkpointId','72000000-0000-4000-8000-000000000001','observationId','observation:actionable',
      'classification','SUSPECTED_BREAK','reasonCodes','["material_change"]'::jsonb,
      'breakTypes','[]'::jsonb,'confidence',0.7,'uncertainty',0.3,'evidenceRefs','[]'::jsonb,
      'assessorVersion','tk-assessor.v1'
    ),'2026-10-26T22:10:00Z'
  ),
  (
    '73000000-0000-4000-8000-000000000002','assessment:intact',
    '71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',
    'observation:intact','INTACT','["invariants_hold"]'::jsonb,'[]'::jsonb,
    1,0,'[]'::jsonb,NULL,'tk-assessor.v1',repeat('2',64),
    jsonb_build_object(
      'scopeSemanticKey','tk-scope:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'checkpointId','72000000-0000-4000-8000-000000000001','observationId','observation:intact',
      'classification','INTACT','reasonCodes','["invariants_hold"]'::jsonb,
      'breakTypes','[]'::jsonb,'confidence',1,'uncertainty',0,'evidenceRefs','[]'::jsonb,
      'assessorVersion','tk-assessor.v1'
    ),'2026-10-26T22:11:00Z'
  );

DO $$
BEGIN
  BEGIN
    INSERT INTO comind.cm_threadkeeper_case (
      case_id,case_key,scope_id,opened_from_assessment_id,opened_at,opened_by_ref
    ) VALUES (
      '74000000-0000-4000-8000-000000000099','case:intact',
      '71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',
      '2026-10-26T22:20:00Z','verify:actor'
    );
    RAISE EXCEPTION 'INTACT ThreadKeeper assessment opened a case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%source assessment is not actionable: INTACT%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

INSERT INTO comind.cm_threadkeeper_case (
  case_id,case_key,scope_id,opened_from_assessment_id,opened_at,opened_by_ref
) VALUES (
  '74000000-0000-4000-8000-000000000001','case:actionable',
  '71000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',
  '2026-10-26T22:20:00Z','verify:actor'
);

INSERT INTO comind.cm_threadkeeper_case_transition (
  transition_id,transition_key,case_id,prior_transition_id,from_state,to_state,route_code,
  actor_ref,authority_evidence_ref,evidence_refs,resolution_ref,successor_checkpoint_id,
  recorded_at,transition_digest,transition
) VALUES
  (
    '75000000-0000-4000-8000-000000000001','transition:observed','74000000-0000-4000-8000-000000000001',
    NULL,NULL,'OBSERVED',NULL,'verify:actor',NULL,'[]'::jsonb,NULL,NULL,'2026-10-26T22:21:00Z',repeat('3',64),
    jsonb_build_object('fromState',NULL,'toState','OBSERVED','routeCode',NULL,'actorRef','verify:actor',
      'authorityEvidenceRef',NULL,'evidenceRefs','[]'::jsonb,'resolutionRef',NULL,'successorCheckpointId',NULL,
      'recordedAt','2026-10-26T22:21:00.000Z')
  ),
  (
    '75000000-0000-4000-8000-000000000002','transition:assessed','74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001','OBSERVED','ASSESSED',NULL,'verify:actor',NULL,'[]'::jsonb,NULL,NULL,
    '2026-10-26T22:22:00Z',repeat('4',64),
    jsonb_build_object('fromState','OBSERVED','toState','ASSESSED','routeCode',NULL,'actorRef','verify:actor',
      'authorityEvidenceRef',NULL,'evidenceRefs','[]'::jsonb,'resolutionRef',NULL,'successorCheckpointId',NULL,
      'recordedAt','2026-10-26T22:22:00.000Z')
  ),
  (
    '75000000-0000-4000-8000-000000000003','transition:routed','74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000002','ASSESSED','ROUTED','REQUEST_HUMAN_REVIEW','verify:actor',NULL,'[]'::jsonb,NULL,NULL,
    '2026-10-26T22:23:00Z',repeat('5',64),
    jsonb_build_object('fromState','ASSESSED','toState','ROUTED','routeCode','REQUEST_HUMAN_REVIEW','actorRef','verify:actor',
      'authorityEvidenceRef',NULL,'evidenceRefs','[]'::jsonb,'resolutionRef',NULL,'successorCheckpointId',NULL,
      'recordedAt','2026-10-26T22:23:00.000Z')
  );

DO $$
BEGIN
  BEGIN
    INSERT INTO comind.cm_threadkeeper_case_transition (
      transition_id,transition_key,case_id,prior_transition_id,from_state,to_state,route_code,
      actor_ref,authority_evidence_ref,evidence_refs,resolution_ref,successor_checkpoint_id,
      recorded_at,transition_digest,transition
    ) VALUES (
      '75000000-0000-4000-8000-000000000099','transition:cross-scope-divergence','74000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000003','ROUTED','ACCEPTED_DIVERGENCE',NULL,
      'verify:authority','verify:authority:evidence','[]'::jsonb,NULL,'72000000-0000-4000-8000-000000000002',
      '2026-10-26T22:24:00Z',repeat('6',64),
      jsonb_build_object('fromState','ROUTED','toState','ACCEPTED_DIVERGENCE','routeCode',NULL,'actorRef','verify:authority',
        'authorityEvidenceRef','verify:authority:evidence','evidenceRefs','[]'::jsonb,'resolutionRef',NULL,
        'successorCheckpointId','72000000-0000-4000-8000-000000000002','recordedAt','2026-10-26T22:24:00.000Z')
    );
    RAISE EXCEPTION 'Cross-scope ThreadKeeper accepted divergence was not rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%successor checkpoint scope mismatch%' THEN
      RAISE;
    END IF;
  END;
END;
$$;

ROLLBACK;

SELECT 'ThreadKeeper scope-integrity verification passed' AS result;
