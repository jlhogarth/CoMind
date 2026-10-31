import assert from 'node:assert/strict';

export const ISSUE_REF = 'github:issue:370';
export const MDO002_MERGE_REF = 'github:commit:1abc83cf45fc8312b15048d2a14d9a214d25c285';

export const WORKFORCE = Object.freeze({
  analyze: { roleCode: 'mdo_test_analyzer', capabilityCode: 'mdo.plan.analyze', maxTasks: 3 },
  research: { roleCode: 'mdo_test_researcher', capabilityCode: 'mdo.plan.research', maxTasks: 2 },
  review: { roleCode: 'mdo_test_reviewer', capabilityCode: 'mdo.plan.review', maxTasks: 3 },
  synthesize: { roleCode: 'mdo_test_synthesizer', capabilityCode: 'mdo.plan.synthesize', maxTasks: 1 },
  portfolio: { roleCode: 'mdo_test_portfolio', capabilityCode: 'mdo.plan.portfolio', maxTasks: 1 },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value, name) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new Error(`${name} must be a UUID`);
  return value;
}

export function createMdoLiveTestFixtures({ db, model, candidateRef, candidateKey }) {
  const { query, one, verifyDatabaseIdentity } = db;

  async function ensureSponsorAndFixture() {
    const databaseIdentity = await verifyDatabaseIdentity();
    const comindProject = await one(
      `SELECT project_id::text, org_id::text
       FROM comind.cm_project
       WHERE project_code::text = 'COMIND'
         AND source_system = 'github'
         AND source_ref = 'github:repo:jlhogarth/CoMind'
         AND status = 'active'`
    );
    requiredUuid(comindProject.org_id, 'CoMind org id');

    const sponsorRows = await query(
      `SELECT actor_id::text, org_id::text, kind, display_name, meta
       FROM comind.cm_actor WHERE handle::text = 'mdo003-test-authority'`
    );
    let sponsor;
    if (sponsorRows.rows.length === 0) {
      sponsor = await one(
        `INSERT INTO comind.cm_actor(org_id, kind, handle, display_name, meta)
         VALUES ($1::uuid, 'service', 'mdo003-test-authority', 'MDO-003 Test Authority', $2::jsonb)
         RETURNING actor_id::text, org_id::text, kind, display_name, meta`,
        [comindProject.org_id, JSON.stringify({ synthetic: true, environment: 'isolated', source_system: 'github', source_ref: ISSUE_REF })]
      );
    } else {
      assert.equal(sponsorRows.rows.length, 1);
      sponsor = sponsorRows.rows[0];
    }
    assert.equal(sponsor.org_id, comindProject.org_id);
    assert.equal(sponsor.kind, 'service');
    assert.equal(sponsor.meta?.synthetic, true);
    assert.equal(sponsor.meta?.environment, 'isolated');
    assert.equal(sponsor.meta?.source_ref, ISSUE_REF);

    const projectRows = await query(
      `SELECT project_id::text, org_id::text, title, slug::text, status, project_code::text, source_system, source_ref
       FROM comind.cm_project WHERE slug::text = 'mdo-003-test-acceptance'`
    );
    let project;
    if (projectRows.rows.length === 0) {
      project = await one(
        `INSERT INTO comind.cm_project(
           org_id, title, slug, description, status, priority, created_by,
           project_code, acronym, source_system, source_ref
         ) VALUES (
           $1::uuid, 'MDO Persistent Test Acceptance', 'mdo-003-test-acceptance',
           'Canonical Test-only project for governed persistent MDO acceptance evidence.',
           'active', 1, $2::uuid, 'MDO-TEST', 'MDO', 'github', $3::text
         )
         RETURNING project_id::text, org_id::text, title, slug::text, status, project_code::text, source_system, source_ref`,
        [comindProject.org_id, sponsor.actor_id, ISSUE_REF]
      );
    } else {
      assert.equal(projectRows.rows.length, 1);
      project = projectRows.rows[0];
    }
    assert.equal(project.org_id, comindProject.org_id);
    assert.equal(project.status, 'active');
    assert.equal(project.project_code, 'MDO-TEST');
    assert.equal(project.source_system, 'github');
    assert.equal(project.source_ref, ISSUE_REF);

    const moduleRows = await query(
      `SELECT module_id::text, name::text, module_code, project_id::text, lifecycle_stage, status, source_system, source_ref
       FROM comind.cm_module_registry WHERE name::text = 'MDO-003 Test Planning Fixture'`
    );
    let module;
    if (moduleRows.rows.length === 0) {
      module = await one(
        `INSERT INTO comind.cm_module_registry(
           name, module_code, project_id, description, status,
           lifecycle_stage, source_system, source_ref
         ) VALUES (
           'MDO-003 Test Planning Fixture', 'MDO3-TEST', $1::uuid,
           'Explicit Test-only module identity for MDO-003 persistent planning acceptance.',
           'enabled', 'conceived', 'github', 'github:issue:370#module-fixture'
         )
         RETURNING module_id::text, name::text, module_code, project_id::text, lifecycle_stage, status, source_system, source_ref`,
        [project.project_id]
      );
    } else {
      assert.equal(moduleRows.rows.length, 1);
      module = moduleRows.rows[0];
    }
    assert.equal(module.project_id, project.project_id);
    assert.equal(module.lifecycle_stage, 'conceived');
    assert.equal(module.status, 'enabled');
    assert.equal(module.source_system, 'github');
    assert.equal(module.source_ref, 'github:issue:370#module-fixture');

    return { databaseIdentity, orgId: comindProject.org_id, sponsor, project, module };
  }

  async function ensureProfile(orgId, sponsorActorId, key, definition) {
    const handle = `mdo003-${key}`;
    const agentName = `MDO-003 ${key} Test Worker`;
    const actorRows = await query(
      `SELECT actor_id::text, org_id::text, kind, handle::text, meta
       FROM comind.cm_actor WHERE handle::text = $1::text`,
      [handle]
    );
    let actor;
    if (actorRows.rows.length === 0) {
      actor = await one(
        `INSERT INTO comind.cm_actor(org_id, kind, handle, display_name, meta)
         VALUES ($1::uuid, 'agent', $2::text, $3::text, $4::jsonb)
         RETURNING actor_id::text, org_id::text, kind, handle::text, meta`,
        [orgId, handle, agentName, JSON.stringify({ synthetic: true, environment: 'isolated', source_system: 'github', source_ref: ISSUE_REF })]
      );
    } else {
      assert.equal(actorRows.rows.length, 1);
      actor = actorRows.rows[0];
    }
    assert.equal(actor.org_id, orgId);
    assert.equal(actor.kind, 'agent');
    assert.equal(actor.meta?.synthetic, true);
    assert.equal(actor.meta?.source_ref, ISSUE_REF);

    const agentRows = await query(
      `SELECT agent_id::text, org_id::text, name::text, config
       FROM comind.cm_agent WHERE name::text = $1::text`,
      [agentName]
    );
    let agent;
    if (agentRows.rows.length === 0) {
      agent = await one(
        `INSERT INTO comind.cm_agent(org_id, name, description, config)
         VALUES ($1::uuid, $2::text, 'Persistent Test-only MDO planning worker for issue #370.', $3::jsonb)
         RETURNING agent_id::text, org_id::text, name::text, config`,
        [orgId, agentName, JSON.stringify({ synthetic: true, environment: 'isolated', source_system: 'github', source_ref: ISSUE_REF })]
      );
    } else {
      assert.equal(agentRows.rows.length, 1);
      agent = agentRows.rows[0];
    }
    assert.equal(agent.org_id, orgId);
    assert.equal(agent.config?.synthetic, true);
    assert.equal(agent.config?.source_ref, ISSUE_REF);

    const runtimeDefaults = {
      provider: 'mdo',
      environment: 'isolated',
      mdo_inference: { adapter: 'ollama_local', provider: 'ollama_local', model },
      paid_provider_allowed: false,
      production_target_allowed: false,
      test_fixture: ISSUE_REF,
    };
    const profileRows = await query(
      `SELECT profile_id::text, agent_id::text, actor_id::text, org_id::text, role_code,
              status, authority_floor, authority_ceiling, runtime_defaults
       FROM comind.cm_foundry_agent_profile WHERE actor_id = $1::uuid`,
      [actor.actor_id]
    );
    let profile;
    if (profileRows.rows.length === 0) {
      profile = await one(
        `INSERT INTO comind.cm_foundry_agent_profile(
           agent_id, actor_id, org_id, role_code, display_name,
           authority_floor, authority_ceiling, instruction_version,
           runtime_defaults, competencies, status, activated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
           'C0', 'C1', 'mdo-003-test-v1', $6::jsonb, $7::jsonb,
           'active', clock_timestamp()
         )
         RETURNING profile_id::text, agent_id::text, actor_id::text, org_id::text, role_code,
                   status, authority_floor, authority_ceiling, runtime_defaults`,
        [agent.agent_id, actor.actor_id, orgId, definition.roleCode, agentName,
         JSON.stringify(runtimeDefaults), JSON.stringify([definition.roleCode, 'module_planning', 'test_acceptance'])]
      );
    } else {
      assert.equal(profileRows.rows.length, 1);
      profile = profileRows.rows[0];
    }
    assert.equal(profile.agent_id, agent.agent_id);
    assert.equal(profile.org_id, orgId);
    assert.equal(profile.role_code, definition.roleCode);
    assert.equal(profile.status, 'active');
    assert.equal(profile.authority_ceiling, 'C1');
    assert.equal(profile.runtime_defaults?.mdo_inference?.adapter, 'ollama_local');
    assert.equal(profile.runtime_defaults?.mdo_inference?.model, model);
    assert.equal(profile.runtime_defaults?.paid_provider_allowed, false);
    assert.equal(profile.runtime_defaults?.production_target_allowed, false);

    const capability = await one(
      `SELECT capability_id::text, capability_code, adapter, max_authority, cost_bearing
       FROM comind.cm_foundry_capability WHERE capability_code = $1::text`,
      [definition.capabilityCode]
    );
    assert.equal(capability.adapter, 'mdo');
    assert.equal(capability.max_authority, 'C1');
    assert.equal(capability.cost_bearing, false);

    return {
      key,
      profileId: profile.profile_id,
      actorId: actor.actor_id,
      agentId: agent.agent_id,
      capabilityId: capability.capability_id,
      capabilityCode: definition.capabilityCode,
      roleCode: definition.roleCode,
      maxTasks: definition.maxTasks,
      sponsorActorId,
    };
  }

  async function ensureWorkforce(fixture) {
    const profiles = {};
    for (const [key, definition] of Object.entries(WORKFORCE)) {
      profiles[key] = await ensureProfile(fixture.orgId, fixture.sponsor.actor_id, key, definition);
    }
    return profiles;
  }

  async function issueAuthorization({
    profile = null,
    actorId,
    capabilityId,
    projectId,
    taskId = null,
    authorityLevel = 'C1',
    targetKind,
    targetRef,
    sponsorActorId,
    reason,
    expired = false,
    decision = 'approved',
  }) {
    const requestTiming = expired
      ? { requested: "clock_timestamp() - interval '10 minutes'", expires: "clock_timestamp() - interval '5 minutes'" }
      : { requested: 'clock_timestamp()', expires: "clock_timestamp() + interval '30 minutes'" };
    const decisionTiming = expired
      ? { decided: "clock_timestamp() - interval '9 minutes'", effective: "clock_timestamp() - interval '5 minutes'" }
      : { decided: 'clock_timestamp()', effective: "clock_timestamp() + interval '30 minutes'" };
    const request = await one(
      `INSERT INTO comind.cm_foundry_authorization_request(
         requesting_profile_id, requesting_actor_id, capability_id, project_id,
         task_id, authority_level, environment, target_kind, target_ref,
         reason, evidence_refs, status, requested_at, expires_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
         $6::text, 'isolated', $7::text, $8::text,
         $9::text, $10::jsonb, $11::text, ${requestTiming.requested}, ${requestTiming.expires}
       ) RETURNING authorization_request_id::text`,
      [profile?.profileId ?? null, actorId, capabilityId, projectId, taskId, authorityLevel, targetKind, targetRef,
       reason, JSON.stringify([ISSUE_REF, MDO002_MERGE_REF, `candidate:${candidateRef}`]), decision === 'denied' ? 'denied' : 'approved']
    );
    const decisionRow = await one(
      `INSERT INTO comind.cm_foundry_authorization_decision(
         authorization_request_id, decision, decided_by_actor_id, decision_basis,
         policy_refs, decided_at, effective_until
       ) VALUES (
         $1::uuid, $5::text, $2::uuid, $3::text, $4::jsonb,
         ${decisionTiming.decided}, ${decisionTiming.effective}
       ) RETURNING authorization_decision_id::text`,
      [request.authorization_request_id, sponsorActorId,
       `Founder-authorized MDO-003 Test acceptance under issue #370; expired=${expired}.`,
       JSON.stringify(['MDO-003', 'Issue #370', 'CoMind Development Contract']), decision]
    );
    return decisionRow.authorization_decision_id;
  }

  async function grantRunAuthority(fixture, profiles, planId) {
    const grantIds = [];
    try {
      for (const profile of Object.values(profiles)) {
        await query(
          `UPDATE comind.cm_foundry_capability_grant
           SET revoked_at=clock_timestamp()
           WHERE profile_id=$1::uuid AND capability_id=$2::uuid
             AND environment='isolated' AND revoked_at IS NULL
             AND grant_reason LIKE 'MDO-003 issue #370%'`,
          [profile.profileId, profile.capabilityId]
        );
        const grant = await one(
          `INSERT INTO comind.cm_foundry_capability_grant(
             profile_id, capability_id, org_id, project_id, environment,
             authority_ceiling, scope, granted_by_actor_id, grant_reason, expires_at
           ) VALUES (
             $1::uuid,$2::uuid,$3::uuid,$4::uuid,'isolated','C1',$5::jsonb,$6::uuid,$7::text,
             clock_timestamp() + interval '45 minutes'
           ) RETURNING grant_id::text`,
          [profile.profileId, profile.capabilityId, fixture.orgId, fixture.project.project_id,
           JSON.stringify({ target_refs: [planId], synthetic_only: false, max_tasks: profile.maxTasks }),
           fixture.sponsor.actor_id, `MDO-003 issue #370 candidate ${candidateKey}`]
        );
        grantIds.push(grant.grant_id);
      }
      return grantIds;
    } catch (error) {
      if (grantIds.length > 0) {
        await query(
          `UPDATE comind.cm_foundry_capability_grant
           SET revoked_at=clock_timestamp()
           WHERE grant_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
          [grantIds]
        );
      }
      throw error;
    }
  }

  async function revokeRunAuthority(grantIds) {
    if (grantIds.length === 0) return { revoked: 0, active: 0 };
    const updated = await query(
      `UPDATE comind.cm_foundry_capability_grant SET revoked_at=clock_timestamp()
       WHERE grant_id = ANY($1::uuid[]) AND revoked_at IS NULL RETURNING grant_id::text`,
      [grantIds]
    );
    const active = await one(
      `SELECT count(*)::int AS active_count FROM comind.cm_foundry_capability_grant
       WHERE grant_id = ANY($1::uuid[]) AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > clock_timestamp())`,
      [grantIds]
    );
    assert.equal(active.active_count, 0);
    return { revoked: updated.rows.length, active: active.active_count };
  }

  async function readback(planId, moduleId) {
    return one(
      `SELECT
         (SELECT count(*)::int FROM comind.cm_mdo_contribution WHERE plan_id=$1::uuid) AS contribution_count,
         (SELECT count(*)::int FROM comind.cm_foundry_work_lease l
            JOIN comind.cm_mdo_plan_task pt ON pt.task_id=l.task_id
            WHERE pt.plan_id=$1::uuid AND l.state='completed') AS completed_lease_count,
         (SELECT count(*)::int FROM comind.cm_evidence e
            WHERE e.source_type='mdo_provider_output' AND e.metadata->>'plan_id'=$1::text) AS inference_evidence_count,
         (SELECT count(*)::int FROM comind.cm_task t
            JOIN comind.cm_mdo_plan_task pt ON pt.task_id=t.task_id
            WHERE pt.plan_id=$1::uuid AND t.status='done') AS done_task_count,
         (SELECT count(*)::int FROM comind.cm_mdo_contribution_evidence ce
            JOIN comind.cm_mdo_contribution c ON c.contribution_id=ce.contribution_id
            WHERE c.plan_id=$1::uuid) AS contribution_evidence_link_count,
         (SELECT count(*)::int FROM comind.cm_audit_log a
            WHERE a.action='mdo.contribution.submitted' AND a.details->>'plan_id'=$1::text) AS contribution_audit_count,
         (SELECT count(*)::int FROM comind.cm_foundry_authorization_request ar
            JOIN comind.cm_foundry_authorization_decision ad ON ad.authorization_request_id=ar.authorization_request_id
            WHERE ar.task_id IN (SELECT task_id FROM comind.cm_mdo_plan_task WHERE plan_id=$1::uuid)) AS role_authorization_count,
         (SELECT count(*)::int FROM comind.cm_foundry_execution_context ec
            JOIN comind.cm_mdo_plan_task pt ON pt.task_id=ec.task_id
            WHERE pt.plan_id=$1::uuid) AS execution_context_count,
         (SELECT status FROM comind.cm_mdo_plan WHERE plan_id=$1::uuid) AS plan_status,
         (SELECT lifecycle_stage FROM comind.cm_module_registry WHERE module_id=$2::uuid) AS module_lifecycle_stage`,
      [planId, moduleId]
    );
  }

  return Object.freeze({
    ensureSponsorAndFixture,
    ensureWorkforce,
    issueAuthorization,
    grantRunAuthority,
    revokeRunAuthority,
    readback,
  });
}
