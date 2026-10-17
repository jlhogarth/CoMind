import { projectRunbookLanes } from './drb-lanes.mjs';
import { routeFor } from './navigation.mjs';
// Read-only rendering of a supplied trusted-reader response. Never fetches or stores tokens.
export function renderLanes(root, source, route) {
  const doc=root.ownerDocument, win=doc.defaultView;
  const el=(tag,text)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=String(text);return n;};
  const link=(text,path)=>{const a=el('a',text);a.href='#'+path;return a;};
  const section=title=>{const n=el('section');n.append(el('h2',title));root.append(n);return n;};
  const value=x=>typeof x==='string'&&x.trim()?x:'Unavailable: source did not supply this field';
  if(source?.status!=='ready'){
    section('Development lanes unavailable').append(el('p',`Source state: ${value(source?.status)}. ${value(source?.reason)}`),el('p','No count is available. Missing integration, failed, forbidden and partial reads are not empty lane registries.'));
    return;
  }
  let page;
  try{page=projectRunbookLanes(source.envelope,source.project);}catch{
    section('Lane source integrity unavailable').append(el('p','Invalid scope, provenance or canonical identifiers. No rows are silently discarded and no count is inferred.'));return;
  }
  const provenance=section('Lane source and coverage');
  provenance.append(el('p',`${source.synthetic===true?'SYNTHETIC TEST FIXTURE. ':''}${page.scope}`),
    el('p',`Observed: ${page.observedAt}. Retrieval: ${page.retrieval.requestId}`),
    el('p',`Sources: ${page.retrieval.sourceRelations.join(', ')}`),
    el('p',`Bounded window: ${page.coverage.returned} returned; limit ${page.coverage.limit}; more available: ${page.coverage.moreAvailable}. Total registry size unknown.`),
    el('p','Source observation is not a freshness guarantee. Recorded lane status does not establish an active chat or running VE.'));
  if(route.id!==null){
    const s=section('Development lane detail');s.append(link('Back to filtered lanes',routeFor('lanes',null,route.filters)));
    const r=page.records.find(x=>x.id===route.id);
    if(!r){s.append(el('p','Lane unavailable in this bounded source window. This does not establish deletion or absence from the registry.'));return;}
    const fields=el('dl');
    for(const [title,key] of [['Canonical UUID','id'],['Project UUID','project_id'],['Work key','work_key'],['Title','title'],['Recorded lifecycle','status'],['Owner','owner'],['Current summary','current_summary'],['Last event time','last_event_at'],['Source updated','updated_at']])fields.append(el('dt',title),el('dd',value(r.source[key])));
    s.append(el('h3',value(r.source.title)),fields);
    const raw=source.envelope.data.find(x=>x.id===r.sourceId);
    s.append(el('p',`Priority: ${value(raw?.priority)}`),el('p',`Recorded next action: ${value(raw?.next_action)}`));
    const gaps=section('Unresolved lane integrations');
    for(const b of r.blockers)gaps.append(el('p',`${b.input}. Resolver: ${b.resolver}. Source: ${b.evidence}`));
    gaps.append(el('p','No dependency state, GitHub head/check result, event history or execution authority is inferred. No mutation controls are enabled.'));
    return;
  }
  const s=section('Development lane records'),form=el('form'),label=el('label','Search lanes'),input=el('input');
  input.value=route.filters.q;label.append(input);
  const stateLabel=el('label','Lane lifecycle'),select=el('select');
  const statuses=new Set(['backlog','ready','in_progress','blocked','review','done','canceled','deferred',...page.records.map(r=>r.lifecycle).filter(x=>typeof x==='string')]);
  for(const status of ['',...statuses]){const o=el('option',status||'All');o.value=status;select.append(o);}select.value=route.filters.state;
  stateLabel.append(select);form.append(label,stateLabel,el('button','Apply lane filters'));
  form.addEventListener('submit',event=>{event.preventDefault();win.location.hash=routeFor('lanes',null,{q:input.value,state:select.value});});s.append(form);
  const visible=page.records.filter(r=>(!route.filters.q||`${r.source.work_key} ${r.source.title} ${r.source.owner??''}`.toLowerCase().includes(route.filters.q.toLowerCase()))&&(!route.filters.state||r.lifecycle===route.filters.state));
  const metric=link(`${visible.length} matching lanes in supplied window`,routeFor('lanes',null,route.filters));metric.className='metric';s.append(metric);
  const list=el('ul');for(const r of visible){const li=el('li');li.append(link(`${value(r.source.work_key)}: ${value(r.source.title)}`,routeFor('lanes',r.id,route.filters)));list.append(li);}s.append(list);
  if(!visible.length)s.append(el('p','No matching lanes in this successful bounded window.'));
}
