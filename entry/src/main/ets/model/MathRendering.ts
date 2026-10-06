// SPDX-License-Identifier: AGPL-3.0-or-later

/** 内置脚本独占域名，不与导入牌组的 collection.media 文件重名。 */
export const MATH_ASSET_BASE = 'https://jidecards-render.local/mathjax/3.2.2/';

/** 同步定义 MathJax，保证正文内 Anki 自定义宏脚本执行时 config 已存在。 */
export const MATH_SCRIPTS = `<script src="${MATH_ASSET_BASE}card-math.js"></script>
<script id="MathJax-script" src="${MATH_ASSET_BASE}tex-svg-full.js"></script>`;

/** 无公式的静态卡面跳过大引擎；两面和 CSS 一起判断，保证翻面仍可排版。 */
export function cardMathScripts(question: string, answer: string, css: string): string {
  const content: string = question + answer + css;
  // 模板脚本、事件属性可能生成公式或调用 MathJax；实体也可能编码公式分隔符。
  const needsEngine: boolean = /\\|\$|<\s*(?:math|script|iframe|object|embed)\b|\bon\w+\s*=|javascript\s*:|MathJax|&#|&(?:bsol|dollar|lpar|rpar|lbrack|rbrack);/i.test(content);
  return needsEngine ? MATH_SCRIPTS : `<script src="${MATH_ASSET_BASE}card-math.js"></script>`;
}
