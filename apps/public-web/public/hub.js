const catalog = [
  ['The Decision Clinic','reading/decision-clinic.html','reasoning decision evidence tool workbench','Work through your own decision with a local reasoning memo.'],
  ['A field guide to justified action','reading/reasoning-field-guide.html','reasoning evidence contradiction source authority','A worked method for moving from a claim to a responsible next step.'],
  ['Memory as a prosthetic','reading/memory-prosthetic.html','memory cognition human prosthetic research','The human problem, outside literature, and open safety questions.'],
  ['Research agenda','reading/research-agenda.html','hypothesis research test memory continuity','Questions and observations that could challenge CoMind.'],
  ['Literature map','reading/literature-map.html','research papers human ai science','Established foundations, extensions, and unproven claims.'],
  ['Continuity protocol','reading/continuity-protocol.html','experiment test evaluation comparison','How to compare different memory conditions.'],
  ['Belief update specification','reading/belief-update.html','belief evidence contradiction correction','What a system should do when evidence changes.'],
  ['Cognitive continuity','reading/continuity.html','memory continuity preferences','When remembering helps and when it misleads.'],
  ['Governed reasoning','reading/governed-reasoning.html','reasoning evidence inference authority','Separate an observation from an inference and a decision.'],
  ['Reliable autonomy','reading/reliable-autonomy.html','automation deployment proof readback','How to know whether autonomous work finished.'],
  ['Start here','reading/start-here.html','guide overview reading room','A map of CoMind ideas.']
];
const input=document.querySelector('#site-search'), results=document.querySelector('#search-results');
function search(){
  const q=input.value.trim().toLowerCase().normalize('NFKD');
  results.replaceChildren();
  if(!q){const p=document.createElement('p');p.textContent='Try a question above, or browse the paths below.';results.append(p);return}
  const words=q.split(/\s+/).filter(Boolean);
  const matches=catalog.filter(item=>words.every(w=>item.join(' ').toLowerCase().includes(w))).slice(0,8);
  const intro=document.createElement('p');intro.textContent=matches.length?`${matches.length} result${matches.length===1?'':'s'} in the CoMind library`:'No match in this library. Try “memory”, “evidence”, or “autonomy”.';results.append(intro);
  const list=document.createElement('ul');for(const [title,url,,description] of matches){const li=document.createElement('li'),a=document.createElement('a'),small=document.createElement('small');a.href='./'+url;a.textContent=title;small.textContent=description;li.append(a,small);list.append(li)}results.append(list);
}
document.querySelector('#search-button').addEventListener('click',search);
input.addEventListener('input',search);
input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();results.querySelector('a')?.focus()}});
