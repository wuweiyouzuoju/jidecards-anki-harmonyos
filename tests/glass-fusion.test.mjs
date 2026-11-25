// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {glassDistance,glassMeshAxis,glassSample} from '../src/core/GlassOptics.ts';
const source=readFileSync(new URL('../src/core/GlassFusion.ts',import.meta.url),'utf8').replace(/^import[^;]+;\s*/gm,'').replace(/^export /gm,'');
const {GlassFusionTessellator,glassFusionDistance,validGlassFusion,glassFusionStageRect,glassFusionTiming,glassPopupTriggerRect,GLASS_MENU_ENTER_MS}=new Function('glassDistance','glassMeshAxis',stripTypeScriptTypes(source,{mode:'transform'})+';return {GlassFusionTessellator,glassFusionDistance,validGlassFusion,glassFusionStageRect,glassFusionTiming,glassPopupTriggerRect,GLASS_MENU_ENTER_MS};')(glassDistance,glassMeshAxis);
const geometry={source:{x:180,y:10,width:44,height:44,radius:22},target:{x:10,y:70,width:220,height:320,radius:16}};

test('fusion endpoints exactly match the source and target analytic distance fields',()=>{
 for(const [p,r] of [[0,geometry.source],[1,geometry.target]])
  for(let y=0;y<420;y+=13)for(let x=0;x<250;x+=13)
   assert.ok(Math.abs(glassFusionDistance(x,y,geometry,p)-glassDistance(x-r.x,y-r.y,r.width,r.height,r.radius))<1e-10);
});
test('fusion mesh is bounded, finite, consistently wound and keeps refraction at the external boundary zero',()=>{
 for(const density of [1,2,3]) {
  const g=JSON.parse(JSON.stringify(geometry));for(const r of [g.source,g.target])for(const k of Object.keys(r))r[k]*=density;
  const t=new GlassFusionTessellator(250*density,420*density,density);
  for(let frame=0;frame<=30;frame++) {
   const mesh=t.update(g,frame/30);
   assert.ok(mesh.positions.length<=1024*8);
   assert.equal(mesh.texture.length,mesh.positions.length);
   assert.equal(mesh.edge.length%2,0);
   for(const p of mesh.texture) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
   for(let i=0;i<mesh.indices.length;i+=3) {
    const [a,b,c]=mesh.indices.slice(i,i+3).map(n=>mesh.texture[n]);
    assert.ok((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>=-1e-7,'refraction mesh cannot fold');
   }
   for(const p of mesh.edge) {
    const i=mesh.positions.findIndex(q=>q.x===p.x&&q.y===p.y);assert.ok(i>=0);
    assert.deepEqual(mesh.positions[i],mesh.texture[i]);
   }
  }
 }
});
test('invalid geometry renders nothing; out of range progress clamps and reuses the mesh owner',()=>{
 const t=new GlassFusionTessellator(250,420);
 const mesh=t.update(geometry,0);assert.equal(t.update(geometry,1),mesh);
 const invalid=JSON.parse(JSON.stringify(geometry));invalid.target.width=NaN;
 assert.equal(validGlassFusion(invalid),false);assert.equal(t.update(invalid,.5).positions.length,0);
 assert.equal(glassFusionDistance(0,0,geometry,-2),glassFusionDistance(0,0,geometry,0));
});
test('fusion geometry benchmark reports host CPU cost separately from device frame performance',t=>{
 const tess=new GlassFusionTessellator(750,1260,3),g=JSON.parse(JSON.stringify(geometry));
 for(const r of [g.source,g.target])for(const k of Object.keys(r))r[k]*=3;
 const times=[];for(let i=0;i<180;i++){const start=performance.now();tess.update(g,(i%60)/59);times.push(performance.now()-start);}
 times.sort((a,b)=>a-b);t.diagnostic(`host geometry median=${times[90].toFixed(2)}ms p95=${times[171].toFixed(2)}ms; not device FPS`);
});

function componentHarness() {
 const original=readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
 let component=original.slice(original.indexOf('@Component\nexport struct SharedGlassFusion'));
 component=component.slice(0,component.indexOf('  build() {'))+'}';
 component=component.replace(/@(Component|Prop|Watch)(?:\([^\n]*?\))?\s*/g,'').replace('export struct SharedGlassFusion','class SharedGlassFusion');
 const callbacks=[],timers=new Map(),events=[],nodes=[];let timer=0;
 class Controller {
  glass={ready(){},configureFusion(){},drawMetrics(){return '0,0';},vertexDrawMean(){return '0';},freezeBackdrop:false};dispose(){events.push('dispose');}
  constructor(){nodes.push(this.glass);}
 }
 const Component=new Function('GLASS_MENU_ENTER_MS','GlassController','GlassFusionFrame','GlassFusionTessellator','validGlassFusion','glassFusionTiming','deviceInfo','session','hilog','setTimeout','clearTimeout',
  stripTypeScriptTypes(component,{mode:'transform'})+';return SharedGlassFusion;')(
   160,Controller,class {constructor(tick){this.onFrame=tick;}},GlassFusionTessellator,validGlassFusion,glassFusionTiming,{apiAvailable:()=>true},
   ()=>({attach(){events.push('attach');},detach(){events.push('detach');}}),{info(){}},fn=>{timers.set(++timer,fn);return timer;},id=>timers.delete(id));
 const view=new Component();view.source='body';view.geometry=geometry;view.region={left:0,top:0,width:250,height:420};
 view.getUIContext=()=>({vp2px:n=>n,postFrameCallback:fn=>callbacks.push(fn)});
 view.onComplete=reason=>events.push(reason);
 return {view,callbacks,timers,events,nodes,frame(ms){const fn=callbacks.shift();assert.ok(fn);fn.onFrame(ms*1e6);}};
}
test('fusion waits for an actual texture, runs on display frames, finishes once and cancels late work on disposal',()=>{
 const h=componentHarness();h.view.aboutToAppear();assert.equal(h.callbacks.length,0);assert.equal(h.nodes[0].freezeBackdrop,true);
 h.nodes[0].ready();assert.equal(h.timers.size,0);h.frame(0);h.frame(100);assert.ok(h.view.progress>0&&h.view.progress<1);
 h.frame(300);assert.equal(h.view.progress,1);assert.equal(h.events.filter(x=>x==='finished').length,1);assert.equal(h.callbacks.length,0);
 h.view.aboutToDisappear();assert.deepEqual(h.events.slice(-2),['detach','dispose']);
});
test('reversing a running fusion continues from current progress without multiplying frame callbacks',()=>{
 const h=componentHarness();h.view.aboutToAppear();h.nodes[0].ready();h.frame(0);h.frame(100);
 const current=h.view.progress;h.view.expanded=false;h.view.playbackChanged();assert.equal(h.callbacks.length,1);
 h.frame(110);assert.equal(h.view.progress,current);h.frame(410);assert.equal(h.view.progress,0);
});
test('inactive, preparation failure, reduced motion and disposal leave no running animation',()=>{
 const wait=componentHarness();wait.view.aboutToAppear();[...wait.timers.values()][0]();
 assert.ok(wait.events.includes('not_ready'));wait.nodes[0].ready();assert.equal(wait.callbacks.length,0);
 const reduce=componentHarness();reduce.view.reducedMotion=true;reduce.view.aboutToAppear();reduce.nodes[0].ready();
 assert.equal(reduce.view.progress,1);assert.ok(reduce.events.includes('reduced_motion'));assert.equal(reduce.callbacks.length,0);
 const inactive=componentHarness();inactive.view.aboutToAppear();inactive.nodes[0].ready();inactive.view.active=false;inactive.view.playbackChanged();
 inactive.frame(1);assert.equal(inactive.callbacks.length,0);assert.ok(inactive.events.includes('inactive'));
 const gone=componentHarness();gone.view.aboutToAppear();gone.nodes[0].ready();gone.view.aboutToDisappear();gone.frame(0);assert.equal(gone.callbacks.length,0);
});

test('a prepared fusion freezes new capture and blur only for its shared source until completion',()=>{
 const source=readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('class BackdropSession'),source.indexOf('const sessions:'));
 const Session=new Function('deviceInfo',stripTypeScriptTypes(code,{mode:'transform'})+';return BackdropSession;')({apiAvailable:()=>false});
 const session=new Session({},'body');const node={freezeBackdrop:true};session.listeners.add(node);
 assert.equal(session.fusionHolding(),false,'first real frame is still permitted');
 session.frame={};assert.equal(session.fusionHolding(),true);
 node.freezeBackdrop=false;assert.equal(session.fusionHolding(),false);
 session.listeners.delete(node);assert.equal(session.fusionHolding(),false);
});

test('adaptive external edge error stays below 0.16vp for both small source and wide target without a dense full mesh',()=>{
 const g={source:{x:620,y:12,width:44,height:44,radius:16},target:{x:60,y:100,width:600,height:400,radius:24}};
 const tess=new GlassFusionTessellator(720,560,1,128);
 for(const [progress,r] of [[0,g.source],[1,g.target]]) {
  const mesh=tess.update(g,progress);
  for(let i=0;i<mesh.edge.length;i+=2) {
   const a=mesh.edge[i],b=mesh.edge[i+1];
   for(const q of [a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2}])
    assert.ok(Math.abs(glassDistance(q.x-r.x,q.y-r.y,r.width,r.height,r.radius))<.16,'test vertices AND segment interiors');
  }
 }
});

test('slow geometry updates never truncate a running animation to its terminal shape',()=>{
 const h=componentHarness();h.view.aboutToAppear();h.nodes[0].ready();h.frame(0);
 h.view.slowFrames=100;h.frame(100);
 assert.ok(h.view.progress>0&&h.view.progress<1);assert.equal(h.events.includes('frame_budget'),false);
 assert.equal(h.callbacks.length,1);h.frame(300);assert.ok(h.events.includes('finished'));
});

test('resizing a completed or running fusion updates the same material without replaying entrance or leaking frames',()=>{
 const h=componentHarness();h.view.aboutToAppear();h.nodes[0].ready();h.frame(0);h.frame(300);
 const completed=h.events.filter(x=>x==='finished').length;
 h.view.region={left:30,top:60,width:400,height:550};
 h.view.geometry={source:{x:40,y:70,width:44,height:44,radius:16},target:{x:50,y:130,width:360,height:420,radius:20}};
 h.view.geometryChanged();assert.equal(h.view.progress,1);assert.equal(h.callbacks.length,0);
 assert.equal(h.view.localGeometry.target.width,360);assert.equal(h.view.localGeometry.target.x,20);
 assert.equal(h.events.filter(x=>x==='finished').length,completed);
 h.view.expanded=false;h.view.playbackChanged();h.frame(400);h.frame(450);const p=h.view.progress;
 h.view.geometry.target.height=300;h.view.geometryChanged();assert.equal(h.view.progress,p);assert.equal(h.callbacks.length,1);
 h.view.aboutToDisappear();h.view.geometryChanged();assert.equal(h.view.tessellator,undefined);
});


test('restoring an already visible panel draws its terminal material without replaying an entrance',()=>{
 const h=componentHarness();h.view.animateEntrance=false;h.view.aboutToAppear();assert.equal(h.view.progress,1);
 h.nodes[0].ready();assert.equal(h.callbacks.length,0);assert.ok(h.events.includes('finished'));
});

test('geometry updates do not revive a disposed material or restart completed preparation',()=>{
 const h=componentHarness();h.view.aboutToAppear();h.view.geometry={source:geometry.source,target:{...geometry.target,height:0}};h.view.geometryChanged();
 assert.equal(h.view.progress,0);h.view.aboutToDisappear();h.nodes[0].ready();assert.equal(h.callbacks.length,0);
});

test('rounded corner tangent vertices retain the area between the chord and arc',()=>{
 const g={source:{x:0,y:0,width:44,height:44,radius:22},target:{x:0,y:0,width:280,height:500,radius:24}};
 const mesh=new GlassFusionTessellator(280,500,1).update(g,1);
 const point={x:8,y:8};assert.ok(glassFusionDistance(point.x,point.y,g,1)<0);
 const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
 const inside=(a,b,c)=>{const values=[cross(a,b,point),cross(b,c,point),cross(c,a,point)];return values.every(v=>v>=-1e-6)||values.every(v=>v<=1e-6);};
 assert.ok(mesh.indices.some((_,i)=>i%3===0&&inside(...mesh.indices.slice(i,i+3).map(index=>mesh.positions[index]))));
});

test('all four rounded corners retain interior coverage across tall tablet menu sizes',()=>{
 for(const [width,height,density] of [[280,617,1],[280,617,2.5],[480,304,2.5],[280,500,1],[280,617.2,2.5]]) {
  const g={source:{x:0,y:0,width:44*density,height:44*density,radius:22*density},target:{x:0,y:0,width:width*density,height:height*density,radius:24*density}};
  const offset=8.48*density;
  g.source.x+=offset;g.source.y+=offset;g.target.x+=offset;g.target.y+=offset;
  const mesh=new GlassFusionTessellator(g.target.width+2*offset,g.target.height+2*offset,density).update(g,1);
  for(const point of [{x:8*density,y:8*density},{x:(width-8)*density,y:8*density},{x:8*density,y:(height-8)*density},{x:(width-8)*density,y:(height-8)*density}]) {
   point.x+=offset;point.y+=offset;
   const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
   const inside=(a,b,c)=>{const values=[cross(a,b,point),cross(b,c,point),cross(c,a,point)];return values.every(v=>v>=-1e-6)||values.every(v=>v<=1e-6);};
   assert.ok(mesh.indices.some((_,i)=>i%3===0&&inside(...mesh.indices.slice(i,i+3).map(index=>mesh.positions[index]))),JSON.stringify({width,height,density,point}));
  }
 }
});


test('liquid stage becomes a true sphere midway and preserves exact endpoint geometry',()=>{
 assert.deepEqual(glassFusionStageRect(geometry,0),geometry.source);
 const end=glassFusionStageRect(geometry,1);
 for(const key of Object.keys(geometry.target))assert.ok(Math.abs(end[key]-geometry.target[key])<1e-9);
 const ball=glassFusionStageRect(geometry,.5);assert.ok(Math.abs(ball.width-ball.height)<1e-9);
 assert.equal(ball.radius,ball.width/2);
 for(const expanding of [true,false]) {
  let previous=-1;
  for(let i=0;i<=100;i++){const p=glassFusionTiming(i/100,expanding);assert.ok(p>=previous&&p<=1);previous=p;}
  assert.equal(glassFusionTiming(0,expanding),0);assert.equal(glassFusionTiming(1,expanding),1);
 }
});

test('settled glass has a full perimeter and a conforming texture grid rather than corner-only edges',()=>{
 const g={source:{x:20,y:20,width:44,height:44,radius:16},target:{x:30,y:100,width:480,height:520,radius:24}};
 const mesh=new GlassFusionTessellator(600,700,1).update(g,1);
 assert.deepEqual(mesh.clipRect,g.target);
 let length=0;const edges=new Map();
 for(let i=0;i<mesh.edge.length;i+=2)length+=Math.hypot(mesh.edge[i].x-mesh.edge[i+1].x,mesh.edge[i].y-mesh.edge[i+1].y);
 const expected=2*(480+520-4*24)+2*Math.PI*24;assert.ok(Math.abs(length-expected)<1);
 for(let i=0;i<mesh.indices.length;i+=3)for(let j=0;j<3;j++) {
  const a=mesh.indices[i+j],b=mesh.indices[i+(j+1)%3],key=[a,b].sort((x,y)=>x-y).join(':');
  edges.set(key,(edges.get(key)??0)+1);
 }
 for(const [key,count] of edges) {
  assert.ok(count===1||count===2);
  if(count===1) {
   const [a,b]=key.split(':').map(Number).map(i=>mesh.positions[i]);
   assert.ok((a.x===30&&b.x===30)||(a.x===510&&b.x===510)||(a.y===100&&b.y===100)||(a.y===620&&b.y===620),'unpaired internal edges create visible diagonal texture seams');
  }
 }
});

test('popup origin preserves the actual native outline and clamps only to measured bounds',()=>{
 assert.deepEqual(glassPopupTriggerRect(10,20,44,44,22),{x:10,y:20,width:44,height:44,radius:22});
 assert.equal(glassPopupTriggerRect(10,20,80,32,22).radius,16);
 assert.equal(glassPopupTriggerRect(10,20,44,44,-1).radius,0);
 assert.equal(GLASS_MENU_ENTER_MS,160);
});


test('rounded morph stages preserve analytic clipping and bounded refraction interpolation', t => {
 let error = 0;
 for (const density of [1, 2, 3]) {
  const g = structuredClone(geometry);
  for (const rect of [g.source, g.target]) for (const key of Object.keys(rect)) rect[key] *= density;
  const tessellator = new GlassFusionTessellator(250 * density, 420 * density, density);
  for (const progress of [.4, .5, .7, .9, .96, 1]) {
   const rect = glassFusionStageRect(g, progress), mesh = tessellator.update(g, progress);
   assert.deepEqual(mesh.clipRect, rect);
   const band = Math.min(36 * density, Math.min(g.target.width, g.target.height) * .4);
   for (let index = 0; index < mesh.indices.length; index += 3) {
    const ids = mesh.indices.slice(index, index + 3);
    const x = ids.reduce((sum, i) => sum + mesh.positions[i].x, 0) / 3;
    const y = ids.reduce((sum, i) => sum + mesh.positions[i].y, 0) / 3;
    if (glassDistance(x - rect.x, y - rect.y, rect.width, rect.height, rect.radius) >= 0) continue;
    const exact = glassSample(x - rect.x, y - rect.y, rect.width, rect.height, rect.radius, band, Math.min(10 * density, band * .3));
    const tx = ids.reduce((sum, i) => sum + mesh.texture[i].x, 0) / 3;
    const ty = ids.reduce((sum, i) => sum + mesh.texture[i].y, 0) / 3;
    error = Math.max(error, Math.hypot(tx - rect.x - exact.x, ty - rect.y - exact.y) / density);
   }
  }
 }
 t.diagnostic(`maximum refraction interpolation error ${error.toFixed(3)}vp`);
 assert.ok(error < 1, 'moving refraction must stay within one vp of the analytic field');
});

test('merged interior triangles retain the exact affine texture mapping', () => {
 const g = { source: geometry.source, target: { x: 46, y: 68, width: 220, height: 176, radius: 16 } };
 const mesh = new GlassFusionTessellator(290, 300).update(g, 1);
 const center = mesh.positions.findIndex(point => point.x === 156 && point.y === 156);
 let triangles = 0;
 for (let index = 0; index < mesh.indices.length; index += 3) {
  const ids = mesh.indices.slice(index, index + 3);
  if (!ids.includes(center)) continue;
  triangles++;
  for (const id of ids) {
   const point = mesh.positions[id], texture = mesh.texture[id];
   assert.ok(Math.abs(texture.x - (point.x + (156 - point.x) * .02)) < 1e-10);
   assert.ok(Math.abs(texture.y - (point.y + (156 - point.y) * .02)) < 1e-10);
  }
 }
 assert.ok(triangles > 4, 'the center fan shares edge vertices with the detailed grid');
});
