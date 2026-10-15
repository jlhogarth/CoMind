import { createPool } from './db.mjs';
const pool=createPool();
const i=process.argv.indexOf('--event-pk');
const eventPk=i>=0?process.argv[i+1]:null;
try {
  const targets=eventPk?{rows:[{event_pk:eventPk}]}:await pool.query(`SELECT DISTINCT ON (e.event_pk) e.event_pk FROM sdn_telemetry.events e JOIN sdn_lifecycle.evaluations x ON x.event_pk=e.event_pk WHERE x.outcome='eligible' ORDER BY e.event_pk,x.evaluated_at DESC`);
  const receipts=[];
  for(const target of targets.rows){ const result=await pool.query('SELECT sdn_lifecycle.purge_eligible_event($1) AS deletion_receipt_id',[target.event_pk]); receipts.push({eventPk:target.event_pk,deletionReceiptId:result.rows[0].deletion_receipt_id}); }
  console.log(JSON.stringify({purged:receipts.length,receipts}));
} finally { await pool.end(); }
