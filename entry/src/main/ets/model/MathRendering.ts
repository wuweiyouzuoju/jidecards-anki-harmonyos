// SPDX-License-Identifier: AGPL-3.0-or-later

/** 内置脚本独占域名，不与导入牌组的 collection.media 文件重名。 */
export const MATH_ASSET_BASE = 'https://jidecards-render.local/mathjax/3.2.2/';

/** 同步定义 MathJax，保证正文内 Anki 自定义宏脚本执行时 config 已存在。 */
export const MATH_SCRIPTS = `<script src="${MATH_ASSET_BASE}card-math.js"></script>
<script id="MathJax-script" src="${MATH_ASSET_BASE}tex-svg-full.js"></script>`;
