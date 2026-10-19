import {mountCockpit} from './cockpit.mjs';
import {createLaneReadController,createTrustedReadController,readTrustedEvents,readTrustedDecisions,readTrustedFoundryRequests} from './trusted-reader.mjs';
const root=document.querySelector('#lane-view'),content=document.querySelector('#content'),status=document.querySelector('#read-status');
const decisionStatus=document.querySelector('#decision-status'),decisionList=document.querySelector('#decision-list');
let unmount=()=>{};
function show(lanes){
  unmount();unmount=mountCockpit(root,{status:'unavailable',records:[],sourceRef:'Attention is not connected in this reader.',reason:'Use the attention surface for its source status.',lanes});
  status.textContent=lanes.status==='ready'?'Project lane window received. Observation time and coverage are shown below.':lanes.reason;
}
show({status:'missing',reason:'No project read requested.'});
const controller=createLaneReadController({onState:show});
function showDecisions(state){
 decisionStatus.textContent=state.status==='ready'?`Received ${state.envelope.data.length} project decision records. Observation time: ${state.envelope.retrieved_at}. More available: ${state.envelope.more_available?'yes':'no'}. Bounded page, not a completeness claim.`:state.reason;
 decisionList.replaceChildren();
 if(state.status!=='ready')return;
 const doc=decisionList.ownerDocument,records=state.envelope.data;
 if(records.length===0){const empty=doc.createElement('p');empty.textContent='The source returned a successful empty page.';decisionList.append(empty);return;}
 for(const row of records){
  const article=doc.createElement('article'),heading=doc.createElement('h3'),list=doc.createElement('dl');
  heading.textContent=`${row.work_key}: ${row.decision_needed}`;article.append(heading);
  for(const [label,value] of [['Canonical decision ID',row.id],['Work item ID',row.work_item_id],['Selected option',row.selected_option],['Options source JSON',row.options_json],['Rationale',row.rationale],['Reversibility source value',row.reversibility],['Recorded by',row.decided_by],['Decision time',row.decided_at],['Record updated',row.updated_at]]){
   const term=doc.createElement('dt'),description=doc.createElement('dd');term.textContent=label;description.textContent=value??'Not recorded';list.append(term,description);
  }
  article.append(list);decisionList.append(article);
 }
}
let decisionController=createTrustedReadController({onState:showDecisions,read:readTrustedDecisions});
const foundryStatus=document.querySelector('#foundry-status'),foundryList=document.querySelector('#foundry-list');
function showFoundry(state){
 foundryStatus.textContent=state.status==='ready'
  ?`Received ${state.envelope.data.length} Foundry authorization request records. Observation time: ${state.envelope.retrieved_at}. More available: ${state.envelope.more_available?'yes':'no'}. Bounded page, not a completeness claim.`
  :state.reason;
 foundryList.replaceChildren();
 if(state.status!=='ready')return;
 const doc=foundryList.ownerDocument,records=state.envelope.data;
 if(records.length===0){const empty=doc.createElement('p');empty.textContent='The source returned a successful empty page.';foundryList.append(empty);return;}
 for(const row of records){
  const article=doc.createElement('article'),heading=doc.createElement('h3'),list=doc.createElement('dl');
  heading.textContent=`${row.authority_level} ${row.status} request: ${row.target_kind}`;article.append(heading);
  for(const [label,value] of [['Canonical Foundry request ID',row.authorization_request_id],['Foundry project UUID',row.project_id],
   ['Requesting profile ID',row.requesting_profile_id],['Requesting actor ID',row.requesting_actor_id],['Capability ID',row.capability_id],
   ['Task ID',row.task_id],['Environment source value',row.environment],['Target reference',row.target_ref],['Reason',row.reason],
   ['Evidence references source JSON',JSON.stringify(row.evidence_refs)],['Requested at',row.requested_at],['Expires at',row.expires_at]]){
   const term=doc.createElement('dt'),description=doc.createElement('dd');term.textContent=label;description.textContent=value??'Not recorded';list.append(term,description);
  }
  article.append(list);foundryList.append(article);
 }
}
let foundryController=createTrustedReadController({onState:showFoundry,read:readTrustedFoundryRequests});
const eventStatus=document.querySelector('#event-status'),eventList=document.querySelector('#event-list');
const eventPagination=document.querySelector('#event-pagination'),eventOlder=document.querySelector('#event-older'),eventNewer=document.querySelector('#event-newer');
let eventPageIndex=0,eventPageCursors=[null],eventContext=null,eventLastState=null;
function showEvents(state){
 eventLastState=state;
 eventList.replaceChildren();
 eventStatus.textContent=state.status==='ready'
  ?`Page ${eventPageIndex+1}: received ${state.projection.coverage.returned} RunBook events. Observation time: ${state.projection.observedAt}. ${state.projection.coverage.moreAvailable?'A next page is available.':'No next page is reported for this bounded response.'} This window is not a complete archive.`
  :state.reason;
 eventPagination.hidden=state.status!=='ready';eventNewer.hidden=state.status!=='ready'||eventPageIndex===0;
 eventOlder.hidden=state.status!=='ready'||!state.projection.coverage.moreAvailable;
 eventOlder.disabled=state.status!=='ready'||!state.envelope.next_cursor;
 if(state.status!=='ready')return;
 const doc=eventList.ownerDocument;
 if(!state.projection.records.length){const empty=doc.createElement('p');empty.textContent='The source returned a successful empty page.';eventList.append(empty);return;}
 for(const record of state.projection.records){
  const row=record.source;
  const article=doc.createElement('article'),heading=doc.createElement('h3'),list=doc.createElement('dl');
  heading.textContent=row.action_summary??'Event without summary';article.append(heading);
  for(const [label,value] of [['Canonical event ID',record.sourceId],['Source relation',record.sourceRelation],['Observed at',record.observedAt],['Revision',record.revision??'Not supplied'],['Projection gaps',record.blockers.map(item=>item.input).join('; ')],['Project',row.project_key],['Project UUID',row.project_id],['Lane',row.work_key],['Work item UUID',row.work_item_id],['Work item type',row.item_type],
   ['Event project UUID',row.event_project_id],['Work item project UUID',row.work_item_project_id],['Occurred at',row.occurred_at],['Result',row.result_summary],['Outcome source value',row.outcome],['Next action',row.next_action],
   ['Source system',row.source_system],['Source reference',row.source_ref],['Evidence references source JSON',JSON.stringify(row.evidence)]]){
   const term=doc.createElement('dt'),description=doc.createElement('dd');term.textContent=label;description.textContent=value??'Not recorded';list.append(term,description);
  }
  article.append(list);eventList.append(article);
 }
}
const eventController=createTrustedReadController({onState:showEvents,read:readTrustedEvents});
function setEventHistory(pageIndex,replace=false){
 const url=new URL(window.location.href);url.searchParams.set('pi_event_page',String(pageIndex));
 const state={piEventPage:pageIndex,piEventProject:eventContext.project,piEventOptions:eventContext.options,piEventCursor:eventPageCursors[pageIndex]??null};
 window.history[replace?'replaceState':'pushState'](state,'',url);
}
eventOlder.addEventListener('click',()=>{
 if(eventLastState?.status!=='ready'||!eventLastState.envelope.next_cursor)return;
 eventPageIndex++;eventPageCursors[eventPageIndex]=eventLastState.envelope.next_cursor;
 setEventHistory(eventPageIndex);void eventController.refresh(eventContext.project,{...eventContext.options,cursor:eventPageCursors[eventPageIndex]});
});
eventNewer.addEventListener('click',()=>{if(eventPageIndex>0)window.history.back();});
window.addEventListener('popstate',event=>{
 const state=event.state;if(!state||!Number.isInteger(state.piEventPage)||typeof state.piEventProject!=='string')return;
 const cursor=state.piEventCursor??eventPageCursors[state.piEventPage];if(state.piEventPage>0&&!cursor)return;
 eventPageIndex=state.piEventPage;eventPageCursors[state.piEventPage]=cursor??null;eventContext={project:state.piEventProject,options:state.piEventOptions??{}};
 const options={...eventContext.options};if(cursor)options.cursor=cursor;else delete options.cursor;
 void eventController.refresh(eventContext.project,options);
});
const form=document.querySelector('#read-scope');
form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity())return;
  // The request project is a lookup key, never an authorization assertion.
  const project=document.querySelector('#project').value;
  const lane=document.querySelector('#lane').value;const options=lane?{lane}:{};
  foundryController.clear('Foundry results cleared because a different source was requested.');
  if(event.submitter?.value==='events'){
   controller.clear('Lane results cleared because a different source was requested.');decisionController.clear('Decision results cleared because a different source was requested.');
   eventPageIndex=0;eventPageCursors=[null];eventContext={project,options:{...options,limit:Number(document.querySelector('#event-limit').value)}};
   const replaceCurrentHistory=!Number.isInteger(window.history.state?.piEventPage);
   setEventHistory(0,replaceCurrentHistory);void eventController.refresh(project,eventContext.options);return;
  }
  eventController.clear('RunBook results cleared because a different source was requested.');
  if(event.submitter?.value==='decisions'){controller.clear('Lane results cleared because a different source was requested.');void decisionController.refresh(project,options);}
  else{decisionController.clear('Decision results cleared because a different source was requested.');void controller.refresh(project,options);}
});
document.querySelector('#foundry-scope').addEventListener('submit',event=>{
 event.preventDefault();const foundryProject=document.querySelector('#foundry-project').value;
 if(!event.currentTarget.reportValidity())return;
 eventController.clear('RunBook results cleared because a Foundry source was requested.');
 controller.clear('Lane results cleared because a Foundry source was requested.');
 decisionController.clear('Decision results cleared because a Foundry source was requested.');
 void foundryController.refresh(foundryProject);
});
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();content.focus();});
window.addEventListener('pagehide',()=>{eventController.stop();controller.stop();decisionController.stop();foundryController.stop();unmount();});
// A restored bfcache page must start again with no retained source or session assertion.
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
