// SPDX-License-Identifier: AGPL-3.0-or-later
import { MATH_ASSET_BASE } from '../MathRendering';
import type { AgentTextRun } from './AgentTextFormatting';
import { parseAgentBoldRuns } from './AgentTextFormatting';

export interface AgentMathPart { kind: string; text: string; }
export interface AgentMathAppearance {
  color: string; fontSize: number; alignment: string; bold: boolean;
  tableColor?: string; headerColor?: string; borderColor?: string;
}
export const AGENT_MATH_BASE = 'https://jidecards-render.local/agent-math/';
export const AGENT_MATH_LAYOUT_PREFIX = '__JIDE_AGENT_MATH_LAYOUT__';
export interface AgentMathLayout { revision: number; width: number; height: number; failed: boolean; }

/** 只接收内置文档的尺寸回执；原生组件再核对版本、宽度和生命周期。 */
export function parseAgentMathLayout(message: string): AgentMathLayout | null {
  if (!message.startsWith(AGENT_MATH_LAYOUT_PREFIX) || message.length > 512) return null;
  try {
    const layout: AgentMathLayout = JSON.parse(message.slice(AGENT_MATH_LAYOUT_PREFIX.length)) as AgentMathLayout;
    if (layout === null || !Number.isInteger(layout.revision) || layout.revision < 0 ||
      !Number.isFinite(layout.width) || layout.width <= 0 ||
      !Number.isFinite(layout.height) || layout.height <= 0 || layout.height > 1000000 ||
      typeof layout.failed !== 'boolean') return null;
    return layout;
  } catch (_) { return null; }
}

function escaped(text: string, index: number): boolean {
  let count: number = 0;
  while (index > 0 && text[--index] === '\\') count++;
  return count % 2 === 1;
}

function closingMath(text: string, start: number, close: string): number {
  for (let index: number = start; index < text.length; index++) {
    if (close === '$' && text[index] === '\n') return -1;
    if (text.startsWith(close, index) && !escaped(text, index) &&
      (close !== '$' || (text[index - 1] !== '$' && text[index + 1] !== '$' &&
        !/\s/.test(text[index - 1]) && !/\d/.test(text[index + 1] ?? '')))) return index;
  }
  return -1;
}

/** 先保护代码和完整公式；流式未闭合公式一直保留原文，不能交给 Markdown 改写反斜杠。 */
export function agentMathParts(text: string): AgentMathPart[] {
  const parts: AgentMathPart[] = [];
  let plain: string = '';
  let index: number = 0;
  let lineStart: number = 0;
  while (index < text.length) {
    let end: number = -1;
    let kind: string = '';
    const fence: boolean = index - lineStart <= 3 && /^ {0,3}$/.test(text.slice(lineStart, index)) &&
      (text.startsWith('```', index) || text.startsWith('~~~', index));
    if (fence) {
      const marker: string = text[index];
      let length: number = 3;
      while (text[index + length] === marker) length++;
      let next: number = text.indexOf('\n', index);
      end = text.length;
      while (next >= 0) {
        const lineEnd: number = text.indexOf('\n', next + 1);
        const line: string = text.slice(next + 1, lineEnd < 0 ? text.length : lineEnd);
        const closeFence: RegExp = new RegExp('^ {0,3}' + marker + '{' + length + ',}\\s*$');
        if (closeFence.test(line)) { end = lineEnd < 0 ? text.length : lineEnd; break; }
        next = lineEnd;
      }
      kind = 'code';
    } else if (text[index] === '`' && !escaped(text, index)) {
      let length: number = 1;
      while (text[index + length] === '`') length++;
      const close: number = text.indexOf('`'.repeat(length), index + length);
      end = close < 0 ? text.length : close + length;
      kind = 'code';
    } else if (!escaped(text, index)) {
      let open: string = '';
      let close: string = '';
      if (text.startsWith('\\(', index)) { open = '\\('; close = '\\)'; }
      else if (text.startsWith('\\[', index)) { open = '\\['; close = '\\]'; }
      else if (text.startsWith('$$', index)) { open = '$$'; close = '$$'; }
      else if (text[index] === '$' && text[index - 1] !== '$' && !/\s/.test(text[index + 1] ?? '')) {
        open = '$'; close = '$';
      }
      if (open !== '') {
        const closing: number = closingMath(text, index + open.length, close);
        if (closing >= 0 && closing > index + open.length) { end = closing + close.length; kind = 'math'; }
        else if (open !== '$') {
          // 未闭合的公式尾部仍是源码，不再尝试把其中的单美元或代码符号当新起点。
          if (plain !== '') { parts.push({ kind: 'text', text: plain }); plain = ''; }
          parts.push({ kind: 'code', text: text.slice(index) }); index = text.length; continue;
        }
      }
    }
    if (end >= 0) {
      if (plain !== '') { parts.push({ kind: 'text', text: plain }); plain = ''; }
      parts.push({ kind: kind, text: text.slice(index, end) }); index = end;
      lineStart = text.lastIndexOf('\n', end - 1) + 1;
    } else {
      if (text[index] === '\n') lineStart = index + 1;
      plain += text[index++];
    }
  }
  if (plain !== '') parts.push({ kind: 'text', text: plain });
  return parts;
}

export function hasAgentMath(text: string): boolean {
  return agentMathParts(text).some((part: AgentMathPart): boolean => part.kind === 'math');
}

function htmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** innerHTML 只接收本函数转义后的标记；回复中的 HTML、脚本和 MathML 保持文字。 */
export function agentMathMarkup(text: string): string {
  return agentMathParts(text).map((part: AgentMathPart): string => {
    if (part.kind === 'math') return `<span class="agent-math" data-source="${htmlText(part.text)}">${htmlText(part.text)}</span>`;
    if (part.kind === 'code') return `<span class="tex2jax_ignore">${htmlText(part.text)}</span>`;
    return parseAgentBoldRuns(part.text).map((run: AgentTextRun): string =>
      `<span class="tex2jax_ignore">${run.bold ? '<strong>' : ''}${htmlText(run.text)}${run.bold ? '</strong>' : ''}</span>`).join('');
  }).join('');
}

function cssColor(color: string): string {
  if (/^#[\da-f]{8}$/i.test(color)) return '#' + color.slice(3) + color.slice(1, 3);
  return /^#[\da-f]{6}$/i.test(color) || /^rgba?\([\d.,\s]+\)$/.test(color) ? color : '#182230';
}

function scriptValue(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// 一个运行任务和一个最新待处理版本；已排版公式节点保留，尺寸来自内容而非 viewport/scrollHeight。
export const AGENT_MATH_RUNTIME: string = String.raw`
(function () {
  var pending = null, running = false, rendered = -1, lastMarkup = null, lastLayout = '';
  function layout(failed) {
    if (rendered < 0) return;
    var content = document.getElementById('content');
    var packet = JSON.stringify({ revision: rendered, width: innerWidth,
      height: Math.max(1, Math.ceil(content.getBoundingClientRect().height)), failed: failed === true });
    if (packet !== lastLayout) { lastLayout = packet; console.info('__JIDE_AGENT_MATH_LAYOUT__' + packet); }
  }
  function replaceMarkup(content, markup) {
    var available = new Map();
    content.querySelectorAll('.agent-math').forEach(function (node) {
      if (!node.querySelector('mjx-container') && !node.dataset.mathError) return;
      var nodes = available.get(node.dataset.source) || [];
      nodes.push(node); available.set(node.dataset.source, nodes);
    });
    var holder = document.createElement('div'); holder.innerHTML = markup;
    var added = [];
    holder.querySelectorAll('.agent-math').forEach(function (node) {
      var nodes = available.get(node.dataset.source);
      if (nodes && nodes.length) node.replaceWith(nodes.shift());
      else added.push(node);
    });
    var removed = [];
    available.forEach(function (nodes) { removed.push.apply(removed, nodes); });
    if (removed.length) MathJax.typesetClear(removed);
    content.replaceChildren.apply(content, Array.from(holder.childNodes));
    return added;
  }
  function pump() {
    if (running || !pending) return;
    running = true;
    Promise.resolve().then(function () { return MathJax.startup.promise; }).then(function () {
      var update = pending; pending = null;
      var content = document.getElementById('content');
      var positions = Array.from(content.querySelectorAll('mjx-container')).map(function (node) {
        return { node: node, left: node.scrollLeft };
      });
      var tablePositions = Array.from(content.querySelectorAll('.agent-table-scroll')).map(function (node) {
        return node.scrollLeft;
      });
      var added = update.markup === lastMarkup ? [] : replaceMarkup(content, update.markup);
      lastMarkup = update.markup;
      content.style.color = update.color; content.style.fontSize = update.size + 'px';
      content.style.textAlign = update.alignment; content.style.fontWeight = update.bold ? 'bold' : 'normal';
      content.style.setProperty('--table-color', update.tableColor);
      content.style.setProperty('--header-color', update.headerColor);
      content.style.setProperty('--border-color', update.borderColor);
      document.documentElement.dataset.renderedRevision = '';
      return (added.length ? MathJax.typesetPromise(added) : Promise.resolve()).then(function () {
        added.forEach(function (node) {
          if (node.querySelector('[data-mml-node="merror"]')) {
            node.dataset.mathError = node.textContent;
            node.textContent = node.dataset.source; node.classList.add('tex2jax_ignore');
          }
        });
        positions.forEach(function (position) { if (position.node.isConnected) position.node.scrollLeft = position.left; });
        content.querySelectorAll('.agent-table-scroll').forEach(function (node, index) {
          if (tablePositions[index] !== undefined) node.scrollLeft = tablePositions[index];
        });
        rendered = update.revision;
        document.documentElement.dataset.renderedRevision = String(rendered);
        layout(false);
      }).catch(function (error) {
        document.documentElement.dataset.mathError = String(error);
        added.forEach(function (node) {
          node.dataset.mathError = String(error); node.textContent = node.dataset.source; node.classList.add('tex2jax_ignore');
        });
        rendered = update.revision;
        document.documentElement.dataset.renderedRevision = String(rendered);
        layout(false);
      });
    }).catch(function (error) {
      document.documentElement.dataset.mathError = String(error);
      rendered = pending ? pending.revision : Math.max(0, rendered);
      pending = null; layout(true);
    }).finally(function () { running = false; pump(); });
  }
  window.jideAgentMathUpdate = function (revision, markup, color, size, alignment, bold, tableColor, headerColor, borderColor) {
    pending = { revision: revision, markup: markup, color: color, size: size, alignment: alignment, bold: bold,
      tableColor: tableColor, headerColor: headerColor, borderColor: borderColor };
    pump();
  };
  document.addEventListener('DOMContentLoaded', function () {
    new ResizeObserver(function () { if (!running) layout(false); }).observe(document.getElementById('content'));
  });
  window.addEventListener('resize', function () { if (!running) layout(false); });
  document.addEventListener('click', function (event) {
    if (event.target.closest('a')) event.preventDefault();
  });
})();`;

export function agentMathUpdateScript(text: string, appearance: AgentMathAppearance, revision: number,
  markup: string = agentMathMarkup(text)): string {
  const size: number = Math.max(8, Math.min(80, appearance.fontSize));
  const alignment: string = ['left', 'center', 'right'].includes(appearance.alignment) ? appearance.alignment : 'left';
  return `window.jideAgentMathUpdate(${revision},${scriptValue(markup)},${scriptValue(cssColor(appearance.color))},` +
    `${size},${scriptValue(alignment)},${appearance.bold ? 'true' : 'false'},` +
    `${scriptValue(cssColor(appearance.tableColor ?? '#ffffff'))},` +
    `${scriptValue(cssColor(appearance.headerColor ?? '#f6f7fa'))},` +
    `${scriptValue(cssColor(appearance.borderColor ?? '#e1e4ea'))});`;
}

export function agentMathHtml(text: string, appearance: AgentMathAppearance, markup: string = agentMathMarkup(text)): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-jide-agent-math' ${MATH_ASSET_BASE}tex-svg-full.js; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<style>html,body{margin:0;padding:0;background:transparent}#content{display:flow-root;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
.agent-prose+.agent-prose,.agent-prose+.agent-table-scroll,.agent-table-scroll+.agent-prose{margin-top:8px}
.agent-table-scroll{width:100%;overflow-x:auto;white-space:normal}
.agent-table{width:100%;border-collapse:collapse;table-layout:fixed;box-sizing:border-box;background:var(--table-color);border:1px solid var(--border-color)}
.agent-table th,.agent-table td{min-width:124px;padding:10px;vertical-align:top;white-space:pre-wrap;border-bottom:1px solid var(--border-color)}
.agent-table th{background:var(--header-color);font-weight:bold}
.agent-math{white-space:normal}mjx-container{max-width:100%;overflow-x:auto;overflow-y:hidden;padding:2px 0}
mjx-container[display="true"]{display:block;text-align:left!important;margin:8px 0!important}</style>
<script nonce="jide-agent-math">
window.MathJax={loader:{paths:{mathjax:'${MATH_ASSET_BASE.slice(0, -1)}'}},
tex:{packages:['base','ams','newcommand','configmacros','mhchem','noundefined'],
inlineMath:[['\\\\(','\\\\)'],['$','$']],displayMath:[['\\\\[','\\\\]'],['$$','$$']],
processEscapes:true,processEnvironments:false,processRefs:false,maxMacros:1000,maxBuffer:8192},
svg:{fontCache:'local'},options:{enableMenu:false,ignoreHtmlClass:'tex2jax_ignore'},startup:{typeset:false}};
${AGENT_MATH_RUNTIME}
</script><script nonce="jide-agent-math" src="${MATH_ASSET_BASE}tex-svg-full.js"></script></head>
<body><div id="content">${markup}</div>
<script nonce="jide-agent-math">${agentMathUpdateScript(text, appearance, 0, markup)}</script></body></html>`;
}
