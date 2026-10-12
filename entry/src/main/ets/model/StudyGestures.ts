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
export function buildStudyGestureScript(version: number, surface: number, gestures: boolean,
  completeInputs: string[] | undefined = undefined): string {
  return `(function(){
    var previous=window.__jideStudyInput;
    if(previous && previous.timer) clearTimeout(previous.timer);
    var cfg={version:${version},surface:${surface},gestures:${completeInputs === undefined ? gestures : completeInputs.includes('double')},
      complete:${completeInputs !== undefined},inputs:${JSON.stringify(completeInputs ?? [])},timer:0,last:null};
    window.__jideStudyInput=cfg;
    function editable(el){
      return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable ||
        (el.getAttribute && el.getAttribute('role')==='textbox'));
    }
    function inputFocus(el){
      var c=window.__jideStudyInput;
      if(window.jideStudyInput) window.jideStudyInput.onAction('input_focus',editable(el)?1:0,0,c.version,c.surface);
    }
    if(editable(document.activeElement)) inputFocus(document.activeElement);
    if(previous) return;
    document.addEventListener('focusin',function(e){inputFocus(e.target);});
    document.addEventListener('focusout',function(e){inputFocus(e.relatedTarget);});
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
    function scrollable(el,axis){
      while(el){
        if(axis==='vertical' ? el.scrollHeight>el.clientHeight+1 : el.scrollWidth>el.clientWidth+1) return true;
        el=el.parentElement;
      }
      return false;
    }
    function send(c,action,x,y){
      if(c!==window.__jideStudyInput || selected()) return;
      if(window.jideStudyInput) window.jideStudyInput.onAction(action,x||0,y||0,c.version,c.surface);
    }
    var touch=null,moved=false,suppressUntil=0;
    function cancelClick(c){clearTimeout(c.timer);c.timer=0;c.last=null;suppressUntil=Date.now()+500;}
    function track(s,points){
      for(var i=0;i<points.length;i++){
        var t=points[i],id=t.identifier===undefined?i:t.identifier;
        var p=s.points.filter(function(p){return p.id===id;})[0];
        if(p){if(Math.abs(t.clientX-p.x)>8 || Math.abs(t.clientY-p.y)>8) s.multiMoved=true;}
        else s.points.push({id:id,x:t.clientX,y:t.clientY});
      }
    }
    document.addEventListener('touchstart',function(e){
      var c=window.__jideStudyInput;
      if(c.complete && touch && touch.cfg===c){
        touch.blocked=touch.blocked||interactive(e.target)||selected();
        track(touch,e.touches);touch.count=Math.max(touch.count,e.touches.length);
        if(touch.count>1){moved=true;cancelClick(c);} return;
      }
      moved=false;
      if(!e.touches.length || (!c.complete && e.touches.length!==1)){touch=null;moved=true;cancelClick(c);return;}
      var t=e.touches[0], scrolls=[], el=e.target;
      while(el){scrolls.push([el,el.scrollLeft,el.scrollTop]);el=el.parentElement;}
      touch={x:t.clientX,y:t.clientY,time:Date.now(),cfg:c,blocked:interactive(e.target)||selected(),scrolls:scrolls,
        target:e.target,count:e.touches.length,points:[],multiMoved:false};
      track(touch,e.touches);
      if(touch.count>1){moved=true;cancelClick(c);}
    },{passive:true});
    document.addEventListener('touchmove',function(e){
      if(!touch) return;
      if(touch.cfg.complete && touch.count>1){track(touch,e.touches);moved=true;return;}
      if(e.touches.length!==1){touch=null;moved=true;return;}
      var dx=e.touches[0].clientX-touch.x,dy=e.touches[0].clientY-touch.y;
      if(Math.abs(dx)>8 || Math.abs(dy)>8) moved=true;
      var direction=dy<0?'up':'down';
      if(touch.cfg.complete && touch.cfg===window.__jideStudyInput && !touch.blocked && !selected() &&
        touch.cfg.inputs.indexOf(direction)>=0 && touch.y>=24 && touch.y<=window.innerHeight-24 &&
        Math.abs(dy)>8 && Math.abs(dy)>Math.abs(dx)*1.5 && !scrollable(touch.target,'vertical')) e.preventDefault();
    },{passive:false});
    document.addEventListener('touchcancel',function(){cancelClick(window.__jideStudyInput);touch=null;moved=true;},{passive:true});
    document.addEventListener('touchend',function(e){
      var s=touch;
      if(!s) return;
      if(s.cfg.complete && s.count>1){
        track(s,e.changedTouches);moved=true;cancelClick(s.cfg);
        if(e.touches.length) return;
        touch=null;
        if(s.count>4 || s.multiMoved || s.blocked || e.defaultPrevented || selected() || Date.now()-s.time>500 ||
          s.points.some(function(p){return p.x<24||p.x>window.innerWidth-24||p.y<24||p.y>window.innerHeight-24;}) ||
          s.scrolls.some(function(p){return p[0].scrollLeft!==p[1] || p[0].scrollTop!==p[2];})) return;
        var action=['','','two_finger','three_finger','four_finger'][s.count];
        if(s.cfg.inputs.indexOf(action)>=0) send(s.cfg,action);return;
      }
      touch=null;
      if(e.touches.length || e.changedTouches.length!==1) return;
      var t=e.changedTouches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;
      if(Math.abs(dx)>8 || Math.abs(dy)>8) moved=true;
      if(!moved && Date.now()-s.time>500) moved=true;
      if(moved) cancelClick(s.cfg);
      if(s.blocked || e.defaultPrevented || selected() || s.x<24 || s.x>window.innerWidth-24 || Date.now()-s.time>1200) return;
      if(s.scrolls.some(function(p){return p[0].scrollLeft!==p[1] || p[0].scrollTop!==p[2];})) return;
      if(Math.abs(dx)>=56 && Math.abs(dx)>Math.abs(dy)*1.5){
        if(!s.cfg.complete || !scrollable(s.target,'horizontal')) send(s.cfg,dx<0?'left':'right');
      } else if(s.cfg.complete && s.y>=24 && s.y<=window.innerHeight-24 && Math.abs(dy)>=56 &&
        Math.abs(dy)>Math.abs(dx)*1.5 && !scrollable(s.target,'vertical')) send(s.cfg,dy<0?'up':'down');
    },{passive:true});
    document.addEventListener('click',function(e){
      if(e.defaultPrevented || moved || Date.now()<suppressUntil || selected()) return;
      var audio=e.target;
      while(audio){
        var target=audio.getAttribute && audio.getAttribute('data-jide-audio');
        if(target && /^[qa]:[0-9]+$/.test(target)){e.preventDefault();send(window.__jideStudyInput,'audio:'+target);return;}
        audio=audio.parentElement;
      }
      if(interactive(e.target)) return;
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
