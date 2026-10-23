import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const prototypePath = fileURLToPath(new URL('../../prototypes/CoMind_Conversation_Notebook.html', import.meta.url));
const fixturePath = fileURLToPath(new URL('../../db/test/conversation_notebook_fixture.sql', import.meta.url));
const html = await readFile(prototypePath, 'utf8');
const fixture = (await readFile(fixturePath, 'utf8')).trim();

test('Notebook prototype keeps its review loop local and embeds the exact Test-only fixture', () => {
  const sqlMatch = html.match(/<script type="text\/plain" id="sqlSource">\n([\s\S]*?)\n<\/script>/);
  assert.ok(sqlMatch, 'prototype exposes its Test-only SQL fixture');
  assert.equal(sqlMatch[1], fixture);
  assert.doesNotMatch(fixture, /memory_entries|auth\.users/i);
  assert.match(fixture, /REFERENCES comind\.cm_memory_node\(memory_id\)/);
  assert.match(html, /Canonical CoMind promotion is not called here/);
  assert.match(html, /code points \$\{f\.evidenceStart\}/);
  assert.match(html, /id="sourcesView"/);
  assert.match(html, /id="sourceSort"/);
  assert.match(html, /value="title-asc"/);
  assert.match(html, /value="longest"/);
  assert.match(html, /comind-notebook-source-sort/);
  assert.match(html, /function openSource\(id\)/);
  assert.match(html, /function renderSources\(\)/);
  assert.match(html, /data-open-source/);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0][1]));
});
