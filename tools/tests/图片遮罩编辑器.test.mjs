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
  识别图片扩展名,
  copyMask, maskNumber, maskProperty, maskPoints, setMaskProperty, nextOcclusionOrdinal, OcclusionHistory,
  parseOcclusionMasks, serializeOcclusionDocument, serializeMask
} from '../../entry/src/main/ets/model/图片遮罩模型.ts';

const editorSource = readFileSync(new URL('../../entry/src/main/ets/components/图片遮罩编辑器.ets', import.meta.url), 'utf8');
const editorMethods = [...editorSource.matchAll(/^  private (?:async )?\w*[^\s:(]+\([^]*?^  }/gm)].map(match => match[0]);
let discard = false;
const editorContext = vm.createContext({ 编号颜色, copyMask, maskNumber, maskProperty, maskPoints, setMaskProperty, OcclusionHistory,
  nextOcclusionOrdinal,
  confirmNoteDiscard: async () => discard });
vm.runInContext(stripTypeScriptTypes(`globalThis.Editor = class { ${editorMethods.join('\n')} }`), editorContext);

function editor(width, height, ratio) {
  const instance = new editorContext.Editor();
  const fills = [];
  const paints = [], states = [];
  const context = { width, height, globalAlpha: 1,
    save() { states.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha }); },
    restore() { Object.assign(this, states.pop()); },
    clearRect() { fills.length = 0; paints.length = 0; },
    fillRect(...rect) { fills.push(rect); paints.push([this.fillStyle, this.globalAlpha]); }, strokeRect() {},
    translate() {}, rotate() {}, setLineDash() {}, beginPath() {}, closePath() {}, ellipse() {},
    moveTo() {}, lineTo() {}, fill() {}, stroke() {}, fillText() {}, measureText(text) { return { width: text.length * 10 }; } };
  Object.assign(instance, {
    上下文: context, 图片宽高比: ratio, 画布宽: 0, 画布高: 0, 画布就绪: false,
    遮罩列表: [], 当前选中编号: 1, 最小拖动距离: 0.005,
    shapeKind: 'rect', selectedMask: -1, polygonPoints: [], annotationText: '', initialMasks: [],
    imageFailed: false, sourceHeight: 1000, history: new OcclusionHistory(), dragSnapshot: null, newInactiveMode: 0,
    confirmingClose: false, canUndo: false, canRedo: false, getUIContext: () => ({})
  });
  instance.refreshCanvas();
  return { instance, context, fills, paints };
}

const touch = (x, y, offsetX = 0, offsetY = 0) => ({ offsetX, offsetY, fingerList: [{ localX: x, localY: y }] });
const plain = value => JSON.parse(JSON.stringify(value));

test('导入所有图形、多卡编号、转角、文本转义及未知属性无改动时逐字保留', () => {
  const source = '<div>保留字段排版</div>' +
    '{{c6,9::image-occlusion:ellipse:left=0.123456789:top=0.2:rx=0.1:ry=0.15:angle=1250:oi=1:future=value}}\n' +
    '{{c0::image-occlusion:text:left=0.1:top=0.1:text=中文\\:标签\n第二行:fs=0.04:scale=1.5:fill=#334455}}' +
    '{{c9::image-occlusion:polygon:left=0.5:top=0.5:points=-0.1,0 0.2,0 0.2,0.2:oi=0}}' +
    '{{c12::image-occlusion:future:left=0.2:top=0.2:custom=keep}}<b>末尾</b>';
  const masks = parseOcclusionMasks(source);
  assert.equal(masks.length, 4);
  assert.equal(maskProperty(masks[1], 'text'), '中文:标签\n第二行');
  assert.equal(masks[0].宽, 0.2);
  assert.equal(serializeOcclusionDocument(source, masks), source);
  masks[0].左 = 0.333333333;
  const moved = serializeOcclusionDocument(source, masks);
  assert.ok(moved.includes('c6,9::'));
  assert.ok(moved.includes('left=0.333333333'));
  assert.ok(moved.includes('future=value'));
  assert.ok(moved.endsWith(masks[3].source + '<b>末尾</b>'));
  assert.equal(maskProperty(parseOcclusionMasks(moved)[1], 'text'), '中文:标签\n第二行');
});

test('只替换或删除选中图形片段，新图形追加，其他 HTML 和卡片编号保留', () => {
  const source = '<p>before</p>{{c6::image-occlusion:rect:left=0.1:top=0.2:width=0.2:height=0.2}}<hr>{{c9::image-occlusion:ellipse:left=0.5:top=0.5:rx=0.1:ry=0.2}}after';
  const masks = parseOcclusionMasks(source);
  const extra = { 形状: 'rect', 左: 0.1, 顶: 0.1, 宽: 0.1, 高: 0.1, 编号: 12 };
  assert.equal(serializeOcclusionDocument(source, [masks[1], extra]), '<p>before</p><hr>' + masks[1].source + 'after' + serializeMask(extra));
});

test('新编号避开导入多卡遮罩保留的所有编号，不意外合并旧卡片', () => {
  const { instance } = editor(300,300,1);
  instance.遮罩列表 = parseOcclusionMasks('{{c6,20::image-occlusion:rect:left=0.1:top=0.1:width=0.1:height=0.1}}');
  instance.addOrdinal(); assert.equal(instance.当前选中编号,21);
  assert.deepEqual(plain(instance.编号候选列表()),[19,20,21,22,23]);
});

test('移动、编号、调整大小和模式变化可连续撤销重做，取消移动回滚到拖动开始', () => {
  const { instance } = editor(300, 300, 1);
  const source = '{{c6,9::image-occlusion:ellipse:left=0.1:top=0.1:rx=0.1:ry=0.1:angle=0:oi=1:custom=kept}}';
  instance.遮罩列表 = parseOcclusionMasks(source);
  instance.拖动开始(touch(60, 60)); instance.拖动更新(touch(90, 90)); instance.cancelDrag();
  assert.equal(serializeMask(instance.遮罩列表[0]), source);
  assert.equal(instance.canUndo, false);
  instance.拖动开始(touch(60, 60)); instance.拖动更新(touch(90, 90)); instance.拖动结束();
  instance.selectOrdinal(12); instance.resizeSelected(0.9); instance.setInactiveMode(false);
  const changed = serializeMask(instance.遮罩列表[0]);
  assert.ok(changed.includes('c12::')); assert.ok(changed.includes('custom=kept'));
  for (let i = 0; i < 4; i++) instance.撤销最后一个();
  assert.equal(serializeMask(instance.遮罩列表[0]), source);
  for (let i = 0; i < 4; i++) instance.redo();
  assert.equal(serializeMask(instance.遮罩列表[0]), changed);
  instance.撤销最后一个(); instance.selectedMask = 0; instance.deleteSelected();
  assert.equal(instance.canRedo, false);
});

test('椭圆和多边形按实际轮廓命中，矩形旋转按图像像素比例换算', () => {
  const { instance } = editor(400, 200, 2);
  instance.遮罩列表 = parseOcclusionMasks('{{c1::image-occlusion:ellipse:left=0.1:top=0.1:rx=0.1:ry=0.1}}');
  assert.equal(instance.命中遮罩(0.11, 0.11), -1);
  assert.equal(instance.命中遮罩(0.2, 0.2), 0);
  instance.遮罩列表 = parseOcclusionMasks('{{c1::image-occlusion:polygon:left=0.1:top=0.1:points=0,0 0.4,0 0,0.4}}');
  assert.equal(instance.命中遮罩(0.45, 0.45), -1);
  assert.equal(instance.命中遮罩(0.2, 0.2), 0);
  instance.遮罩列表 = parseOcclusionMasks('{{c1::image-occlusion:rect:left=0.4:top=0.1:width=0.2:height=0.1:angle=2500}}');
  assert.equal(instance.命中遮罩(0.375, 0.3), 0);
  assert.equal(instance.命中遮罩(0.5, 0.15), -1);
});

test('多边形与文字创建使用 Core 坐标和 c0 标注，文字可更新而不重建图形', () => {
  const { instance } = editor(300, 300, 1);
  instance.shapeKind = 'polygon';
  for (const point of [[30, 30], [90, 30], [90, 90]]) instance.tapImage(touch(...point));
  instance.finishPolygon(); assert.equal(instance.遮罩列表[0].形状, 'polygon');
  assert.deepEqual(maskPoints(instance.遮罩列表[0]), [{x:0.1,y:0.1},{x:0.3,y:0.1},{x:0.3,y:0.3}]);
  instance.annotationText = 'A:B'; instance.addText();
  assert.equal(instance.遮罩列表[1].编号, 0);
  assert.ok(serializeMask(instance.遮罩列表[1]).includes('text=A\\:B'));
  instance.selectedMask = 1; instance.annotationText = 'Changed'; instance.addText();
  assert.equal(instance.遮罩列表.length, 2); assert.equal(maskProperty(instance.遮罩列表[1], 'text'), 'Changed');
  instance.撤销最后一个(); assert.equal(maskProperty(instance.遮罩列表[1], 'text'), 'A:B');
});

test('关闭编辑器的各入口统一确认，取消保留草稿，确认才退出', async () => {
  const { instance } = editor(300, 300, 1);
  let closed = 0; instance.onCancel = () => closed++;
  await instance.requestClose(); assert.equal(closed, 1);
  instance.annotationText = '待添加文字'; discard = false;
  await instance.requestClose(); assert.equal(closed, 1); assert.equal(instance.annotationText, '待添加文字');
  discard = true; await instance.requestClose(); assert.equal(closed, 2);
  discard = false;
});

test('五种遮罩颜色使用六位 RGB，透明度独立且不污染后续绘制', () => {
  const { instance, context, paints } = editor(300, 300, 1);
  for (let ordinal = 1; ordinal <= 5; ordinal++) {
    const mask = { 形状: 'rect', 左: 0.1, 顶: 0.1, 宽: 0.2, 高: 0.2, 编号: ordinal };
    instance.绘制遮罩(mask, false);
    instance.绘制遮罩(mask, true);
    assert.deepEqual(paints.slice(-2), [[编号颜色(ordinal), 0.4], [编号颜色(ordinal), 0.25]]);
    assert.equal(context.globalAlpha, 1);
  }
});

test('手势识别阈值不改变按下点，反向绘制与已存在遮罩命中都使用真实起点', () => {
  const { instance } = editor(300, 300, 1);
  instance.拖动开始(touch(90, 84, -10, -16));
  instance.拖动更新(touch(40, 40));
  instance.拖动结束();
  assert.equal(生成Occlusions字符串(instance.遮罩列表), '{{c1::image-occlusion:rect:left=0.1333:top=0.1333:width=0.2:height=0.2}}');
  // 按在右边缘内，识别时已越过遮罩；仍应移动原遮罩而非新建。
  instance.拖动开始(touch(110, 60, 15, 0));
  assert.equal(instance.拖动模式, 2);
  instance.拖动结束();
  assert.equal(instance.遮罩列表.length, 1);
  assert.ok(Math.abs(instance.遮罩列表[0].左 - 55 / 300) < 1e-9);
});

test('从留白开始滑入图片不误建，绘制期间切换编号不会改变当前矩形颜色', () => {
  const { instance } = editor(320, 500, 2);
  instance.拖动开始(touch(80, 180, 0, 20));
  assert.equal(instance.拖动模式, 0);
  instance.当前选中编号 = 2;
  instance.拖动开始(touch(80, 200));
  instance.当前选中编号 = 5;
  instance.拖动更新(touch(120, 240));
  instance.拖动结束();
  assert.equal(instance.遮罩列表[0].编号, 2);
});

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
