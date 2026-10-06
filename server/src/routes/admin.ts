
import { FastifyInstance } from 'fastify';

export function registerAdminRoutes(app: FastifyInstance) {
  app.get('/admin', async (_req, reply) => {
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>CoMind Admin</title>
    <style>
      body{font-family:system-ui, sans-serif; margin:24px; line-height:1.4}
      h1{margin-bottom:8px;}
      h2{margin-top:24px;}
      table{border-collapse:collapse; width:100%; margin-top:8px;}
      th,td{border:1px solid #ddd; padding:8px; font-size:14px;}
      th{background:#f3f3f3; text-align:left;}
      input,button{padding:8px; font-size:14px;}
      .row{display:flex; gap:8px; flex-wrap:wrap}
      .muted{color:#666; font-size:12px;}
      .badge{padding:2px 6px; border-radius:4px; background:#eee; font-size:12px;}
    </style>
  </head>
  <body>
    <h1>CoMind Admin</h1>
    <p class="muted">Lightweight controls for Research References and Enterprise Checklist.</p>

    <h2>Research References</h2>
    <div class="row">
      <input id="ref_title" placeholder="Title" />
      <input id="ref_url" placeholder="URL" />
      <input id="ref_notes" placeholder="Notes" />
      <input id="ref_tags" placeholder="Tags (comma separated)" />
      <button onclick="addRef()">Add</button>
    </div>
    <table id="refs"><thead><tr><th>Title</th><th>URL</th><th>Tags</th><th>Actions</th></tr></thead><tbody></tbody></table>

    <h2>Enterprise Checklist</h2>
    <div class="row">
      <input id="chk_item" placeholder="Item" />
      <input id="chk_effort" placeholder="Effort" />
      <select id="chk_priority">
        <option>Day-1 Critical</option>
        <option>Day-2 Enhancement</option>
      </select>
      <button onclick="addChecklist()">Add</button>
    </div>
    <table id="checklist"><thead><tr><th>Item</th><th>Priority</th><th>Status</th><th>Config</th><th>Migration</th><th>Test</th><th>Actions</th></tr></thead><tbody></tbody></table>

    <script>
      async function loadRefs(){
        const res = await fetch('/api/research'); const data = await res.json();
        const tbody = document.querySelector('#refs tbody'); tbody.innerHTML='';
        data.forEach(r=>{
          const tr = document.createElement('tr');
          tr.innerHTML = \`<td>\${r.title}</td>
            <td><a href="\${r.url}" target="_blank">\${r.url}</a></td>
            <td>\${(r.tags||[]).join(', ')}</td>
            <td><button onclick="delRef('\${r.ref_id}')">Delete</button></td>\`;
          tbody.appendChild(tr);
        });
      }
      async function addRef(){
        const title = document.getElementById('ref_title').value;
        const url = document.getElementById('ref_url').value;
        const notes = document.getElementById('ref_notes').value;
        const tags = document.getElementById('ref_tags').value.split(',').map(s=>s.trim()).filter(Boolean);
        await fetch('/api/research',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title,url,notes,tags})});
        loadRefs();
      }
      async function delRef(id){
        await fetch('/api/research/'+id,{method:'DELETE'}); loadRefs();
      }

      async function loadChecklist(){
        const res = await fetch('/api/checklist'); const data = await res.json();
        const tbody = document.querySelector('#checklist tbody'); tbody.innerHTML='';
        data.forEach(c=>{
          const tr = document.createElement('tr');
          tr.innerHTML = \`<td>\${c.item}</td>
            <td><span class="badge">\${c.priority||''}</span></td>
            <td>\${c.status}</td>
            <td><input type="checkbox" \${c.config_checked?'checked':''} onchange="updateChk('\${c.item_id}',{config_checked:this.checked})"/></td>
            <td><input type="checkbox" \${c.migration_done?'checked':''} onchange="updateChk('\${c.item_id}',{migration_done:this.checked})"/></td>
            <td><input type="checkbox" \${c.test_done?'checked':''} onchange="updateChk('\${c.item_id}',{test_done:this.checked})"/></td>
            <td><button onclick="updateChk('\${c.item_id}',{status:'done',config_checked:true,migration_done:true,test_done:true})">Mark Done</button></td>\`;
          tbody.appendChild(tr);
        });
      }
      async function addChecklist(){
        const item = document.getElementById('chk_item').value;
        const effort_estimate = document.getElementById('chk_effort').value;
        const priority = document.getElementById('chk_priority').value;
        await fetch('/api/checklist',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({item, effort_estimate, priority})});
        loadChecklist();
      }
      async function updateChk(id, body){
        await fetch('/api/checklist/'+id,{method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
        loadChecklist();
      }
      loadRefs(); loadChecklist();
    </script>
  </body>
</html>`;
    reply.type('text/html').send(html);
  });
}
