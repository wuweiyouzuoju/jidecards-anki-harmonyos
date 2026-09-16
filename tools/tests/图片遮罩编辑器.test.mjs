// SPDX-License-Identifier: AGPL-3.0-or-later

// 覆盖序列化及编辑器实际坐标/手势方法；ArkUI 布局和触屏由真机验收覆盖。
// 格式参考：third_party/anki/rslib/src/image_occlusion/imageocclusion.rs
//   parse_image_cloze 与 cloze.rs multi_card_image_occlusion 测试。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import {
  生成Occlusions字符串,
  编号颜色,
  识别图片扩展名
} from '../../entry/src/main/ets/model/图片遮罩模型.ts';

const editorSource = readFileSync(new URL('../../entry/src/main/ets/components/图片遮罩编辑器.ets', import.meta.url), 'utf8');
const editorMethods = [...editorSource.matchAll(/^  private \w*[^\s:(]+\([^]*?^  }/gm)].map(match => match[0]);
const editorContext = vm.createContext({ 编号颜色 });
vm.runInContext(stripTypeScriptTypes(`globalThis.Editor = class { ${editorMethods.join('\n')} }`), editorContext);

function editor(width, height, ratio) {
  const instance = new editorContext.Editor();
  const fills = [];
  const context = { width, height, clearRect() { fills.length = 0; }, fillRect(...rect) { fills.push(rect); }, strokeRect() {} };
  Object.assign(instance, {
    上下文: context, 图片宽高比: ratio, 画布宽: 0, 画布高: 0, 画布就绪: false,
    遮罩列表: [], 当前选中编号: 1, 最小拖动距离: 0.005
  });
  instance.refreshCanvas();
  return { instance, context, fills };
}

const touch = (x, y) => ({ fingerList: [{ localX: x, localY: y }] });
const plain = value => JSON.parse(JSON.stringify(value));

test('横图、竖图、全景和长图始终完整居中，归一化使用图片边界', () => {
  for (const [width, height, ratio] of [[320, 500, 2], [320, 500, 0.5], [300, 450, 10], [600, 240, 0.1], [280, 280, 1]]) {
    const { instance } = editor(width, height, ratio);
    const rect = instance.imageContentRect();
    assert.ok(rect.width <= width && rect.height <= height);
    assert.ok(Math.abs(rect.width / rect.height - ratio) < 1e-9);
    assert.equal(rect.left * 2 + rect.width, width);
    assert.equal(rect.top * 2 + rect.height, height);
    assert.equal(instance.归一化X(rect.left), 0);
    assert.equal(instance.归一化Y(rect.top), 0);
    assert.equal(instance.归一化X(rect.left + rect.width), 1);
    assert.equal(instance.归一化Y(rect.top + rect.height), 1);
  }
});

test('横图留白不创建遮罩，整图拖动保存完整原图坐标', () => {
  const { instance, fills } = editor(320, 500, 2);
  instance.拖动开始(touch(100, 20));
  instance.拖动更新(touch(200, 300));
  instance.拖动结束();
  assert.equal(instance.遮罩列表.length, 0);
  instance.拖动开始(touch(0, 170));
  instance.拖动更新(touch(320, 330));
  instance.拖动结束();
  assert.equal(生成Occlusions字符串(instance.遮罩列表), '{{c1::image-occlusion:rect:left=0:top=0:width=1:height=1}}');
  assert.deepEqual(fills, [[0, 170, 320, 160]]);
});

test('多遮罩重排后仍对应原图位置，反复切换画布尺寸不累积误差', () => {
  const { instance, context, fills } = editor(320, 500, 2);
  for (const [left, top, right, bottom] of [[32, 186, 96, 218], [224, 282, 288, 314]]) {
    instance.拖动开始(touch(left, top));
    instance.拖动更新(touch(right, bottom));
    instance.拖动结束();
  }
  const saved = 生成Occlusions字符串(instance.遮罩列表);
  for (let i = 0; i < 3; i++) {
    context.width = 600;
    context.height = 200;
    instance.refreshCanvas();
    assert.deepEqual(fills.map(rect => rect.map(Math.round)), [[140, 20, 80, 40], [380, 140, 80, 40]]);
    context.width = 320;
    context.height = 500;
    instance.refreshCanvas();
    assert.deepEqual(fills.map(rect => rect.map(Math.round)), [[32, 186, 64, 32], [224, 282, 64, 32]]);
    assert.equal(生成Occlusions字符串(instance.遮罩列表), saved);
  }
});

test('竖图反向拖动及移动到图外时遮罩保持大小并限制在图片内', () => {
  const { instance } = editor(400, 400, 0.5);
  instance.拖动开始(touch(260, 320));
  instance.拖动更新(touch(140, 80));
  instance.拖动结束();
  assert.deepEqual(plain(instance.遮罩列表[0]), { 形状: 'rect', 左: 0.2, 顶: 0.2, 宽: 0.6000000000000001, 高: 0.6000000000000001, 编号: 1 });
  instance.拖动开始(touch(160, 120));
  instance.拖动更新(touch(800, 800));
  instance.拖动结束();
  const mask = instance.遮罩列表[0];
  assert.equal(mask.左 + mask.宽, 1);
  assert.equal(mask.顶 + mask.高, 1);
  assert.equal(生成Occlusions字符串(instance.遮罩列表), '{{c1::image-occlusion:rect:left=0.4:top=0.4:width=0.6:height=0.6}}');
});

test('未加载、空触点、取消手势和画布变化不会落定错误矩形', () => {
  const { instance, context } = editor(320, 500, 0);
  instance.拖动开始(touch(30, 200));
  assert.equal(instance.拖动模式, 0);
  instance.图片宽高比 = 2;
  instance.拖动开始({ fingerList: [] });
  for (const cancel of [() => instance.cancelDrag(), () => { context.width = 400; instance.refreshCanvas(); }]) {
    instance.拖动开始(touch(30, 200));
    instance.拖动更新(touch(60, 230));
    instance.拖动更新({ fingerList: [] });
    cancel();
    instance.拖动结束();
    assert.equal(instance.遮罩列表.length, 0);
  }
});

test('生成Occlusions字符串_单个c1矩形', () => {
  // spec T2.4 用例 1：1 个矩形 c1
  const 输入 = [
    { 形状: 'rect', 左: 0.2, 顶: 0.3, 宽: 0.4, 高: 0.1, 编号: 1 }
  ];
  assert.equal(
    生成Occlusions字符串(输入),
    '{{c1::image-occlusion:rect:left=0.2:top=0.3:width=0.4:height=0.1}}'
  );
});

test('生成Occlusions字符串_三个不同ordinal矩形', () => {
  // spec T2.4 用例 2：c1/c2/c3 三个矩形串连
  const 输入 = [
    { 形状: 'rect', 左: 0.1, 顶: 0.1, 宽: 0.2, 高: 0.2, 编号: 1 },
    { 形状: 'rect', 左: 0.3, 顶: 0.3, 宽: 0.2, 高: 0.2, 编号: 2 },
    { 形状: 'rect', 左: 0.5, 顶: 0.5, 宽: 0.2, 高: 0.2, 编号: 3 }
  ];
  const 期望 =
    '{{c1::image-occlusion:rect:left=0.1:top=0.1:width=0.2:height=0.2}}' +
    '{{c2::image-occlusion:rect:left=0.3:top=0.3:width=0.2:height=0.2}}' +
    '{{c3::image-occlusion:rect:left=0.5:top=0.5:width=0.2:height=0.2}}';
  assert.equal(生成Occlusions字符串(输入), 期望);
});

test('生成Occlusions字符串_整图遮罩边界值', () => {
  // spec T2.4 用例 3：左=0, 顶=0, 宽=1, 高=1（整图遮罩）
  const 输入 = [
    { 形状: 'rect', 左: 0, 顶: 0, 宽: 1, 高: 1, 编号: 1 }
  ];
  assert.equal(
    生成Occlusions字符串(输入),
    '{{c1::image-occlusion:rect:left=0:top=0:width=1:height=1}}'
  );
});

test('生成Occlusions字符串_编号越界按c6输出', () => {
  // spec T2.4 用例 4：编号=6 仍按 {{c6::...}} 输出，不强校验
  const 输入 = [
    { 形状: 'rect', 左: 0.1, 顶: 0.1, 宽: 0.1, 高: 0.1, 编号: 6 }
  ];
  assert.equal(
    生成Occlusions字符串(输入),
    '{{c6::image-occlusion:rect:left=0.1:top=0.1:width=0.1:height=0.1}}'
  );
});

test('生成Occlusions字符串_空列表返回空字符串', () => {
  // 边界：空列表应返回空字符串（Anki Occlusions 字段允许为空，
  // 但实际建卡时调用方负责保证至少 1 个遮罩）
  assert.equal(生成Occlusions字符串([]), '');
});

test('生成Occlusions字符串_浮点尾数四舍五入到4位', () => {
  // 浮点尾数误差兜底：0.123456 → "0.1235"，0.987654 → "0.9877"
  const 输入 = [
    { 形状: 'rect', 左: 0.123456, 顶: 0.987654, 宽: 0.555555, 高: 0.0001, 编号: 1 }
  ];
  assert.equal(
    生成Occlusions字符串(输入),
    '{{c1::image-occlusion:rect:left=0.1235:top=0.9877:width=0.5556:height=0.0001}}'
  );
});

test('生成Occlusions字符串_同ordinal多矩形', () => {
  // 同 ordinal 的两个矩形：输出两个 {{c1::...}}，串连无分隔
  // （Anki 端会把它们都作为 c1 的遮罩，复习时同时揭示）
  const 输入 = [
    { 形状: 'rect', 左: 0.1, 顶: 0.1, 宽: 0.2, 高: 0.2, 编号: 1 },
    { 形状: 'rect', 左: 0.5, 顶: 0.5, 宽: 0.2, 高: 0.2, 编号: 1 }
  ];
  const 期望 =
    '{{c1::image-occlusion:rect:left=0.1:top=0.1:width=0.2:height=0.2}}' +
    '{{c1::image-occlusion:rect:left=0.5:top=0.5:width=0.2:height=0.2}}';
  assert.equal(生成Occlusions字符串(输入), 期望);
});

test('编号颜色_c1到c5返回固定色', () => {
  // c1 红 / c2 橙 / c3 黄 / c4 绿 / c5 蓝
  assert.equal(编号颜色(1), '#E53935');
  assert.equal(编号颜色(2), '#FB8C00');
  assert.equal(编号颜色(3), '#FDD835');
  assert.equal(编号颜色(4), '#43A047');
  assert.equal(编号颜色(5), '#1E88E5');
});

test('编号颜色_越界返回默认灰', () => {
  // 越界编号不报错，返回中性灰
  assert.equal(编号颜色(0), '#9E9E9E');
  assert.equal(编号颜色(6), '#9E9E9E');
  assert.equal(编号颜色(-1), '#9E9E9E');
});

test('识别图片扩展名_按魔数识别jpg/png/webp/gif', () => {
  // 魔数依据：JPEG=FF D8 FF；PNG=89 50 4E 47；WEBP=RIFF....WEBP；GIF=GIF8
  assert.equal(识别图片扩展名(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00])), 'jpg');
  assert.equal(识别图片扩展名(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), 'png');
  assert.equal(
    识别图片扩展名(
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])),
    'webp');
  assert.equal(识别图片扩展名(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), 'gif');
});

test('识别图片扩展名_无法识别兜底png', () => {
  // 兜底 png：Anki is_image_file 只认 jpg/jpeg/png/gif/svg/webp/ico/avif，
  // 必须返回受支持的扩展名，否则遮罩编辑器无法回读图片
  assert.equal(识别图片扩展名(new Uint8Array([0x00, 0x01, 0x02, 0x03])), 'png');
  assert.equal(识别图片扩展名(new Uint8Array([0x42, 0x4D])), 'png');
  assert.equal(识别图片扩展名(new Uint8Array(0)), 'png');
});
