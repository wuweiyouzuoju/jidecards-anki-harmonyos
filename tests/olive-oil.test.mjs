// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {OliveOil, olivePath, oliveSplitPath} from '../src/core/OliveOil.ts';
const source=readFileSync(new URL('../src/core/OliveOilSession.ts',import.meta.url),'utf8')
  .replace(/^import[^;]+;\n/gm,'').replaceAll('export ','');
const Session=vm.runInNewContext(stripTypeScriptTypes(source+'\nOliveOilSession',{mode:'transform'}),{OliveOil});
class Clock {
  now=0; next=0; tasks=new Map();
  schedule(ms,work){const id=++this.next;this.tasks.set(id,{at:this.now+ms,work});return id;}
  cancel(id){this.tasks.delete(id);}
  advance(ms){const end=this.now+ms;while(true){const pending=[...this.tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;
    this.now=pending[1].at;this.tasks.delete(pending[0]);pending[1].work();}this.now=end;}
}
test('橄榄油真实时序：隐藏25ms、主体240ms、文字提前50ms、重入与往返',()=>{
 const clock=new Clock(),events=[];const s=new Session(clock,state=>events.push({...state,at:clock.now}));
 assert.equal(s.transition(true),true);assert.equal(s.transition(false),false);
 clock.advance(24);assert.equal(s.snapshot().surfaceActive,false);
 clock.advance(1);assert.equal(s.snapshot().phase,'measure');s.startSurface();s.startSurface();
 clock.advance(49);assert.equal(s.snapshot().contentVisible,false);
 clock.advance(1);assert.equal(s.snapshot().contentVisible,true);assert.equal(s.snapshot().isTransitioning,true);
 clock.advance(190);assert.equal(s.snapshot().isTransitioning,false);assert.equal(s.snapshot().progress,1);
 assert.equal(s.transition(false),true);clock.advance(25);s.startSurface();clock.advance(240);
 assert.equal(s.snapshot().progress,0);assert.equal(s.snapshot().contentExpanded,false);
 assert.equal(events.filter(e=>e.phase==='shape').length,2);
});
test('缺失锚点兜底、减少动态效果、重定向和销毁使迟到回调失效',()=>{
 const c=new Clock(),events=[];const s=new Session(c,v=>events.push(v));s.transition(true);c.advance(145);
 assert.equal(s.snapshot().isTransitioning,false);assert.equal(s.snapshot().contentExpanded,true);
 s.transition(false,true);c.advance(25);assert.equal(s.snapshot().surfaceActive,false);c.advance(100);
 assert.equal(s.snapshot().isTransitioning,false);
 s.transition(true,false,false);c.advance(30);s.transition(false,false,false);c.advance(400);
 assert.equal(s.snapshot().progress,0);assert.equal(s.snapshot().contentExpanded,false);
 s.transition(true);s.settle();const old=s.snapshot();c.advance(500);assert.equal(s.snapshot().progress,old.progress);
 s.transition(false);s.dispose();const count=events.length;c.advance(500);assert.equal(events.length,count);
});
test('输出拒绝无效几何，进度钳位且轮廓不产生NaN',()=>{
 const top={x:12,y:12,width:296,height:100},low={x:12,y:128,width:296,height:180};
 assert.equal(oliveSplitPath({...top,width:0},low,100,0.5),'');
 assert.equal(oliveSplitPath(top,low,100,NaN),oliveSplitPath(top,low,100,0));
 for(const p of [-1,0,.04,.36,.64,.97,.999,1,2]){const path=oliveSplitPath(top,low,100,p);assert.ok(path.length>0);assert.ok(!/NaN|Infinity/.test(path));}
});
// 独立将SVG贝塞尔细分为线段，以非零环绕规则比较iOS Path.contains输出。
function polygons(path){
 const tokens=path.match(/[MLCQZ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)||[];let i=0,x=0,y=0,current=[],all=[];
 const num=()=>Number(tokens[i++]);const append=(a,b)=>{x=a;y=b;current.push([a,b]);};
 while(i<tokens.length){const cmd=tokens[i++];if(cmd==='M'){if(current.length)all.push(current);current=[];append(num(),num());}
 else if(cmd==='L')append(num(),num());
 else if(cmd==='C'){const x0=x,y0=y,a=num(),b=num(),c=num(),d=num(),e=num(),f=num();for(let k=1;k<=24;k++){const t=k/24,u=1-t;append(u*u*u*x0+3*u*u*t*a+3*u*t*t*c+t*t*t*e,u*u*u*y0+3*u*u*t*b+3*u*t*t*d+t*t*t*f);}}
 else if(cmd==='Q'){const x0=x,y0=y,a=num(),b=num(),c=num(),d=num();for(let k=1;k<=24;k++){const t=k/24,u=1-t;append(u*u*x0+2*u*t*a+t*t*c,u*u*y0+2*u*t*b+t*t*d);}}
 else if(cmd==='Z'){all.push(current);current=[];}else throw Error('Unknown SVG command '+cmd);}
 return all;
}
function contains(polys,x,y){let w=0;for(const ps of polys){for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];const cross=(b[0]-a[0])*(y-a[1])-(x-a[0])*(b[1]-a[1]);if(a[1]<=y){if(b[1]>y&&cross>0)w++;}else if(b[1]<=y&&cross<0)w--;}}return w!==0;}
const reference=JSON.parse(readFileSync(new URL('./fixtures/olive-ios-reference.json',import.meta.url),'utf8'));
for(const kind of ['cluster','horizontal','vertical','travel','radial','ligament']){
 test('对照真实iOS轮廓采样：'+kind,()=>{
  for(const frame of reference.frames.filter(f=>f.kind===kind)){
   const geometry={sources:frame.sources,destinations:frame.destinations,axis:kind==='horizontal'?'horizontal':'vertical',
    mode:['cluster','radial','ligament'].includes(kind)?kind:'group',radius:kind==='horizontal'?26:22};
   const path=olivePath(geometry,frame.progress);assert.ok(!/NaN|Infinity/.test(path));const ps=polygons(path);
   let index=0,mismatch=0;for(let y=4;y<=316;y+=8){for(let x=4;x<=316;x+=8){if(contains(ps,x,y)!==(frame.occupancy[index++]==='1'))mismatch++;}}
   // SwiftUI连续圆角与ArkUI三次圆角允许边缘差异，主体/连接片仍逐帧覆盖。
   assert.ok(mismatch/1600<=0.02,`${kind}@${frame.progress}: ${mismatch}/1600 grid samples differ`);
  }
 });
}

test('轮盘根部与圆心始终实心，不因连接片绕向相反挖空',()=>{
 const frame=reference.frames.find(f=>f.kind==='radial'&&f.progress===0.55);
 for(const progress of [.25,.5,.55,.75]){
  const path=olivePath({sources:frame.sources,destinations:frame.destinations,axis:'vertical',mode:'radial',radius:23},progress);
  const ps=polygons(path);
  for(let y=252;y<=292;y+=4)for(let x=140;x<=180;x+=4){if(Math.hypot(x-160,y-272)<23)assert.ok(contains(ps,x,y),`hub missing ${x},${y}@${progress}`);}
 }
});
