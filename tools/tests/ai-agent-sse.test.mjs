// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';

import { IncrementalSseParser } from '../../entry/src/main/ets/model/agent/SseParser.ts';
import { ResponsesEventNormalizer } from '../../entry/src/main/ets/model/agent/ResponsesEventNormalizer.ts';

const encoder = new TextEncoder();

test('SSE parser preserves a UTF-8 character split across byte chunks', () => {
  const parser = new IncrementalSseParser();
  const bytes = encoder.encode('data: {"text":"填空"}\n\n');
  const splitAt = bytes.indexOf(0xE5) + 1;

  assert.deepEqual(parser.push(bytes.slice(0, splitAt)), []);
  assert.deepEqual(parser.push(bytes.slice(splitAt)), [{
    event: '',
    data: '{"text":"填空"}',
    id: '',
    done: false,
  }]);
});

test('SSE parser emits multiple events from one chunk and joins data lines', () => {
  const parser = new IncrementalSseParser();
  const events = parser.push(encoder.encode(
    'event: response.output_text.delta\r\n' +
    'id: 7\r\n' +
    'data: first\r\n' +
    'data: second\r\n\r\n' +
    'data: next\n\n',
  ));

  assert.deepEqual(events, [{
    event: 'response.output_text.delta',
    data: 'first\nsecond',
    id: '7',
    done: false,
  }, {
    event: '',
    data: 'next',
    id: '',
    done: false,
  }]);
});

test('SSE parser ignores comments and empty events', () => {
  const parser = new IncrementalSseParser();
  const events = parser.push(encoder.encode(': keep-alive\n\nretry: 1000\n\ndata: ok\n\n'));

  assert.deepEqual(events, [{ event: '', data: 'ok', id: '', done: false }]);
});

test('SSE parser recognizes DONE without exposing it as model text', () => {
  const parser = new IncrementalSseParser();
  assert.deepEqual(parser.push(encoder.encode('data: [DONE]\n\n')), [{
    event: '',
    data: '',
    id: '',
    done: true,
  }]);
});

test('malformed UTF-8 is isolated to its event and later events still parse', () => {
  const parser = new IncrementalSseParser();
  const prefix = encoder.encode('data: ');
  const suffix = encoder.encode('\n\ndata: healthy\n\n');
  const bytes = new Uint8Array(prefix.length + 1 + suffix.length);
  bytes.set(prefix, 0);
  bytes[prefix.length] = 0xFF;
  bytes.set(suffix, prefix.length + 1);

  const events = parser.push(bytes);
  assert.equal(events.length, 2);
  assert.equal(events[0].data, '\uFFFD');
  assert.equal(events[1].data, 'healthy');
});

test('finish flushes one final event without a trailing blank line', () => {
  const parser = new IncrementalSseParser();
  assert.deepEqual(parser.push(encoder.encode('event: final\ndata: value')), []);
  assert.deepEqual(parser.finish(), [{
    event: 'final',
    data: 'value',
    id: '',
    done: false,
  }]);
  assert.deepEqual(parser.finish(), []);
});

function message(data) {
  return { event: '', data: JSON.stringify(data), id: '', done: false };
}

test('Responses normalizer accumulates function-call arguments before emitting one tool call', () => {
  const normalizer = new ResponsesEventNormalizer();
  assert.deepEqual(normalizer.accept(message({
    type: 'response.output_item.added',
    item: { type: 'function_call', id: 'fc_item', call_id: 'call_7', name: 'search_cards' },
  })), []);
  assert.deepEqual(normalizer.accept(message({
    type: 'response.function_call_arguments.delta',
    item_id: 'fc_item',
    delta: '{"query":',
  })), []);
  assert.deepEqual(normalizer.accept(message({
    type: 'response.function_call_arguments.delta',
    item_id: 'fc_item',
    delta: '"ATP"}',
  })), []);

  const events = normalizer.accept(message({
    type: 'response.function_call_arguments.done',
    item_id: 'fc_item',
    name: 'search_cards',
    arguments: '{"query":"ATP"}',
  }));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].toolCall, {
    id: 'call_7',
    name: 'search_cards',
    argumentsJson: '{"query":"ATP"}',
  });
  assert.deepEqual(normalizer.accept(message({
    type: 'response.output_item.done',
    item: {
      type: 'function_call', id: 'fc_item', call_id: 'call_7',
      name: 'search_cards', arguments: '{"query":"ATP"}',
    },
  })), []);
  assert.deepEqual(normalizer.accept(message({
    type: 'response.function_call_arguments.done', item_id: 'fc_item',
    name: 'search_cards', arguments: '{"query":"ATP"}',
  })), [], 'duplicate completion must not turn a successfully emitted call into a protocol error');
});

test('Responses normalizer exposes only real text, reasoning, search, citation and completion events', () => {
  const normalizer = new ResponsesEventNormalizer();
  const rawEvents = [
    { type: 'response.reasoning_text.delta', delta: '检查字段' },
    { type: 'response.reasoning_summary_text.delta', delta: '正在检查字段' },
    { type: 'response.web_search_call.searching', item_id: 'ws_1' },
    { type: 'response.output_text.delta', delta: '结果' },
    {
      type: 'response.output_text.annotation.added',
      annotation: { type: 'url_citation', url: 'https://example.com/a', title: 'A' },
    },
    { type: 'response.completed' },
  ];
  const events = rawEvents.flatMap((raw) => normalizer.accept(message(raw)));
  assert.deepEqual(events.map((event) => event.kind), [
    'reasoning_delta', 'reasoning_summary', 'status',
    'text_delta', 'search_source', 'completed',
  ]);
  assert.equal(events[0].text, '检查字段');
  assert.equal(events[1].text, '正在检查字段');
  assert.equal(events[2].text, 'web_search_searching');
  assert.deepEqual(events[4].source, { url: 'https://example.com/a', title: 'A' });
});

test('Responses normalizer extracts HTTPS sources returned on a web-search output item', () => {
  const normalizer = new ResponsesEventNormalizer();
  const events = normalizer.accept(message({
    type: 'response.output_item.done',
    item: {
      type: 'web_search_call',
      id: 'ws_1',
      action: {
        sources: [
          { type: 'url', url: 'https://example.com/source', title: 'Primary source' },
          { type: 'url', url: 'http://unsafe.example/source', title: 'Unsafe source' },
        ],
      },
    },
  }));
  assert.deepEqual(events.filter((event) => event.kind === 'search_source').map((event) => event.source), [{
    url: 'https://example.com/source',
    title: 'Primary source',
  }]);
  const continuation = events.find((event) => event.kind === 'continuation_item');
  assert.equal(JSON.parse(continuation.text).type, 'web_search_call');
});

test('Responses normalizer preserves a completed reasoning item for stateless continuation', () => {
  const normalizer = new ResponsesEventNormalizer();
  const item = {
    type: 'reasoning',
    id: 'rs_1',
    content: [{ type: 'reasoning_text', text: '先检查笔记类型' }],
  };
  const events = normalizer.accept(message({
    type: 'response.output_item.done',
    item,
  }));
  const continuation = events.find((event) => event.kind === 'continuation_item');
  assert.deepEqual(JSON.parse(continuation.text), item);
});

test('Responses normalizer makes max-token truncation recoverable but keeps content filtering fatal', () => {
  const recoverable = new ResponsesEventNormalizer().accept(message({
    type: 'response.incomplete',
    response: { incomplete_details: { reason: 'max_output_tokens' } },
  }));
  assert.equal(recoverable.length, 1);
  assert.equal(recoverable[0].kind, 'status');
  assert.equal(recoverable[0].text, 'provider_response_incomplete_max_output_tokens');

  const filtered = new ResponsesEventNormalizer().accept(message({
    type: 'response.incomplete',
    response: { incomplete_details: { reason: 'content_filter' } },
  }));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].kind, 'error');
  assert.equal(filtered[0].errorCode, 'provider_response_incomplete_content_filter');
});

test('malformed Responses JSON reports one event and does not poison the next event', () => {
  const normalizer = new ResponsesEventNormalizer();
  const malformed = normalizer.accept({ event: '', data: '{bad', id: '', done: false });
  assert.equal(malformed.length, 1);
  assert.equal(malformed[0].kind, 'error');
  assert.equal(malformed[0].errorCode, 'provider_event_malformed');

  const healthy = normalizer.accept(message({ type: 'response.output_text.delta', delta: 'ok' }));
  assert.equal(healthy.length, 1);
  assert.equal(healthy[0].kind, 'text_delta');
  assert.equal(healthy[0].text, 'ok');
});
