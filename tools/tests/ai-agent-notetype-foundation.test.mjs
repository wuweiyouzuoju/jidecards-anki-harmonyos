// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import test from 'node:test';

import {
  decodeClozeFieldOrds,
  decodeNotetype,
  previewNotetypeTemplates,
  NOTE_TYPE_KIND_CLOZE,
  NOTE_TYPE_KIND_NORMAL,
} from '../../entry/src/main/ets/proto/messages/NotetypeMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 笔记类型方法, 服务号 } from '../../entry/src/main/ets/backend/服务索引.ts';

const libStub = 'export const openBackend = () => 0; export const closeBackend = () => {}; export const runMethodRaw = () => Promise.resolve(new Uint8Array(0));';
const libStubUrl = 'data:text/javascript;base64,' + Buffer.from(libStub).toString('base64');
const networkStub = 'export const http = {};';
const networkStubUrl = 'data:text/javascript;base64,' + Buffer.from(networkStub).toString('base64');
const hookCode = `export function resolve(s, c, n) {
  if (s === 'libjidecards.so') return { url: ${JSON.stringify(libStubUrl)}, shortCircuit: true };
  if (s === '@kit.NetworkKit') return { url: ${JSON.stringify(networkStubUrl)}, shortCircuit: true };
  return n(s, c);
}`;
register('data:text/javascript;base64,' + Buffer.from(hookCode).toString('base64'), import.meta.url);

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function buildNotetype(name, kind, templates = []) {
  const message = new 协议写入器();
  message.写入64位整数(1, 42);
  message.写入字符串(2, name);
  if (kind !== null) {
    const config = new 协议写入器();
    config.写入变长整数(1, kind);
    message.写入子消息(7, config);
  }
  for (const item of templates) {
    const template = new 协议写入器();
    const ord = new 协议写入器();
    ord.写入变长整数(1, item.ord);
    template.写入子消息(1, ord);
    template.写入字符串(2, item.name);
    const config = new 协议写入器();
    config.写入字符串(1, item.questionFormat);
    config.写入字符串(2, item.answerFormat);
    config.写入字符串(3, 'browser-only');
    template.写入子消息(5, config);
    message.写入子消息(9, template);
  }
  return message.转为字节();
}

const typedTemplate = {ord: 0, name: '输入', questionFormat: '{{题干}} {{type:答案}}',
  answerFormat: '{{FrontSide}}<hr>{{type:答案}}'};
const richTemplate = {ord: 1, name: '阅读', questionFormat: '{{题干}}', answerFormat: '{{答案}}'};

test('capabilities expose actual mixed template source even when the type is renamed', () => {
  const view = decodeNotetype(buildNotetype('普通问答这个名字不能代表行为', 0, [richTemplate, typedTemplate]));
  assert.deepEqual(view.templates, [typedTemplate, richTemplate]);
  assert.deepEqual(previewNotetypeTemplates(view.templates), [typedTemplate, richTemplate].map(t => ({...t, truncated: false})));
});

test('template previews bound source size, signal truncation and do not modify decoded templates', () => {
  const templates = Array.from({length: 7}, (_, ord) => ({...richTemplate, ord,
    questionFormat: 'Q'.repeat(501), answerFormat: 'A'.repeat(500)}));
  const previews = previewNotetypeTemplates(templates);
  assert.equal(previews.length, 4);
  assert.ok(previews.every(t => t.questionFormat.length === 500 && t.answerFormat.length === 500 && t.truncated));
  assert.equal(templates[0].questionFormat.length, 501);
  assert.deepEqual(previewNotetypeTemplates([]), []);
});

test('decodes cloze kind from config regardless of imported note-type name', () => {
  const view = decodeNotetype(buildNotetype('机器学习·挖空', NOTE_TYPE_KIND_CLOZE));
  assert.equal(view.name, '机器学习·挖空');
  assert.equal(view.kind, NOTE_TYPE_KIND_CLOZE);
});

test('defaults an absent note-type kind to normal', () => {
  const view = decodeNotetype(buildNotetype('Imported custom type', null));
  assert.equal(view.kind, NOTE_TYPE_KIND_NORMAL);
});

test('decodes packed and unpacked cloze field ords as sorted unique values', () => {
  const response = new 协议写入器();
  response.写入打包64位整数(1, [3, 1, 3]);
  response.写入变长整数(1, 2);
  assert.deepEqual(decodeClozeFieldOrds(response.转为字节()), [1, 2, 3]);
});

test('note-type capability service reads cloze ords only for cloze types', async () => {
  assert.equal(笔记类型方法.获取填空字段序号, 18);
  const { 后端会话 } = await import('../../entry/src/main/ets/backend/后端会话.ts');
  const calls = [];
  let requestedKind = NOTE_TYPE_KIND_NORMAL;
  后端会话.获取实例 = () => ({
    调用: async (serviceId, methodId, inputBytes) => {
      calls.push({ serviceId, methodId, inputBytes });
      if (methodId === 笔记类型方法.获取笔记类型) {
        return buildNotetype('Imported capability type', requestedKind, [typedTemplate]);
      }
      const response = new 协议写入器();
      response.写入打包64位整数(1, [2, 0]);
      return response.转为字节();
    },
  });
  const { 笔记类型服务 } = await import('../../entry/src/main/ets/backend/笔记类型服务.ts');

  const normal = await new 笔记类型服务().获取笔记类型能力(42);
  assert.equal(normal.kind, NOTE_TYPE_KIND_NORMAL);
  assert.deepEqual(normal.clozeFieldOrds, []);
  assert.equal(normal.templateCount, 1);
  assert.deepEqual(normal.templatePreviews, [{...typedTemplate, truncated: false}]);
  assert.deepEqual(calls.map((call) => call.methodId), [笔记类型方法.获取笔记类型]);

  calls.length = 0;
  requestedKind = NOTE_TYPE_KIND_CLOZE;
  const cloze = await new 笔记类型服务().获取笔记类型能力(42);
  assert.equal(cloze.kind, NOTE_TYPE_KIND_CLOZE);
  assert.deepEqual(cloze.clozeFieldOrds, [0, 2]);
  assert.deepEqual(calls.map((call) => call.methodId), [
    笔记类型方法.获取笔记类型,
    笔记类型方法.获取填空字段序号,
  ]);
  assert.ok(calls.every((call) => call.serviceId === 服务号.后端笔记类型));
});

test('agent instructions inspect real templates and support autonomous target switching without bypassing creation confirmation', async () => {
  const { buildAgentSessionInstructions } = await import('../../entry/src/main/ets/model/agent/AgentSessionContext.ts');
  const { buildAgentTaskProviderText } = await import('../../entry/src/main/ets/model/agent/AgentTaskContext.ts');
  const setup = {mode: 'create', deckId: 1, deckName: '知识', notetypeId: 42, notetypeName: '改过名字',
    fieldNames: ['题干', '答案'], noteTypeKind: 0, clozeFieldOrds: [], expanded: true,
    templateCount: 1, templatePreviews: [{...typedTemplate, truncated: false}]};
  const instructions = buildAgentSessionInstructions(setup, 20);
  assert.match(instructions, /kind=normal 不能区分/);
  assert.match(instructions, /list_notetypes.*get_note_type_capabilities.*configure_create_target/);
  assert.match(instructions, /确认执行成功得到真实 ID 后再继续生成/);
  assert.match(instructions, /不转换已有笔记/);
  assert.doesNotMatch(instructions, /\{\{type:答案\}\}/);
  const payload = buildAgentTaskProviderText({...setup, userText: '做知识卡', localContext: '', omittedMedia: false, batchLimit: 20});
  const configuration = JSON.parse(payload.split('\n')[0].slice('任务配置：'.length));
  assert.deepEqual(configuration.templatePreviews, setup.templatePreviews);
  assert.equal(configuration.templateCount, 1);
  assert.match(buildAgentSessionInstructions({...setup, templateCount: undefined, templatePreviews: undefined}, 20), /当前模板数量=unknown/);
});

test('AI card page loads structural capabilities instead of guessing cloze from names', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.doesNotMatch(page, /填空笔记类型名集合/);
  assert.doesNotMatch(page, /是否填空笔记类型\s*\(/);
  assert.match(page, /获取笔记类型能力\s*\(/);
  assert.match(page, /clozeFieldOrds/);
});

test('AI prompt restricts cloze markup to backend-declared field ords', async () => {
  const { 构建系统提示 } = await import('../../entry/src/main/ets/backend/AI制卡服务.ets');
  const { AGENT_IDENTITY_INSTRUCTIONS } = await import('../../entry/src/main/ets/model/agent/AgentSessionContext.ts');
  const prompt = 构建系统提示({
    apiKey: 'secret',
    baseUrl: 'https://example.com',
    model: 'example-model',
    笔记类型名: '机器学习·挖空',
    字段名列表: ['Question', 'Text', 'Source'],
    noteTypeKind: NOTE_TYPE_KIND_CLOZE,
    clozeFieldOrds: [1],
    用户输入: 'make cards',
  });
  assert.match(prompt, /第 2 个字段（Text）/);
  assert.ok(prompt.startsWith(AGENT_IDENTITY_INSTRUCTIONS));
  assert.doesNotMatch(prompt, /你是 Anki 闪卡制卡助手/);
  assert.match(prompt, /只返回 JSON/);
  assert.match(prompt, /只允许/);
  assert.doesNotMatch(prompt, /第一个字段（题干）/);
});

test('AI prompt rejects a cloze type with no backend-declared cloze fields', async () => {
  const { AI制卡错误, 构建系统提示 } = await import('../../entry/src/main/ets/backend/AI制卡服务.ets');
  assert.throws(() => 构建系统提示({
    apiKey: 'secret',
    baseUrl: 'https://example.com',
    model: 'example-model',
    笔记类型名: 'Broken cloze',
    字段名列表: ['Text'],
    noteTypeKind: NOTE_TYPE_KIND_CLOZE,
    clozeFieldOrds: [],
    用户输入: 'make cards',
  }), (error) => error instanceof AI制卡错误 && error.kind === 'unsupported_notetype');
});
