import pg from 'pg';
import ingestion from './worker.mjs';

const statements = {
  web001_submit: ['select web001_private.web001_submit($1::uuid,$2,$3,$4,$5,$6,$7) as result',
    ['p_id', 'p_hash', 'p_consent_version', 'p_question', 'p_why', 'p_known', 'p_unknown']],
  web001_withdraw: ['select web001_private.web001_withdraw($1::uuid,$2) as result', ['p_id', 'p_hash']],
};

export default {
  fetch(request, env) {
    return ingestion.fetch(request, {
      ...env,
      WEB001_STORAGE: env.WEB001_DB && {
        async call(operation, params) {
          const [sql, keys] = statements[operation];
          const client = new pg.Client({
            connectionString: env.WEB001_DB.connectionString,
            connectionTimeoutMillis: 5000,
            query_timeout: 8000,
          });
          try {
            await client.connect();
            const result = await client.query(sql, keys.map(key => params[key]));
            return result.rows[0].result;
          } finally {
            await client.end().catch(() => {});
          }
        },
      },
    });
  },
};
