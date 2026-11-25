import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glassCaptureScale, sameGlassCaptureGeometry } from '../src/core/GlassCapture.ts';
import { stripTypeScriptTypes } from 'node:module';

function harness(backgroundSource = 'background', missing = false, drawFails = false) {
  const calls = [], released = [], frames = {};
  for (const id of ['content', 'background']) frames[id] = {
    id, getImageInfoSync: () => ({size: {width: id === 'content' ? 200 : 300, height: id === 'content' ? 300 : 400}}),
    release() { released.push(id); }
  };
  const content = {getMeasuredSize: () => ({width: 400, height: 600}), getPositionToWindow: () => ({x: 10, y: 20})};
  const background = {getMeasuredSize: () => ({width: 600, height: 800}), getPositionToWindow: () => ({x: 0, y: 0})};
  const ui = {vp2px: n => n * 2, getFrameNodeById: () => missing ? null : background,
    getComponentSnapshot: () => ({get: async (id, options) => {
      if (id === 'background' && options?.region) {
        const region=options.region; frames[id].getImageInfoSync=()=>({size:{width:Math.round((region.right-region.left)*options.scale),height:Math.round((region.bottom-region.top)*options.scale)}});
      }
      return frames[id];
    }})};
  const source = readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets', import.meta.url), 'utf8')
    .split('const sessions:')[0].replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
  const Canvas = class { constructor(width,height) { this.width=width; this.height=height; } reset() {} drawImage(...args) { if(drawFails) throw Error('draw'); calls.push(args); }
    getPixelMap() { return {id:'composite', getImageInfoSync:()=>({size:{width:this.width,height:this.height}}), release() {}}; } };
  const Session = new Function('OffscreenCanvasRenderingContext2D', 'RenderingContextSettings', 'LengthMetricsUnit', 'deviceInfo', 'glassCaptureScale', 'sameGlassCaptureGeometry', 'sessions',
    stripTypeScriptTypes(source, {mode:'transform'})+';return BackdropSession;')(Canvas, class {}, {PX:0}, {apiAvailable:()=>false}, glassCaptureScale, sameGlassCaptureGeometry, new Map());
  return {session: new Session(ui, 'content', backgroundSource), content, calls, released, frames};
}

test('transparent content composites over the one background with window coordinates and pixel scaling', async()=>{
  const h=harness(), result=await h.session.capturePixels(h.content);
  assert.equal(result.id,'composite');
  assert.deepEqual(h.calls.map(call=>[call[0].id,...call.slice(1)]),[
    ['background',10,20,200,300,0,0,200,300],['composite',0,0,200,300],['content',0,0,200,300]
  ]);
  assert.deepEqual(h.released.slice().sort(),['background','content']);
});
test('existing consumers retain their original snapshot when no shared background is supplied',async()=>{
  const h=harness('');assert.equal(await h.session.capturePixels(h.content),h.frames.content);
  assert.deepEqual(h.calls,[]);assert.deepEqual(h.released,[]);
});
test('missing background or failed composition releases every acquired input and propagates fallback',async()=>{
  for(const [missing,drawFails] of [[true,false],[false,true]]) {
    const h=harness('background',missing,drawFails);
    await assert.rejects(h.session.capturePixels(h.content));
    assert.deepEqual(h.released.slice().sort(),missing?[]:['background','content']);
  }
});

test('background replicas use original pixels and unwarped coordinates; glass still uses frosted refraction',()=>{
  const raw=readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
  const source=raw.slice(raw.indexOf('class GlassRenderNode extends'),raw.indexOf('class GlassController'));
  const draws=[],images=[];
  const points=[{x:0,y:0},{x:100,y:0},{x:0,y:100}],warped=points.map(p=>({x:p.x+5,y:p.y+5}));
  const drawing={Brush:class {setAntiAlias(){} setAlpha(){} setShaderEffect(){}},
    ShaderEffect:{createImageShader:p=>{images.push(p);}},TileMode:{CLAMP:0},SamplingOptions:class {},FilterMode:{FILTER_MODE_LINEAR:0},VertexMode:{TRIANGLES_VERTEXMODE:0},BlendMode:{SRC:0}};
  const Node=new Function('RenderNode','LengthMetricsUnit','glassMesh','glassContour','glassTexturePoint','drawing','deviceInfo','setTimeout','hilog',
    stripTypeScriptTypes(source,{mode:'transform'})+';return GlassRenderNode;')(
    class {invalidate(){}},{PX:0},()=>({positions:points,texture:warped,indices:[0,1,2]}),()=>[],p=>p,drawing,{apiAvailable:()=>true},()=>{}, {info(){},warn(){}});
  for(const plain of [false,true]) {
    const view=new Node();view.plain=plain;view.configure(100,100,0,0,0,1,'');
    const preparedMesh = view.mesh;
    view.configure(100,100,0,0,0,1,'');
    assert.equal(view.mesh,preparedMesh);
    view.updateFrame({pixels:'original',frosted:'blurred',left:0,top:0,width:100,height:100,scaleX:1,scaleY:1});
    view.draw({canvas:{attachBrush(){},detachBrush(){},drawVertices:(...args)=>draws.push(args[3])}});
  }
  assert.deepEqual(images,['blurred','original']);
  assert.deepEqual(draws,[warped,[...points,{x:100,y:100}]]);
});

test('fusion reuses drawing resources and texture-coordinate objects while keeping source coordinates correct',()=>{
 const text=readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
 const source=text.slice(text.indexOf('class GlassRenderNode extends'),text.indexOf('class GlassController extends'));
 let brushes=0,paths=0,pens=0,shaders=0;
 const drawing={Brush:class{constructor(){brushes++;}setAntiAlias(){}setAlpha(){}setShaderEffect(){}setColor(){}},
  Pen:class{constructor(){pens++;}setAntiAlias(){}setStrokeWidth(){}setColor(){}},
  Path:class{constructor(){paths++;}reset(){}moveTo(){}lineTo(){}},
  ShaderEffect:{createImageShader(){shaders++;return {};}},TileMode:{CLAMP:0},SamplingOptions:class{},FilterMode:{FILTER_MODE_LINEAR:0},
  VertexMode:{TRIANGLES_VERTEXMODE:0},BlendMode:{SRC:0,SRC_OVER:1}};
 const Node=new Function('RenderNode','LengthMetricsUnit','drawing','deviceInfo','setTimeout','hilog',
  stripTypeScriptTypes(source,{mode:'transform'})+';return GlassRenderNode;')(
   class{invalidate(){}},{PX:0},drawing,{apiAvailable:()=>true},()=>{},{info(){},warn(){}});
 const node=new Node(),mesh={positions:[{x:0,y:0},{x:10,y:0},{x:0,y:10}],texture:[{x:0,y:0},{x:10,y:0},{x:0,y:10}],indices:[0,1,2],edge:[{x:0,y:0},{x:10,y:0}]};
 const pixels={};const context={canvas:{attachBrush(){},detachBrush(){},drawVertices(){},attachPen(){},drawPath(){},detachPen(){}}};
 node.configureFusion(100,100,20,30,mesh,false,1);
 node.updateFrame({pixels,frosted:pixels,left:0,top:0,width:300,height:300,scaleX:.5,scaleY:.5});
 node.draw(context);const texturePoint=node.texs[0];
 let coordinateWrites = 0;
 node.texs[0] = new Proxy(texturePoint, {set(target, key, value) {
   coordinateWrites++; target[key] = value; return true;
 }});
 node.draw(context);
 assert.equal(coordinateWrites, 0, 'repainting unchanged glass reuses its transformed texture coordinates');
 const cachedPoint = node.texs[0];
 node.configureFusion(100,100,21,30,mesh,false,1);node.draw(context);
 assert.equal(paths,0);assert.equal(pens,0);assert.equal(brushes,1);assert.equal(shaders,1);
 assert.equal(node.texs[0],cachedPoint);assert.deepEqual(texturePoint,{x:10.5,y:15});
 assert.equal(coordinateWrites, 2, 'moving the glass recalculates both coordinates');
 node.updateFrame(undefined);assert.equal(node.imageBrush,undefined);
});


test('fusion draws and signals ready when its padded canvas crosses the sample boundary', () => {
  const source = readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('class GlassRenderNode extends'), source.indexOf('class GlassController extends'));
  const drawing = {
    Brush: class { setAntiAlias() {} setAlpha() {} setShaderEffect() {} setColor() {} },
    ShaderEffect: { createImageShader() {} }, TileMode: { CLAMP: 0 }, SamplingOptions: class {},
    FilterMode: { FILTER_MODE_LINEAR: 0 }, VertexMode: { TRIANGLES_VERTEXMODE: 0 },
    BlendMode: { SRC: 0 }, ClipOp: { INTERSECT: 0 }
  };
  const Node = new Function('RenderNode', 'LengthMetricsUnit', 'drawing', 'deviceInfo', 'setTimeout', 'hilog',
    stripTypeScriptTypes(code, { mode: 'transform' }) + ';return GlassRenderNode;')(
    class { invalidate() {} }, { PX: 0 }, drawing, { apiAvailable: () => true },
    callback => callback(), { info() {}, warn() {} });
  const view = new Node();
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
  const mesh = { positions: points, texture: points, indices: [0, 1, 2], edge: [] };
  const calls = [];
  view.ready = () => calls.push('ready');
  const context = { canvas: {
    save: () => calls.push('save'), restore: () => calls.push('restore'),
    clipRect: rect => calls.push(rect),
    attachBrush() {}, detachBrush() {}, drawVertices: () => calls.push('draw')
  } };
  view.updateFrame({ pixels: {}, frosted: {}, left: 0, top: 0, width: 200, height: 200, scaleX: 0.5, scaleY: 0.5 });
  view.configureFusion(100, 100, -105, 20, mesh, false);
  view.draw(context);
  assert.deepEqual(calls, []);
  view.configureFusion(100, 100, -6, 20, mesh, false);
  view.draw(context);
  assert.deepEqual(calls, ['save', { left: 6, top: -20, right: 206, bottom: 180 }, 'draw', 'restore', 'ready']);
});

test('a plain background shares the original bitmap and releases it exactly once', () => {
  const { session } = harness();
  let releases = 0;
  const pixels = { release() { releases++; } };
  const background = { plain: true, freezeBackdrop: false };
  const fusion = { freezeBackdrop: true };
  session.listeners.add(background);
  assert.equal(session.blurStrength(), 0);
  session.frame = { pixels, frosted: pixels };
  session.frameBlur = 0;
  session.listeners.add(fusion);
  session.waiting.add(fusion);
  assert.equal(session.blurStrength(), 1);
  assert.equal(session.fusionHolding(), false);
  session.waiting.delete(fusion);
  assert.equal(session.fusionHolding(), true);
  session.releaseFrame(session.frame);
  assert.equal(releases, 1);
});

test('glass highlights follow the optical contour, reuse static resources and skip plain replicas', () => {
  const source = readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('class GlassRenderNode extends'), source.indexOf('class GlassController extends'));
  const draws = [], gradients = [];
  let pens = 0, paths = 0;
  const drawing = {
    Pen: class {
      constructor() { pens++; }
      setAntiAlias() {}
      setStrokeWidth(width) { this.width = width; }
      setShaderEffect() {}
    },
    Path: class {
      constructor() { paths++; }
      addRoundRect(rect) { this.rect = rect; }
    },
    RoundRect: class { constructor(rect) { this.rect = rect; } },
    ShaderEffect: { createLinearGradient(...args) { gradients.push(args); return {}; } },
    TileMode: { CLAMP: 0 }
  };
  const Node = new Function('RenderNode', 'drawing', stripTypeScriptTypes(code, {mode:'transform'}) +
    ';return GlassRenderNode;')(class {}, drawing);
  const view = new Node();
  view.frame = {width: 200, height: 120};
  view.radius = 18;
  view.density = 2;
  view.specular = true;
  const context = {canvas: {attachPen() {}, drawPath: path => draws.push(path), detachPen() {}}};
  view.drawSpecular(context);
  view.drawSpecular(context);
  assert.equal(pens, 1);
  assert.equal(paths, 1);
  assert.equal(draws[0], draws[1]);
  assert.deepEqual(draws[0].rect.rect, {left: .85, top: .85, right: 199.15, bottom: 119.15});
  assert.equal(gradients.length, 1);
  assert.notEqual(gradients[0][2][0], gradients[0][2][1], 'reflection has directional brightness');
  view.plain = true;
  view.drawSpecular(context);
  assert.equal(draws.length, 2);
});

test('the root glass texture survives navigation, including a capture already in flight', async () => {
  const source = readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('class BackdropSession'), source.indexOf('const sessions:'));
  const timers = new Map();
  let nextTimer = 0;
  const Session = new Function('sameGlassCaptureGeometry', 'glassCaptureScale', 'deviceInfo', 'productGlassBlur', 'setInterval', 'clearInterval', 'hilog', 'sessions',
    stripTypeScriptTypes(code, { mode: 'transform' }) + ';return BackdropSession;')(
    sameGlassCaptureGeometry, glassCaptureScale, { apiAvailable: () => false }, 0,
    callback => { timers.set(++nextTimer, callback); return nextTimer; },
    id => timers.delete(id), { info() {}, warn() {} }, new Map());
  const node = { getMeasuredSize: () => ({ width: 100, height: 100 }), getPositionToWindow: () => ({ x: 0, y: 0 }) };
  const session = new Session({ getFrameNodeById: () => node, vp2px: value => value }, 'root');
  let captures = 0;
  session.setRetention(true, false);
  session.capturePixels = async () => {
    captures++;
    return { getImageInfoSync: () => ({ size: { width: 50, height: 50 } }), release() {} };
  };
  const first = { cached: true, freezeBackdrop: false, updateFrame() {} };
  const second = { cached: true, freezeBackdrop: false, updateFrame() {} };
  session.attach(first, () => true);
  session.attach(second, () => true);
  await Promise.resolve();
  assert.equal(captures, 1);
  assert.equal(timers.size, 0);
  await session.capture();
  assert.equal(captures, 1);
  session.invalidateSource();
  assert.equal(timers.size, 1);
  await session.capture();
  assert.equal(captures, 2);
  assert.equal(timers.size, 0);
  session.detach(first);
  session.detach(second);
  assert.equal(timers.size, 0);

  const cachedFrame = session.frame;
  const updates = [];
  const incoming = { cached: true, freezeBackdrop: false, updateFrame: frame => updates.push(frame) };
  session.setRetention(true, true);
  session.attach(incoming, () => true);
  assert.deepEqual(updates, [cachedFrame]);
  await session.capture();
  assert.equal(captures, 2);
  assert.equal(timers.size, 0);

  session.setRetention(true, false);
  assert.equal(timers.size, 0, 'ending navigation alone does not refresh the texture');
  session.invalidateSource();
  let resolveSnapshot;
  session.capturePixels = () => new Promise(resolve => { resolveSnapshot = resolve; });
  const pending = session.capture();
  session.setRetention(true, true);
  session.setRetention(true, false);
  let discarded = false;
  resolveSnapshot({ release() { discarded = true; } });
  await pending;
  assert.equal(discarded, true);
  assert.deepEqual(updates, [cachedFrame], 'the stale snapshot never replaced the visible texture');
  session.detach(incoming);
  session.setRetention(false, true);
  assert.equal(session.frame, undefined);
  assert.equal(timers.size, 0);
});


test('resident glass excludes its center and blends only a faint cached rim without repeating host tint', () => {
  const source = readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('class GlassRenderNode extends'), source.indexOf('class GlassController extends'));
  const calls = [], paths = [];
  const drawing = {
    Brush: class { setAntiAlias() {} setShaderEffect() {} setAlpha(alpha) { this.alpha = alpha; } },
    Path: class { constructor() { paths.push(this); } addRoundRect(rect) { this.rect = rect; } addCircle(...circle) { this.circle = circle; } },
    RoundRect: class { constructor(rect, radius) { this.rect = rect; this.radius = radius; } },
    ShaderEffect: { createImageShader() {} }, TileMode: { CLAMP: 0 }, SamplingOptions: class {},
    FilterMode: { FILTER_MODE_LINEAR: 0 }, VertexMode: { TRIANGLES_VERTEXMODE: 0 },
    BlendMode: { SRC: 'replace', SRC_OVER: 'over' }, ClipOp: { DIFFERENCE: 'exclude' }
  };
  const Node = new Function('RenderNode', 'drawing', 'deviceInfo', 'setTimeout', 'hilog',
    stripTypeScriptTypes(code, { mode: 'transform' }) + ';return GlassRenderNode;')(
    class { invalidate() {} }, drawing, { apiAvailable: () => true }, () => {}, { info() {}, warn() {} });
  const node = new Node();
  node.cached = true; node.tint = '#52ffffff'; node.frame = { width: 200, height: 120 };
  node.radius = 30; node.density = 2;
  node.mesh = { positions: [{x:0,y:0}], texture: [{x:0,y:0}], indices: [0] };
  node.updateFrame({ pixels: {}, frosted: {}, left: 0, top: 0, width: 200, height: 120, scaleX: 1, scaleY: 1 });
  const context = { canvas: {
    save: () => calls.push('save'), restore: () => calls.push('restore'),
    clipPath: (path, op) => calls.push([path, op]),
    attachBrush: brush => calls.push(['alpha', brush.alpha]), detachBrush() {},
    drawVertices: (...args) => calls.push(['blend', args.at(-1)]),
    drawRect: () => assert.fail('resident tint is already owned by the native surface')
  } };
  node.draw(context); node.draw(context);
  assert.equal(paths.length, 1, 'unchanged geometry reuses the cached interior path');
  assert.deepEqual(paths[0].rect.rect, {left:2, top:2, right:198, bottom:118});
  assert.equal(paths[0].rect.radius, 28);
  assert.deepEqual(calls, Array(2).fill(['save', [paths[0], 'exclude'], ['alpha',40], ['blend','over'], 'restore']).flat());
  node.meshOutline = 'M 200 0 C ...';
  node.clipMaterialInterior(context.canvas);
  assert.deepEqual(paths.at(-1).circle, [200,60,58]);
  node.meshOutline = 'M 0 0 C ...';
  node.clipMaterialInterior(context.canvas);
  assert.deepEqual(paths.at(-1).circle, [0,60,58]);
});

test('rotation between measurement and snapshot rejects the mismatched composite and releases both inputs', async () => {
  const h = harness();
  h.frames.content.getImageInfoSync = () => ({ size: { width: 300, height: 200 } });
  await assert.rejects(h.session.capturePixels(h.content), /glass_capture_geometry_changed/);
  assert.deepEqual(h.released.slice().sort(), ['background', 'content']);
  assert.ok(h.calls.every(call=>call[0].id==='background'), 'invalid foreground must never be composited');
});

test('wide capsule reflections and cached rims use the same bounded physical radius as native controls',()=>{
 const raw=readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
 const source=raw.slice(raw.indexOf('class GlassRenderNode extends'),raw.indexOf('class GlassController'));
 const meshes=[];
 const drawing={Pen:class{setAntiAlias(){}setStrokeWidth(){}setShaderEffect(){}},
  Path:class{addRoundRect(rect){this.rect=rect;}},RoundRect:class{constructor(rect,x,y){Object.assign(this,{rect,x,y});}},
  ShaderEffect:{createLinearGradient(){}},TileMode:{CLAMP:0},ClipOp:{DIFFERENCE:0}};
 const Node=new Function('RenderNode','LengthMetricsUnit','glassMesh','glassContour','drawing','hilog',
  stripTypeScriptTypes(source,{mode:'transform'})+';return GlassRenderNode;')(
  class{invalidate(){}},{PX:0},(w,h,r)=>{meshes.push(r);return {positions:[],texture:[],indices:[]};},()=>[],drawing,{info(){}});
 const node=new Node();node.cached=true;
 node.configure(900,110,0,0,999,2.5,'',true);
 assert.equal(node.radius,55);assert.deepEqual(meshes,[55]);
 const paths=[];node.drawSpecular({canvas:{attachPen(){},drawPath:p=>paths.push(p),detachPen(){}}});
 assert.equal(paths[0].rect.x,55-.425*2.5);assert.equal(paths[0].rect.x,paths[0].rect.y);
 node.clipMaterialInterior({clipPath(){}});assert.equal(node.materialInterior.rect.x,52.5);
 const cached=node.materialInterior;
 node.configure(900,110,0,0,1000,2.5,'',true);assert.deepEqual(meshes,[55]);
 node.clipMaterialInterior({clipPath(){}});assert.equal(node.materialInterior,cached);
 node.configure(900,110,0,0,1000,3,'',true);node.clipMaterialInterior({clipPath(){}});
 assert.notEqual(node.materialInterior,cached);assert.equal(node.materialInterior.rect.x,52);
 node.configure(44,44,0,0,32,1,'',true);assert.equal(node.radius,22);
});

test('popup tint shares the existing texture draw and caches its color filter across frames', () => {
 const full=readFileSync(new URL('../src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
 const source=full.slice(full.indexOf('class GlassRenderNode extends'),full.indexOf('class GlassController extends'));
 let filters=0, draws=0;
 const drawing={Brush:class{setAntiAlias(){}setAlpha(){}setShaderEffect(){}setColorFilter(value){this.filter=value;}},
  ColorFilter:{createBlendModeColorFilter(color,mode){filters++;return {color,mode};}},
  ShaderEffect:{createImageShader(){return {};}},TileMode:{CLAMP:0},SamplingOptions:class{},FilterMode:{FILTER_MODE_LINEAR:0},
  VertexMode:{TRIANGLES_VERTEXMODE:0},BlendMode:{SRC:0,SRC_OVER:1}};
 const Node=new Function('RenderNode','LengthMetricsUnit','drawing','deviceInfo','setTimeout','hilog',
  stripTypeScriptTypes(source,{mode:'transform'})+';return GlassRenderNode;')(
   class{invalidate(){}},{PX:0},drawing,{apiAvailable:()=>true},()=>{},{info(){},warn(){}});
 const node=new Node(),mesh={positions:[{x:0,y:0},{x:10,y:0},{x:0,y:10}],texture:[{x:0,y:0},{x:10,y:0},{x:0,y:10}],indices:[0,1,2],edge:[]};
 node.configureFusion(100,100,0,0,mesh,false);node.tint='#8018202B';
 const pixels={};node.updateFrame({pixels,frosted:pixels,left:0,top:0,width:100,height:100,scaleX:1,scaleY:1});
 const context={canvas:{attachBrush(){},detachBrush(){},drawVertices(){draws++;}}};
 node.draw(context);node.draw(context);
 assert.equal(draws,2,'exactly one texture draw per frame, without a second tint pass');
 assert.equal(filters,1,'unchanged preference reuses native filter');
 node.tint='#40FFFFFF';node.draw(context);assert.equal(filters,2);assert.equal(draws,3);
 node.tint='';node.draw(context);assert.equal(node.imageBrush.filter,null);assert.equal(draws,4);
 for(const color of ['#00FFFFFF','#0018202B','#00000000']) {
  node.tint=color;node.draw(context);assert.equal(node.imageBrush.filter,null);
 }
 assert.equal(filters,2,'every zero-alpha tint bypasses the native filter regardless of its RGB bytes');
});


test('clear optical panels require native sampling while warmup and resident controls keep the small budget', () => {
 const h=harness();
 const optical={cached:false,plain:false,updateFrame(){}};
 h.session.blurStrength=()=>0;
 assert.equal(h.session.captureScale(2800,1752),512/2800);
 h.session.listeners.add({cached:true});
 assert.equal(h.session.captureScale(2800,1752),512/2800);
 h.session.listeners.add(optical);
 assert.equal(h.session.captureScale(2800,1752),1);
 h.session.listeners.delete(optical);
 assert.equal(h.session.captureScale(2800,1752),512/2800);
});

test('clear small menus sample only their optical bounds with lens padding',()=>{
 const h=harness();h.session.blurStrength=()=>0;
 h.session.listeners.add({cached:false,captureRegion:{left:400,top:200,width:300,height:400}});
 const full={left:0,top:0,width:2800,height:1752};
 const crop=h.session.captureGeometry(full);
 assert.deepEqual(crop,{left:328,top:128,width:444,height:544});
 assert.ok(crop.width*crop.height<full.width*full.height/10);
 h.session.listeners.add({cached:false,captureRegion:{left:800,top:200,width:200,height:400}});
 assert.equal(h.session.captureGeometry(full).width,744,'simultaneous child panels share their union, not a second full texture');
});

test('opening clear glass with a frosted warmup frame never publishes that insufficient frame', () => {
 const h=harness();h.session.blurStrength=()=>0;h.session.syncTimer=()=>{};
 const pixels={release(){}};
 h.session.frame={pixels,frosted:pixels,left:20,top:40,width:400,height:600,scaleX:.5,scaleY:.5};
 const updates=[];let requested=0;
 h.session.capture=()=>{requested++;};
 h.session.attach({cached:false,captureRegion:{left:20,top:40,width:400,height:600},
  updateFrame:frame=>updates.push(frame)},()=>true);
 assert.equal(h.session.frame,undefined);
 assert.deepEqual(updates,[undefined]);
 assert.equal(requested,1,'one clear capture is requested before glass becomes ready');
});


test('a newly opened optical panel never receives an invalidated cached frame', () => {
 const h=harness('');
 h.session.ui.getFrameNodeById=()=>h.content;
 h.session.frame={pixels:{release(){}},frosted:{release(){}},left:20,top:40,width:400,height:600,scaleX:1,scaleY:1};
 h.session.frame.sourceGeometry={left:20,top:40,width:400,height:600};
 h.session.sourceDirty=true;
 h.session.syncTimer=()=>{};h.session.capture=()=>{};
 const frames=[];
 h.session.attach({cached:false,plain:false,captureRegion:{left:20,top:40,width:400,height:600},updateFrame:frame=>frames.push(frame)},()=>true);
 assert.ok(frames.every(frame=>frame===undefined),'stale warm frame cannot become the newly frozen optical texture');
 assert.equal(h.session.frame,undefined);
});


test('optical crop uses full-node pixels and preserves window coordinates at every blur sampling scale', async () => {
  for (const scale of [1, .5, .2]) {
    const h=harness(''); const requests=[];
    const full={left:90,top:117,width:1320,height:2115};
    const crop={left:691,top:1157,width:480,height:948};
    let released=0;
    h.session.ui.getComponentSnapshot=()=>({get:async(id,options)=>{
      requests.push({id,options});return {getImageInfoSync:()=>({size:{width:1320*scale,height:2115*scale}}),release(){released++;}};
    }});
    const output=await h.session.captureNodePixels('dialog',full,crop,scale);
    assert.equal(requests[0].options.region,undefined,'native region/scale must not shift the pixel grid');
    assert.deepEqual(h.calls[0].slice(1),[601*scale,1040*scale,480*scale,948*scale,0,0,Math.round(480*scale),Math.round(948*scale)]);
    assert.deepEqual(output.getImageInfoSync().size,{width:Math.round(480*scale),height:Math.round(948*scale)});
    assert.equal(released,1);
  }
});


test('low-blur warmup matches menu sharpness before a button is pressed', () => {
 const h=harness();h.session.blurStrength=()=>.22;
 h.session.warm=true;
 assert.equal(h.session.captureScale(1320,2115),glassCaptureScale(1320,2115,.22));
 h.session.listeners.add({cached:false});
 assert.equal(h.session.captureScale(1320,2115),glassCaptureScale(1320,2115,.22));
 h.session.warm=false;h.session.listeners.clear();
 assert.equal(h.session.captureScale(1320,2115),glassCaptureScale(1320,2115));
});


test('repeated background composition reuses bounded native canvases and releases them on stop', async () => {
 const h = harness();
 await h.session.capturePixels(h.content);
 const first = h.session.canvases.get('composite');
 assert.ok(first);
 for (let index = 0; index < 20; index++) await h.session.capturePixels(h.content);
 assert.equal(h.session.canvases.size, 2, 'crop and composite each own one canvas');
 assert.equal(h.session.canvases.get('composite'), first);
 h.session.stop();
 assert.equal(h.session.canvases.size, 0);
});
