import assert from 'node:assert/strict';
import test from 'node:test';

const {
  classifySequence,
  compareAcquisitionStreams,
  normalizeAcquisitionEnvelope,
  sha256Hex,
} = await import('../dist/conversation-acquisition.js');

function openAI(eventRef, sequence, type, extra = {}) {
  return {
    sourceFamily: 'openai_api',
    sourceStreamRef: 'resp_synthetic_1',
    sourceEventFamily: type,
    sourceEventRef: eventRef,
    sourceSequenceNumber: sequence,
    sourceEndpointFamily: 'responses',
    payload: { type, sequence_number: sequence, ...extra },
  };
}

function browser(eventRef, sequence, family, payload = {}) {
  return {
    sourceFamily: 'chatgpt_browser_observed',
    sourceStreamRef: 'browser_synthetic_1',
    sourceEventFamily: family,
    sourceEventRef: eventRef,
    sourceSequenceNumber: sequence,
    sourceEndpointFamily: 'synthetic-browser-adapter',
    payload,
  };
}

test('stable raw-envelope digest ignores object-key ordering', () => {
  const left = { b: 2, a: { z: 3, y: 4 } };
  const right = { a: { y: 4, z: 3 }, b: 2 };
  assert.equal(sha256Hex(left), sha256Hex(right));
});

test('supported API and browser-observed assistant events normalize to the same semantic classes', () => {
  const apiDelta = normalizeAcquisitionEnvelope(
    openAI('api-1', 1, 'response.output_text.delta', { delta: 'Durable ' })
  );
  const browserDelta = normalizeAcquisitionEnvelope(
    browser('browser-1', 1, 'assistant_delta', { delta: 'Durable ' })
  );
  const apiDone = normalizeAcquisitionEnvelope(
    openAI('api-2', 2, 'response.output_text.done', { text: 'Durable answer' })
  );
  const browserDone = normalizeAcquisitionEnvelope(
    browser('browser-2', 2, 'assistant_completed', { text: 'Durable answer' })
  );

  assert.equal(apiDelta.status, 'normalized');
  assert.equal(browserDelta.status, 'normalized');
  assert.equal(apiDelta.normalizationClass, 'assistant_text_delta');
  assert.equal(browserDelta.normalizationClass, 'assistant_text_delta');
  assert.equal(apiDone.normalizationClass, 'assistant_text_completed');
  assert.equal(browserDone.normalizationClass, 'assistant_text_completed');
  assert.equal(compareAcquisitionStreams([apiDelta, apiDone], [browserDelta, browserDone]), 'exact');
});

test('exposed reasoning summaries normalize while raw reasoning-text events do not', () => {
  const summary = normalizeAcquisitionEnvelope(
    openAI('api-summary', 4, 'response.reasoning_summary_text.delta', {
      delta: 'Checking the relevant evidence.',
      item_id: 'rs_1',
      summary_index: 0,
      output_index: 0,
    })
  );
  const rawReasoning = normalizeAcquisitionEnvelope(
    openAI('api-reasoning', 5, 'response.reasoning_text.delta', {
      delta: 'not normalized as CoMind reasoning evidence',
      item_id: 'rs_1',
      content_index: 0,
      output_index: 0,
    })
  );

  assert.equal(summary.status, 'normalized');
  assert.equal(summary.normalizationClass, 'reasoning_summary_delta');
  assert.equal(summary.content, 'Checking the relevant evidence.');
  assert.equal(rawReasoning.status, 'unknown');
  assert.equal(rawReasoning.normalizationClass, undefined);
  assert.match(rawReasoning.driftReason, /not normalized/);
});

test('missing or retyped fields are schema drift and retain a deterministic raw digest', () => {
  const drifted = normalizeAcquisitionEnvelope(
    openAI('api-drift', 6, 'response.output_text.delta', { delta: { text: 'wrong type' } })
  );
  assert.equal(drifted.status, 'schema_drift');
  assert.equal(drifted.normalizationClass, undefined);
  assert.match(drifted.driftReason, /missing string field delta/);
  assert.match(drifted.rawEnvelopeSha256, /^[a-f0-9]{64}$/);
});

test('unknown browser event families remain explicit rather than guessed', () => {
  const unknown = normalizeAcquisitionEnvelope(
    browser('browser-unknown', 7, 'future_private_event_shape', { arbitrary: true })
  );
  assert.equal(unknown.status, 'unknown');
  assert.match(unknown.driftReason, /Unrecognized browser-observed event family/);
  assert.match(unknown.rawEnvelopeSha256, /^[a-f0-9]{64}$/);
});

test('sequence classification distinguishes duplicate, out-of-order, gap, and indeterminate observations', () => {
  assert.equal(classifySequence(10, 11), 'in_order');
  assert.equal(classifySequence(10, 10), 'duplicate');
  assert.equal(classifySequence(10, 9), 'out_of_order');
  assert.equal(classifySequence(10, 13), 'gap');
  assert.equal(classifySequence(undefined, 1), 'indeterminate');
});

test('a source with additional non-conflicting reasoning evidence is a compatible extension', () => {
  const api = [
    normalizeAcquisitionEnvelope(openAI('api-a', 1, 'response.output_text.done', { text: 'Answer' })),
    normalizeAcquisitionEnvelope(openAI('api-b', 2, 'response.completed')),
  ];
  const browserObserved = [
    normalizeAcquisitionEnvelope(browser('browser-a', 1, 'reasoning_summary_completed', { text: 'Evidence summary' })),
    normalizeAcquisitionEnvelope(browser('browser-b', 2, 'assistant_completed', { text: 'Answer' })),
    normalizeAcquisitionEnvelope(browser('browser-c', 3, 'response_completed')),
  ];

  assert.equal(compareAcquisitionStreams(api, browserObserved), 'compatible_extension');
});

test('one source ending later with a matching prefix is a compatible extension', () => {
  const partial = [
    normalizeAcquisitionEnvelope(browser('browser-p', 1, 'assistant_delta', { delta: 'Part' })),
  ];
  const completed = [
    normalizeAcquisitionEnvelope(openAI('api-c', 1, 'response.output_text.done', { text: 'Partial completion' })),
  ];
  assert.equal(compareAcquisitionStreams(partial, completed), 'compatible_extension');
});

test('materially divergent overlapping assistant content is a conflict', () => {
  const left = [
    normalizeAcquisitionEnvelope(openAI('api-left', 1, 'response.output_text.done', { text: 'Alpha' })),
  ];
  const right = [
    normalizeAcquisitionEnvelope(browser('browser-right', 1, 'assistant_completed', { text: 'Beta' })),
  ];
  assert.equal(compareAcquisitionStreams(left, right), 'conflict');
});

test('insufficient shared semantic evidence is ambiguous and an explicitly different turn is unmatched', () => {
  const assistant = [
    normalizeAcquisitionEnvelope(openAI('api-assistant', 1, 'response.output_text.done', { text: 'Answer' })),
  ];
  const toolOnly = [
    normalizeAcquisitionEnvelope(browser('browser-tool', 1, 'tool_call_started', { tool: 'search', call_id: 'call_1' })),
  ];

  assert.equal(compareAcquisitionStreams(assistant, toolOnly), 'ambiguous');
  assert.equal(compareAcquisitionStreams(assistant, toolOnly, false), 'unmatched');
});
