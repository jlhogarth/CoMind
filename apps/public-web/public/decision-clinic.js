const form=document.querySelector('#reasoning-form');
const steps=[...form.querySelectorAll('.aid-step')], progress=document.querySelector('#aid-progress');
const back=document.querySelector('#aid-back'),next=document.querySelector('#aid-next'),review=document.querySelector('#aid-review'),output=document.querySelector('#aid-output');
let current=0;
function showStep(index,focus=true){current=index;steps.forEach((s,i)=>s.hidden=i!==index);back.hidden=index===0;next.hidden=index===steps.length-1;review.hidden=index!==steps.length-1;progress.textContent=`Step ${index+1} of ${steps.length}: ${['frame the decision','name the evidence','challenge the story','choose a next move'][index]}`;output.hidden=true;if(focus)steps[index].querySelector('h3').setAttribute('tabindex','-1'),steps[index].querySelector('h3').focus()}
next.addEventListener('click',()=>showStep(Math.min(current+1,steps.length-1)));
back.addEventListener('click',()=>showStep(Math.max(current-1,0)));
const get=id=>form.querySelector('#aid-'+id).value.trim();
form.addEventListener('submit',event=>{
  event.preventDefault();
  const fields=[['Decision',get('decision')],['Observation',get('observed')],['Source and time',get('source')],['Contrary evidence',get('contrary')],['Interpretation',get('inference')],['Alternative explanation',get('alternative')],['What would change my mind',get('falsifier')],['Decision authority',get('owner')],['Next action',get('action')],['Self-rated confidence',get('confidence')]];
  const gaps=[];
  if(!get('decision'))gaps.push('Name a concrete decision before acting.');
  if(!get('observed'))gaps.push('Find an observation you can point to, rather than relying on the conclusion alone.');
  if(!get('source'))gaps.push('Record where the observation came from and when it was true.');
  if(!get('contrary'))gaps.push('Look for a correction or conflicting observation. A blank field does not prove none exists.');
  if(!get('inference'))gaps.push('State the interpretation separately from the observation.');
  if(!get('alternative'))gaps.push('Consider one other explanation that could fit the same facts.');
  if(!get('falsifier'))gaps.push('Choose a check whose result could actually change your mind.');
  if(!get('owner'))gaps.push('Identify who has authority to decide or correct the action.');
  if(!get('action'))gaps.push('Choose a small next step whose outcome you can verify.');
  const high=get('stakes')==='high',hard=get('reverse')==='no';
  if(high&&hard)gaps.unshift('Consequential and difficult to reverse: seek responsible review and verify primary evidence before acting.');
  else if(high)gaps.unshift('Consequential decision: verify with a responsible person or source before acting.');
  if(get('confidence')==='high'&&(!get('contrary')||!get('falsifier')))gaps.push('High confidence with an untested alternative: what evidence could lower that confidence?');
  const signal=document.querySelector('#aid-signal');
  signal.textContent=high&&hard?'Pause and verify before an irreversible decision.':gaps.length?'There are checks worth making before you act.':'Your entries cover the basic checks. Verify the source and decide with the responsible person.';
  const memo=document.querySelector('#aid-memo');memo.replaceChildren();
  for(const [label,value] of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value||'Not yet entered';memo.append(dt,dd)}
  const list=document.querySelector('#aid-gaps');list.replaceChildren();
  for(const g of gaps.length?gaps:['No fields are empty. Revisit the source, time, alternative explanation, and authority before using this memo.']){const li=document.createElement('li');li.textContent=g;list.append(li)}
  output.hidden=false;document.querySelector('#aid-output-title').focus();
});
document.querySelector('#aid-edit').addEventListener('click',()=>showStep(current));
document.querySelector('#aid-print').addEventListener('click',()=>window.print());
form.addEventListener('reset',()=>{setTimeout(()=>{showStep(0);document.querySelector('#aid-decision').focus()},0)});
showStep(0,false);
