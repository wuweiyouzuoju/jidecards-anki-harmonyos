// SPDX-License-Identifier: AGPL-3.0-or-later
/** 橄榄油：与iOS同一时序和阶段参数；坐标由宿主在同一可见坐标系采集。 */
export class OliveOil {
  static readonly hideMs: number = 25;
  static readonly morphMs: number = 240;
  static readonly revealDelayMs: number = 50;
  static readonly revealMs: number = 10;
  static readonly reducedMotionMs: number = 100;
  static readonly geometryTimeoutMs: number = 120;
  static readonly fusionEnd: number = 0.04;
  static readonly stretchEnd: number = 0.64;
  static readonly neckStart: number = 0.36;
  static readonly separationStart: number = 0.40;
  static readonly detachment: number = 0.97;
}
export interface MorphRect { x: number; y: number; width: number; height: number; }
export interface OliveGeometry {
  sources: MorphRect[];
  destinations: MorphRect[];
  axis: string;
  mode: string;
  radius: number;
}
function clamp(t: number): number { return Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0; }
function smooth(t: number): number { const p: number = clamp(t); return p * p * (3 - 2 * p); }
function right(r: MorphRect): number { return r.x + r.width; }
function bottom(r: MorphRect): number { return r.y + r.height; }
function cx(r: MorphRect): number { return r.x + r.width / 2; }
function cy(r: MorphRect): number { return r.y + r.height / 2; }
function valid(r: MorphRect): boolean {
  return Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.width) && Number.isFinite(r.height)
    && Number.isFinite(right(r)) && Number.isFinite(bottom(r)) && r.width > 0 && r.height > 0;
}
function rect(x: number, y: number, width: number, height: number): MorphRect { return { x, y, width, height }; }
function union(rs: MorphRect[]): MorphRect {
  let x: number = rs[0].x, y: number = rs[0].y, x1: number = right(rs[0]), y1: number = bottom(rs[0]);
  for (const r of rs) { x = Math.min(x, r.x); y = Math.min(y, r.y); x1 = Math.max(x1, right(r)); y1 = Math.max(y1, bottom(r)); }
  return rect(x, y, x1 - x, y1 - y);
}
function lerp(a: MorphRect, b: MorphRect, t: number): MorphRect {
  return rect(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t,
    a.width + (b.width - a.width) * t, a.height + (b.height - a.height) * t);
}
function n(v: number): string { return String(Math.round(v * 100000) / 100000); }
function point(x: number, y: number): string { return n(x) + ' ' + n(y); }
function move(x: number, y: number): string { return 'M' + point(x, y); }
function line(x: number, y: number): string { return 'L' + point(x, y); }
function curve(x1: number, y1: number, x2: number, y2: number, x: number, y: number): string {
  return 'C' + point(x1, y1) + ' ' + point(x2, y2) + ' ' + point(x, y);
}
function rounded(r: MorphRect, radius: number): string {
  if (!valid(r)) { return ''; }
  const t: number = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  const k: number = 0.5522847498, x: number = r.x, y: number = r.y, x1: number = right(r), y1: number = bottom(r);
  return move(x + t, y) + line(x1 - t, y) + curve(x1 - t + t*k, y, x1, y+t-t*k, x1, y+t)
    + line(x1,y1-t) + curve(x1,y1-t+t*k,x1-t+t*k,y1,x1-t,y1) + line(x+t,y1)
    + curve(x+t-t*k,y1,x,y1-t+t*k,x,y1-t) + line(x,y+t) + curve(x,y+t-t*k,x+t-t*k,y,x+t,y) + 'Z';
}

/** 双卡拉伸与切向收颈：根部和颈部一起缩到零，避免末帧连接片突断。 */
export function oliveSplitPath(top: MorphRect, lower: MorphRect, sourceHeight: number, progress: number, radius: number = 22): string {
  if (!valid(top) || !valid(lower) || !Number.isFinite(sourceHeight) || sourceHeight <= 0 || !Number.isFinite(radius)) { return ''; }
  const p: number = clamp(progress), total: number = bottom(lower)-top.y;
  const stretch: number = smooth(p/OliveOil.stretchEnd);
  const split: number = smooth((p-OliveOil.neckStart)/(OliveOil.detachment-OliveOil.neckStart));
  const separation: number = smooth((p-OliveOil.separationStart)/(1-OliveOil.separationStart));
  const end: number = top.y + Math.max(1,sourceHeight+(total-sourceHeight)*stretch);
  const r: number = radius+(28-radius)*split;
  if (split === 0) { return rounded(rect(top.x,top.y,top.width,end-top.y),r); }
  const gap: number = Math.max(0,lower.y-bottom(top));
  const opening: number = gap*separation+26*Math.sin(Math.PI*separation);
  const upper: number = Math.min(end,bottom(top)+(gap-opening)/2);
  const low: number = Math.min(end,lower.y-(gap-opening)/2);
  let path: string = rounded(rect(top.x,top.y,top.width,Math.max(0,upper-top.y)),r)
    + rounded(rect(lower.x,low,lower.width,Math.max(0,end-low)),24);
  if (split < 1 && end > low) {
    const remain: number = 1-split, middle: number = (upper+low)/2;
    const center: number = cx(top)+(cx(lower)-cx(top))*split;
    const root: number = Math.max(0,Math.min(top.width,lower.width)/2-r)*Math.pow(remain,0.28);
    const neck: number = root*Math.pow(remain,0.44), depth: number = Math.max(0,(low-upper)*0.32);
    const tangent: number = Math.max(0,root-neck)*0.55;
    path += move(center-root,upper)+line(center+root,upper)
      +curve(center+root-tangent,upper,center+neck,middle-depth,center+neck,middle)
      +curve(center+neck,middle+depth,center+root-tangent,low,center+root,low)+line(center-root,low)
      +curve(center-root+tangent,low,center-neck,middle+depth,center-neck,middle)
      +curve(center-neck,middle-depth,center-root+tangent,upper,center-root,upper)+'Z';
  }
  return path;
}

export function oliveClusterPath(sources: MorphRect[], top: MorphRect, lower: MorphRect, progress: number): string {
  if (!valid(top) || !valid(lower)) { return ''; }
  const cards: MorphRect[] = sources.filter(valid).sort((a: MorphRect,b: MorphRect): number => a.y-b.y);
  const p: number = clamp(progress), envelope: MorphRect = union([top,lower]);
  if (cards.length === 0) { return oliveSplitPath(top,lower,top.height,p); }
  if (p >= OliveOil.fusionEnd) { return oliveSplitPath(top,lower,envelope.height,(p-OliveOil.fusionEnd)/(1-OliveOil.fusionEnd)); }
  const t: number = smooth(p/OliveOil.fusionEnd), bounds: MorphRect = union(cards);
  const mapped: MorphRect[] = cards.map((c: MorphRect): MorphRect => lerp(c,rect(envelope.x,
    envelope.y+(c.y-bounds.y)/bounds.height*envelope.height,envelope.width,c.height/bounds.height*envelope.height),t));
  if (mapped.length === 1) { return rounded(mapped[0],22); }
  let path: string = '';
  for (let i: number=0;i<mapped.length-1;i++) { path+=oliveSplitPath(mapped[i],mapped[i+1],bottom(mapped[i+1])-mapped[i].y,1-t); }
  return path;
}

function fused(sources: MorphRect[], axis: string, radius: number, t: number): string {
  const bounds: MorphRect = union(sources), horizontal: boolean = axis === 'horizontal';
  if (sources.length === 1) { return rounded(bounds,radius); }
  const sorted: MorphRect[] = sources.slice().sort((a: MorphRect,b: MorphRect): number => horizontal ? cx(a)-cx(b) : a.y-b.y);
  const centers: number[] = sorted.map((r: MorphRect): number => horizontal ? cx(r) : cy(r));
  const mapped: MorphRect[] = []; let path: string = '';
  for (let i: number=0;i<sorted.length;i++) {
    const start: number = i===0 ? (horizontal ? bounds.x : bounds.y) : (centers[i-1]+centers[i])/2;
    const end: number = i===sorted.length-1 ? (horizontal ? right(bounds) : bottom(bounds)) : (centers[i]+centers[i+1])/2;
    const dest: MorphRect = horizontal ? rect(start,bounds.y,Math.max(0.5,end-start),bounds.height) : rect(bounds.x,start,bounds.width,Math.max(0.5,end-start));
    const item: MorphRect = lerp(sorted[i],dest,t); mapped.push(item); path+=rounded(item,radius);
  }
  for (let i: number=0;i<mapped.length-1;i++) {
    const a: MorphRect=mapped[i], b: MorphRect=mapped[i+1];
    const overlap: number=horizontal ? Math.min(bottom(a),bottom(b))-Math.max(a.y,b.y) : Math.min(right(a),right(b))-Math.max(a.x,b.x);
    const thickness: number=overlap*smooth(t); if (overlap<=0.5 || thickness<=0.5) { continue; }
    const start: number=horizontal ? right(a)-radius*t : bottom(a)-radius*t;
    const end: number=horizontal ? b.x+radius*t : b.y+radius*t;
    if (end<=start) { continue; }
    path+=rounded(horizontal ? rect(start,cy(a)-thickness/2,end-start,thickness) : rect(cx(a)-thickness/2,start,thickness,end-start),Math.min(thickness/2,6));
  }
  return path;
}
function neck(a: MorphRect,b: MorphRect,separation: number,axis: string): string {
  const remaining: number=1-separation; if (remaining<=0.001) { return ''; }
  const h: boolean=axis==='horizontal';
  const thickness: number=(h ? Math.min(a.height,b.height) : Math.min(a.width,b.width))*Math.pow(remaining,0.32)*0.8;
  if (thickness<=0.4) { return ''; }
  const left: number=h ? Math.max(a.y,b.y) : Math.max(a.x,b.x);
  const rightEdge: number=h ? Math.min(bottom(a),bottom(b)) : Math.min(right(a),right(b));
  if (rightEdge<=left) { return ''; }
  const mid: number=(left+rightEdge)/2, half: number=Math.min(thickness/2,(rightEdge-left)/2), tip: number=half*0.55;
  const start: number=h ? right(a) : bottom(a), end: number=h ? b.x : b.y;
  if (end<=start+0.5) { return rounded(h ? rect(start-1,mid-half,2,half*2) : rect(mid-half,start-1,half*2,2),half); }
  return ligament(start,end,mid,half,tip,h);
}
/** 共享轴向贝塞尔连接；横向和纵向通过坐标映射共用同一算法。 */
function ligament(start: number,end: number,mid: number,half: number,tip: number,h: boolean): string {
  // 交换纵向端点，保持连接片与圆角主体同向，避免非零填充互相挖空。
  if (!h) { const swap: number=start; start=end; end=swap; }
  const length: number=end-start, center: number=(start+end)/2;
  function m(u: number,v: number): string { return h ? move(u,v) : move(v,u); }
  function l(u: number,v: number): string { return h ? line(u,v) : line(v,u); }
  function c(u1: number,v1: number,u2: number,v2: number,u: number,v: number): string {
    return h ? curve(u1,v1,u2,v2,u,v) : curve(v1,u1,v2,u2,v,u);
  }
  return m(start,mid-half)+c(start+length*0.55,mid-half,center-length*0.15,mid-tip,center,mid-tip)
    +c(center+length*0.15,mid-tip,end-length*0.55,mid-half,end,mid-half)+l(end,mid+half)
    +c(end-length*0.55,mid+half,center+length*0.15,mid+tip,center,mid+tip)
    +c(center-length*0.15,mid+tip,start+length*0.55,mid+half,start,mid+half)+'Z';
}

export function oliveGroupPath(sources: MorphRect[],destinations: MorphRect[],axis: string,progress: number,radius: number=22): string {
  const a: MorphRect[]=sources.filter(valid), b: MorphRect[]=destinations.filter(valid), p: number=clamp(progress);
  if (axis!=='horizontal' && axis!=='vertical') { return ''; }
  if (a.length===0) { return b.map((r: MorphRect): string=>rounded(r,radius)).join(''); }
  if (b.length===0) { return fused(a,axis,radius,1); }
  if (p<=OliveOil.fusionEnd) { return fused(a,axis,radius,smooth(p/OliveOil.fusionEnd)); }
  const s: number=(p-OliveOil.fusionEnd)/(1-OliveOil.fusionEnd), ab: MorphRect=union(a), bb: MorphRect=union(b);
  if (b.length===1) {
    const r: MorphRect=lerp(ab,b[0],smooth(s)), bulge: number=0.1*Math.min(r.width,r.height)*Math.sin(Math.PI*s);
    return rounded(axis==='horizontal' ? rect(r.x,r.y-bulge,r.width,r.height+2*bulge) : rect(r.x-bulge,r.y,r.width+2*bulge,r.height),radius);
  }
  const envelope: MorphRect=lerp(ab,bb,smooth(s/OliveOil.stretchEnd));
  const separation: number=smooth((s-OliveOil.separationStart)/(1-OliveOil.separationStart));
  if (separation<=0.0001) { return rounded(envelope,radius); }
  const h: boolean=axis==='horizontal', weights: number[]=b.map((r: MorphRect): number=>Math.max(1,h?r.width:r.height));
  let total: number=0; for (const w of weights) { total+=w; }
  let cursor: number=h?envelope.x:envelope.y, path: string=''; const modules: MorphRect[]=[];
  for (let i: number=0;i<b.length;i++) {
    const length: number=(h?envelope.width:envelope.height)*weights[i]/total;
    const slice: MorphRect=h?rect(cursor,envelope.y,length,envelope.height):rect(envelope.x,cursor,envelope.width,length); cursor+=length;
    const item: MorphRect=lerp(slice,b[i],separation);
    const span: number=h?bb.width:bb.height;
    const relative: number=Math.min(1.3,Math.max(-1.3,((h?cx(b[i]):cy(b[i]))-(h?cx(bb):cy(bb)))/(span/2)));
    const overshoot: number=(b.length<=2?26:16)*Math.sin(Math.PI*separation)*relative;
    if(h){item.x+=overshoot;}else{item.y+=overshoot;}
    modules.push(item); path+=rounded(item,radius);
  }
  for(let i: number=0;i<modules.length-1;i++){path+=neck(modules[i],modules[i+1],separation,axis);}
  return path;
}

export function oliveRadialPath(sources: MorphRect[],hub: MorphRect,progress: number): string {
  if(!valid(hub)){return '';}
  const cards: MorphRect[]=sources.filter(valid);if(cards.length===0){return '';}
  const p: number=clamp(progress),t: number=smooth(p);let path: string=rounded(hub,Math.min(hub.width,hub.height)/2);
  for(const source of cards){
    const x: number=cx(source)+(cx(hub)-cx(source))*t,y: number=cy(source)+(cy(hub)-cy(source))*t;
    const side: number=Math.min(source.width,source.height)*(1-0.55*t);
    path+=rounded(rect(x-side/2,y-side/2,Math.max(1,side),Math.max(1,side)),side/2);
    const strength: number=Math.sin(Math.PI*p)*0.9;if(strength<=0.02){continue;}
    const len: number=Math.max(1,Math.hypot(cx(source)-cx(hub),cy(source)-cy(hub)));
    const dx: number=(cx(source)-cx(hub))/len,dy: number=(cy(source)-cy(hub))/len,px: number=-dy,py: number=dx;
    const half: number=Math.min(hub.width,hub.height)*0.20*strength,tip: number=Math.max(2,side*0.34)*strength;
    const hx: number=cx(hub)+dx*hub.width*0.24,hy: number=cy(hub)+dy*hub.height*0.24;
    const tx: number=x-dx*side*0.22,ty: number=y-dy*side*0.22,mx: number=(hx+tx)/2+px*2,my: number=(hy+ty)/2+py*2;
    const mh: number=(half+tip)*0.42;
    path+=move(hx-px*half,hy-py*half)+'Q'+point(mx-px*mh,my-py*mh)+' '+point(tx-px*tip,ty-py*tip)
      +line(tx+px*tip,ty+py*tip)+'Q'+point(mx+px*mh,my+py*mh)+' '+point(hx+px*half,hy+py*half)+'Z';
  }
  return path;
}
export function oliveLigamentPath(upper: MorphRect,lower: MorphRect,axis: string,progress: number,thickness: number=30): string {
  if(!valid(upper)||!valid(lower)||!Number.isFinite(thickness)||thickness<=0){return '';}
  const p: number=clamp(progress);if(p<=0.001){return '';}
  const h: boolean=axis==='horizontal',left: number=h?Math.max(upper.y,lower.y):Math.max(upper.x,lower.x);
  const end: number=h?Math.min(bottom(upper),bottom(lower)):Math.min(right(upper),right(lower));
  if(end-left<=4){return '';}
  const half: number=Math.min(thickness*p,(end-left)/2)/2;if(half<=0.4){return '';}
  return ligament(h?right(upper):bottom(upper),h?lower.x:lower.y,(left+end)/2,half,half*0.55,h);
}
export function olivePath(geometry: OliveGeometry,progress: number): string {
  if(geometry.mode==='group'){return oliveGroupPath(geometry.sources,geometry.destinations,geometry.axis,progress,geometry.radius);}
  if(geometry.mode==='radial'){return geometry.destinations.length>0?oliveRadialPath(geometry.sources,geometry.destinations[0],progress):'';}
  if(geometry.destinations.length<2){return '';}
  if(geometry.mode==='ligament'){return oliveLigamentPath(geometry.destinations[0],geometry.destinations[1],geometry.axis,progress);}
  if(geometry.mode==='cluster'){return oliveClusterPath(geometry.sources,geometry.destinations[0],geometry.destinations[1],progress);}
  return '';
}
