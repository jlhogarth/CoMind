import {mountCockpit} from './cockpit.mjs';
import {createLaneReadController,createTrustedReadController,readTrustedDecisions} from './trusted-reader.mjs';
const root=document.querySelector('main'),status=document.querySelector('#read-status');
const decisionStatus=document.querySelector('#decision-status'),decisionList=document.querySelector('#decision-list');
let unmount=()=>{};
function show(lanes){
  unmount();unmount=mountCockpit(root,{status:'unavailable',records:[],sourceRef:'Attention is not connected in this reader.',reason:'Use the attention surface for its source status.',lanes});
  status.textContent=lanes.status==='ready'?'Project lane window received. Observation time and coverage are shown below.':lanes.reason;
}
show({status:'missing',reason:'No project read requested.'});
const controller=createLaneReadController({onState:show});
function showDecisions(state){
 decisionStatus.textContent=state.status==='ready'?`Received ${state.envelope.data.length} project decision records. Observation time: ${state.envelope.retrieved_at}. More available: ${state.envelope.more_available?'yes':'no'}.`:state.reason;
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
const form=document.querySelector('#read-scope');
form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity())return;
  // The request project is a lookup key, never an authorization assertion.
  const project=document.querySelector('#project').value;
  if(event.submitter?.value==='decisions'){controller.clear('Lane results cleared because a different source was requested.');void decisionController.refresh(project);}
  else{decisionController.clear('Decision results cleared because a different source was requested.');void controller.refresh(project);}
});
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();root.focus();});
window.addEventListener('pagehide',()=>{controller.stop();decisionController.stop();unmount();});
// A restored bfcache page must start again with no retained source or session assertion.
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
