import {mountCockpit} from './cockpit.mjs';
import {createLaneReadController} from './trusted-reader.mjs';
const root=document.querySelector('main'),status=document.querySelector('#read-status');
let unmount=()=>{};
function show(lanes){
  unmount();unmount=mountCockpit(root,{status:'unavailable',records:[],sourceRef:'Attention is not connected in this reader.',reason:'Use the attention surface for its source status.',lanes});
  status.textContent=lanes.status==='ready'?'Project lane window received. Observation time and coverage are shown below.':lanes.reason;
}
show({status:'missing',reason:'No project read requested.'});
const controller=createLaneReadController({onState:show});
const form=document.querySelector('#read-scope');
form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity())return;
  // The request project is a lookup key, never an authorization assertion.
  void controller.refresh(document.querySelector('#project').value);
});
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();root.focus();});
window.addEventListener('pagehide',()=>{controller.stop();unmount();});
// A restored bfcache page must start again with no retained source or session assertion.
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
