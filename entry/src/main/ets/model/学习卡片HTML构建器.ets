// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-STUDY-HTML-001
// @名称 学习页卡片 HTML 构建器
//
// @作用
// 渲染节点流 → 学习页 HTML 的纯函数积木（M7）。
// 不依赖后端 / Web 组件，可独立单元测试。
//
// 媒体路径策略：Anki 卡片 HTML 中媒体以相对文件名引用（<img src="foo.png">）。
// ArkWeb 对 file/resource 协议跨域请求一律拦截（官方文档：本地资源跨域），
// 因此把相对文件名重写为自建 https 域名 媒体基地址，由 StudyPage 的
// onInterceptRequest 拦截并映射到沙箱 collection.media/ 目录。
// 依据：developer.huawei.com ArkWeb「本地资源跨域」章节 + 社区示例。
//
// @输入
// rendered: RenderedCard - 后端渲染的卡片节点流
// side: 卡片正反面 - 'question' 或 'answer'
// nodes: TemplateNode[] - 模板节点流（提取拼写标记用）
// html: string - 待剥除/注入的 HTML 文本
// resultHtml: string - 拼写比对结果 HTML
//
// @输出
// 重写媒体地址(html): string
// 原始侧HTML(rendered, side): string
// 构建卡片HTML(rendered, side): string
// 提取拼写标记(nodes): 拼写标记 | null
// 剥除拼写标记(html): string
// 注入拼写结果(html, resultHtml): string
//
// @业务规则
// 'question' / 'answer' 是 CardSide 字符串字面量联合类型的值，
// 同时也是与后端协议的字段语义，保留英文，不可中文化。
// 媒体基地址 'https://jidecards-media.local/' 是自建拦截锚点，保留英文。
//
// @副作用
// 无。全部为纯函数。
//
// @注意
// 修改这里可能影响学习页卡片渲染、媒体加载、拼写题功能。
// ========================================================

import type { RenderedCard, TemplateNode } from '../proto/messages/CardRenderingMessages';

// ========================================================
// @块ID MODEL-STUDY-HTML-002
// @名称 媒体基地址
//
// @作用
// 自建媒体域名（onInterceptRequest 拦截锚点），不与真实域名冲突。
//
// @输入
// 无（常量定义）
//
// @输出
// string：'https://jidecards-media.local/'
//
// @业务规则
// 此 URL 是自建拦截锚点，保留英文，不可中文化。
//
// @副作用
// 无
// ========================================================
export const 媒体基地址: string = 'https://jidecards-media.local/';

// ========================================================
// @块ID MODEL-STUDY-HTML-003
// @名称 卡片正反面
//
// @作用
// 卡片正反面类型：抽出 type alias 避免 ArkTS 在函数签名中直接展开字符串字面量联合
// 引发类型推断告警。
//
// @输入
// 无（类型定义）
//
// @输出
// 字符串字面量联合类型：'question' | 'answer'
//
// @业务规则
// 'question' / 'answer' 是与后端协议的字段语义值，保留英文。
//
// @副作用
// 无
// ========================================================
export type 卡片正反面 = 'question' | 'answer';

const 基础样式: string = `
body {
  margin: 0;
  padding: 20px 16px;
  font-family: sans-serif;
  font-size: 17px;
  line-height: 1.6;
  color: #1A1A1A;
  background: transparent;
  text-align: center;
  word-wrap: break-word;
}
img { max-width: 100%; height: auto; }
a { color: #2E6BE6; }
hr { opacity: 0.3; }
.sound-flag { color: #2E6BE6; font-size: 0.75em; }
.nightMode body, body.nightMode { color: #E6E6E6; }
#typeans { white-space: pre-wrap; font-family: monospace; display: inline-block; text-align: left; }
.typeGood { color: #0a7d20; }
.typeBad { color: #c62828; }
.typeMissed { color: #888; }
#typearrow { color: #888; }
`;

// ========================================================
// @块ID MODEL-STUDY-HTML-004
// @名称 重写媒体地址
//
// @作用
// 把卡片正文中的相对媒体文件名重写为 媒体基地址 绝对地址。
//
// @输入
// html: string - 原始 HTML
//
// @输出
// string：重写后的 HTML（src / href 相对路径被替换为 媒体基地址 + 文件名）
//
// @业务规则
// href 以 '#' 开头的锚点链接不重写。
//
// @副作用
// 无
// ========================================================
export function 重写媒体地址(html: string): string {
  return html
    .replace(/(src\s*=\s*")([^":/][^":]*)"/g, (_匹配: string, 前缀: string, 文件名: string): string => {
      return `${前缀}${媒体基地址}${encodeURIComponent(文件名)}"`;
    })
    .replace(/(href\s*=\s*")([^":/][^":]*)"/g, (_匹配: string, 前缀: string, 文件名: string): string => {
      if (文件名.startsWith('#')) {
        return `${前缀}${文件名}"`;
      }
      return `${前缀}${媒体基地址}${encodeURIComponent(文件名)}"`;
    });
}

/** 节点流 → HTML 片段：text 节点为模板原文，replacement 节点为后端已渲染的字段 HTML */
function 节点流转HTML(节点列表: TemplateNode[]): string {
  const 片段: string[] = [];
  for (const 节点 of 节点列表) {
    if (节点.text !== null) {
      片段.push(节点.text);
    } else if (节点.replacement !== null) {
      片段.push(节点.replacement.currentText);
    }
  }
  return 片段.join('');
}

// ========================================================
// @块ID MODEL-STUDY-HTML-005
// @名称 原始侧HTML
//
// @作用
// 一侧卡片的原始字段 HTML（未剥标签、未重写地址），供后端 ExtractAvTags 提取音频。
//
// @输入
// rendered: RenderedCard - 后端渲染的卡片
// side: 卡片正反面 - 'question' 取正面节点流，'answer' 取背面节点流
//
// @输出
// string：原始字段 HTML
//
// @副作用
// 无
// ========================================================
export function 原始侧HTML(渲染结果: RenderedCard, 侧面: 卡片正反面): string {
  const 节点列表: TemplateNode[] = 侧面 === 'question' ? 渲染结果.questionNodes : 渲染结果.answerNodes;
  return 节点流转HTML(节点列表);
}

/** 视频扩展名正则：匹配 [sound:xxx.mp4] 等视频文件，由 webview <video> 内联播放。
 *  Anki 约定音视频统一走 [sound:] 语法，前端按扩展名分流：视频交 webview，音频交原生 SoundPlayer。 */
const 视频扩展名正则: RegExp = /\.(mp4|webm|mov|m4v|ogv)$/i;

/** 剥除 Anki [sound:xxx] 标签：音频文件留小标记由原生 SoundPlayer 播放；
 *  视频文件改用 <video> 标签交给 webview 内联播放（playsinline 防止全屏跳转）。 */
function 剥除音频标签(html: string): string {
  return html.replace(/\[sound:([^\]]+)\]/g, (_匹配: string, 文件名: string): string => {
    if (视频扩展名正则.test(文件名)) {
      return `<video src="${媒体基地址}${encodeURIComponent(文件名)}" controls playsinline style="max-width:100%;display:block;margin:8px auto"></video>`;
    }
    return '<span class="sound-flag">♪</span>';
  });
}

// ========================================================
// @块ID MODEL-STUDY-HTML-011
// @名称 ImageOcclusion 渲染样式
//
// @作用
// 为 ImageOcclusion 笔记类型卡片提供 container / img / canvas 的定位样式，
// 使 canvas 能叠加在 img 上方绘制遮罩。仅在含 #image-occlusion-container
// 的卡片上生效，Basic / Cloze 卡片不受影响。
//
// @输入
// 无（常量定义）
//
// @输出
// string：CSS 文本，拼接到 构建卡片HTML 输出的 <style> 末尾
//
// @业务规则
// Anki 桌面端通过全局 reviewer.scss 提供 #image-occlusion-container 的
// position:relative 与 img/canvas 的 position:absolute 定位；jidecards
// 复习页无此全局样式，需随卡片 HTML 一起注入。
//
// @副作用
// 无
// ========================================================
const 图片遮罩渲染样式: string = `
#image-occlusion-container {
  position: relative;
  display: inline-block;
  max-width: 100%;
}
#image-occlusion-container img {
  display: block;
  max-width: 100%;
  height: auto;
}
#image-occlusion-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
`;

// ========================================================
// @块ID MODEL-STUDY-HTML-012
// @名称 ImageOcclusion 渲染脚本
//
// @作用
// 定义 window.anki.imageOcclusion.setup() 与 toggle()，供 ImageOcclusion 笔记类型
// qfmt/afmt 中的 <script>anki.imageOcclusion.setup()</script> 调用，
// 以及 afmt 中 <button id="toggle"> 的点击切换遮罩。
// 在 canvas 上按 cloze 数据绘制矩形遮罩：正面用不透明粉色盖住区域，
// 背面用透明填充揭示原图。仅在含 #image-occlusion-canvas 的卡片上生效。
//
// @输入
// 无（自包含脚本，运行时从 DOM 读取 cloze 数据）
//
// @输出
// string：以 <script>...</script> 包裹的 JS 文本，拼接到 构建卡片HTML
// 输出的 <head> 末尾
//
// @业务规则
// cloze 数据格式（Anki rslib/src/cloze.rs render_image_occlusion 产出）：
//   <div class="cloze" data-ordinal="1" data-shape="rect"
//        data-left="0.20" data-top="0.30" data-width="0.40"
//        data-height="0.10"></div>
// left/top/width/height 为 0-1 归一化坐标，乘以 canvas 像素尺寸得绘制坐标。
// 三类 cloze class 对应三种绘制模式：
//   .cloze            — 正面当前 ordinal，默认不透明粉色 #ff8e8e，toggle 后透明
//   .cloze-inactive   — 其他 ordinal，仅 data-occludeinactive="1" 时绘制
//   .cloze-highlight  — 背面当前 ordinal，透明填充揭示原图
// 仅实现 rect 形状（spec §4 限定），ellipse/polygon/text 忽略。
//
// 上游 afmt 模板（rslib/src/image_occlusion/notetype.rs）的切换按钮 HTML：
//   <div><button id="toggle">Toggle Masks</button></div>
// 按钮无 onclick 属性，由本脚本在 setup() 中查找 #toggle 后隐藏（2026-07-28 暂停切换功能）。
// toggle() 方法保留，hidden 变量保留，redraw 中 hidden 逻辑保留，不破坏 IIFE 结构。
// 后续恢复切换遮罩功能时：去掉 btn.style.display='none'，重新绑事件即可。
// 防重定义：if (window.anki.imageOcclusion) return 避免重定义对象导致 hidden 状态丢失。
//
// @副作用
// 无（脚本在 webview 内执行，操作 DOM/canvas）
// ========================================================
const 图片遮罩渲染脚本: string = `<script>
(function () {
  window.anki = window.anki || {};
  if (window.anki.imageOcclusion) { return; }
  var hidden = true;
  function drawRects(ctx, canvas, selector, fill, drawAll) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.tagName !== 'DIV') { continue; }
      if (node.dataset.shape !== 'rect') { continue; }
      var left = parseFloat(node.dataset.left);
      var top = parseFloat(node.dataset.top);
      var width = parseFloat(node.dataset.width);
      var height = parseFloat(node.dataset.height);
      if (!isFinite(left) || !isFinite(top) || !isFinite(width) || !isFinite(height)) { continue; }
      if (width <= 0 || height <= 0) { continue; }
      if (!drawAll && node.dataset.occludeinactive !== '1') { continue; }
      ctx.fillStyle = fill;
      ctx.fillRect(
        Math.round(left * canvas.width),
        Math.round(top * canvas.height),
        Math.round(width * canvas.width),
        Math.round(height * canvas.height)
      );
    }
  }
  function redraw() {
    var canvas = document.querySelector('#image-occlusion-canvas');
    var img = document.querySelector('#image-occlusion-container img');
    if (!canvas || !img || !img.complete || !img.naturalWidth) { return; }
    var w = img.naturalWidth, h = img.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) { return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var clozeFill = hidden ? '#ff8e8e' : 'rgba(255,142,142,0)';
    drawRects(ctx, canvas, '.cloze', clozeFill, true);
    drawRects(ctx, canvas, '.cloze-inactive', '#ffeba2', false);
    drawRects(ctx, canvas, '.cloze-highlight', 'rgba(255,142,142,0)', true);
  }
  window.anki.imageOcclusion = {
    setup: function () {
      var canvas = document.querySelector('#image-occlusion-canvas');
      if (!canvas) { return; }
      var img = document.querySelector('#image-occlusion-container img');
      if (!img) {
        var err = document.getElementById('err');
        if (err) { err.innerHTML = 'No image to show'; }
        return;
      }
      if (img.complete && img.naturalWidth) {
        redraw();
      } else {
        img.addEventListener('load', redraw);
        img.addEventListener('error', redraw);
      }
      var btn = document.getElementById('toggle');
      if (btn) {
        // 暂时隐藏「切换遮罩」按钮（2026-07-28）：
        // Web focusable(false) 下 click/touchend 都存在事件转发问题，toggle 无法稳定触发。
        // 后续若恢复切换遮罩功能，去掉 display='none' 并重新绑事件即可。
        // 保留 toggle 方法 + hidden 变量 + redraw 中的 hidden 逻辑，不破坏 IIFE 结构。
        btn.style.display = 'none';
      }
    },
    toggle: function () {
      hidden = !hidden;
      redraw();
    }
  };
})();
</script>`;

// ========================================================
// @块ID MODEL-STUDY-HTML-013
// @名称 数学公式渲染脚本（MathJax）
//
// @作用
// 在 <head> 注入 MathJax 3.x 配置 + 异步加载脚本，让 webview 自动渲染
// \(...\) \[...\] $...$ $$...$$ 四类 LaTeX 公式分隔符。
//
// @输入
// 无（自包含脚本，由 构建卡片HTML 拼到 <head> 末尾）
//
// @输出
// string：以 <script>...</script> 包裹的 JS 文本
//
// @业务规则
// - 仅在 RenderedCard.latexSvg=false 时注入：latexSvg=true 表示后端已把 LaTeX
//   编译成 SVG 嵌入正文（如安装了 TeX Live 的桌面端导出的卡片），前端再注入
//   MathJax 会重复处理已渲染的 SVG，浪费性能。
// - CDN 走 jsdelivr（应用已申请 ohos.permission.INTERNET）；async 异步加载，
//   网络失败时降级为原始 LaTeX 文本展示，不阻塞卡片渲染。
// - skipHtmlTags 避免 MathJax 扫描 <script>/<pre>/<code> 等代码块内的反斜杠。
// - inlineMath/displayMath 同时配置 \(...\) 与 $...$ 两套分隔符，覆盖 Anki 桌面端
//   reviewer 默认配置 + 社区牌组常见写法。
//
// @副作用
// 无（脚本在 webview 内执行，操作 DOM）
// ========================================================
const 数学公式脚本: string = `<script>
window.MathJax = {
  tex: {
    inlineMath: [['\\\\(', '\\\\)'], ['$', '$']],
    displayMath: [['\\\\[', '\\\\]'], ['$$', '$$']]
  },
  svg: { fontCache: 'global' },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

// ========================================================
// @块ID MODEL-STUDY-HTML-014
// @名称 可折叠字段样式与脚本
//
// @作用
// 为 .anki-collapsible class 提供"长内容默认折叠 + 点击展开"能力，对齐
// AnkiDroid 的 Collapsible Fields 功能；同时美化原生 <details>/<summary>
// 让卡片模板里用 HTML5 折叠元素也有一致样式。
//
// @输入
// 无（自包含 CSS+JS，由 构建卡片HTML 拼到 <style> 与 <head> 末尾）
//
// @输出
// string：CSS 文本（拼到 <style> 末尾）与 <script> 脚本（拼到 <head> 末尾）
//
// @业务规则
// - 不自动检测长字段：避免破坏现有卡片渲染。用户在卡片模板里用
//   <div class="anki-collapsible">...长内容...</div> 主动声明需折叠的字段。
// - 默认 max-height: 200px 折叠；点击 toggle 按钮切换 expanded 状态。
// - toggle 按钮文案用 ▼/▲ 字符避免 i18n（model 层不能用 $r）。
// - IIFE 防重定义：if (window.ankiCollapsibleInit) return 防止翻面/切卡时
//   重复绑定按钮导致每张卡出现多个 toggle。
// - setup 幂等：data-anki-init 标记防止单个 .anki-collapsible 元素被绑多次。
// - 兼容 DOMContentLoaded 已触发场景（loadData 注入 HTML 后 readyState
//   可能已是 complete，监听 DOMContentLoaded 不会触发，需立即执行 initAll）。
//
// @副作用
// 无（脚本在 webview 内执行，操作 DOM）
// ========================================================
const 可折叠字段样式: string = `
.anki-collapsible {
  max-height: 200px;
  overflow: hidden;
  position: relative;
  margin: 8px 0;
  padding: 8px 12px;
  background: rgba(128, 128, 128, 0.06);
  border-radius: 8px;
}
.anki-collapsible.expanded { max-height: none; }
.anki-collapsible-toggle {
  display: block;
  text-align: center;
  padding: 6px;
  color: #2E6BE6;
  cursor: pointer;
  font-size: 0.85em;
  user-select: none;
}
.anki-collapsible-toggle::before {
  content: '▶';
  display: inline-block;
  margin-right: 4px;
  transition: transform 150ms ease-out;
}
.anki-collapsible-toggle.expanded::before { transform: rotate(90deg); }
details {
  margin: 8px 0;
  padding: 8px 12px;
  background: rgba(128, 128, 128, 0.06);
  border-radius: 8px;
}
details > summary {
  cursor: pointer;
  font-weight: 500;
  list-style: none;
}
details > summary::-webkit-details-marker { display: none; }
details > summary::before {
  content: '▶';
  display: inline-block;
  margin-right: 6px;
  transition: transform 150ms ease-out;
}
details[open] > summary::before { transform: rotate(90deg); }
`;

const 可折叠字段脚本: string = `<script>
(function () {
  if (window.ankiCollapsibleInit) { return; }
  window.ankiCollapsibleInit = true;
  function setup(el) {
    if (el.dataset.ankiInit === '1') { return; }
    el.dataset.ankiInit = '1';
    el.classList.add('collapsed');
    var btn = document.createElement('div');
    btn.className = 'anki-collapsible-toggle';
    btn.addEventListener('click', function () {
      var expanded = el.classList.toggle('expanded');
      el.classList.toggle('collapsed', !expanded);
      btn.classList.toggle('expanded', expanded);
    });
    if (el.parentNode) { el.parentNode.insertBefore(btn, el.nextSibling); }
  }
  function initAll() {
    var nodes = document.querySelectorAll('.anki-collapsible');
    for (var i = 0; i < nodes.length; i++) { setup(nodes[i]); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
</script>`;

// ========================================================
// @块ID MODEL-STUDY-HTML-006
// @名称 构建卡片HTML
//
// @作用
// 组装学习页完整 HTML 文档。
//
// @输入
// rendered: RenderedCard - 后端渲染的卡片
// side: 卡片正反面 - 'question' 取正面节点流，'answer' 取背面节点流；
//   背面节点流在 Anki 模板中通常已包含正面（{{FrontSide}}），直接渲染即可。
//
// @输出
// string：完整 HTML 文档字符串
//
// @业务规则
// 模板 CSS（rendered.css）在前，基础兜底 CSS 在后做最低可读保障。
// 字段中的 [sound:xxx] 标签剥除为小标记，
// 音频由原生 SoundPlayer 播放（真机 Web 自动播放无声）。
// ImageOcclusion 渲染样式追加在 <style> 末尾；IIFE 脚本放在 <head> 末尾，
// 因为 qfmt/afmt 模板内联 <script>anki.imageOcclusion.setup()</script> 在 正文 中，
// 必须在 qfmt 脚本执行前先定义 window.anki.imageOcclusion，否则抛 ReferenceError。
// ArkWeb 对 <body> 起始处的内联脚本存在执行时序抖动（BUG-001），
// 移到 <head> 后由解析器在 body 解析前同步执行，时序稳定。
// 无 #image-occlusion-canvas 时 setup() 直接返回，Basic / Cloze 卡片零影响。
//
// @副作用
// 无
// ========================================================
export function 构建卡片HTML(渲染结果: RenderedCard, 侧面: 卡片正反面): string {
  const 正文: string = 剥除音频标签(重写媒体地址(原始侧HTML(渲染结果, 侧面)));
  const 样式: string = `${渲染结果.css}\n${基础样式}\n${图片遮罩渲染样式}\n${可折叠字段样式}`;
  // latexSvg=true：后端已把 LaTeX 编译成 SVG 嵌入正文，前端不再注入 MathJax 避免重复处理。
  // latexSvg=false：注入 MathJax（async 异步加载）扫描 \(...\) \[...\] $...$ $$...$$ 公式；
  // 加载失败降级为原始 LaTeX 文本，不阻塞卡片渲染。
  const 数学脚本: string = 渲染结果.latexSvg ? '' : 数学公式脚本;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${样式}</style>
${图片遮罩渲染脚本}
${数学脚本}
${可折叠字段脚本}
</head>
<body class="card">${正文}</body>
</html>`;
}

// ========================================================
// @块ID MODEL-STUDY-HTML-007
// @名称 拼写标记
//
// @作用
// [[type:FieldName]] 标记解析结果。
//
// @输入
// 无（数据结构定义）
//
// @输出
// 字段：
// fieldName - 字段名
// combining - 控制是否 NFC 归一化
// cloze - 标记本期不实现
//
// @副作用
// 无
// ========================================================
export interface 拼写标记 {
  fieldName: string;
  combining: boolean;
  cloze: boolean;
}

// ========================================================
// @块ID MODEL-STUDY-HTML-008
// @名称 提取拼写标记
//
// @作用
// 检测节点流中首个 [[type:...]] 标记，返回字段名与模式（combining/cloze）。
//
// @输入
// nodes: TemplateNode[] - 模板节点流
//
// @输出
// 拼写标记 | null：无标记返回 null
//
// @业务规则
// - mode === 'nc'：fieldName 取 second，combining=false，cloze=false
// - mode === 'cloze'：fieldName 取 second，combining=true，cloze=true
// - 其他：fieldName 取 mode，combining=true，cloze=false
// - 字段名段用 [^\]:]+ 宽松匹配：上游按建库时本地化字段名原样发出标记
//   （如中文环境 [[type:背面]] / [[type:cloze:文字]]），ASCII 正则会漏检导致拼写输入静默失效。
// - 标记在 text 节点而非 replacement：上游 type 过滤器由后端消费（apply_filters 返回
//   remaining_filters=[]），render_into 走 append_str_to_nodes 输出 RenderedNode::Text——
//   只扫 replacement.currentText 会永远漏检（Text/Replacement 两种节点都要扫）。
//
// @副作用
// 无
// ========================================================
export function 提取拼写标记(节点列表: TemplateNode[]): 拼写标记 | null {
  const 正则 = /\[\[type:([^\]:]+)(?::([^\]:]+))?\]\]/;
  for (const 节点 of 节点列表) {
    const 节点文本: string | null = 节点.text !== null
      ? 节点.text
      : (节点.replacement !== null ? 节点.replacement.currentText : null);
    if (节点文本 !== null) {
      const 匹配: RegExpMatchArray | null = 节点文本.match(正则);
      if (匹配 !== null) {
        const 模式: string = 匹配[1];
        const 第二段: string | undefined = 匹配[2];
        if (模式 === 'nc') {
          const 结果: 拼写标记 = { fieldName: 第二段 ?? '', combining: false, cloze: false };
          return 结果;
        }
        if (模式 === 'cloze') {
          const 结果: 拼写标记 = { fieldName: 第二段 ?? '', combining: true, cloze: true };
          return 结果;
        }
        const 结果: 拼写标记 = { fieldName: 模式, combining: true, cloze: false };
        return 结果;
      }
    }
  }
  return null;
}

// ========================================================
// @块ID MODEL-STUDY-HTML-009
// @名称 剥除拼写标记
//
// @作用
// 剥除 HTML 中所有 [[type:...]] 标记（正面不显示输入框占位）。
//
// @输入
// html: string - 待处理的 HTML
//
// @输出
// string：剥除标记后的 HTML
//
// @副作用
// 无
// ========================================================
export function 剥除拼写标记(html: string): string {
  return html.replace(/\[\[type:[^\]]+\]\]/g, '');
}

// ========================================================
// @块ID MODEL-STUDY-HTML-010
// @名称 注入拼写结果
//
// @作用
// 将 HTML 中首个 [[type:...]] 标记替换为比对结果 HTML（背面注入 diff）。
//
// @输入
// html: string - 待注入的 HTML
// resultHtml: string - 拼写比对结果 HTML（已转义，不再二次转义）
//
// @输出
// string：注入结果后的 HTML
//
// @副作用
// 无
// ========================================================
export function 注入拼写结果(html: string, 结果HTML: string): string {
  return html.replace(/\[\[type:[^\]]+\]\]/, 结果HTML);
}
