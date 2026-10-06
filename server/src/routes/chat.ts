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
      .shell { display: grid; grid-template-columns: minmax(220px, 300px) 1fr; min-height: 100vh; }
      aside { border-right: 1px solid color-mix(in srgb, CanvasText 18%, transparent); padding: 16px; }
      main { display: grid; grid-template-rows: auto 1fr auto; min-width: 0; }
      h1, h2, p { margin-top: 0; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      h2 { font-size: 16px; margin-bottom: 8px; }
      .muted { opacity: .7; font-size: 13px; }
      .new-conversation { display: grid; gap: 8px; margin: 20px 0; }
      input, textarea, button { font: inherit; }
      input, textarea { width: 100%; padding: 10px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); border-radius: 8px; background: Canvas; color: CanvasText; }
      button { padding: 9px 12px; border-radius: 8px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); cursor: pointer; }
      button.primary { background: Highlight; color: HighlightText; border-color: Highlight; }
      #conversationList { display: grid; gap: 6px; }
      .conversation-button { width: 100%; text-align: left; background: transparent; }
      .conversation-button[aria-current="true"] { outline: 2px solid Highlight; }
      header { padding: 18px 22px; border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); }
      #messages { padding: 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
      .message { max-width: 780px; padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); }
      .message.user { margin-left: auto; background: color-mix(in srgb, Highlight 14%, Canvas); }
      .message.assistant { margin-right: auto; }
      .role { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; opacity: .65; margin-bottom: 6px; }
      .content { white-space: pre-wrap; overflow-wrap: anywhere; }
      form { padding: 16px 22px; border-top: 1px solid color-mix(in srgb, CanvasText 18%, transparent); display: grid; gap: 8px; }
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
        <p class="muted">Minimal durable conversation surface</p>
        <div class="new-conversation">
          <label for="conversationTitle">New conversation title</label>
          <input id="conversationTitle" maxlength="200" autocomplete="off" />
          <button id="createConversation" class="primary" type="button">Create conversation</button>
        </div>
        <h2>Conversations</h2>
        <div id="conversationList" aria-live="polite"></div>
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

      const list = document.getElementById('conversationList');
      const messages = document.getElementById('messages');
      const activeTitle = document.getElementById('activeTitle');
      const status = document.getElementById('status');
      const titleInput = document.getElementById('conversationTitle');
      const messageInput = document.getElementById('messageText');
      const sendButton = document.getElementById('sendMessage');

      async function request(url, options) {
        const response = await fetch(url, options);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Request failed');
        return body;
      }

      function setStatus(text) {
        status.textContent = text;
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

      function renderMessages(rows) {
        messages.replaceChildren();
        for (const row of rows) {
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
        }
        messages.scrollTop = messages.scrollHeight;
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
        renderMessages(data.messages);
        messageInput.disabled = false;
        sendButton.disabled = false;
        setStatus('Conversation loaded from PostgreSQL.');
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

      document.getElementById('messageForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const content = messageInput.value.trim();
        if (!selectedConversationId || !content) return;
        sendButton.disabled = true;
        try {
          await request('/api/conversations/' + encodeURIComponent(selectedConversationId) + '/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'user', content })
          });
          messageInput.value = '';
          await selectConversation(selectedConversationId, false);
          setStatus('Message persisted. Assistant provider is not configured yet.');
        } catch (error) {
          setStatus(error.message);
        } finally {
          sendButton.disabled = false;
        }
      });

      loadConversations().catch((error) => setStatus(error.message));
    </script>
  </body>
</html>`;
    reply.type('text/html').send(html);
  });
}
