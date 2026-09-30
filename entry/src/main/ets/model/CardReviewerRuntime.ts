// SPDX-License-Identifier: AGPL-3.0-or-later

/** Browser code shared by study and preview. The native session owns document/revision identities. */
export const CARD_REVIEWER_RUNTIME: string = String.raw`
(function () {
  var documentId = 0, revision = 0;
  window.onUpdateHook = [];
  window.onShownHook = [];
  function report(error) {
    window.jideCardRuntime.onRendered(documentId, revision, error ? String(error) : '');
  }
  async function hooks(list) {
    await Promise.allSettled(list.map(function (hook) { return Promise.resolve().then(hook); }));
  }
  async function finish(side, scrollToAnswer, initial) {
    await hooks(window.onUpdateHook);
    if (window.MathJax && MathJax.startup) {
      await MathJax.startup.promise;
      if (!initial) await MathJax.typesetPromise([document.getElementById('qa')]);
    }
    if (window.anki && anki.imageOcclusion) anki.imageOcclusion.setup();
    if (window.ankiSetupCollapsible) window.ankiSetupCollapsible();
    await hooks(window.onShownHook);
    if (side === 'question') window.scrollTo(0, 0);
    if (side === 'answer' && scrollToAnswer) {
      var anchor = document.getElementById('answer');
      if (anchor) anchor.scrollIntoView({block: 'start'});
      else window.scrollTo(0, document.body.scrollHeight);
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
        var timeout = setTimeout(function () { reject(new Error('Card script timed out: ' + script.src)); }, 15000);
        script.onload = function () { clearTimeout(timeout); resolve(); };
        script.onerror = function () { clearTimeout(timeout); reject(new Error('Card script failed: ' + script.src)); };
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
      window.addEventListener('load', function () {
        finish(side, scrollToAnswer, true).then(function () { report(''); }, report);
      }, {once: true});
    },
    update: function (id, version, html, side, scrollToAnswer) {
      if (id !== documentId) return;
      revision = version;
      (async function () {
        var parsed = new DOMParser().parseFromString(html, 'text/html');
        var next = parsed.getElementById('qa');
        var qa = document.getElementById('qa');
        if (!qa || !next) throw new Error('Missing card content container');
        document.querySelectorAll('audio,video').forEach(function (media) { media.pause(); });
        if (window.MathJax && MathJax.typesetClear) MathJax.typesetClear([qa]);
        window.onUpdateHook.length = 0;
        window.onShownHook.length = 0;
        document.body.className = parsed.body.className;
        qa.innerHTML = next.innerHTML;
        for (var script of Array.from(qa.querySelectorAll('script'))) await replaceScript(script);
        await finish(side, scrollToAnswer, false);
      })().then(function () { report(''); }, report);
    }
  };
})();`;
