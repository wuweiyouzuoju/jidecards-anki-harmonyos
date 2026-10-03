// SPDX-License-Identifier: AGPL-3.0-or-later
import type { StudyInputCommand } from './StudyInputPolicy';

export enum StudyQuickAnswerMode {
  Off = 0,
  TapZones = 1,
  Gestures = 2
}

/** 旧版双开优先保留四象限；新模式是唯一有效值。 */
export function resolveStudyQuickAnswerMode(value: number, tapZones: boolean,
  gestures: boolean): StudyQuickAnswerMode {
  if (value === StudyQuickAnswerMode.Off || value === StudyQuickAnswerMode.TapZones ||
    value === StudyQuickAnswerMode.Gestures) return value;
  return tapZones ? StudyQuickAnswerMode.TapZones :
    (gestures ? StudyQuickAnswerMode.Gestures : StudyQuickAnswerMode.Off);
}

export interface StudyGestureState {
  phase: string;
  gestures: boolean;
  tapZones: boolean;
  choice: boolean;
  blocked: boolean;
}

/** 普通卡只在答案面评分；选择题反馈的右滑仅继续，不重复提交评分。 */
export function resolveStudyGesture(action: string, state: StudyGestureState,
  nx: number = 0, ny: number = 0): StudyInputCommand | 'continue' {
  if (state.blocked) return 'none';
  if (state.choice) return action === 'right' && state.phase === 'answer' ? 'continue' : 'none';
  if (state.gestures && action === 'double') return state.phase === 'question' ? 'flip' : 'none';
  if (state.gestures && state.phase === 'answer') {
    if (action === 'left') return 'good';
    if (action === 'right') return 'hard';
  }
  if (action !== 'tap' || !state.tapZones || !Number.isFinite(nx) || !Number.isFinite(ny) ||
    nx < 0 || nx > 1 || ny < 0 || ny > 1) return 'none';
  if (state.phase === 'question') return 'flip';
  if (state.phase !== 'answer') return 'none';
  return ny < 0.5 ? (nx < 0.5 ? 'again' : 'hard') : (nx < 0.5 ? 'good' : 'easy');
}

/** 文档内识别触摸；每次卡面更新撤销待判定点击，并携带原卡片/卡面代次。 */
export function buildStudyGestureScript(version: number, surface: number, gestures: boolean): string {
  return `(function(){
    var previous=window.__jideStudyInput;
    if(previous && previous.timer) clearTimeout(previous.timer);
    var cfg={version:${version},surface:${surface},gestures:${gestures},timer:0,last:null};
    window.__jideStudyInput=cfg;
    if(previous) return;
    function interactive(el){
      while(el){
        if(/^(A|BUTTON|INPUT|TEXTAREA|SELECT|OPTION|CANVAS|AUDIO|VIDEO|IFRAME|SUMMARY|DETAILS)$/.test(el.tagName)
          || el.isContentEditable || (el.getAttribute && (el.getAttribute('data-jide-gesture')==='ignore'
          || el.getAttribute('onclick')!==null || /^(button|link|slider|textbox|checkbox|radio)$/.test(el.getAttribute('role'))))
          || (el.classList && el.classList.contains('sound-flag'))) return true;
        el=el.parentElement;
      }
      return false;
    }
    function selected(){return String(window.getSelection()||'').length>0;}
    function send(c,action,x,y){
      if(c!==window.__jideStudyInput || selected()) return;
      if(window.jideStudyInput) window.jideStudyInput.onAction(action,x||0,y||0,c.version,c.surface);
    }
    var touch=null,moved=false,suppressUntil=0;
    document.addEventListener('touchstart',function(e){
      moved=false;
      if(e.touches.length!==1){touch=null;moved=true;return;}
      var t=e.touches[0], c=window.__jideStudyInput, scrolls=[], el=e.target;
      while(el){scrolls.push([el,el.scrollLeft,el.scrollTop]);el=el.parentElement;}
      touch={x:t.clientX,y:t.clientY,time:Date.now(),cfg:c,blocked:interactive(e.target)||selected(),scrolls:scrolls};
    },{passive:true});
    document.addEventListener('touchmove',function(e){
      if(!touch) return;
      if(e.touches.length!==1){touch=null;moved=true;return;}
      if(Math.abs(e.touches[0].clientX-touch.x)>8 || Math.abs(e.touches[0].clientY-touch.y)>8) moved=true;
    },{passive:true});
    document.addEventListener('touchcancel',function(){touch=null;moved=true;suppressUntil=Date.now()+500;},{passive:true});
    document.addEventListener('touchend',function(e){
      var s=touch;touch=null;
      if(!s || e.touches.length || e.changedTouches.length!==1) return;
      var t=e.changedTouches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;
      if(Math.abs(dx)>8 || Math.abs(dy)>8) moved=true;
      if(!moved && Date.now()-s.time>500) moved=true;
      if(moved){suppressUntil=Date.now()+500;clearTimeout(s.cfg.timer);s.cfg.last=null;}
      if(s.blocked || e.defaultPrevented || selected() || s.x<24 || s.x>window.innerWidth-24
        || Math.abs(dx)<56 || Math.abs(dx)<=Math.abs(dy)*1.5 || Date.now()-s.time>1200) return;
      if(s.scrolls.some(function(p){return p[0].scrollLeft!==p[1] || p[0].scrollTop!==p[2];})) return;
      send(s.cfg,dx<0?'left':'right');
    },{passive:true});
    document.addEventListener('click',function(e){
      if(e.defaultPrevented || moved || Date.now()<suppressUntil || interactive(e.target) || selected()) return;
      var c=window.__jideStudyInput,x=e.clientX/window.innerWidth,y=e.clientY/window.innerHeight;
      if(!c.gestures){send(c,'tap',x,y);return;}
      var now=Date.now(),last=c.last;
      if(last && now-last.time<=320 && Math.abs(e.clientX-last.x)<=24 && Math.abs(e.clientY-last.y)<=24){
        clearTimeout(c.timer);c.timer=0;c.last=null;
        e.preventDefault();send(c,'double');return;
      }
      if(last){clearTimeout(c.timer);send(c,'tap',last.nx,last.ny);}
      c.last={time:now,x:e.clientX,y:e.clientY,nx:x,ny:y};
      c.timer=setTimeout(function(){c.timer=0;c.last=null;send(c,'tap',x,y);},320);
    });
  })();`;
}
