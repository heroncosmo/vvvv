import assert from 'node:assert/strict';
import test from 'node:test';

import { extractStructuredJsonObject, parseAgenteZapLiveCliJson } from '../agenteZapLiveCliJson';

test('live CLI JSON parser accepts a valid object followed by noisy CLI events', () => {
  const parsed = parseAgenteZapLiveCliJson([
    '{"schemaVersion":"agentezap_live_cli_plan_v1","decision":"respond","customerFacingMessages":["ok"],"actions":[]}',
    '{"type":"step-start","timestamp":8410}',
  ].join('\n'));

  assert.deepEqual(parsed, {
    schemaVersion: 'agentezap_live_cli_plan_v1',
    decision: 'respond',
    customerFacingMessages: ['ok'],
    actions: [],
  });
});

test('live CLI JSON parser skips event objects before the final plan', () => {
  const parsed = parseAgenteZapLiveCliJson([
    '{"type":"step-start","sessionID":"ses_123"}',
    '{"schemaVersion":"agentezap_live_cli_plan_v1","decision":"ask_more_context","messages":["me mande o nome"],"actions":[]}',
    '{"type":"step-finish","cost":0.01}',
  ].join('\n'));

  assert.deepEqual(parsed, {
    schemaVersion: 'agentezap_live_cli_plan_v1',
    decision: 'ask_more_context',
    messages: ['me mande o nome'],
    actions: [],
  });
});

test('live CLI JSON parser keeps braces inside strings while extracting first object', () => {
  const parsed = parseAgenteZapLiveCliJson(
    'log before {"decision":"respond","customerFacingMessages":["use {contexto} com cuidado"],"actions":[]} trailing {bad}',
  );

  assert.deepEqual(parsed, {
    decision: 'respond',
    customerFacingMessages: ['use {contexto} com cuidado'],
    actions: [],
  });
});

test('structured JSON extractor prefers assistant_response over MiMo envelope metadata', () => {
  const jsonText = extractStructuredJsonObject([
    '<assistant_response>{"action":"execute_create","companyName":"Passo Certo Calçados","businessSegment":"loja de calçados","serviceDescription":"vende tênis e chinelos"}</assistant_response>',
    '<actions_json>[]</actions_json>',
    '<attention_json>{"requiresAttention":false}</attention_json>',
    '<routing_json>{"suggestedRoute":"direct"}</routing_json>',
  ].join('\n'));

  assert.equal(
    jsonText,
    '{"action":"execute_create","companyName":"Passo Certo Calçados","businessSegment":"loja de calçados","serviceDescription":"vende tênis e chinelos"}',
  );
});

test('structured JSON extractor skips CLI event objects before an auxiliary action decision', () => {
  const jsonText = extractStructuredJsonObject([
    '{"type":"step-start","sessionID":"ses_123"}',
    '{"action":"confirm"}',
    '{"type":"step-finish","cost":0.01}',
  ].join('\n'));

  assert.equal(jsonText, '{"action":"confirm"}');
});
