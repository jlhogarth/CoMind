import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/comind_ci';

const { buildApp } = await import('../../dist/app.js');

let app;

before(async () => {
  app = await buildApp();
});

after(async () => {
  if (app) {
    await app.close();
  }
});

test('conversation list returns deterministic fixtures newest first', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/conversations' });

  assert.equal(response.statusCode, 200);
  const conversations = response.json();
  assert.deepEqual(
    conversations.map((conversation) => conversation.conv_id),
    [
      '44444444-4444-4444-8444-444444444443',
      '44444444-4444-4444-8444-444444444442',
      '44444444-4444-4444-8444-444444444441',
    ]
  );
  assert.deepEqual(
    conversations.map((conversation) => conversation.title),
    [
      'Issue #8 integration verification',
      'Supabase migration planning',
      'Memory architecture discussion',
    ]
  );
});

test('conversation detail preserves parent relationship and chronological message order', async () => {
  const conversationId = '44444444-4444-4444-8444-444444444441';
  const response = await app.inject({
    method: 'GET',
    url: `/api/conversations/${conversationId}`,
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.conversation.conv_id, conversationId);
  assert.equal(body.conversation.project_id, '33333333-3333-4333-8333-333333333333');
  assert.deepEqual(
    body.messages.map((message) => message.msg_id),
    [
      '55555555-5555-4555-8555-555555555551',
      '55555555-5555-4555-8555-555555555552',
      '55555555-5555-4555-8555-555555555553',
    ]
  );
  assert.deepEqual(
    body.messages.map((message) => message.role),
    ['user', 'assistant', 'user']
  );
  assert.ok(body.messages.every((message) => message.conv_id === conversationId));
});

test('message search performs case-insensitive database-backed matching in newest-first order', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/messages/search?q=MEMORY',
  });

  assert.equal(response.statusCode, 200);
  const matches = response.json();
  assert.deepEqual(
    matches.map((match) => match.msg_id),
    [
      '55555555-5555-4555-8555-555555555558',
      '55555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555553',
      '55555555-5555-4555-8555-555555555552',
    ]
  );
  assert.ok(matches.every((match) => match.snippet.toLowerCase().includes('memory')));
});

test('analytics summary reports fixture totals and conversation message counts', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/analytics/summary' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    conversations: 3,
    messages: 9,
    top10: [
      { conv_id: '44444444-4444-4444-8444-444444444443', messages: 4 },
      { conv_id: '44444444-4444-4444-8444-444444444441', messages: 3 },
      { conv_id: '44444444-4444-4444-8444-444444444442', messages: 2 },
    ],
  });
});

test('minimal chat lifecycle persists, reloads, searches, and contributes to analytics', async () => {
  const chatPage = await app.inject({ method: 'GET', url: '/chat' });
  assert.equal(chatPage.statusCode, 200);
  assert.match(chatPage.body, /CoMind Chat/);
  assert.match(chatPage.body, /messageForm/);
  assert.match(chatPage.body, /\/messages/);

  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/conversations',
    payload: { title: 'Issue #10 durable chat verification' },
  });
  assert.equal(createResponse.statusCode, 201);
  const conversation = createResponse.json();
  assert.equal(conversation.source, 'live');
  assert.equal(conversation.title, 'Issue #10 durable chat verification');
  assert.equal(conversation.project_id, '33333333-3333-4333-8333-333333333333');

  const userMessage = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversation.conv_id}/messages`,
    payload: {
      role: 'user',
      content: 'CoMind persistence marker: OrchardQuartz',
    },
  });
  assert.equal(userMessage.statusCode, 201);
  assert.equal(userMessage.json().role, 'user');

  const assistantMessage = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversation.conv_id}/messages`,
    payload: {
      role: 'assistant',
      content: 'Deterministic integration response for OrchardQuartz',
    },
  });
  assert.equal(assistantMessage.statusCode, 201);
  assert.equal(assistantMessage.json().role, 'assistant');

  const reloadResponse = await app.inject({
    method: 'GET',
    url: `/api/conversations/${conversation.conv_id}`,
  });
  assert.equal(reloadResponse.statusCode, 200);
  const reloaded = reloadResponse.json();
  assert.equal(reloaded.conversation.conv_id, conversation.conv_id);
  assert.deepEqual(
    reloaded.messages.map((message) => message.role),
    ['user', 'assistant']
  );
  assert.deepEqual(
    reloaded.messages.map((message) => message.content),
    [
      'CoMind persistence marker: OrchardQuartz',
      'Deterministic integration response for OrchardQuartz',
    ]
  );
  assert.ok(reloaded.messages.every((message) => message.conv_id === conversation.conv_id));

  const searchResponse = await app.inject({
    method: 'GET',
    url: '/api/messages/search?q=OrchardQuartz',
  });
  assert.equal(searchResponse.statusCode, 200);
  const searchMatches = searchResponse.json();
  assert.equal(searchMatches.length, 2);
  assert.ok(searchMatches.every((match) => match.conv_id === conversation.conv_id));

  const analyticsResponse = await app.inject({ method: 'GET', url: '/api/analytics/summary' });
  assert.equal(analyticsResponse.statusCode, 200);
  const analytics = analyticsResponse.json();
  assert.equal(analytics.conversations, 4);
  assert.equal(analytics.messages, 11);
  assert.equal(
    analytics.top10.find((row) => row.conv_id === conversation.conv_id)?.messages,
    2
  );
});
