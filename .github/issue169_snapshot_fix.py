from pathlib import Path

path = Path('server/src/foundry-lifecycle.ts')
source = path.read_text()
old = """     SELECT COALESCE((SELECT ok FROM finished), false) AS finalized,
            (SELECT status FROM task_updated) AS task_status,
            (SELECT state FROM comind.cm_foundry_work_lease WHERE task_id = $1::uuid) AS lease_state`"""
new = """     SELECT COALESCE((SELECT ok FROM finished), false) AS finalized,
            (SELECT status FROM task_updated) AS task_status,
            CASE
              WHEN COALESCE((SELECT ok FROM finished), false)
                THEN CASE WHEN $7::text = 'succeeded' THEN 'completed' ELSE 'exhausted' END
              ELSE NULL
            END AS lease_state`"""
if old not in source:
    raise SystemExit('Issue 169 snapshot-fix anchor not found')
path.write_text(source.replace(old, new, 1))
