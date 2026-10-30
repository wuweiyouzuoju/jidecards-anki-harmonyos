// SPDX-License-Identifier: AGPL-3.0-or-later
/** All card surfaces use one scoped bridge. Never expose arbitrary Anki pycmd to templates. */
export interface NoteReferencePalette { surface: string; text: string; }
export function noteLinkBridgeScript(version: number, mirror?: string, palette?: NoteReferencePalette): string {
  const surface: string = palette?.surface ?? '';
  const text: string = palette?.text ?? '';
  const colors: string = /^#[0-9a-f]{6}$/i.test(surface) && /^#[0-9a-f]{6}$/i.test(text) ?
    'html{--jide-reference-surface:' + surface + ';--jide-reference-text:' + text + '}' : '';
  return `(function(){
    var v=${version};window.__jideLinkVersion=v;
    var old=window.__jideLinkBinding;
    if(old){document.removeEventListener('click',old.click,true);document.removeEventListener('keydown',old.key,true);}
    function open(row,edit){
      var guid=row.getAttribute('data-guid')||'';
      if(!guid){var href=row.getAttribute('href')||'';if(href.indexOf('#jide-note:')===0){try{guid=decodeURIComponent(href.slice(11));}catch(e){}}}
      if(guid && window.jideNoteLinks) window.jideNoteLinks.onLink(guid,edit?'edit':'preview',v);
    }
    window.mlxGo=function(ev){if(ev){ev.preventDefault();ev.stopPropagation();} var row=ev&&(ev.currentTarget||ev.target);if(row&&row.closest)row=row.closest('.ml-mirror-row');if(row)open(row,false);};
    var click=function(ev){var row=ev.target.closest&&ev.target.closest('.ml-mirror-row[data-guid],a[href^="#jide-note:"]');if(!row)return;ev.preventDefault();ev.stopImmediatePropagation();open(row,false);};
    var key=function(ev){if(ev.key!=='Enter'&&ev.key!==' ')return;var row=ev.target.closest&&ev.target.closest('.ml-mirror-row[data-guid],a[href^="#jide-note:"]');if(row){ev.preventDefault();ev.stopImmediatePropagation();open(row,false);}};
    window.__jideLinkBinding={click:click,key:key};document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
    var style=document.getElementById('jide-note-link-style')||document.createElement('style');style.id='jide-note-link-style';style.textContent=${JSON.stringify(colors)}+'#qa a[href^="#jide-note:"]{background:var(--jide-reference-surface,#E8EEFC);color:var(--jide-reference-text,inherit);text-decoration:none!important;border-radius:.2em;padding:0 .08em;box-decoration-break:clone;-webkit-box-decoration-break:clone}.ml-mirror{box-sizing:border-box;width:100%;margin:12px 0;padding:12px;border-radius:12px;background:rgba(127,127,127,.09);text-align:left;overflow-wrap:anywhere}.jide-links-label{font-size:.85em;opacity:.65;margin:8px 0}.ml-mirror-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;box-sizing:border-box;padding:8px 10px;border-radius:8px;margin:4px 0;background:rgba(127,127,127,.10);color:inherit;cursor:pointer}.ml-mirror-row>span:first-child{flex:1;min-width:0}.ml-mirror-row:focus-visible{outline:2px solid currentColor}.ml-mirror-row:active{background:rgba(127,127,127,.24)}';document.head.appendChild(style);
  })();` + (mirror === undefined ? '' : noteLinkMirrorScript(version, mirror));
}
/** 运行时镜像避免给普通笔记类型加字段；只更新当前代次文档的自有展示块。 */
export function noteLinkMirrorScript(version: number, html: string): string {
  return `(function(){if(!window.__jideLinkBinding||window.__jideLinkVersion!==${version})return;var root=document.getElementById('qa');if(!root)return;root.querySelectorAll('.ml-mirror,[data-jide-links-runtime]').forEach(function(n){n.remove();});var box=document.createElement('div');box.setAttribute('data-jide-links-runtime','');box.innerHTML=${JSON.stringify(html).replace(/</g, '\\u003c')};root.appendChild(box);})();`;
}
