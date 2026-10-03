// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentToolFailureTracker,
  buildAgentToolFailureFingerprint,
  createStartedAgentToolTrace,
  sanitizeAgentToolJson,
} from '../../entry/src/main/ets/model/agent/AgentToolDiagnostics.ts';

const diagnostic = {
  code: 'unexpected_property',
  path: 'cards[0].extra',
  message: 'extra is not allowed inside cards[]',
  receivedKeys: ['fields', 'extra'],
  allowedKeys: ['fields', 'images'],
  validTemplateJson: '{"cards":[{"fields":["<field>"]}]}',
};

test('tool failure fingerprints ignore JSON object key order but retain meaningful differences', () => {
  const first = buildAgentToolFailureFingerprint(
    'create_flashcards', '{"cards":[{"fields":["x"],"extra":"r"}]}', diagnostic,
  );
  const reordered = buildAgentToolFailureFingerprint(
    'create_flashcards', '{"cards":[{"extra":"r","fields":["x"]}]}', diagnostic,
  );
  assert.equal(first, reordered);
  assert.notEqual(first, buildAgentToolFailureFingerprint(
    'create_flashcards', '{"cards":[{"fields":["y"],"extra":"r"}]}', diagnostic,
  ));
  assert.notEqual(first, buildAgentToolFailureFingerprint(
    'propose_update_notes', '{"cards":[{"fields":["x"],"extra":"r"}]}', diagnostic,
  ));
  assert.notEqual(first, buildAgentToolFailureFingerprint(
    'create_flashcards', '{"cards":[{"fields":["x"],"extra":"r"}]}',
    { ...diagnostic, path: 'cards[1].extra' },
  ));
});

test('identical failures escalate on the second attempt and abort on the third', () => {
  const tracker = new AgentToolFailureTracker();
  const first = tracker.record('create_flashcards', '{"a":1,"b":2}', diagnostic);
  const second = tracker.record('create_flashcards', '{"b":2,"a":1}', diagnostic);
  const third = tracker.record('create_flashcards', '{"a":1,"b":2}', diagnostic);
  assert.deepEqual(first, { count: 1, requireCorrection: false, shouldAbort: false });
  assert.deepEqual(second, { count: 2, requireCorrection: true, shouldAbort: false });
  assert.deepEqual(third, { count: 3, requireCorrection: true, shouldAbort: true });
  assert.deepEqual(
    tracker.record('create_flashcards', '{"a":2,"b":2}', diagnostic),
    { count: 1, requireCorrection: false, shouldAbort: false },
  );
});

test('syntax corrections past the visible diagnostic limit are not mistaken for identical failures', () => {
  const prefix = '{"cards":[{"fields":["' + 'a'.repeat(10000);
  const tracker = new AgentToolFailureTracker();
  const syntax = { ...diagnostic, code: 'invalid_json', path: '$' };
  tracker.record('create_flashcards', prefix + 'x', syntax);
  assert.equal(tracker.record('create_flashcards', prefix + 'y', syntax).count, 1);
});

test('tool JSON sanitizer redacts nested secrets and media before truncating', () => {
  const safe = sanitizeAgentToolJson(JSON.stringify({
    apiKey: 'sk-top-secret',
    nested: {
      authorization: 'Bearer hidden-value',
      token: 'token-value',
      harmless: 'visible',
      media: 'data:image/png;base64,AAAA',
    },
  }), 4096);
  assert.equal(safe.truncated, false);
  assert.doesNotMatch(safe.text, /top-secret|hidden-value|token-value|base64,AAAA/);
  assert.match(safe.text, /\[REDACTED\]/);
  assert.match(safe.text, /\[MEDIA OMITTED\]/);
  assert.match(safe.text, /visible/);

  const clipped = sanitizeAgentToolJson(JSON.stringify({ value: 'x'.repeat(500) }), 120);
  assert.equal(clipped.truncated, true);
  assert.match(clipped.text, /truncated=true/);
  assert.ok(clipped.text.length <= 120);
});

test('malformed model JSON remains safely visible instead of crashing diagnostics', () => {
  const safe = sanitizeAgentToolJson('{"token":"secret", bad data:image/png;base64,AAAA', 4096);
  assert.doesNotMatch(safe.text, /secret|base64,AAAA/);
  assert.match(safe.text, /\[REDACTED\]|token/);
  assert.match(safe.text, /\[MEDIA OMITTED\]/);
});

test('a new tool trace has a fixed layout and is collapsed by default', () => {
  const trace = createStartedAgentToolTrace({
    id: 'call-1', name: 'list_decks', argumentsJson: '{"query":"中国","limit":20}',
  }, 2, 3);
  assert.deepEqual(trace, {
    callId: 'call-1',
    toolName: 'list_decks',
    status: 'started',
    providerRound: 2,
    sequence: 3,
    argumentsJson: '{"query":"中国","limit":20}',
    outputJson: '',
    errorCode: '',
    errorPath: '',
    errorMessage: '',
    receivedKeys: [],
    allowedKeys: [],
    validTemplateJson: '',
    repeatCount: 0,
    argumentsTruncated: false,
    outputTruncated: false,
    diagnosticTruncated: false,
    expanded: false,
    legacySummary: '',
  });
});
