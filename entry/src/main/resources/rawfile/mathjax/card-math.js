// SPDX-License-Identifier: AGPL-3.0-or-later
// 在卡片正文之前加载；排版等待 DOM 就绪，允许模板按 Anki 约定配置 MathJax.config。
window.MathJax = {
  loader: {
    paths: { mathjax: 'https://jidecards-render.local/mathjax/3.2.2' },
    load: ['input/mml']
  },
  tex: {
    packages: ['base', 'ams', 'newcommand', 'configmacros', 'autoload', 'require', 'mhchem'],
    inlineMath: [['\\(', '\\)'], ['$', '$']],
    displayMath: [['\\[', '\\]'], ['$$', '$$']],
    processEscapes: true
  },
  svg: { fontCache: 'global' },
  options: {
    enableMenu: false,
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    ignoreHtmlClass: 'tex2jax_ignore'
  },
  startup: {
    pageReady: function () {
      return MathJax.startup.defaultPageReady().then(function () {
        document.documentElement.dataset.mathReady = 'true';
      });
    }
  }
};

// 传统 LaTeX 缺少媒体时保留源码和文件名，避免空白；不在设备上编译任意 TeX。
document.addEventListener('error', function (event) {
  var img = event.target;
  if (!img || img.tagName !== 'IMG' || !img.classList.contains('latex')) return;
  var fallback = document.createElement('span');
  fallback.className = 'latex-missing tex2jax_ignore';
  var file = img.getAttribute('src').split('/').pop();
  fallback.textContent = '⚠ ' + (img.alt || '') + ' [' + file + ']';
  img.replaceWith(fallback);
}, true);
