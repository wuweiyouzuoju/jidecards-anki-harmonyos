// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import * as codec from '../../entry/src/main/ets/proto/messages/CardRenderingMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { 服务号, 卡片渲染方法 } from '../../entry/src/main/ets/backend/服务索引.ts';
import { 构建卡片HTML, 原始侧HTML, 提取拼写标记, 媒体基地址 } from '../../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { renderStudyAnswer } from '../../entry/src/main/ets/model/StudyAnswerRenderer.ts';
import { CARD_RENDERING_SUPPORT, ttsSpeakOptions } from '../../entry/src/main/ets/model/CardRenderingSupport.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { answerCases, clozeCases, coreTyping } from './core-rendering-harness.mjs';

const requestFields = bytes => {
  const reader = new 协议读取器(bytes), result = {};
  let tag;
  while ((tag = reader.读取标签()) !== null) result[tag.字段号] = tag.线类型 === 2 ? reader.读取字符串() : reader.读取变长整数();
  return result;
};
function service(rpc) {
  const Service = loadPlatformModule('backend/卡片渲染服务.ts', '卡片渲染服务', {
    ...codec, 原始侧HTML, 服务号, 卡片渲染方法, 后端会话: { 获取实例: () => ({调用: rpc}) }
  });
  return new Service();
}

test('typing service sends complete fields to the locked Core method IDs', async () => {
  const calls = [];
  const renderer = service(async (service, method, bytes) => {
    assert.equal(service, 27);
    const fields = requestFields(bytes);
    calls.push(method);
    const text = method === 15 ? await coreTyping.compareAnswer(fields[1] ?? '', fields[2] ?? '', fields[3] === 1) :
      await coreTyping.extractClozeForTyping(fields[1] ?? '', fields[2] ?? 0);
    return codec.encodeRenderingString(text);
  });
  for (const row of answerCases) assert.equal(await renderer.compareAnswer(row.expected, row.provided, row.combining), row.html);
  for (const row of clozeCases) assert.equal(await renderer.extractClozeForTyping(row.text, row.ordinal), row.expected);
  assert.deepEqual(calls, [...answerCases.map(() => 15), ...clozeCases.map(() => 16)]);
});

test('existing and draft cards encode assembled media paths without changing typing or audio nodes', async () => {
  const rendered = new 协议写入器();
  for (const [field, text] of [[1, '<img src="'], [1, '图#1.png">[[type:Front]][sound:a#1.mp3]'], [2, '<img src="图#1.png">']]) {
    const node = new 协议写入器(); node.写入字符串(1, text); rendered.写入子消息(field, node);
  }
  for (const draft of [false, true]) {
    const calls = [];
    const renderer = service(async (service, method, bytes) => {
      assert.equal(service, 27); calls.push(method);
      if (method === (draft ? 8 : 6)) return rendered.转为字节();
      assert.equal(method, 11);
      const html = requestFields(bytes)[1];
      assert.match(html, /<img src="图#1.png">/, 'Core receives the complete attribute across nodes');
      return codec.encodeRenderingString(html.replace('<img src="图#1.png">', '<img src="图%231.png">'));
    });
    const card = draft ? await renderer.renderUncommittedCard({id: 0, guid: '', notetypeId: 1, mtimeSecs: 0, usn: 0, fields: [], tags: []}, 0, '{}', '') :
      await renderer.渲染既有卡片(1);
    assert.deepEqual(calls, [draft ? 8 : 6, 11, 11]);
    assert.match(原始侧HTML(card, 'question'), /src="图#1.png".*\[sound:a#1.mp3\]/);
    assert.equal(提取拼写标记(card.questionNodes).fieldName, 'Front');
    for (const side of ['question', 'answer']) {
      const html = 构建卡片HTML(card, side), src = html.match(/<img src="([^"]+)"/)[1];
      assert.equal(decodeURIComponent(new URL(src, 媒体基地址).pathname.slice(1)), '图#1.png');
    }
  }
});

test('Core rendering failures propagate; typing failure keeps the ordinary answer and never emits a local verdict', async () => {
  const renderer = service(async () => { throw Error('Core unavailable'); });
  await assert.rejects(renderer.compareAnswer('x', 'x', true), /Core unavailable/);
  const backend = { ...coreTyping, note: async () => ({notetypeId: 2, fields: ['&aacute;']}),
    notetype: async () => ({fieldNames: ['Front']}), compareAnswer: () => renderer.compareAnswer('', '', true) };
  const request = {noteId: 1, fieldName: 'Front', cloze: false, ordinal: 0, input: 'á', combining: true};
  assert.equal(await renderStudyAnswer('<b>answer</b>[[type:Front]]', request, backend), '<b>answer</b>');
  backend.compareAnswer = coreTyping.compareAnswer;
  assert.equal(await renderStudyAnswer('[[type:Front]]', request, backend), '<code id=typeans><span class=typeGood>á</span></code>');
  assert.equal(await renderStudyAnswer('answer', request, backend), 'answer<hr><code id=typeans><span class=typeGood>á</span></code>');
});

test('Core TTS decoding preserves all template parameters and protobuf defaults', () => {
  const writer = new 协议写入器(), av = new 协议写入器(), tts = new 协议写入器();
  tts.写入字符串(1, '你好'); tts.写入字符串(2, 'zh_CN');
  tts.写入字符串(3, 'Missing'); tts.写入字符串(3, 'HarmonyOS_21'); tts.写入浮点(4, 1.5);
  for (const arg of ['volume=0.8', 'pitch=1.2', 'platformOnly=value']) tts.写入字符串(5, arg);
  av.写入子消息(2, tts); writer.写入子消息(2, av);
  const item = codec.decodeExtractAvTagsResponse(writer.转为字节()).ttsItems[0];
  assert.deepEqual(item, {text:'你好', language:'zh_CN', voices:['Missing','HarmonyOS_21'], speed:1.5,
    otherArgs:['volume=0.8','pitch=1.2','platformOnly=value']});
  assert.deepEqual(ttsSpeakOptions(item), {extraParams:{speed:1.5,volume:0.8,pitch:1.2},
    unsupported:['platformOnly=value'],speedAdjusted:false});
  const empty = new 协议写入器(), tag = new 协议写入器(); tag.写入字节(2, new Uint8Array()); empty.写入子消息(2, tag);
  assert.deepEqual(codec.decodeExtractAvTagsResponse(empty.转为字节()).ttsItems[0],
    {text:'',language:'',voices:[],speed:1,otherArgs:[]});
  assert.deepEqual(ttsSpeakOptions({...item,speed:8,otherArgs:['volume=', 'pitch=NaN','volume=3']}),
    {extraParams:{speed:CARD_RENDERING_SUPPORT.tts.maximumSpeed},unsupported:['volume=','pitch=NaN','volume=3'],speedAdjusted:true});
});
