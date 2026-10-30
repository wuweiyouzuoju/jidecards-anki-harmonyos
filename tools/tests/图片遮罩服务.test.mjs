// SPDX-License-Identifier: AGPL-3.0-or-later

// T1.5 图片遮罩服务契约测试：
// - 获取图片遮罩字段 经 后端会话 走 后端图片遮罩(37) 的 获取图片遮罩字段(2)，
//   解出 4 个字段索引（含 occlusions=0 的 proto3 默认值）；
// - 添加图片遮罩笔记类型 经 后端图片遮罩(37) 的 添加图片遮罩笔记类型(3)，
//   入参为 generic.Empty（空字节）；
// - 媒体服务.添加媒体文件 经 后端媒体(41) 的 添加媒体文件(1)，返回最终文件名。
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 媒体方法, 图片遮罩方法, 服务号 } from '../../entry/src/main/ets/backend/服务索引.ts';

// 后端客户端.ts import libjidecards.so（HarmonyOS 原生 NAPI），Node 测试环境无此包。
// 注册一个 resolve hook 把它桩成空实现，让 后端会话 / 图片遮罩服务 / 媒体服务 可在 Node 下加载。
const libStub = 'export const openBackend = () => 0; export const closeBackend = () => {}; export const runMethodRaw = () => Promise.resolve(new Uint8Array(0));';
const libStubUrl = 'data:text/javascript;base64,' + Buffer.from(libStub).toString('base64');
const hookCode = `export function resolve(s, c, n) { if (s === 'libjidecards.so') { return { url: ${JSON.stringify(libStubUrl)}, shortCircuit: true }; } return n(s, c); }`;
register('data:text/javascript;base64,' + Buffer.from(hookCode).toString('base64'), import.meta.url);

// 构造 GetImageOcclusionFieldsResponse 字节：
// ImageOcclusionFieldIndexes { occlusions=0, image=1, header=2, back_extra=3 }
// occlusions=0 是 proto3 默认值，不在网络上传输，验证解码端正确补 0。
function buildFieldsResponseBytes() {
  const indexes = new 协议写入器();
  indexes.写入变长整数(2, 1);
  indexes.写入变长整数(3, 2);
  indexes.写入变长整数(4, 3);
  const response = new 协议写入器();
  response.写入子消息(1, indexes);
  return response.转为字节();
}

// 桩 后端会话.获取实例：返回只带 调用 方法的 mock，按方法号分派固定字节。
async function 桩会话与图片遮罩服务(分派) {
  const { 后端会话 } = await import('../../entry/src/main/ets/backend/后端会话.ts');
  const calls = [];
  后端会话.获取实例 = () => ({
    调用: async (服务号Arg, 方法号Arg, 输入字节) => {
      calls.push({ 服务号: 服务号Arg, 方法号: 方法号Arg, 输入字节 });
      return 分派(服务号Arg, 方法号Arg, 输入字节);
    }
  });
  const { 图片遮罩服务 } = await import('../../entry/src/main/ets/backend/图片遮罩服务.ts');
  return { calls, service: new 图片遮罩服务() };
}

test('获取图片遮罩字段 走 后端图片遮罩(37) 的 获取图片遮罩字段(2) 并解出 4 个索引', async () => {
  const { calls, service } = await 桩会话与图片遮罩服务(() => buildFieldsResponseBytes());
  const result = await service.获取图片遮罩字段(1);

  assert.deepEqual(result, { 遮罩: 0, 图片: 1, 标题: 2, 额外: 3 },
    'occlusions=0 是 proto3 默认值，必须被正确补回');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].服务号, 服务号.后端图片遮罩, 'service id 37');
  assert.equal(calls[0].方法号, 图片遮罩方法.获取图片遮罩字段, 'method id 2');

  // 请求侧 GetImageOcclusionFieldsRequest { notetype_id: int64 = 1 }
  const { 协议读取器 } = await import('../../entry/src/main/ets/proto/core/ProtoReader.ts');
  const reader = new 协议读取器(calls[0].输入字节);
  const tag = reader.读取标签();
  assert.equal(tag.字段号, 1, 'request must encode notetype_id at field 1');
  assert.equal(reader.读取64位整数(), 1, 'notetype_id=1');
});

test('添加图片遮罩笔记类型 走 后端图片遮罩(37) 的 添加图片遮罩笔记类型(3)，入参为 Empty', async () => {
  const { calls, service } = await 桩会话与图片遮罩服务(() => new Uint8Array(0));
  await service.添加图片遮罩笔记类型();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].服务号, 服务号.后端图片遮罩, 'service id 37');
  assert.equal(calls[0].方法号, 图片遮罩方法.添加图片遮罩笔记类型, 'method id 3');
  assert.equal(calls[0].输入字节.length, 0, 'generic.Empty must be empty bytes');
});

test('媒体服务.添加媒体文件 走 后端媒体(41) 的 添加媒体文件(1) 并返回最终文件名', async () => {
  const { 后端会话 } = await import('../../entry/src/main/ets/backend/后端会话.ts');
  const calls = [];
  后端会话.获取实例 = () => ({
    调用: async (服务号Arg, 方法号Arg, 输入字节) => {
      calls.push({ 服务号: 服务号Arg, 方法号: 方法号Arg, 输入字节 });
      const w = new 协议写入器();
      w.写入字符串(1, 'photo-1.png');
      return w.转为字节();
    }
  });
  const { 媒体服务 } = await import('../../entry/src/main/ets/backend/媒体服务.ts');
  const service = new 媒体服务();
  const 最终文件名 = await service.添加媒体文件('photo.png', new Uint8Array([1, 2, 3]));

  assert.equal(最终文件名, 'photo-1.png', 'generic.String.val returned as final filename');
  assert.equal(calls[0].服务号, 服务号.后端媒体, 'service id 41');
  assert.equal(calls[0].方法号, 媒体方法.添加媒体文件, 'method id 1');
});

// ============================================================
// T8 新增 4 个 RPC 的 proto 往返测试：
// - 获取遮罩用图片（method 0）：request=path string，response=data bytes + name string
// - 获取图片遮罩笔记（method 1）：request=noteId int64，response=oneof note/error（含嵌套子消息）
// - 添加图片遮罩笔记（method 4）：request=6 字段，response=OpChanges
// - 更新图片遮罩笔记（method 5）：request=5 字段，response=OpChanges
// ============================================================

// 构造 GetImageForOcclusionResponse 字节：data=[1,2,3] name='photo.png'
function buildGetImageForOcclusionResponseBytes() {
  const w = new 协议写入器();
  w.写入字节(1, new Uint8Array([1, 2, 3]));
  w.写入字符串(2, 'photo.png');
  return w.转为字节();
}

test('获取遮罩用图片 走 后端图片遮罩(37) 的 获取遮罩用图片(0) 并解出 data+name', async () => {
  const { calls, service } = await 桩会话与图片遮罩服务(() => buildGetImageForOcclusionResponseBytes());
  const result = await service.获取遮罩用图片('photo.png');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].服务号, 服务号.后端图片遮罩, 'service id 37');
  assert.equal(calls[0].方法号, 图片遮罩方法.获取遮罩用图片, 'method id 0');

  // 请求侧 GetImageForOcclusionRequest { path: string = 1 }
  const { 协议读取器 } = await import('../../entry/src/main/ets/proto/core/ProtoReader.ts');
  const reader = new 协议读取器(calls[0].输入字节);
  const tag = reader.读取标签();
  assert.equal(tag.字段号, 1, 'request must encode path at field 1');
  assert.equal(reader.读取字符串(), 'photo.png', 'path=photo.png');

  // 响应侧 data + name
  assert.deepEqual(Array.from(result.data), [1, 2, 3], 'image bytes round-trip');
  assert.equal(result.name, 'photo.png', 'filename round-trip');
});

// 构造 GetImageOcclusionNoteResponse 字节（oneof=note）：
// ImageOcclusionNote { image_data=[10,20], occlusions=[{shapes:[{shape:'rect',properties:[{name:'left',value:'0.1'}]}],ordinal:1}], header='H', back_extra='B', tags=['t1','t2'], image_file_name='img.png', occlude_inactive=true }
function buildGetImageOcclusionNoteResponseBytes() {
  // ImageOcclusionProperty { name='left', value='0.1' }
  const prop = new 协议写入器();
  prop.写入字符串(1, 'left');
  prop.写入字符串(2, '0.1');
  // ImageOcclusionShape { shape='rect', properties=[prop] }
  const shape = new 协议写入器();
  shape.写入字符串(1, 'rect');
  shape.写入子消息(2, prop);
  // ImageOcclusion { shapes=[shape], ordinal=1 }
  const occlusion = new 协议写入器();
  occlusion.写入子消息(1, shape);
  occlusion.写入变长整数(2, 1);
  // ImageOcclusionNote { image_data, occlusions, header, back_extra, tags, image_file_name, occlude_inactive }
  const note = new 协议写入器();
  note.写入字节(1, new Uint8Array([10, 20]));
  note.写入子消息(2, occlusion);
  note.写入字符串(3, 'H');
  note.写入字符串(4, 'B');
  note.写入字符串(5, 't1');
  note.写入字符串(5, 't2');
  note.写入字符串(6, 'img.png');
  note.写入布尔(7, true);
  // GetImageOcclusionNoteResponse { note } (oneof field 1)
  const response = new 协议写入器();
  response.写入子消息(1, note);
  return response.转为字节();
}

test('获取图片遮罩笔记 走 后端图片遮罩(37) 的 获取图片遮罩笔记(1) 并解出嵌套 note', async () => {
  const { calls, service } = await 桩会话与图片遮罩服务(() => buildGetImageOcclusionNoteResponseBytes());
  const result = await service.获取图片遮罩笔记(42);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].服务号, 服务号.后端图片遮罩, 'service id 37');
  assert.equal(calls[0].方法号, 图片遮罩方法.获取图片遮罩笔记, 'method id 1');

  // 请求侧 GetImageOcclusionNoteRequest { note_id: int64 = 1 }
  const { 协议读取器 } = await import('../../entry/src/main/ets/proto/core/ProtoReader.ts');
  const reader = new 协议读取器(calls[0].输入字节);
  const tag = reader.读取标签();
  assert.equal(tag.字段号, 1, 'request must encode note_id at field 1');
  assert.equal(reader.读取64位整数(), 42, 'note_id=42');

  // 响应侧 oneof=note，解出嵌套结构
  assert.notEqual(result.note, null, 'note must be present');
  assert.equal(result.error, '', 'error must be empty');
  assert.deepEqual(Array.from(result.note.imageData), [10, 20], 'image_data round-trip');
  assert.equal(result.note.occlusions.length, 1, 'one occlusion');
  assert.equal(result.note.occlusions[0].ordinal, 1, 'ordinal=1');
  assert.equal(result.note.occlusions[0].shapes.length, 1, 'one shape');
  assert.equal(result.note.occlusions[0].shapes[0].shape, 'rect', 'shape=rect');
  assert.equal(result.note.occlusions[0].shapes[0].properties.length, 1, 'one property');
  assert.equal(result.note.occlusions[0].shapes[0].properties[0].name, 'left', 'property name=left');
  assert.equal(result.note.occlusions[0].shapes[0].properties[0].value, '0.1', 'property value=0.1');
  assert.equal(result.note.header, 'H', 'header round-trip');
  assert.equal(result.note.backExtra, 'B', 'back_extra round-trip');
  assert.deepEqual(result.note.tags, ['t1', 't2'], 'tags round-trip');
  assert.equal(result.note.imageFileName, 'img.png', 'image_file_name round-trip');
  assert.equal(result.note.occludeInactive, true, 'occlude_inactive round-trip');
});

test('获取图片遮罩笔记 后端返回 error 时 note 为 null', async () => {
  // GetImageOcclusionNoteResponse { error: string = 2 } (oneof=error)
  const w = new 协议写入器();
  w.写入字符串(2, 'note not found');
  const errorBytes = w.转为字节();
  const { service } = await 桩会话与图片遮罩服务(() => errorBytes);
  const result = await service.获取图片遮罩笔记(999);

  assert.equal(result.note, null, 'note must be null on error');
  assert.equal(result.error, 'note not found', 'error message round-trip');
});

// 构造 OpChanges 字节（仅 note=true，其余默认 false）
function buildOpChangesBytes() {
  const w = new 协议写入器();
  w.写入布尔(2, true); // note=true
  w.写入布尔(12, true); // mtime=true
  return w.转为字节();
}

test('添加图片遮罩笔记 走 后端图片遮罩(37) 的 添加图片遮罩笔记(4) 并解出 OpChanges', async () => {
  const { calls, service } = await 桩会话与图片遮罩服务(() => buildOpChangesBytes());
  const result = await service.添加图片遮罩笔记({
    imagePath: 'photo-1.png',
    occlusions: '{{c1::image-occlusion:rect:left=0.2:top=0.3:width=0.4:height=0.1}}',
    header: '标题',
    backExtra: '额外',
    tags: ['t1', 't2'],
    notetypeId: 7
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].服务号, 服务号.后端图片遮罩, 'service id 37');
  assert.equal(calls[0].方法号, 图片遮罩方法.添加图片遮罩笔记, 'method id 4');

  // 请求侧 AddImageOcclusionNoteRequest 6 字段
  const { 协议读取器 } = await import('../../entry/src/main/ets/proto/core/ProtoReader.ts');
  const reader = new 协议读取器(calls[0].输入字节);
  let imagePath = '';
  let occlusions = '';
  let header = '';
  let backExtra = '';
  const tags = [];
  let notetypeId = 0;
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: imagePath = reader.读取字符串(); break;
      case 2: occlusions = reader.读取字符串(); break;
      case 3: header = reader.读取字符串(); break;
      case 4: backExtra = reader.读取字符串(); break;
      case 5: tags.push(reader.读取字符串()); break;
      case 6: notetypeId = reader.读取64位整数(); break;
      default: reader.跳过字段(tag.线类型);
    }
  }
  assert.equal(imagePath, 'photo-1.png', 'image_path round-trip');
  assert.equal(occlusions, '{{c1::image-occlusion:rect:left=0.2:top=0.3:width=0.4:height=0.1}}', 'occlusions round-trip');
  assert.equal(header, '标题', 'header round-trip');
  assert.equal(backExtra, '额外', 'back_extra round-trip');
  assert.deepEqual(tags, ['t1', 't2'], 'tags round-trip');
  assert.equal(notetypeId, 7, 'notetype_id round-trip');

  // 响应侧 OpChanges
  assert.equal(result.note, true, 'OpChanges.note=true');
  assert.equal(result.card, false, 'OpChanges.card=false (default)');
  assert.equal(result.mtime, true, 'OpChanges.mtime=true');
});

test('添加图片遮罩笔记 空串/0 值按 proto3 默认值省略不写入', async () => {
  const { calls, service } = await 桩会话与图片遮罩服务(() => buildOpChangesBytes());
  await service.添加图片遮罩笔记({
    imagePath: '',
    occlusions: '',
    header: '',
    backExtra: '',
    tags: [],
    notetypeId: 0
  });

  // 所有字段都是默认值，应该没有字节写入
  assert.equal(calls[0].输入字节.length, 0, 'all-default request must be empty bytes');
});

test('更新图片遮罩笔记 走 后端图片遮罩(37) 的 更新图片遮罩笔记(5) 并解出 OpChanges', async () => {
  const { calls, service } = await 桩会话与图片遮罩服务(() => buildOpChangesBytes());
  const result = await service.更新图片遮罩笔记({
    noteId: 100,
    occlusions: '{{c1::image-occlusion:rect:left=0.5:top=0.5:width=0.2:height=0.2}}',
    header: '新标题',
    backExtra: '新额外',
    tags: ['updated']
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].服务号, 服务号.后端图片遮罩, 'service id 37');
  assert.equal(calls[0].方法号, 图片遮罩方法.更新图片遮罩笔记, 'method id 5');

  // 请求侧 UpdateImageOcclusionNoteRequest 5 字段
  const { 协议读取器 } = await import('../../entry/src/main/ets/proto/core/ProtoReader.ts');
  const reader = new 协议读取器(calls[0].输入字节);
  let noteId = 0;
  let occlusions = '';
  let header = '';
  let backExtra = '';
  const tags = [];
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: noteId = reader.读取64位整数(); break;
      case 2: occlusions = reader.读取字符串(); break;
      case 3: header = reader.读取字符串(); break;
      case 4: backExtra = reader.读取字符串(); break;
      case 5: tags.push(reader.读取字符串()); break;
      default: reader.跳过字段(tag.线类型);
    }
  }
  assert.equal(noteId, 100, 'note_id round-trip');
  assert.equal(occlusions, '{{c1::image-occlusion:rect:left=0.5:top=0.5:width=0.2:height=0.2}}', 'occlusions round-trip');
  assert.equal(header, '新标题', 'header round-trip');
  assert.equal(backExtra, '新额外', 'back_extra round-trip');
  assert.deepEqual(tags, ['updated'], 'tags round-trip');

  // 响应侧 OpChanges
  assert.equal(result.note, true, 'OpChanges.note=true');
  assert.equal(result.mtime, true, 'OpChanges.mtime=true');
});
