from pathlib import Path

runtime = Path('server/src/mdo-planning-runtime.ts')
tests = Path('server/test/mdo-planning-runtime.test.mjs')
pilot = Path('server/test/integration/mdo-ollama-pilot.e2e.mjs')

source = runtime.read_text()
marker = "async function finishLease(\n"
if source.count(marker) != 1:
    raise SystemExit(f'expected one finishLease marker, found {source.count(marker)}')
source = source.replace(marker, """interface LeaseDiagnosticRow {
  state: string;
  worker_matches: boolean;
  token_matches: boolean;
  fencing_epoch: number | string;
  epoch_matches: boolean;
  lease_expires_at: string | null;
  expired: boolean | null;
  attempt_count: number | string;
  max_attempts: number | string;
}

function errorIdentity(error: unknown): string {
  if (error instanceof MdoPlanningRuntimeError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && SAFE_CODE.test(code)) return code;
  }
  if (error instanceof Error && SAFE_CODE.test(error.name)) return error.name;
  return 'unknown_error';
}

async function finishLease(
""", 1)

old_rejection = """  if (finished.rows.length !== 1 || finished.rows[0].ok !== true) {
    throw new MdoPlanningRuntimeError('fence_rejected', 'MDO lease completion was rejected by the fencing contract');
  }
"""
new_rejection = """  if (finished.rows.length !== 1 || finished.rows[0].ok !== true) {
    const diagnostic = await queryFn<LeaseDiagnosticRow>(
      `SELECT state,
              worker_instance_id = $2::text AS worker_matches,
              lease_token = $3::uuid AS token_matches,
              fencing_epoch,
              fencing_epoch = $4::bigint AS epoch_matches,
              lease_expires_at::text,
              CASE WHEN lease_expires_at IS NULL THEN NULL
                   ELSE lease_expires_at <= clock_timestamp() END AS expired,
              attempt_count,
              max_attempts
       FROM comind.cm_foundry_work_lease
       WHERE task_id = $1::uuid`,
      [claim.taskId, workerInstanceId, claim.leaseToken, claim.fencingEpoch]
    );
    const row = diagnostic.rows.length === 1 ? diagnostic.rows[0] : null;
    const detail = row
      ? `state=${row.state};worker_match=${row.worker_matches};token_match=${row.token_matches};epoch=${row.fencing_epoch};epoch_match=${row.epoch_matches};expired=${row.expired};attempt=${row.attempt_count}/${row.max_attempts}`
      : 'lease_row=missing_or_ambiguous';
    throw new MdoPlanningRuntimeError(
      'fence_rejected',
      `MDO lease completion was rejected by the fencing contract (${detail})`
    );
  }
"""
if source.count(old_rejection) != 1:
    raise SystemExit(f'expected one fence rejection block, found {source.count(old_rejection)}')
source = source.replace(old_rejection, new_rejection, 1)

class_marker = """  return readback.rows[0].lease_state;
}

export class MdoPlanningWorker {
"""
replacement = """  return readback.rows[0].lease_state;
}

async function releaseAfterExecutionFailure(
  queryFn: QueryFunction,
  claim: MdoClaimedWork,
  workerInstanceId: string,
  originalError: unknown
): Promise<string> {
  try {
    return await finishLease(queryFn, claim, workerInstanceId, false);
  } catch (releaseError) {
    const releaseDetail = releaseError instanceof MdoPlanningRuntimeError
      ? `${releaseError.code}:${releaseError.message}`
      : errorIdentity(releaseError);
    throw new MdoPlanningRuntimeError(
      'execution_release_failed',
      `MDO execution failed as ${errorIdentity(originalError)} and retry release failed as ${releaseDetail}`
    );
  }
}

export class MdoPlanningWorker {
"""
if source.count(class_marker) != 1:
    raise SystemExit(f'expected one worker class marker, found {source.count(class_marker)}')
source = source.replace(class_marker, replacement, 1)

old_catch = """    } catch (error) {
      await finishLease(this.options.queryFn, input.claim, input.workerInstanceId, false);
      throw error;
    }
"""
new_catch = """    } catch (error) {
      await releaseAfterExecutionFailure(
        this.options.queryFn,
        input.claim,
        input.workerInstanceId,
        error
      );
      throw error;
    }
"""
if source.count(old_catch) != 1:
    raise SystemExit(f'expected one execution catch block, found {source.count(old_catch)}')
source = source.replace(old_catch, new_catch, 1)
runtime.write_text(source)

unit = tests.read_text()
new_test_name = "planning worker preserves original failure identity when retry release fencing is rejected"
if new_test_name in unit:
    raise SystemExit('diagnostic integrity test already exists')
unit += r'''

test('planning worker preserves original failure identity when retry release fencing is rejected', async () => {
  let diagnosticRead = false;
  const queryFn = async (sql, params = []) => {
    if (sql.includes('cm_foundry_finish_work')) {
      assert.equal(params[4], false);
      return { rows: [{ ok: false }] };
    }
    if (sql.includes('worker_instance_id = $2::text AS worker_matches')) {
      diagnosticRead = true;
      return { rows: [{
        state: 'ready',
        worker_matches: false,
        token_matches: false,
        fencing_epoch: 2,
        epoch_matches: false,
        lease_expires_at: null,
        expired: null,
        attempt_count: 1,
        max_attempts: 3,
      }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const providerError = Object.assign(new Error('provider payload must not leak'), {
    code: 'ollama_inference_failed',
  });
  const worker = new MdoPlanningWorker({
    queryFn,
    foundryRuntime: { execute: async () => { throw providerError; } },
    mdo: {
      loadTaskContext: async () => context(),
      submitContribution: async () => 'never',
    },
  });
  await assert.rejects(
    () => worker.executeClaim({
      profileId: ids.profile,
      workerInstanceId: 'mdo-unit-worker',
      authorizationDecisionId: ids.decision,
      idempotencyKey: 'mdo-unit-execution-release-failure',
      claim: {
        taskId: ids.task,
        leaseToken: ids.lease,
        fencingEpoch: 1,
        leaseExpiresAt: '2099-01-01T00:00:00Z',
        planId: ids.plan,
        capabilityCode: 'mdo.plan.analyze',
      },
    }),
    (error) => {
      assert.equal(error instanceof MdoPlanningRuntimeError, true);
      assert.equal(error.code, 'execution_release_failed');
      assert.match(error.message, /ollama_inference_failed/);
      assert.match(error.message, /state=ready/);
      assert.match(error.message, /worker_match=false/);
      assert.match(error.message, /epoch_match=false/);
      assert.equal(error.message.includes(ids.lease), false);
      assert.equal(error.message.includes('provider payload must not leak'), false);
      return true;
    }
  );
  assert.equal(diagnosticRead, true);
});
'''
tests.write_text(unit)

pilot_source = pilot.read_text()
start_line = """      const profile = profiles[profileKey];
      const workerId = `mdo002-${profileKey}-${index + 1}`;
"""
start_replacement = """      const profile = profiles[profileKey];
      const workerId = `mdo002-${profileKey}-${index + 1}`;
      console.log(`mdo-pilot-role-start|index=${index + 1}|role=${expectedRole}|capability=${profile.capabilityCode}`);
"""
if pilot_source.count(start_line) != 1:
    raise SystemExit(f'expected one pilot role-start marker, found {pilot_source.count(start_line)}')
pilot_source = pilot_source.replace(start_line, start_replacement, 1)
end_line = """      assert.equal(result.execution.terminalStatus, 'succeeded');
      results.push({
"""
end_replacement = """      assert.equal(result.execution.terminalStatus, 'succeeded');
      console.log(`mdo-pilot-role-complete|index=${index + 1}|role=${expectedRole}`);
      results.push({
"""
if pilot_source.count(end_line) != 1:
    raise SystemExit(f'expected one pilot role-complete marker, found {pilot_source.count(end_line)}')
pilot_source = pilot_source.replace(end_line, end_replacement, 1)
pilot.write_text(pilot_source)

print('MDO-002 guarded diagnostic patch applied')
