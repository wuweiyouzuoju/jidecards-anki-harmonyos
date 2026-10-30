/* 双链引用 —— 卡片端脚本（内联进卡片，不依赖 jQuery）
 *
 * 2026-10-18 修复：buildFloat() 之前用 `if (document.getElementById('ml-float')) return;`
 * 兜底，导致复习界面 webview 复用时旧按钮还挂在 DOM 上、其 hard-code 的
 * `ml:openLinks:<旧guid>` 跟着发出去——切到下一张卡片后再点「关联卡片」
 * 弹出来的还是上一张的关联面板。修法是重建时先 remove 旧节点、点击时
 * 实时从 window.__ML_DATA__ 读最新 guid。
 *
 * 2026-10-18 重构：复习界面关联条目点击直接打开目标卡的「关联」dialog
 * （openLinks verb），不再走「打开预览面板 → 再点浏览器」的两段式中转。
 *
 * 2026-10-18 删助记：复习界面悬浮按钮只剩「🌐 浏览器中显示关联」一个，
 * 直接发 ml:openLinksInBrowser:<guid> 给 Python 端 _on_js_message。
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- mlxGo
   * 笔记「关联」字段里渲染出的镜像行（mirror.py 写的那份 HTML）会带
   *   onclick="mlxGo(event)"
   * 定义必须放在下面 `if (!D || !D.guid) return;` 守卫**之前**——
   * 字段优先模式下 card_inject 会跳过注入块，但脚本仍会注入；
   * 若早期 return 掉，mlxGo 就是 undefined，点击直接报错、毫无反应。
   *
   * 行为：
   *   单击 → ml:preview:<nid>   跳到目标卡预览（用户要的「点击跳转」）
   *   双击 → ml:openLinks:<guid> 打开目标卡关联弹窗
   */
  window.mlxGo = function (ev) {
    try {
      var el = (ev && (ev.currentTarget || ev.target)) || null;
      if (el && !el.getAttribute && el.closest) {
        el = el.closest('.ml-mirror-row') || el;
      }
      if (!el || !el.getAttribute) return;
      if (ev && ev.stopPropagation) ev.stopPropagation();
      var nid = el.getAttribute('data-nid');
      var g = el.getAttribute('data-guid');
      if (!nid) {
        if (g) pycmd('ml:openLinks:' + g);
        return;
      }
      if (el.__mlT) {
        clearTimeout(el.__mlT);
        el.__mlT = null;
        if (g) pycmd('ml:openLinks:' + g);
        return;
      }
      el.__mlT = setTimeout(function () {
        el.__mlT = null;
        pycmd('jl:preview:' + encodeURIComponent(g));
      }, 210);
    } catch (e) {}
  };

  // Delegated, replaceable binding also works when only inline references are shown.
  if (window.__jlInlineClick) document.removeEventListener('click', window.__jlInlineClick, true);
  window.__jlInlineClick = function (ev) {
    var anchor = ev.target.closest && ev.target.closest('a[href^="#jide-note:"]');
    if (!anchor) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    try { pycmd('jl:preview:' + encodeURIComponent(decodeURIComponent(anchor.getAttribute('href').slice(11)))); } catch (e) {}
  };
  document.addEventListener('click', window.__jlInlineClick, true);

  try {
    var D = window.__ML_DATA__;
    if (!D || !D.guid) return;

    /* 取最新数据快照：避免闭包里的 D 是上一张卡的 */
    function curData() {
      return window.__ML_DATA__ || D;
    }
    function curGuid() {
      var d = curData();
      return (d && d.guid) ? d.guid : '';
    }

    /* 折叠面板：块头点击收起/展开 */
    function bindCollapse() {
      var heads = document.querySelectorAll('#ml-root .ml-block-head');
      for (var i = 0; i < heads.length; i++) {
        (function (h) {
          if (h.__mlBound) return;
          h.__mlBound = true;
          h.addEventListener('click', function () {
            var blk = h.parentNode;
            if (blk && blk.classList) blk.classList.toggle('ml-collapsed');
          });
        })(heads[i]);
      }
    }

    /* 关联条目点击：
     *   单击 → ml:preview:<nid>  跳到目标卡预览（双链的「跳转」语义）
     *   双击 → ml:openLinks:<guid> 打开目标卡的关联 dialog（编辑用）
     *
     * 2026-10-21 修复：此前这里只有 `ml:openLinks:` 一条路径，
     * 而 `data-nid` 早就写在 HTML 里却从没被读取 —— 于是「点击跳转」
     * 实际变成了「点开弹窗」，用户侧表现为跳转功能消失。
     * Python 端 `ml:preview` 分支（_on_js_message）一直是好的。
     */
    function bindLinks() {
      var items = document.querySelectorAll('#ml-root .ml-link-item');
      for (var i = 0; i < items.length; i++) {
        (function (el) {
          if (el.__mlBound) return;
          el.__mlBound = true;
          el.addEventListener('click', function (ev) {
            if (ev) ev.stopPropagation();
            var g = el.getAttribute('data-guid');
            var nid = el.getAttribute('data-nid');
            if (!nid) {
              /* 无 nid 时退回旧行为 */
              if (g) pycmd('ml:openLinks:' + g);
              return;
            }
            if (el.__mlT) {
              /* 第二次点击 = 双击 → 打开关联 dialog */
              clearTimeout(el.__mlT);
              el.__mlT = null;
              if (g) pycmd('ml:openLinks:' + g);
              return;
            }
            el.__mlT = setTimeout(function () {
              el.__mlT = null;
              pycmd('jl:preview:' + encodeURIComponent(g));
            }, 210);
          });
        })(items[i]);
      }
    }

    /* 悬浮按钮 —— 两个：
     *   1. 「关联」     → 打开 dialog，编辑/添加/删除我引用与引用我
     *   2. 「🌐 浏览器」 → 只读视图，把本卡 + 全部关联放进 Anki 浏览器
     *
     *   1. 先把 DOM 里残留的旧 #ml-float 摘掉，避免 webview 复用时遗留
     *   2. pycmd 前缀挂在按钮上，guid 在点击瞬间从 window.__ML_DATA__ 取最新值
     */
    function buildFloat() {
      var data = curData();
      if (!data.buttons) return;
      /* 摘掉旧的——即使还在挂着，参数是上张卡的 guid，必须清掉 */
      var old = document.getElementById('ml-float');
      if (old && old.parentNode) old.parentNode.removeChild(old);

      var bar = document.createElement('div');
      bar.id = 'ml-float';
      var p = data.pos || 'bottom-right';
      bar.className = { 'bottom-right': 'ml-br', 'bottom-left': 'ml-bl', 'top-right': 'ml-tr', 'top-left': 'ml-tl' }[p] || 'ml-br';

      function mk(label, title, has, prefix) {
        var b = document.createElement('button');
        b.className = 'ml-btn' + (has ? ' has' : '');
        b.type = 'button';
        b.innerHTML = '<span class="ml-dot"></span>' + label;
        b.title = title;
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          /* 每次点击都用最新的 guid，避免旧按钮残留导致的"打开的是上张卡" */
          pycmd(prefix + curGuid());
        });
        return b;
      }

      var hasLinks = !!(data.outCount || data.inCount);
      bar.appendChild(mk(
        data.lkLabel || '关联',
        '打开关联 dialog（编辑 / 添加 / 删除 我引用 + 引用我）',
        hasLinks,
        'ml:openLinks:'
      ));
      bar.appendChild(mk(
        '🌐 浏览器中显示',
        '在 Anki 浏览器里仅显示本卡 + 全部关联（我引用 + 引用我），方便批量编辑',
        hasLinks,
        'ml:openLinksInBrowser:'
      ));
      (document.body || document.documentElement).appendChild(bar);
    }

    function boot() {
      try { bindCollapse(); bindLinks(); buildFloat(); } catch (e) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
    /* 卡片内容可能被模板脚本重排，稍后再兜几次；每次都重建 #ml-float */
    setTimeout(boot, 260);
    setTimeout(boot, 900);
  } catch (e) {
    /* 静默失败，绝不影响卡片本身 */
  }
})();
