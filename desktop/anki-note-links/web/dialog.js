/* 助记与双链引用 —— 对话框脚本（原生 JS，无外部依赖） */
(function () {
  'use strict';

  var P = window.__ML_DLG__ || {};
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  /* 对话框消息统一走 mldlg: 前缀，避免和卡片端 ml: 抢消息 */
  var send = function (cmd) {
    try { pycmd(String(cmd).replace(/^ml:/, 'mldlg:')); } catch (e) {}
  };
  var enc = function (o) { return encodeURIComponent(JSON.stringify(o)); };

  /* ------------------------------------------------------------ 一次性初始化开关 */
  var ONCE = {};
  function once(key, fn) {
    if (ONCE[key]) return false;
    ONCE[key] = true;
    fn();
    return true;
  }

  /* ------------------------------------------------------------ 提示条 */
  var toastTimer = null;
  function toast(msg) {
    var t = $('ml-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1600);
  }

  /* ------------------------------------------------------------ 关联模式 */
  function rowHTML(item, dir, action, drag) {
    var meta = item.meta ? '<span class="meta">' + esc(item.meta) + '</span>' : '';
    var acts = '';
    /* 「编辑显示文本」按钮：只在我引用 / 引用我 这两栏出现（搜索结果 add 没必要编辑）
       已设置别名时给按钮打 marked，让用户看到这一行被改过。 */
    var showAlias = (dir === 'out' || dir === 'in') && item.guid;
    if (showAlias) {
      var marked = item.alias ? ' marked' : '';
      acts += '<button class="act act-alias' + marked + '" data-act="alias" data-guid="' +
        esc(item.guid) + '" title="修改显示文本（所有引用此卡的条目都会同步）">✎</button>';
    }
    if (action === 'del') {
      acts += '<button class="act act-del" data-act="del" data-guid="' + esc(item.guid) + '" title="取消引用">✕</button>';
    } else if (action === 'add') {
      acts += '<button class="act act-add" data-act="add" data-guid="' + esc(item.guid) + '" title="添加引用">＋</button>';
    }
    var badge = dir === 'out' ? '我引用' : (dir === 'in' ? '引用我' : '＋');
    var li = drag
      ? '<li draggable="true" data-guid="' + esc(item.guid) + '">'
      : '<li>';
    /* 显示文本：优先用别名（alias），无别名才用默认 title。
       别名按目标卡片全局唯一——所有引用方都显示同一份文本，
       不动目标卡片本身的字段、模板或笔记内容。
       alias_html 是服务端白名单清洗过的富文本，可直接插入；
       title 是笔记原文，必须转义。 */
    var display;
    if (item.alias_html) display = item.alias_html;
    else if (item.alias) display = esc(item.alias);
    else display = esc(item.title || '(空笔记)');
    return li + '<div class="ml-row" data-nid="' + esc(item.nid) + '" data-guid="' + esc(item.guid) + '">' +
      '<span class="dir ' + esc(dir || 'in') + '">' + badge + '</span>' +
      '<span class="tx">' + display + meta + '</span>' + acts + '</div></li>';
  }

  function fillList(el, items, dir, emptyText, action) {
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<li class="ml-empty">' + esc(emptyText) + '</li>';
      return;
    }
    el.innerHTML = items.map(function (it) { return rowHTML(it, dir, action); }).join('');
  }

  /* 行点击跳转：单击 -> 预览目标卡；双击 -> 打开目标卡关联弹窗。
   * 抽成共享函数，避免 bindListClicks / bindOutList 两处实现漂移
   * （历史上正是「两处各写一遍」导致其中一处丢了跳转绑定）。 */
  function jumpFromRow(row) {
    if (!row) return;
    var nid = row.getAttribute('data-nid');
    var guid = row.getAttribute('data-guid');
    if (!guid) return;
    if (!nid) {
      try { pycmd('ml:openLinks:' + guid); } catch (e) {}
      return;
    }
    if (row.__mlClickT) {
      clearTimeout(row.__mlClickT);
      row.__mlClickT = null;
      try { pycmd('ml:openLinks:' + guid); } catch (e) {}
      return;
    }
    row.__mlClickT = setTimeout(function () {
      row.__mlClickT = null;
      send('ml:preview:' + nid);
    }, 210);
  }

  function bindListClicks(el) {
    if (!el || el.__mlBound) return;
    el.__mlBound = true;
    el.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('.act');
      if (btn) {
        ev.stopPropagation();
        var g = btn.getAttribute('data-guid');
        var act = btn.getAttribute('data-act');
        if (act === 'alias') {
          var row = btn.closest('.ml-row');
          /* 别名按目标卡片全局唯一，列表 item 里有 alias 字段。
             没设别名时为空字符串（编辑器会用默认 title 作为预览兜底）。 */
          var currentAlias = '';
          var defaultTitle = '';
          if (row) {
            try {
              var guid = g;
              var items = (window.__ML_DLG_OUT__ || []).concat(window.__ML_DLG_INC__ || []);
              for (var i = 0; i < items.length; i++) {
                if (items[i].guid === guid) {
                  currentAlias = items[i].alias || '';
                  defaultTitle = items[i].title || '';
                  break;
                }
              }
            } catch (e) {}
          }
          openAliasPop(g, currentAlias, defaultTitle);
          return;
        }
        send(act === 'add' ? ('ml:addLink:' + g) : ('ml:delLink:' + g));
        return;
      }
      var row = t.closest('.ml-row');
      if (row && row.getAttribute('data-guid')) {
        jumpFromRow(row);
      }
    });
  }

  /* ------------------------------------------------------------ 别名编辑器 */

  var ALIAS_POP = null;        // 当前打开的别名编辑器 popover
  var ALIAS_TARGET = '';       // 正在编辑哪个 target_guid
  var ALIAS_DEFAULT_TITLE = '';// 该目标卡的默认标题（清空别名时回退用）

  function buildAliasPop() {
    if (ALIAS_POP) return ALIAS_POP;
    var pop = document.createElement('div');
    pop.className = 'ml-alias-pop';
    pop.style.cssText = 'position:fixed;z-index:25;display:none;background:var(--bg);' +
      'border:1px solid var(--bd);border-radius:10px;padding:12px 14px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.18);min-width:320px;max-width:420px;' +
      'font:13px/1.45 -apple-system,Segoe UI,sans-serif;color:var(--fg);';

    /* 标题 */
    var hd = document.createElement('div');
    hd.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin-bottom:8px;';
    hd.innerHTML = '<span style="font-weight:600">编辑显示文本</span>' +
      '<span style="color:var(--muted);font-size:12px">改一处 = 所有引用同步</span>';
    pop.appendChild(hd);

    /* 默认标题（清空别名时回退） */
    var def = document.createElement('div');
    def.style.cssText = 'color:var(--muted);font-size:12px;margin-bottom:6px;';
    def.innerHTML = '默认标题：<span class="ml-alias-default" ' +
      'style="color:var(--fg);font-weight:500"></span>';
    pop.appendChild(def);
    pop.__defaultEl = def.querySelector('.ml-alias-default');

    /* 富文本编辑区。
       2026-10-21 用户要求：
         ① 预填原标题 —— 原来是个空框，用户得自己重打一遍才能改
         ② 给几个常用排版按钮（加粗 / 斜体 / 下划线 / 颜色）
       用 contenteditable + execCommand 做成所见即所得，
       比让用户在 textarea 里看 `<b>` 标签直观得多。
       保存时把 innerHTML 交给 Python 做白名单清洗。 */
    var ED = document.createElement('div');
    ED.className = 'ml-alias-input';
    ED.contentEditable = 'true';
    ED.spellcheck = false;
    ED.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;' +
      'border:1px solid var(--bd);border-radius:6px;background:var(--bg2);' +
      'color:var(--fg);font:13px/1.55 -apple-system,Segoe UI,sans-serif;' +
      'min-height:64px;max-height:180px;overflow:auto;outline:none;' +
      'overflow-wrap:anywhere;';
    pop.appendChild(ED);
    pop.__input = ED;
    pop.__editor = ED;

    /* 工具条：几个关键排版，不做成完整编辑器 */
    var tb = document.createElement('div');
    tb.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:7px;flex-wrap:wrap;';

    function cmdBtn(label, title, cmd, val, css) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.style.cssText = 'min-width:26px;height:26px;padding:0 6px;cursor:pointer;' +
        'border:1px solid var(--bd);border-radius:6px;background:var(--bg2);' +
        'color:var(--fg);font-size:13px;line-height:1;' + (css || '');
      b.addEventListener('mousedown', function (ev) {
        /* 必须阻止默认：否则点按钮会让编辑区失焦、选中内容丢失 */
        ev.preventDefault();
      });
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ED.focus();
        try {
          document.execCommand('styleWithCSS', false, true);
          document.execCommand(cmd, false, val || null);
        } catch (e) {}
      });
      return b;
    }

    tb.appendChild(cmdBtn('B', '加粗', 'bold', null, 'font-weight:700;'));
    tb.appendChild(cmdBtn('I', '斜体', 'italic', null, 'font-style:italic;'));
    tb.appendChild(cmdBtn('U', '下划线', 'underline', null, 'text-decoration:underline;'));

    var sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:16px;background:var(--bd);margin:0 3px;';
    tb.appendChild(sep);

    /* 颜色：4 个常用色，够用就好 */
    var COLORS = [
      ['#e5484d', '红'],
      ['#2f7cf6', '蓝'],
      ['#12a594', '绿'],
      ['#e8a33d', '橙'],
    ];
    COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.title = '文字颜色：' + c[1];
      b.style.cssText = 'width:20px;height:20px;border-radius:50%;cursor:pointer;' +
        'border:1px solid rgba(0,0,0,.15);background:' + c[0] + ';padding:0;';
      b.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ED.focus();
        try {
          document.execCommand('styleWithCSS', false, true);
          document.execCommand('foreColor', false, c[0]);
        } catch (e) {}
      });
      tb.appendChild(b);
    });

    tb.appendChild(cmdBtn('清除格式', '去掉加粗/颜色等格式', 'removeFormat', null,
      'font-size:11.5px;margin-left:4px;'));

    pop.appendChild(tb);

    /* 提示：动字段的时机 */
    var tip = document.createElement('div');
    tip.style.cssText = 'color:var(--muted);font-size:11.5px;margin-top:6px;';
    tip.textContent = '保存后立刻写入所有引用这张卡的笔记，复习界面当场生效。';
    pop.appendChild(tip);

    /* 操作按钮：取消 / 清除 / 保存 */
    var opRow = document.createElement('div');
    opRow.style.cssText = 'display:flex;gap:6px;margin-top:10px;justify-content:flex-end;';
    function mkOp(label, cls, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = 'ml-btn ' + (cls || '');
      b.style.cssText = 'padding:5px 12px;font-size:13px;';
      b.addEventListener('click', fn);
      return b;
    }
    opRow.appendChild(mkOp('取消', '', closeAliasPop));
    opRow.appendChild(mkOp('恢复默认', 'danger', function () {
      send('ml:clearAlias:' + ALIAS_TARGET);
      closeAliasPop();
    }));
    opRow.appendChild(mkOp('保存', 'primary', function () {
      /* 富文本按 HTML 提交，由 Python 白名单清洗后再落库/渲染。
         只有格式没有文字（比如内容被删空、只剩空 <b></b>）视为清空。 */
      var v = (ED.innerHTML || '').trim();
      var plain = (ED.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (!plain) v = '';
      send('ml:setAlias:' + enc({ target: ALIAS_TARGET, alias: v }));
      closeAliasPop();
    }));
    pop.appendChild(opRow);

    /* 点 pop 外部关闭 */
    pop.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });

    document.body.appendChild(pop);
    ALIAS_POP = pop;
    return pop;
  }

  function openAliasPop(targetGuid, currentAlias, defaultTitle) {
    if (!targetGuid) return;
    ALIAS_TARGET = targetGuid;
    ALIAS_DEFAULT_TITLE = defaultTitle || '';
    var pop = buildAliasPop();
    pop.__defaultEl.textContent = ALIAS_DEFAULT_TITLE || '(空笔记)';
    /* 预填：已有别名 → 原样（含格式）；没有 → 把默认标题填进去，
       让用户直接在原文上改，而不是对着空框重打一遍。 */
    if (currentAlias) {
      pop.__editor.innerHTML = currentAlias;
    } else {
      pop.__editor.textContent = ALIAS_DEFAULT_TITLE || '';
    }
    /* 定位：靠近点中的按钮；下方不够向上翻 */
    pop.style.display = 'block';
    var btn = document.querySelector('.act[data-act="alias"][data-guid="' +
      targetGuid.replace(/"/g, '\\"') + '"]');
    var r = (btn || pop).getBoundingClientRect();
    var vh = window.innerHeight;
    var ph = pop.offsetHeight;
    var pw = Math.min(420, Math.max(320, pop.offsetWidth));
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left));
    var top;
    var below = vh - r.bottom - 8;
    if (below >= ph + 10) {
      top = r.bottom + 6;
    } else {
      var above = r.top - ph - 6;
      top = Math.max(8, above);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    /* 聚焦并把光标放到末尾 —— 不要全选：
       现在内容已预填，全选会让用户一打字就把原文全删掉。 */
    setTimeout(function () {
      try {
        var ed = pop.__editor;
        ed.focus();
        var sel = window.getSelection();
        var rg = document.createRange();
        rg.selectNodeContents(ed);
        rg.collapse(false);
        sel.removeAllRanges();
        sel.addRange(rg);
      } catch (e) {}
    }, 30);
  }

  function closeAliasPop() {
    if (ALIAS_POP) ALIAS_POP.style.display = 'none';
  }

  /* ------------------------------------------------------------ 引用列表（无分组） */
/* 分组功能已删除——所有引用统一显示，可拖拽改顺序 */

  var OUT = [];        // 我引用（顺序 = 显示顺序）
  var DRAG = null;

  function renderOutList() {
    var el = $('ml-out-list');
    if (!el) return;
    var oc = $('ml-out-count');
    if (oc) oc.textContent = OUT.length;
    if (!OUT.length) {
      el.innerHTML = '<li class="ml-empty">还没有引用任何卡片</li>';
      return;
    }
    var html = OUT.map(function (it) { return rowHTML(it, 'out', 'del', true); }).join('');
    el.innerHTML = html;
  }

  /* 从 DOM 读回当前顺序（拖拽结束后用） */
  function currentOutOrder() {
    var el = $('ml-out-list');
    if (!el) return [];
    var lis = el.querySelectorAll(':scope > li[data-guid]');
    var out = [];
    for (var i = 0; i < lis.length; i++) out.push(lis[i].getAttribute('data-guid'));
    return out.filter(Boolean);
  }

  /* 写回 OUT，重渲染，并把新顺序交给后端落盘 */
  function applyOrder(orderedGuids) {
    var byGuid = {};
    OUT.forEach(function (it) { byGuid[it.guid] = it; });
    var flat = [];
    orderedGuids.forEach(function (g) {
      var it = byGuid[g];
      if (it) flat.push(it);
    });
    OUT = flat;
    renderOutList();
    send('ml:setLinks:' + enc({ links: orderedGuids }));
  }

  function bindOutList(el) {
    if (!el || el.__mlDrag) return;
    el.__mlDrag = true;

    el.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      var btn = t.closest('.act');
      if (btn) {
        ev.stopPropagation();
        var g = btn.getAttribute('data-guid');
        var act = btn.getAttribute('data-act');
        if (act === 'alias') {
          var row = btn.closest('.ml-row');
          var currentAlias = '';
          var defaultTitle = '';
          if (row) {
            try {
              var guid = g;
              var items = (window.__ML_DLG_OUT__ || []).concat(window.__ML_DLG_INC__ || []);
              for (var i = 0; i < items.length; i++) {
                if (items[i].guid === guid) {
                  currentAlias = items[i].alias || '';
                  defaultTitle = items[i].title || '';
                  break;
                }
              }
            } catch (e) {}
          }
          openAliasPop(g, currentAlias, defaultTitle);
          return;
        }
        send(act === 'add' ? ('ml:addLink:' + g) : ('ml:delLink:' + g));
        return;
      }
      var row = t.closest('.ml-row');
      if (row && row.getAttribute('data-guid')) {
        jumpFromRow(row);
      }
    });

    el.addEventListener('dragstart', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var li = t.closest('li[draggable="true"]');
      if (!li) return;
      DRAG = { kind: 'item', guid: li.getAttribute('data-guid') || '' };
      try {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', 'ml');
      } catch (e) {}
    });

    el.addEventListener('dragover', function (ev) {
      if (!DRAG) return;
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {}
      clearDropMarks(el);
      var t = ev.target;
      if (!t || !t.closest) return;
      var row = t.closest('.ml-row');
      if (!row) return;
      var rect = row.getBoundingClientRect();
      var after = ev.clientY >= rect.top + rect.height / 2;
      row.classList.add(after ? 'drop-after' : 'drop-before');
      DRAG.target = { ref: row.getAttribute('data-guid') || '', after: after };
    });

    el.addEventListener('drop', function (ev) {
      if (!DRAG) return;
      ev.preventDefault();
      clearDropMarks(el);
      var d = DRAG;
      DRAG = null;
      if (!d.target) return;
      var guid = d.guid;
      if (!guid) return;
      var order = currentOutOrder();
      var at = order.indexOf(guid);
      if (at >= 0) order.splice(at, 1);
      var refIdx = order.indexOf(d.target.ref);
      if (refIdx < 0) { order.push(guid); }
      else { order.splice(refIdx + (d.target.after ? 1 : 0), 0, guid); }
      applyOrder(order);
    });

    el.addEventListener('dragend', function () {
      DRAG = null;
      clearDropMarks(el);
    });
  }



  function leafName(full) {
    var p = String(full == null ? '' : full).split('::');
    return p[p.length - 1] || String(full || '');
  }

  function currentFilters() {
    var d = $('ml-f-deck'), f = $('ml-f-field'),
        s = $('ml-f-scope'), o = $('ml-f-order');
    return {
      deck: d ? d.value : '',
      field: f ? f.value : '',
      scope: s ? s.value : 'all',
      order: o ? o.value : 'relevance'
    };
  }

  function markFilters() {
    var d = $('ml-f-deck'), f = $('ml-f-field'),
        s = $('ml-f-scope'), btn = $('ml-dd-btn'), tx = $('ml-dd-tx');
    var dv = d ? d.value : '';
    if (btn) btn.classList.toggle('on', !!dv);
    if (f) f.classList.toggle('on', !!f.value);
    if (s) s.classList.toggle('on', s.value && s.value !== 'all');
    if (tx) tx.textContent = dv ? leafName(dv) : '全部卡包';
  }

  /* ------------------------------------------------------------ 卡包树 */

  var DTREE = [];
  var DOPEN = {};
  var DQ = '';

  function buildDeckTree() {
    var list = P.decks || [];
    var map = {}, roots = [];
    list.forEach(function (d) {
      map[d.f] = { f: d.f, n: d.n, c: d.c || 0, t: d.t || 0, kids: [] };
    });
    list.forEach(function (d) {
      var p = d.f.indexOf('::') >= 0 ? d.f.slice(0, d.f.lastIndexOf('::')) : '';
      if (p && map[p]) map[p].kids.push(map[d.f]);
      else if (map[d.f]) roots.push(map[d.f]);
    });
    DTREE = roots;
    DOPEN = {};
    roots.forEach(function (r) { if (r.kids.length) DOPEN[r.f] = true; });
  }

  function dnHTML(full, label, count, depth, cls, arrow, open) {
    return '<div class="ml-dn' + (cls ? ' ' + cls : '') + '" data-f="' + esc(full) + '"' +
      ' style="padding-left:' + (2 + depth * 13) + 'px">' +
      '<span class="ml-dn-ar' + (arrow ? ' has' : '') + '" data-act="fold">' +
      (arrow ? (open ? '\u25BE' : '\u25B8') : '') + '</span>' +
      '<span class="ml-dn-n">' + esc(label) + '</span>' +
      '<span class="ml-dn-c">' + (count == null ? '' : count) + '</span>' +
      '</div>';
  }

  function flatDecks(out, list) {
    list.forEach(function (n) {
      out.push(n);
      if (n.kids && n.kids.length) flatDecks(out, n.kids);
    });
    return out;
  }

  function renderTree() {
    var host = $('ml-dd-tree');
    if (!host) return;
    var q = DQ.trim().toLowerCase();
    var html = dnHTML('', '全部卡包', '', 0, 'quick', false, false);
    var cur = P.cur_deck || '';
    if (cur) html += dnHTML(cur, '当前卡包：' + leafName(cur), '', 0, 'quick', false, false);
    html += '<div class="ml-dn-sep"></div>';
    var shown = 0;

    if (q) {
      var hits = flatDecks([], DTREE).filter(function (n) {
        return n.f.toLowerCase().indexOf(q) >= 0;
      });
      hits.slice(0, 400).forEach(function (n) {
        html += dnHTML(n.f, n.f, n.t, 0, '', false, false);
      });
      shown = hits.length;
      if (!hits.length) {
        html += '<div class="ml-dn" style="cursor:default;color:var(--muted)">没有匹配的卡包</div>';
      }
    } else {
      var walk = function (n, depth) {
        var open = !!DOPEN[n.f];
        var has = n.kids.length > 0;
        html += dnHTML(n.f, n.n, n.t, depth, '', has, open);
        shown += 1;
        if (has && open) n.kids.forEach(function (k) { walk(k, depth + 1); });
      };
      DTREE.forEach(function (r) { walk(r, 0); });
    }

    host.innerHTML = html;

    var sel = $('ml-f-deck') ? $('ml-f-deck').value : '';
    var dns = host.querySelectorAll('.ml-dn');
    for (var i = 0; i < dns.length; i++) {
      if ((dns[i].getAttribute('data-f') || '') === sel && sel) dns[i].classList.add('sel');
    }

    var foot = $('ml-dd-foot');
    if (foot) {
      foot.textContent = q
        ? ('筛选出 ' + shown + ' 个卡包')
        : (DTREE.length + ' 个一级卡包 · 点 ▸ 展开，点名字选中（含子卡包）');
    }
  }

  function openDeckPop() {
    var pop = $('ml-dd-pop'), btn = $('ml-dd-btn');
    if (!pop || !btn) return;
    pop.hidden = false;
    var r = btn.getBoundingClientRect();
    var vh = window.innerHeight;
    var w = Math.max(280, Math.min(460, Math.round(r.width * 1.7)));
    var left = Math.min(r.left, window.innerWidth - w - 10);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, left) + 'px';

    /* 下方空间不够就向上翻，否则面板会跑到屏幕外 */
    var wantH = Math.min(460, Math.max(220, Math.round(vh * 0.6)));
    var below = vh - (r.bottom + 5) - 10;
    var top;
    if (below >= 200) {
      top = r.bottom + 5;
      pop.style.maxHeight = Math.min(wantH, below) + 'px';
    } else {
      var above = r.top - 10;
      var h = Math.min(wantH, Math.max(160, above));
      top = Math.max(8, r.top - 5 - h);
      pop.style.maxHeight = h + 'px';
    }
    pop.style.top = top + 'px';

    renderTree();
    var q = $('ml-dd-q');
    if (q) {
      q.value = DQ;
      setTimeout(function () {
        try { q.focus({ preventScroll: true }); } catch (e) {}
      }, 20);
    }
  }

  function closeDeckPop() {
    var pop = $('ml-dd-pop');
    if (pop) pop.hidden = true;
  }

  function pickDeck(full) {
    var hid = $('ml-f-deck');
    if (hid) hid.value = full || '';
    markFilters();
    closeDeckPop();
    runSearch(0);
  }

  function bindDeckTree() {
    var btn = $('ml-dd-btn'), pop = $('ml-dd-pop'), q = $('ml-dd-q'), host = $('ml-dd-tree');
    if (btn && !btn.__mlBound) {
      btn.__mlBound = true;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (pop && pop.hidden) openDeckPop();
        else closeDeckPop();
      });
    }
    if (q && !q.__mlBound) {
      q.__mlBound = true;
      q.addEventListener('input', function () { DQ = q.value; renderTree(); });
      q.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); closeDeckPop(); }
      });
    }
    if (host && !host.__mlBound) {
      host.__mlBound = true;
      host.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var ar = t.closest('.ml-dn-ar');
        if (ar && ar.classList.contains('has')) {
          ev.stopPropagation();
          var dn = ar.closest('.ml-dn');
          var f = dn ? dn.getAttribute('data-f') : '';
          if (f) { DOPEN[f] = !DOPEN[f]; renderTree(); }
          return;
        }
        var row = t.closest('.ml-dn');
        if (row) pickDeck(row.getAttribute('data-f') || '');
      });
    }
    if (pop && !pop.__mlBound) {
      pop.__mlBound = true;
      pop.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    }
    if (!document.__mlDeckBound) {
      document.__mlDeckBound = true;
      document.addEventListener('mousedown', function (ev) {
        var t = ev.target;
        if (t && t.closest && (t.closest('#ml-dd') || t.closest('#ml-dd-pop') || t.closest('#ml-dd-btn'))) return;
        closeDeckPop();
      });
      var sc = document.querySelector('.ml-scroll');
      if (sc) sc.addEventListener('scroll', closeDeckPop);
      window.addEventListener('resize', closeDeckPop);
    }
  }

  /* 返回 true 表示"原来选中的字段在新列表里没有了" */
  function buildFieldSelect(fields) {
    var sel = $('ml-f-field');
    if (!sel) return false;
    var list = fields || P.fields || [];
    var sig = list.map(function (f) { return f[0] + ':' + f[1]; }).join('\u0000');
    if (sel.__sig === sig) return false;
    var keep = sel.value;
    sel.__sig = sig;
    var html = ['<option value="">全部字段</option>'];
    for (var i = 0; i < list.length; i++) {
      var n = list[i][0], c = list[i][1] || 0;
      html.push('<option value="' + esc(n) + '">' + esc(n) + (c ? ' (' + c + ')' : '') + '</option>');
    }
    sel.innerHTML = html.join('');
    if (keep) {
      sel.value = keep;
      if (sel.value !== keep) sel.value = '';
    }
    return sel.value !== keep;
  }

  var SEARCH_TIMER = null;

  function runSearch(delay) {
    var box = $('ml-search');
    if (!box) return;
    var q = box.value.trim();
    var res = $('ml-results');
    var hint = $('ml-f-hint');
    if (!q) {
      if (res) res.innerHTML = '<li class="ml-empty">输入关键词搜索全库卡片</li>';
      if (hint) hint.textContent = '';
      return;
    }
    if (SEARCH_TIMER) clearTimeout(SEARCH_TIMER);
    var go = function () {
      markFilters();
      var f = currentFilters();
      if (hint) hint.textContent = '搜索中…';
      send('ml:search:' + enc({ q: q, deck: f.deck, field: f.field,
                                scope: f.scope, order: f.order }));
    };
    if (delay) SEARCH_TIMER = setTimeout(go, delay);
    else go();
  }

  function bindFilters() {
    var f = $('ml-f-field'), r = $('ml-f-reset'), d = $('ml-f-deck'),
        s = $('ml-f-scope'), o = $('ml-f-order');
    if (f && !f.__mlBound) {
      f.__mlBound = true;
      f.addEventListener('change', function () { runSearch(0); });
    }
    [s, o].forEach(function (el) {
      if (el && !el.__mlBound) {
        el.__mlBound = true;
        el.addEventListener('change', function () { runSearch(0); });
      }
    });
    if (r && !r.__mlBound) {
      r.__mlBound = true;
      r.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (d) d.value = '';
        if (f) f.value = '';
        if (s) s.value = 'all';
        if (o) o.value = 'relevance';
        DQ = '';
        markFilters();
        closeDeckPop();
        runSearch(0);
      });
    }
  }

  function initLinks() {
    OUT = (P.out || []).slice();
    /* 全局缓存：点击「编辑显示文本」按钮时，handler 要从这里读 item.alias / item.title。
       initLinks 里也要写一份——它是从 P.out 直接同步读进来的（不走 setLinks），
       否则 HTML 预览/初始化时序下 __ML_DLG_OUT__ 还是空的。 */
    window.__ML_DLG_OUT__ = OUT;
    window.__ML_DLG_INC__ = P.inc || [];
    renderOutList();
    bindOutList($('ml-out-list'));
    fillList($('ml-in-list'), P.inc, 'in', '还没有卡片引用本条', '');
    var ic = $('ml-in-count');
    if (ic) ic.textContent = (P.inc || []).length;
    bindListClicks($('ml-in-list'));
    bindListClicks($('ml-results'));

    buildDeckTree();
    var hid = $('ml-f-deck');
    if (hid) {
      var want = P.saved_deck || '';
      hid.value = want;
      if (!DTREE.length) hid.value = '';
    }
    buildFieldSelect(P.fields);
    var fsel = $('ml-f-field');
    if (fsel && P.saved_field) {
      fsel.value = P.saved_field;
      if (fsel.value !== P.saved_field) fsel.value = '';
    }
    var ssel = $('ml-f-scope');
    if (ssel && P.saved_scope) {
      ssel.value = P.saved_scope;
      if (ssel.value !== P.saved_scope) ssel.value = 'all';
    }
    var osel = $('ml-f-order');
    if (osel && P.saved_order) {
      osel.value = P.saved_order;
      if (osel.value !== P.saved_order) osel.value = 'relevance';
    }
    bindDeckTree();
    renderTree();
    bindFilters();
    markFilters();
    /* 分组功能已删除：sync / newgrp 两个按钮对应的 JS 端逻辑也移除。
       模板里也删了按钮 HTML，但即使保留，$(srcid="{{ 也不报错，安全兜底 */

    var box = $('ml-search');
    if (!box || box.__mlBound) return;
    box.__mlBound = true;
    box.addEventListener('input', function () { runSearch(320); });
    setTimeout(function () { try { box.focus({ preventScroll: true }); } catch (e) {} }, 40);
  }

  /* ------------------------------------------------------------ 预览模式 */
  function initPreview() {
    var nav = $('ml-prev-nav');
    if (nav && !nav.__mlBound) {
      nav.__mlBound = true;
      var tabs = nav.querySelectorAll('[data-side]');
      for (var i = 0; i < tabs.length; i++) {
        (function (b) {
          b.addEventListener('click', function () { send('ml:previewSide:' + b.getAttribute('data-side')); });
        })(tabs[i]);
      }
    }
    var ob = $('ml-prev-browse');
    if (ob && !ob.__mlBound) {
      ob.__mlBound = true;
      ob.addEventListener('click', function () { send('ml:openBrowser:' + (P.nid || '')); });
    }
  }

  /* ------------------------------------------------------------ 面板切换 */
  function showPane(mode) {
    /* 互斥切换 —— 强制先全部移除再给当前加 .on，
     * 避免「两个面板同时显示」（曾因 forEach+toggle 时序漏掉一个） */
    var ids = ['ml-pane-links', 'ml-pane-preview'];
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (el) el.classList.remove('on');
    }
    var want = $('ml-pane-' + mode);
    if (want) want.classList.add('on');

    /* 头部 ✕ 的语义随面板变化：
     *   列表页 → 关闭窗口
     *   预览页 → 返回列表（不是退出，两个 ✕ 功能必须不同）
     * 悬停提示同步改，否则用户不知道它会返回。 */
    var x = document.querySelector('.ml-x');
    if (x) {
      var back = (mode === 'preview');
      x.title = back ? '返回列表' : '关闭';
      x.setAttribute('aria-label', x.title);
      if (back) x.classList.add('ml-x-back');
      else x.classList.remove('ml-x-back');
    }
  }

  /* ------------------------------------------------------------ 对外接口 */
  window.ML = {
    toast: toast,
    showPane: showPane,
    switchPane: function (mode) {
      mode = mode || 'links';
      P.mode = mode;
      if (mode === 'links') once('links', initLinks);
      else if (mode === 'preview') once('preview', initPreview);
      showPane(mode);
    },
    openPreview: function (nid, side, title) {
      P.nid = nid;
      once('preview', initPreview);
      showPane('preview');
      window.ML.setSide(side || 'answer');
      var t = $('ml-prev-title');
      if (t) t.textContent = title || '';
    },
    setLinks: function (out, inc) {
      OUT = (out || []).slice();
      P.out = OUT;
      P.inc = inc || [];
      /* 全局缓存：点击「编辑显示文本」按钮时，handler 要从这里读 item.alias / item.title */
      window.__ML_DLG_OUT__ = OUT;
      window.__ML_DLG_INC__ = P.inc;
      renderOutList();
      var ic = $('ml-in-count');
      if (ic) ic.textContent = P.inc.length;
      fillList($('ml-in-list'), P.inc, 'in', '还没有卡片引用本条', '');
    },
    /* 供外部（后端 eval）直接刷新列表用 */
    setResults: function (o) {
      var el = $('ml-results');
      if (!el) return;
      var isObj = !!o && !Array.isArray(o) && typeof o === 'object';
      var items = Array.isArray(o) ? o : ((o && o.items) || []);
      /* 字段列表随卡包变化；原选中项没了就清掉并重搜一次 */
      if (isObj && o.fields) {
        if (buildFieldSelect(o.fields)) { runSearch(0); return; }
      }
      markFilters();
      var hint = $('ml-f-hint');
      if (!items.length) {
        el.innerHTML = '<li class="ml-empty">没有匹配的卡片</li>';
        if (hint) hint.textContent = '0 条';
        return;
      }
      el.innerHTML = items.map(function (it) { return rowHTML(it, 'add', 'add'); }).join('');
      if (hint) {
        hint.textContent = (isObj && o.capped)
          ? ('显示前 ' + items.length + ' 条 · 还有更多，用卡包/字段/范围缩小')
          : ('共 ' + items.length + ' 条');
      }
    },
    markSaved: function () { /* 兼容旧 API：助记已删除，保留空实现 */ },
    setEditor: function (html) { /* 兼容旧 API：助记已删除，保留空实现 */ },
    /* 用 iframe 隔离卡片的 CSS/JS，避免污染对话框样式 */
    setPreview: function (doc) {
      var b = $('ml-prev-body');
      if (!b) return;
      b.style.padding = '0';
      b.innerHTML = '';
      var f = document.createElement('iframe');
      f.className = 'ml-frame';
      f.setAttribute('sandbox', 'allow-same-origin');
      f.style.cssText = 'width:100%;height:100%;border:0;display:block;background:transparent;';
      f.srcdoc = doc || '';
      b.appendChild(f);
    },
    setSide: function (side) {
      var tabs = document.querySelectorAll('#ml-prev-nav [data-side]');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('on', tabs[i].getAttribute('data-side') === side);
      }
    },
    setBusy: function (on) {
      document.body.style.cursor = on ? 'progress' : '';
    },
  };

  /* ------------------------------------------------------------ 启动 */
  document.addEventListener('DOMContentLoaded', function () {
    var x = document.querySelector('.ml-x');
    if (x) x.addEventListener('click', function () { send('ml:closeOrBack'); });

    /* 关闭别名编辑器：点 pop 外部时收起（统一复用 pop 的 mousedown 兜底） */
    if (!document.__mlAliasBound) {
      document.__mlAliasBound = true;
      document.addEventListener('mousedown', function (ev) {
        var t = ev.target;
        if (t && t.closest && t.closest('.ml-alias-pop')) return;
        closeAliasPop();
      });
    }

    var statics = [
      ['ml-lk-close', 'ml:close'],
      ['ml-prev-close', 'ml:close'],
      ['ml-lk-browser', 'ml:openLinksInBrowser'],
      ['ml-prev-back', 'ml:previewBack'],
      ['ml-lk-refresh', 'ml:refreshLinks'],
    ];
    statics.forEach(function (p) {
      var b = $(p[0]);
      if (b) b.addEventListener('click', function () {
        /* 关 dialog 前先关别名编辑器，避免 pop 残留在屏幕上 */
        if (p[1] === 'ml:close') closeAliasPop();
        send(p[1]);
      });
    });

    try {
      window.ML.switchPane(P.mode || 'links');
      if (P.mode === 'preview' && P.nid) {
        window.ML.openPreview(P.nid, P.side || 'answer', P.title || '');
      }
    } catch (e) {
      toast('界面初始化出错：' + e.message);
    }
  });
})();
