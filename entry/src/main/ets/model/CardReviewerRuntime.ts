// SPDX-License-Identifier: AGPL-3.0-or-later

/** Browser code shared by study and preview. The native session owns document/revision identities. */
export const CARD_REVIEWER_RUNTIME: string = String.raw`
(function () {
  var documentId = 0, revision = 0;
  var scriptFailures = [], rendering = true;
  window.onUpdateHook = [];
  window.onShownHook = [];
  function clearScriptDiagnostics() {
    var notice = document.getElementById('jide-card-script-errors');
    if (notice) notice.remove();
  }
  function scriptSource(source) {
    // 授权 URL 可能携带用户 ID；诊断只保留源和路径。
    try { var url = new URL(source, document.baseURI); return url.origin + url.pathname; }
    catch (error) { return String(source || 'inline script').split(/[?#]/)[0]; }
  }
  function showScriptDiagnostics(failEmpty) {
    clearScriptDiagnostics();
    if (!scriptFailures.length || !document.body) return;
    var label = document.querySelector('meta[name="jide-card-script-error"]');
    var message = label ? label.content : 'Card script failed';
    var sources = scriptFailures.join('\n');
    var hasContent = !!document.body.innerText.trim() || Array.from(document.body.querySelectorAll(
      'img,svg,canvas,video,audio,input,textarea,select,button,iframe,object,embed')).some(function (element) {
        return element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
      });
    if (failEmpty && !hasContent) throw new Error(message + '\n' + sources);
    var notice = document.createElement('details');
    notice.id = 'jide-card-script-errors';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'margin:12px 0;padding:8px;border:1px solid currentColor;border-radius:8px;' +
      'font:14px/1.5 sans-serif;text-align:start;color:CanvasText;background:Canvas;overflow-wrap:anywhere';
    var summary = document.createElement('summary');
    summary.textContent = message;
    var detail = document.createElement('pre');
    detail.style.cssText = 'white-space:pre-wrap;font:inherit';
    detail.textContent = sources;
    notice.appendChild(summary); notice.appendChild(detail);
    document.body.appendChild(notice);
  }
  function recordScriptFailure(source) {
    var value = scriptSource(source);
    if (scriptFailures.indexOf(value) >= 0) return;
    scriptFailures.push(value);
    // 作者脚本可能在 load 之后异步请求授权；失败仍应可见，不能留下无解释的空卡。
    if (!rendering) showScriptDiagnostics(false);
  }
  window.addEventListener('error', function (event) {
    if (event.target && event.target.tagName === 'SCRIPT') recordScriptFailure(event.target.src);
    else if (event.filename) recordScriptFailure(event.filename);
  }, true);
  function surfaceBackground() {
    // Composite transparent body colors over the HTML fallback; emit an ArkUI-compatible opaque color.
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    var context = canvas.getContext('2d');
    if (!context) return '';
    [document.documentElement, document.body].forEach(function (element) {
      context.fillStyle = getComputedStyle(element).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    });
    var pixel = context.getImageData(0, 0, 1, 1).data;
    if (pixel[3] !== 255) return '';
    return '#' + Array.from(pixel.slice(0, 3)).map(function (value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
  }
  function luminance(hex) {
    var channels = [1, 3, 5].map(function (offset) {
      var value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  function updateDefaultTextColor() {
    var background = surfaceBackground();
    if (!background) return;
    // The builder owns the palette; this runtime derives only the readable fallback.
    var appearance = getComputedStyle(document.documentElement);
    var light = appearance.getPropertyValue('--jide-card-light-text').trim();
    var dark = appearance.getPropertyValue('--jide-card-dark-text').trim();
    var preferred = appearance.getPropertyValue('--jide-card-preferred-text').trim();
    if (![light, dark, preferred].every(function (color) { return /^#[0-9a-f]{6}$/i.test(color); })) return;
    var alternate = preferred === light ? dark : light;
    var surface = luminance(background);
    function contrast(color) {
      var text = luminance(color);
      return (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05);
    }
    if (contrast(preferred) < 4.5 && contrast(alternate) > contrast(preferred)) preferred = alternate;
    // Only the application fallback consumes this variable; explicit template/field colors keep priority.
    document.body.style.setProperty('--jide-card-default-text', preferred);
  }
  function report(error) {
    if (error) {
      rendering = false;
      window.jideCardRuntime.onRendered(documentId, revision, String(error), '');
      return;
    }
    var id = documentId, version = revision, failureCount = scriptFailures.length;
    // 布局完成不等于绘制完成；不能用固定延时提前确认隐藏视图。
    document.body.getBoundingClientRect();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (scriptFailures.length !== failureCount) {
          // 绘制等待期间的新错误也必须先展示，再确认新的两帧。
          try { showScriptDiagnostics(true); report(''); } catch (error) { report(error); }
          return;
        }
        rendering = false;
        window.jideCardRuntime.onRendered(id, version, '', surfaceBackground());
      });
    });
  }
  async function hooks(list) {
    await Promise.all(list.map(function (hook) { return Promise.resolve().then(hook); }));
  }
  function updateAppearance(parsed) {
    var next = parsed.getElementById('jide-card-appearance');
    var current = document.getElementById('jide-card-appearance');
    if (!next && !current) return;
    if (!next || next.tagName !== 'STYLE' || !current || current.tagName !== 'STYLE') {
      throw new Error('Missing card appearance stylesheet');
    }
    // Keep the same cascade position and the template's global environment. Update before its scripts run.
    current.textContent = next.textContent;
    document.documentElement.classList.toggle('night-mode', parsed.documentElement.classList.contains('night-mode'));
    document.documentElement.setAttribute('data-bs-theme', parsed.documentElement.getAttribute('data-bs-theme'));
    document.body.style.removeProperty('--jide-card-default-text');
  }
  function cardContainer(doc) {
    var qa = doc.getElementById('qa');
    if (!qa) throw new Error('Missing card content container');
    var nodes = Array.from(doc.body.childNodes);
    // Only nodes through the builder's end marker belong to this side. MathJax and other
    // document runtimes can append persistent caches after it; do not move or delete them.
    var end = doc.getElementById('jide-card-content-end');
    if (end && qa.contains(end)) return qa;
    if (end) {
      while (end.parentNode && end.parentNode !== doc.body) end = end.parentNode;
      var index = nodes.indexOf(end);
      if (index >= 0) nodes = nodes.slice(0, index + 1);
    }
    if (nodes.every(function (node) {
      return node === qa || (node.nodeType === 3 && !node.textContent.trim());
    })) return qa;
    // Imported HTML can close #qa early. The marked prefix still belongs to this side.
    // Move existing nodes to preserve initial script state; valid wrappers remain untouched.
    var content = doc.createDocumentFragment();
    function collect(node) {
      if (node === qa) {
        while (qa.firstChild) content.appendChild(qa.firstChild);
      } else if (node.nodeType === 1 && node.contains(qa)) {
        // A template script may wrap #qa before the parser repairs the trailing HTML.
        // Retain that ancestor instead of trying to insert it into its own descendant.
        Array.from(node.childNodes).forEach(collect);
      } else content.appendChild(node);
    }
    nodes.forEach(collect);
    qa.appendChild(content);
    return qa;
  }
  async function finish(side, scrollToAnswer, initial) {
    cardContainer(document);
    await hooks(window.onUpdateHook);
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
      await MathJax.startup.promise;
      if (!initial) await MathJax.typesetPromise([document.getElementById('qa')]);
    }
    if (window.anki && anki.imageOcclusion) anki.imageOcclusion.setup();
    if (window.ankiSetupCollapsible) window.ankiSetupCollapsible();
    await hooks(window.onShownHook);
    showScriptDiagnostics(true);
    updateDefaultTextColor();
    if (side === 'question') window.scrollTo(0, 0);
    if (side === 'answer' && scrollToAnswer) {
      var anchor = document.getElementById('answer');
      if (anchor) anchor.scrollIntoView({block: 'start'});
      else window.scrollTo(0, 0);
    }
  }
  async function replaceScript(oldScript) {
    var script = document.createElement('script');
    Array.from(oldScript.attributes).forEach(function (attr) { script.setAttribute(attr.name, attr.value); });
    script.textContent = oldScript.textContent;
    var executable = !script.type || /^(module|text\/javascript|application\/javascript)$/i.test(script.type);
    if (executable && (script.src || script.type === 'module')) {
      // Preserve dependency order; do not report the card ready before external scripts finish.
      await new Promise(function (resolve, reject) {
        var timeout = setTimeout(function () { reject(new Error('Card script timed out: ' + scriptSource(script.src))); }, 15000);
        script.onload = function () { clearTimeout(timeout); resolve(); };
        // 对齐 Anki reviewer：缺失可选依赖不能挡住后面的作者脚本，失败仍单独展示。
        script.onerror = function () { clearTimeout(timeout); recordScriptFailure(script.src); resolve(); };
        script.async = false;
        oldScript.replaceWith(script);
      });
    } else {
      oldScript.replaceWith(script);
    }
  }
  window.__jideCardReviewer = {
    start: function (id, version, side, scrollToAnswer) {
      documentId = id;
      revision = version;
      rendering = true;
      window.addEventListener('load', function () {
        finish(side, scrollToAnswer, true).then(function () { report(''); }, report);
      }, {once: true});
    },
    update: function (id, version, html, side, scrollToAnswer) {
      if (id !== documentId) return;
      revision = version;
      rendering = true;
      scriptFailures = [];
      clearScriptDiagnostics();
      (async function () {
        var parsed = new DOMParser().parseFromString(html, 'text/html');
        var next = cardContainer(parsed);
        var qa = cardContainer(document);
        document.querySelectorAll('audio,video').forEach(function (media) { media.pause(); });
        if (window.MathJax && MathJax.typesetClear) MathJax.typesetClear([qa]);
        window.onUpdateHook.length = 0;
        window.onShownHook.length = 0;
        updateAppearance(parsed);
        document.body.className = parsed.body.className;
        qa.innerHTML = next.innerHTML;
        for (var script of Array.from(qa.querySelectorAll('script'))) await replaceScript(script);
        await finish(side, scrollToAnswer, false);
      })().then(function () { report(''); }, report);
    },
    setTheme: function (id, version, isDark, stylesheet) {
      if (id !== documentId) return;
      revision = version;
      try {
        var appearance = document.getElementById('jide-card-appearance');
        if (!appearance || appearance.tagName !== 'STYLE') throw new Error('Missing card appearance stylesheet');
        appearance.textContent = stylesheet;
        document.documentElement.classList.toggle('night-mode', isDark);
        document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
        document.body.classList.toggle('nightMode', isDark);
        document.body.classList.toggle('night_mode', isDark);
        document.body.style.removeProperty('--jide-card-default-text');
        updateDefaultTextColor();
        // 外观确认保留 DOM、输入焦点、滚动位置和音频；不调用模板的翻面 hooks。
        report('');
      } catch (error) { report(error); }
    }
  };
})();`;
