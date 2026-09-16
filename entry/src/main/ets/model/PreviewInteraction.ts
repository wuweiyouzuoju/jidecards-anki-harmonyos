// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 预览只发送翻面/上一步/下一步/重播意图；链接、表单、遮罩画布、选中文本与缩放不触发动作。
 * 与 Anki 浏览器预览一致：点击卡片看答案，方向键/左右滑按 Anki 的 "<" ">" 语义走。
 * Invariants: 文档代次随回调传回，旧页面事件不能操作新卡；不包含评分接口。
 */
export function buildPreviewInteractionScript(version: number): string {
  return `(function(){
    var version=${version};
    function interactive(el){
      while(el){
        if(/^(A|BUTTON|INPUT|TEXTAREA|SELECT|OPTION|CANVAS|AUDIO|VIDEO|IFRAME|SUMMARY|DETAILS)$/.test(el.tagName)
          || el.isContentEditable || (el.getAttribute && /^(button|link|slider|textbox)$/.test(el.getAttribute('role')))) return true;
        el=el.parentElement;
      }
      return false;
    }
    var moved=false, startX=0, startY=0, startTime=0, startedOnInteractive=false;
    document.addEventListener('touchstart',function(e){
      moved=e.touches.length!==1;
      startedOnInteractive=e.touches.length===1 && !!e.target && interactive(e.target);
      if(e.touches.length){startX=e.touches[0].clientX;startY=e.touches[0].clientY;}
      startTime=Date.now();
    },{passive:true});
    document.addEventListener('touchmove',function(e){
      if(e.touches.length!==1 || Math.abs(e.touches[0].clientX-startX)>8 || Math.abs(e.touches[0].clientY-startY)>8) moved=true;
    },{passive:true});
    // 左右滑等价 Anki 预览的 "<" ">"：左滑→下一步，右滑→上一步。
    // 只能在文档内判定：ArkWeb 先消费触摸，挂在 Web 组件上的 ArkUI 手势收不到。
    // 只认单指、横向位移占优且 >=48px、1.2s 内完成的滑动；起点在链接/表单/画布上时不抢手势。
    document.addEventListener('touchend',function(e){
      if(!e.changedTouches || e.changedTouches.length!==1 || startedOnInteractive) return;
      var t=e.changedTouches[0], dx=t.clientX-startX, dy=t.clientY-startY;
      if(Math.abs(dx)<48 || Math.abs(dx)<=Math.abs(dy) || Date.now()-startTime>1200) return;
      if(window.jidePreview) window.jidePreview.onAction(dx<0?'next':'previous',version);
    },{passive:true});
    // 点击卡片 = 看答案（题目态有效；答案态由后端状态机忽略）。滑动后的合成 click 被 moved 抑制。
    document.addEventListener('click',function(e){
      if(e.defaultPrevented || moved || String(window.getSelection()||'').length) return;
      if(e.target.classList && e.target.classList.contains('sound-flag')){
        if(window.jidePreview) window.jidePreview.onAction('replay',version);
        return;
      }
      if(interactive(e.target)) return;
      if(window.jidePreview) window.jidePreview.onAction('flip',version);
    });
    document.addEventListener('keydown',function(e){
      if(e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.metaKey || interactive(e.target)) return;
      var action=e.key==='ArrowLeft'?'previous':e.key==='ArrowRight'?'next':'';
      if(action && window.jidePreview){e.preventDefault();window.jidePreview.onAction(action,version);}
    });
  })();`;
}
