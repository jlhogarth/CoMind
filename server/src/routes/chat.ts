import { FastifyInstance } from 'fastify';

export function registerChatRoutes(app: FastifyInstance) {
  app.get('/chat', async (_req, reply) => {
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>CoMind Chat</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: Canvas; color: CanvasText; }
      .shell { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; min-height: 100vh; }
      aside { border-right: 1px solid color-mix(in srgb, CanvasText 18%, transparent); padding: 16px; overflow-y: auto; }
      main { display: grid; grid-template-rows: auto 1fr auto; min-width: 0; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      h2 { font-size: 16px; margin-bottom: 8px; }
      h3 { font-size: 14px; margin-bottom: 8px; }
      .muted { opacity: .7; font-size: 13px; }
      .new-conversation { display: grid; gap: 8px; margin: 20px 0; }
      input, textarea, button, select { font: inherit; }
      input, textarea, select { width: 100%; padding: 10px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); border-radius: 8px; background: Canvas; color: CanvasText; }
      button { padding: 9px 12px; border-radius: 8px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); cursor: pointer; }
      button.primary { background: Highlight; color: HighlightText; border-color: Highlight; }
      button.danger { border-color: color-mix(in srgb, red 55%, CanvasText); }
      #conversationList, #memoryList { display: grid; gap: 6px; }
      .conversation-button, .memory-button { width: 100%; text-align: left; background: transparent; }
      .conversation-button[aria-current="true"], .memory-button[aria-current="true"] { outline: 2px solid Highlight; }
      .memory-section { margin-top: 24px; padding-top: 18px; border-top: 1px solid color-mix(in srgb, CanvasText 18%, transparent); display: grid; gap: 10px; }
      .memory-toolbar { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
      .memory-detail { margin-top: 8px; padding: 12px; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 10px; display: grid; gap: 8px; }
      .memory-detail[hidden] { display: none; }
      .memory-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .memory-meta { display: grid; gap: 4px; font-size: 12px; }
      .memory-content { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow-y: auto; padding: 8px; border-radius: 8px; background: color-mix(in srgb, CanvasText 5%, Canvas); }
      .memory-provenance { white-space: pre-wrap; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; max-height: 160px; overflow-y: auto; padding: 8px; border-radius: 8px; background: color-mix(in srgb, CanvasText 5%, Canvas); }
      header { padding: 18px 22px; border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); }
      #messages { padding: 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
      .message { max-width: 780px; padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); }
      .message.user { margin-left: auto; background: color-mix(in srgb, Highlight 14%, Canvas); }
      .message.assistant { margin-right: auto; }
      .role { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .65; margin-bottom: 6px; }
      .content { white-space: pre-wrap; overflow-wrap: anywhere; }
      form#messageForm { padding: 16px 22px; border-top: 1px solid color-mix(in srgb, CanvasText 18%, transparent); display: grid; gap: 8px; }
      .form-row { display: flex; gap: 8px; align-items: flex-end; }
      textarea { min-height: 72px; resize: vertical; }
      #status { min-height: 20px; }
      @media (max-width: 720px) {
        .shell { grid-template-columns: 1fr; }
        aside { border-right: 0; border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); }
        main { min-height: 70vh; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <h1>CoMind Chat</h1>
        <p class="muted">Durable conversation and governed memory surface</p>
        <div class="new-conversation">
          <label for="conversationTitle">New conversation title</label>
          <input id="conversationTitle" maxlength="200" autocomplete="off" />
          <button id="createConversation" class="primary" type="button">Create conversation</button>
        </div>
        <h2>Conversations</h2>
        <div id="conversationList" aria-live="polite"></div>

        <section class="memory-section" aria-labelledby="memoryHeading">
          <div>
            <h2 id="memoryHeading">Durable memory</h2>
            <p class="muted">Project-scoped, provenance-preserving lifecycle controls.</p>
          </div>
          <div class="memory-toolbar">
            <select id="memoryStatus" aria-label="Memory status filter" disabled>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <button id="refreshMemories" type="button" disabled>Refresh</button>
          </div>
          <div id="memoryList" aria-live="polite"></div>
          <section id="memoryDetail" class="memory-detail" hidden aria-labelledby="memoryDetailHeading">
            <h3 id="memoryDetailHeading">Memory detail</h3>
            <label for="memoryTitle">Title</label>
            <input id="memoryTitle" maxlength="200" />
            <label for="memoryKind">Kind</label>
            <input id="memoryKind" maxlength="80" />
            <label for="memorySubtype">Subtype</label>
            <input id="memorySubtype" maxlength="80" />
            <label for="memoryPriority">Priority</label>
            <input id="memoryPriority" type="number" min="1" max="10" />
            <label for="memoryVisibility">Visibility</label>
            <select id="memoryVisibility">
              <option value="internal">Internal</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <div class="memory-meta" id="memoryMeta"></div>
            <div>
              <strong>Source content</strong>
              <div id="memoryContent" class="memory-content"></div>
            </div>
            <div>
              <strong>Provenance</strong>
              <div id="memoryProvenance" class="memory-provenance"></div>
            </div>
            <div class="memory-actions">
              <button id="saveMemory" class="primary" type="button">Save metadata</button>
              <button id="toggleMemoryArchive" class="danger" type="button"></button>
            </div>
          </section>
        </section>
      </aside>
      <main>
        <header>
          <h2 id="activeTitle">Select or create a conversation</h2>
          <div id="status" class="muted" role="status"></div>
        </header>
        <section id="messages" aria-live="polite"></section>
        <form id="messageForm">
          <label for="messageText">Message</label>
          <div class="form-row">
            <textarea id="messageText" maxlength="100000" disabled></textarea>
            <button id="sendMessage" class="primary" type="submit" disabled>Send</button>
          </div>
        </form>
      </main>
    </div>
    <script>
      let selectedConversationId = null;
      let selectedProjectId = null;
      let selectedMemoryId = null;
      let selectedMemoryStatus = null;
      let assistantEnabled = false;
      let assistantProvider = null;

      const list = document.getElementById('conversationList');
      const messages = document.getElementById('messages');
      const activeTitle = document.getElementById('activeTitle');
      const status = document.getElementById('status');
      const titleInput = document.getElementById('conversationTitle');
      const messageInput = document.getElementById('messageText');
      const sendButton = document.getElementById('sendMessage');
      const memoryStatus = document.getElementById('memoryStatus');
      const refreshMemoriesButton = document.getElementById('refreshMemories');
      const memoryList = document.getElementById('memoryList');
      const memoryDetail = document.getElementById('memoryDetail');
      const memoryTitle = document.getElementById('memoryTitle');
      const memoryKind = document.getElementById('memoryKind');
      const memorySubtype = document.getElementById('memorySubtype');
      const memoryPriority = document.getElementById('memoryPriority');
      const memoryVisibility = document.getElementById('memoryVisibility');
      const memoryMeta = document.getElementById('memoryMeta');
      const memoryContent = document.getElementById('memoryContent');
      const memoryProvenance = document.getElementById('memoryProvenance');
      const toggleMemoryArchive = document.getElementById('toggleMemoryArchive');

      async function request(url, options) {
        const response = await fetch(url, options);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Request failed');
        return body;
      }

      function setStatus(text) {
        status.textContent = text;
      }

      function projectMemoryUrl(suffix = '') {
        if (!selectedProjectId) throw new Error('Select a project-scoped conversation first');
        return '/api/projects/' + encodeURIComponent(selectedProjectId) + '/memories' + suffix;
      }

      async function loadAssistantStatus() {
        const assistant = await request('/api/assistant/status');
        assistantEnabled = assistant.enabled === true;
        assistantProvider = assistant.provider;
      }

      function renderConversationButtons(conversations) {
        list.replaceChildren();
        for (const conversation of conversations) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'conversation-button';
          button.textContent = conversation.title || 'Untitled conversation';
          button.dataset.id = conversation.conv_id;
          button.setAttribute('aria-current', conversation.conv_id === selectedConversationId ? 'true' : 'false');
          button.addEventListener('click', () => selectConversation(conversation.conv_id));
          list.appendChild(button);
        }
      }

      function appendMessage(row) {
        const article = document.createElement('article');
        article.className = 'message ' + row.role;
        const role = document.createElement('div');
        role.className = 'role';
        role.textContent = row.role;
        const content = document.createElement('div');
        content.className = 'content';
        content.textContent = row.content;
        article.append(role, content);
        messages.appendChild(article);
        messages.scrollTop = messages.scrollHeight;
      }

      function renderMessages(rows) {
        messages.replaceChildren();
        for (const row of rows) appendMessage(row);
      }

      function renderMemoryButtons(rows) {
        memoryList.replaceChildren();
        for (const memory of rows) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'memory-button';
          button.textContent = (memory.status === 'archived' ? '[Archived] ' : '') + (memory.title || 'Untitled memory');
          button.dataset.id = memory.memory_id;
          button.setAttribute('aria-current', memory.memory_id === selectedMemoryId ? 'true' : 'false');
          button.addEventListener('click', () => selectMemory(memory.memory_id));
          memoryList.appendChild(button);
        }
        if (rows.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'muted';
          empty.textContent = 'No memories in this status.';
          memoryList.appendChild(empty);
        }
      }

      function showMemory(memory) {
        selectedMemoryId = memory.memory_id;
        selectedMemoryStatus = memory.status;
        memoryDetail.hidden = false;
        memoryTitle.value = memory.title || '';
        memoryKind.value = memory.kind || '';
        memorySubtype.value = memory.subtype || '';
        memoryPriority.value = String(memory.priority ?? 5);
        memoryVisibility.value = memory.visibility || 'internal';
        memoryContent.textContent = memory.content || '';
        memoryProvenance.textContent = JSON.stringify(memory.json_payload || {}, null, 2);
        memoryMeta.replaceChildren();
        for (const text of [
          'Memory ID: ' + memory.memory_id,
          'Project ID: ' + memory.project_id,
          'Author ID: ' + (memory.author_id || 'none'),
          'Status: ' + memory.status,
          'Created: ' + memory.created_at,
          'Updated: ' + memory.updated_at,
        ]) {
          const row = document.createElement('div');
          row.textContent = text;
          memoryMeta.appendChild(row);
        }
        toggleMemoryArchive.textContent = memory.status === 'archived' ? 'Restore memory' : 'Archive memory';
      }

      function clearMemoryDetail() {
        selectedMemoryId = null;
        selectedMemoryStatus = null;
        memoryDetail.hidden = true;
        memoryMeta.replaceChildren();
        memoryContent.textContent = '';
        memoryProvenance.textContent = '';
      }

      async function loadMemories(preferredId) {
        if (!selectedProjectId) {
          memoryStatus.disabled = true;
          refreshMemoriesButton.disabled = true;
          memoryList.replaceChildren();
          clearMemoryDetail();
          return;
        }
        memoryStatus.disabled = false;
        refreshMemoriesButton.disabled = false;
        const rows = await request(projectMemoryUrl('?status=' + encodeURIComponent(memoryStatus.value) + '&limit=100'));
        if (preferredId) selectedMemoryId = preferredId;
        renderMemoryButtons(rows);
        const selectedRow = rows.find((memory) => memory.memory_id === selectedMemoryId);
        if (selectedRow) {
          await selectMemory(selectedRow.memory_id, false);
        } else {
          clearMemoryDetail();
        }
      }

      async function selectMemory(memoryId, refreshList = true) {
        const memory = await request(projectMemoryUrl('/' + encodeURIComponent(memoryId)));
        showMemory(memory);
        if (refreshList) {
          await loadMemories(memoryId);
        }
      }

      async function loadConversations(preferredId) {
        const conversations = await request('/api/conversations');
        if (preferredId) selectedConversationId = preferredId;
        renderConversationButtons(conversations);
        if (selectedConversationId) {
          await selectConversation(selectedConversationId, false);
        } else if (conversations[0]) {
          await selectConversation(conversations[0].conv_id, false);
        }
      }

      async function selectConversation(id, refreshList = true) {
        selectedConversationId = id;
        const data = await request('/api/conversations/' + encodeURIComponent(id));
        activeTitle.textContent = data.conversation.title || 'Untitled conversation';
        selectedProjectId = data.conversation.project_id || null;
        renderMessages(data.messages);
        messageInput.disabled = false;
        sendButton.disabled = false;
        await loadMemories();
        setStatus(selectedProjectId
          ? 'Conversation and governed project memory loaded from PostgreSQL.'
          : 'Conversation loaded, but it is not assigned to a project.');
        if (refreshList) {
          const conversations = await request('/api/conversations');
          renderConversationButtons(conversations);
        }
      }

      document.getElementById('createConversation').addEventListener('click', async () => {
        const title = titleInput.value.trim();
        if (!title) {
          setStatus('Enter a conversation title first.');
          return;
        }
        try {
          const created = await request('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
          });
          titleInput.value = '';
          await loadConversations(created.conv_id);
          setStatus('Conversation created and persisted.');
        } catch (error) {
          setStatus(error.message);
        }
      });

      memoryStatus.addEventListener('change', async () => {
        try {
          await loadMemories();
          setStatus('Memory filter updated.');
        } catch (error) {
          setStatus(error.message);
        }
      });

      refreshMemoriesButton.addEventListener('click', async () => {
        try {
          await loadMemories(selectedMemoryId);
          setStatus('Durable memory refreshed.');
        } catch (error) {
          setStatus(error.message);
        }
      });

      document.getElementById('saveMemory').addEventListener('click', async () => {
        if (!selectedMemoryId) return;
        const priority = Number(memoryPriority.value);
        if (!Number.isInteger(priority) || priority < 1 || priority > 10) {
          setStatus('Memory priority must be an integer from 1 through 10.');
          return;
        }
        try {
          const updated = await request(projectMemoryUrl('/' + encodeURIComponent(selectedMemoryId)), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: memoryTitle.value.trim(),
              kind: memoryKind.value.trim(),
              subtype: memorySubtype.value.trim() || null,
              priority,
              visibility: memoryVisibility.value,
            })
          });
          showMemory(updated);
          await loadMemories(updated.memory_id);
          setStatus('Memory metadata updated without changing source content or provenance.');
        } catch (error) {
          setStatus(error.message);
        }
      });

      toggleMemoryArchive.addEventListener('click', async () => {
        if (!selectedMemoryId) return;
        const action = selectedMemoryStatus === 'archived' ? 'restore' : 'archive';
        try {
          const updated = await request(
            projectMemoryUrl('/' + encodeURIComponent(selectedMemoryId) + '/' + action),
            { method: 'POST' }
          );
          showMemory(updated);
          await loadMemories(updated.memory_id);
          setStatus(action === 'archive'
            ? 'Memory archived and removed from active retrieval eligibility.'
            : 'Memory restored to active retrieval eligibility.');
        } catch (error) {
          setStatus(error.message);
        }
      });

      document.getElementById('messageForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const content = messageInput.value.trim();
        if (!selectedConversationId || !content) return;
        sendButton.disabled = true;
        try {
          const persistedUser = await request('/api/conversations/' + encodeURIComponent(selectedConversationId) + '/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'user', content })
          });
          messageInput.value = '';
          appendMessage(persistedUser);

          if (!assistantEnabled) {
            setStatus('Message persisted. Assistant provider is not configured yet.');
            return;
          }

          setStatus('Message persisted. Requesting assistant response from ' + assistantProvider + '.');
          try {
            const persistedAssistant = await request(
              '/api/conversations/' + encodeURIComponent(selectedConversationId) + '/assistant-response',
              { method: 'POST' }
            );
            appendMessage(persistedAssistant);
            setStatus('Assistant response persisted.');
          } catch (assistantError) {
            setStatus('Message persisted. ' + assistantError.message + '.');
          }
        } catch (error) {
          setStatus(error.message);
        } finally {
          sendButton.disabled = false;
        }
      });

      Promise.all([loadAssistantStatus(), loadConversations()])
        .catch((error) => setStatus(error.message));
    </script>
  </body>
</html>`;
    reply.type('text/html').send(html);
  });
}
