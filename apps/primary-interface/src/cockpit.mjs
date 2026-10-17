import { assessHumanAction } from './human-attention.mjs';
import { routeFor, parseRoute } from './navigation.mjs';
const value = x => typeof x === 'string' && x.trim() ? x : 'Unavailable: source did not supply this field';
export function mountCockpit(root, source, { clock = () => new Date().toISOString() } = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const el = (tag, text) => { const n = doc.createElement(tag); if (text != null) n.textContent = String(text); return n; };
  const link = (text, path) => { const a = el('a', text); a.href = `#${path}`; return a; };
  const section = title => { const n = el('section'); n.append(el('h2', title)); root.append(n); return n; };
  const records = Array.isArray(source.records) ? source.records : [];
  function render(focus = false) {
    root.replaceChildren();
    const route = parseRoute(win.location.hash.slice(1) || '/attention');
    const now = clock();
    const coverage = section('Source and coverage');
    coverage.append(el('p', `${source.synthetic === true ? 'SYNTHETIC TEST FIXTURE. ' : ''}${value(source.status)} | ${value(source.sourceRef)}`), el('p', `Source observed: ${value(source.observedAt)}. Assessed: ${now}`));
    if (!route) { section('Unknown route').append(link('Return to attention', '/attention')); }
    else if (route.entity !== 'attention') {
      section(route.entity).append(el('p', 'Unavailable: canonical entity adapter is not connected. No operational records or counts are inferred.'), el('p', route.id ? `Requested identifier: ${route.id}` : 'No record selected.'));
    } else if (source.status !== 'ready') {
      section('Attention unavailable').append(el('p', value(source.reason)), el('p', 'No count is available. A source failure or missing integration is not an empty queue.'));
    } else if (!Array.isArray(source.records) || records.some(r => !r || typeof r.id !== 'string' || !r.id.trim()) || new Set(records.map(r => r.id)).size !== records.length) {
      section('Source integrity unavailable').append(el('p', 'Missing, invalid or duplicate identifiers prevent a reliable count and detail lookup. Refresh the canonical projection; no source rows are silently discarded.'));
    } else if (route.id !== null) {
      const matches = records.filter(r => r?.id === route.id);
      const s = section('Human-action detail');
      s.append(link('Back to filtered attention', routeFor('attention', null, route.filters)));
      if (matches.length !== 1) s.append(el('p', matches.length ? 'Conflicting identifiers: detail unavailable.' : 'Record unavailable in this source snapshot.'));
      else {
        const r = matches[0], assessment = assessHumanAction(r, now);
        s.append(el('h3', r.id), el('p', `Assessment: ${assessment.state}`));
        const fields = el('dl');
        for (const [name, field] of [['Why work stopped','stopReason'],['Exact authority boundary','authorityBoundary'],['Recommendation','recommendation'],['Consequences','consequences'],['Lifecycle','status'],['Requested at','requestedAt'],['Expires at','expiresAt']]) fields.append(el('dt',name),el('dd',value(r[field])));
        fields.append(el('dt','Revision'),el('dd',Number.isSafeInteger(r.revision) ? r.revision : 'Unavailable'));
        s.append(fields,link(`Related lane: ${value(r.laneId)}`,routeFor('lanes',r.laneId || undefined)));
        const problems = section('Evidence and freshness assessment');
        problems.append(el('p', 'Verification labels are supplied assertions, not independent proof of truth.'));
        for (const issue of assessment.issues) problems.append(el('p',`${issue.field}: ${issue.code}`));
        if (!assessment.issues.length) problems.append(el('p','No presentation-contract issues at assessment time.'));
        for (const e of Array.isArray(r.evidence) ? r.evidence : []) {
          const item = el('p'); item.append(el('span',`${value(e?.sourceRef)} | verification: ${value(e?.verification)} | verified: ${value(e?.verifiedAt)} | expires: ${value(e?.expiresAt)} | conflict: ${String(e?.conflict ?? 'unknown')} `));
          if (typeof e?.id === 'string' && e.id.trim()) item.append(link('Inspect evidence',routeFor('evidence',e.id))); problems.append(item);
        }
        const history = section('Related RunBook history');
        history.append(el('p','References only. Event contents and chronology are unavailable until the canonical RunBook resolver is connected.'));
        for (const ref of Array.isArray(r.runbookRefs) ? r.runbookRefs : []) {
          const item = el('p',value(ref?.sourceRef)); if (typeof ref?.id === 'string' && ref.id.trim()) item.append(' ',link('Inspect RunBook event',routeFor('runbook',ref.id))); history.append(item);
        }
        const actions = section('Actions');
        actions.append(el('p','Approve, hold and reject are unavailable: trusted identity, current authority, canonical revalidation and durable decision recording are not connected. Approval would not execute work.'));
        for (const action of ['approve','hold','reject']) { const b=el('button',action); b.disabled=true; actions.append(b); }
        actions.append(el('p',`Presentation choices: ${assessment.decisionOptions.join(', ') || 'none'}. Refresh to reassess freshness.`));
      }
    } else {
      const s = section('Attention records');
      const form = el('form');
      const label = el('label','Search'); const input=el('input'); input.name='q'; input.value=route.filters.q; label.append(input);
      const stateLabel=el('label','Assessment'); const select=el('select'); select.name='state';
      for (const state of ['', 'reviewable','needs_refresh','closed']) { const o=el('option',state || 'All'); o.value=state; select.append(o); } select.value=route.filters.state;
      const submit=el('button','Apply filters'); form.append(label,stateLabel,submit);stateLabel.append(select);
      form.addEventListener('submit',event=>{event.preventDefault(); win.location.hash=routeFor('attention',null,{q:input.value,state:select.value});}); s.append(form);
      const visible=records.filter(r=> r && typeof r.id==='string').filter(r=>(!route.filters.q || `${r.id} ${r.stopReason || ''} ${r.laneId || ''}`.toLowerCase().includes(route.filters.q.toLowerCase())) && (!route.filters.state || assessHumanAction(r,now).state===route.filters.state));
      const metric=link(`${visible.length} matching records in supplied snapshot`,routeFor('attention',null,route.filters)); metric.className='metric'; s.append(metric);
      const list=el('ul');
      for (const r of visible) { const li=el('li'); li.append(link(`${r.id}: ${value(r.stopReason)}`,routeFor('attention',r.id,route.filters)));list.append(li); } s.append(list);
      if (!visible.length) s.append(el('p','No matching records in this successful source snapshot.'));
    }
    const refresh=el('button','Refresh assessment'); refresh.addEventListener('click',()=>render(true));root.append(refresh);
    if (focus) root.focus();
  }
  const changed=()=>render(true); win.addEventListener('hashchange',changed); render();
  return ()=>{win.removeEventListener('hashchange',changed);root.replaceChildren();};
}
