// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassMesh, GlassPoint } from './GlassOptics';

export interface GlassFusionRect { x: number; y: number; width: number; height: number; radius: number; }
export interface GlassFusionGeometry { source: GlassFusionRect; target: GlassFusionRect; }
export interface GlassFusionMesh extends GlassMesh { edge: GlassPoint[]; clipRect?: GlassFusionRect; }
interface FusionVertex extends GlassPoint { distance: number; sampled: boolean; texture: GlassPoint; outputIndex: number; }
/** 菜单展开公共时长；窗口/对话框可显式传入其语义时长。 */
export const GLASS_MENU_ENTER_MS: number = 160;
export const GLASS_POPUP_ENTER_MS: number = 200;

export interface GlassExitMotion {
  scale: number;
  offsetX: number;
  duration: number;
}

export function glassExitMotion(menu: boolean, drawer: boolean): GlassExitMotion {
  return { scale: drawer ? 1 : menu ? 0.72 : 0.86, offsetX: drawer ? -16 : 0, duration: drawer ? 180 : 190 };
}
/** 使用控件实测外形；不能把圆形工具按钮默认为16vp圆角。 */
export function glassPopupTriggerRect(x: number, y: number, width: number, height: number, radius: number): GlassFusionRect {
  return { x, y, width, height, radius: Math.min(Math.max(0, radius), width / 2, height / 2) };
}
export const GLASS_FUSION_MAX_CELLS: number = 256;

export function validGlassFusion(g: GlassFusionGeometry): boolean {
  return [g.source, g.target].every((r: GlassFusionRect): boolean =>
    [r.x,r.y,r.width,r.height,r.radius,r.x+r.width,r.y+r.height].every(Number.isFinite) && r.width > 0 && r.height > 0 && r.radius >= 0);
}
function clamp(t: number): number { return Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0; }
/** 缓存圆角矩形常量；热循环避免重复归一尺寸与可变参数hypot。 */
class GlassFusionRectField {
  private cx: number;
  private cy: number;
  private ex: number;
  private ey: number;
  private radius: number;
  constructor(r: GlassFusionRect) {
    this.radius=Math.max(0,Math.min(r.radius,r.width/2,r.height/2));
    this.cx=r.x+r.width/2;this.cy=r.y+r.height/2;
    this.ex=r.width/2-this.radius;this.ey=r.height/2-this.radius;
  }
  distance(x: number,y: number): number {
    const dx: number=x-this.cx,dy: number=y-this.cy;
    const qx: number=(dx<0?-dx:dx)-this.ex,qy: number=(dy<0?-dy:dy)-this.ey;
    if(qx<=0&&qy<=0) return (qx>qy?qx:qy)-this.radius;
    const ax: number=qx>0?qx:0,ay: number=qy>0?qy:0;
    return Math.sqrt(ax*ax+ay*ay)-this.radius;
  }
}
/** 中段聚为圆球再展开；端点严格保持宿主实测矩形，避免布局漂移。 */
export function glassFusionStageRect(g: GlassFusionGeometry, progress: number): GlassFusionRect {
  const p: number=clamp(progress),a: GlassFusionRect=g.source,b: GlassFusionRect=g.target;
  const width: number=a.width+(b.width-a.width)*p,height: number=a.height+(b.height-a.height)*p;
  const sphere: number=Math.pow(Math.sin(Math.PI*p),4),diameter: number=Math.min(width,height);
  const w: number=width+(diameter-width)*sphere,h: number=height+(diameter-height)*sphere;
  const radius: number=a.radius+(b.radius-a.radius)*p;
  return {x:a.x+(b.x-a.x)*p+(width-w)/2,y:a.y+(b.y-a.y)*p+(height-h)/2,
    width:w,height:h,radius:radius+(Math.min(w,h)/2-radius)*sphere};
}

export function glassFusionTiming(time: number, expanding: boolean): number {
  const t: number=clamp(time);
  return expanding ? 1-Math.pow(1-t,2) : t*t*(3-2*t);
}

/** 两个解析距离场的平滑并集；仅最终外缘产生折射，不保留两个内部边界。 */
export function glassFusionDistance(x: number, y: number, g: GlassFusionGeometry, progress: number): number {
  return new GlassFusionField(g,progress).distance(x,y);
}
class GlassFusionField {
  private main: GlassFusionRect;
  private source: GlassFusionRect;
  private blend: number;
  private mainField: GlassFusionRectField;
  private sourceField: GlassFusionRectField;
  constructor(g: GlassFusionGeometry,progress: number) {
    const p: number=clamp(progress),a: GlassFusionRect=g.source,b: GlassFusionRect=g.target;
    this.main=glassFusionStageRect(g,p);
    const remaining: number=Math.max(0,1-p/0.4),w: number=a.width*remaining,h: number=a.height*remaining;
    this.source={x:a.x+(a.width-w)/2,y:a.y+(a.height-h)/2,width:w,height:h,radius:a.radius*remaining};
    this.mainField=new GlassFusionRectField(this.main);this.sourceField=new GlassFusionRectField(this.source);
    this.blend=p===0||remaining===0?0:Math.min(a.width,a.height)*0.65*Math.sin(Math.PI*p);
  }
  bounds(width: number,height: number): GlassFusionRect {
    const a: GlassFusionRect=this.main,b: GlassFusionRect=this.blend>0?this.source:this.main;
    const pad: number=this.blend*0.25;
    const x: number=Math.max(0,Math.min(a.x,b.x)-pad), y: number=Math.max(0,Math.min(a.y,b.y)-pad);
    return {x,y,width:Math.max(0,Math.min(width,Math.max(a.x+a.width,b.x+b.width)+pad)-x),
      height:Math.max(0,Math.min(height,Math.max(a.y+a.height,b.y+b.height)+pad)-y),radius:0};
  }
  distance(x: number,y: number): number {
    const d: number=this.mainField.distance(x,y);
    if(this.blend<=0) return d;
    const e: number=this.sourceField.distance(x,y);
    const delta: number=d-e,remaining: number=this.blend-(delta<0?-delta:delta);
    const blend: number=remaining>0?remaining/this.blend:0;
    return (d<e?d:e)-blend*blend*this.blend*0.25;
  }
}

/** 一次准备时固定网格预算，逐帧只更新距离和顶点；无像素遍历或截图。 */
export class GlassFusionTessellator {
  private columns: number;
  private rows: number;
  private width: number;
  private height: number;
  private density: number;
  private vertices: FusionVertex[] = [];
  private intersections: FusionVertex[] = [];
  private intersectionCount: number = 0;
  private positionPool: GlassPoint[] = [];
  private texturePool: GlassPoint[] = [];
  private polygon: FusionVertex[] = [];
  readonly mesh: GlassFusionMesh = {positions:[],texture:[],indices:[],edge:[]};
  constructor(width: number, height: number, density: number = 1, cellBudget: number = GLASS_FUSION_MAX_CELLS) {
    this.width=Math.max(1,width);this.height=Math.max(1,height);this.density=Math.max(0.1,density);
    const budget: number=Number.isFinite(cellBudget)?Math.max(64,Math.min(1024,Math.floor(cellBudget))):GLASS_FUSION_MAX_CELLS;
    const ratio: number = this.width/this.height;
    this.columns=Math.max(4,Math.min(64,Math.round(Math.sqrt(budget*ratio))));
    this.rows=Math.max(4,Math.min(64,Math.floor(budget/this.columns)));
    for(let i: number=0;i<(this.columns+1)*(this.rows+1);i++) this.vertices.push({x:0,y:0,distance:0,sampled:false,texture:{x:0,y:0},outputIndex:-1});
  }
  private allocateVertex(x: number,y: number,distance: number): FusionVertex {
    let v: FusionVertex=this.intersections[this.intersectionCount++];
    if(v===undefined) {
      v={x:0,y:0,distance:0,sampled:false,texture:{x:0,y:0},outputIndex:-1};this.intersections.push(v);
    }
    v.x=x;v.y=y;v.distance=distance;v.sampled=false;v.outputIndex=-1;return v;
  }
  private intersection(a: FusionVertex,b: FusionVertex,field: GlassFusionField): FusionVertex {
    let lo: number=0,hi: number=1,da: number=a.distance,db: number=b.distance;
    let t: number=da/(da-db),x: number=a.x+(b.x-a.x)*t,y: number=a.y+(b.y-a.y)*t;
    // 曲线边缘不能把线性SDF插值当作真实零点；有限次求根消除圆角鼓包/缩角。
    for(let i: number=0;i<5;i++) {
      const d: number=field.distance(x,y);
      if(Math.abs(d)<0.0001) break;
      if((d<0)===(da<0)){lo=t;da=d;}else{hi=t;db=d;}
      t=lo+(hi-lo)*da/(da-db);x=a.x+(b.x-a.x)*t;y=a.y+(b.y-a.y)*t;
    }
    return this.allocateVertex(x,y,0);
  }
  private midpoint(a: FusionVertex,b: FusionVertex,field: GlassFusionField): FusionVertex {
    const x: number=(a.x+b.x)/2,y: number=(a.y+b.y)/2;
    return this.allocateVertex(x,y,field.distance(x,y));
  }
  private emit(v: FusionVertex,field: GlassFusionField,band: number): number {
    if(v.outputIndex>=0) return v.outputIndex;
    const index: number=this.mesh.positions.length;
    let position: GlassPoint=this.positionPool[index],texture: GlassPoint=this.texturePool[index];
    if(position===undefined) {
      position={x:0,y:0};texture={x:0,y:0};this.positionPool.push(position);this.texturePool.push(texture);
    }
    position.x=v.x;position.y=v.y;
    this.sample(v,field,band);texture.x=v.texture.x;texture.y=v.texture.y;
    this.mesh.positions.push(position);this.mesh.texture.push(texture);v.outputIndex=index;
    return index;
  }
  private triangle(a: FusionVertex,b: FusionVertex,c: FusionVertex,field: GlassFusionField,band: number,depth: number = 0): void {
    // 浮点平移后边界零点可能落在外侧；先细分接近边缘的单元，不能依赖精确符号。
    if(depth<1 && !(a.distance<=0&&b.distance<=0&&c.distance<=0)) {
      const span: number=Math.max(Math.hypot(a.x-b.x,a.y-b.y),Math.hypot(b.x-c.x,b.y-c.y),Math.hypot(c.x-a.x,c.y-a.y));
      if(Math.min(a.distance,b.distance,c.distance)<=span) {
        const ab: FusionVertex=this.midpoint(a,b,field),bc: FusionVertex=this.midpoint(b,c,field),ca: FusionVertex=this.midpoint(c,a,field);
        this.triangle(a,ab,ca,field,band,depth+1);this.triangle(ab,b,bc,field,band,depth+1);
        this.triangle(ca,bc,c,field,band,depth+1);this.triangle(ab,bc,ca,field,band,depth+1);return;
      }
    }
    if(a.distance>0&&b.distance>0&&c.distance>0) {
      if(depth<4) {
        const ab: FusionVertex=this.midpoint(a,b,field),bc: FusionVertex=this.midpoint(b,c,field),ca: FusionVertex=this.midpoint(c,a,field);
        if(ab.distance<0||bc.distance<0||ca.distance<0) {
          this.triangle(a,ab,ca,field,band,depth+1);this.triangle(ab,b,bc,field,band,depth+1);
          this.triangle(ca,bc,c,field,band,depth+1);this.triangle(ab,bc,ca,field,band,depth+1);
        }
      }
      return;
    }
    if(a.distance<=0&&b.distance<=0&&c.distance<=0) {
      const points: FusionVertex[] = [a, b, c];
      for (let index: number = 0; index < 3; index++) {
        const start: FusionVertex = points[index], end: FusionVertex = points[(index + 1) % 3];
        if (Math.abs(start.distance) < 0.00001 && Math.abs(end.distance) < 0.00001 &&
          Math.abs(field.distance((start.x + end.x) / 2, (start.y + end.y) / 2)) < 0.00001)
          this.mesh.edge.push(this.mesh.positions[this.emit(start,field,band)],this.mesh.positions[this.emit(end,field,band)]);
      }
      this.mesh.indices.push(this.emit(a,field,band),this.emit(b,field,band),this.emit(c,field,band));return;
    }
    this.polygon.length=0;
    for(let i: number=0;i<3;i++) {
      const start: FusionVertex=i===0?a:i===1?b:c,end: FusionVertex=i===0?b:i===1?c:a;
      if(start.distance<=0) this.polygon.push(start);
      if((start.distance<0&&end.distance>0)||(start.distance>0&&end.distance<0)) this.polygon.push(this.intersection(start,end,field));
    }
    // 圆角两端恰落在网格边界时，弧内仍有面积，继续细分而非丢弃。
    if(this.polygon.length===2 && depth<4) {
      const u: FusionVertex=this.polygon[0],v: FusionVertex=this.polygon[1];
      if(field.distance((u.x+v.x)/2,(u.y+v.y)/2)<-0.15*this.density) {
        const ab: FusionVertex=this.midpoint(a,b,field),bc: FusionVertex=this.midpoint(b,c,field),ca: FusionVertex=this.midpoint(c,a,field);
        this.triangle(a,ab,ca,field,band,depth+1);this.triangle(ab,b,bc,field,band,depth+1);
        this.triangle(ca,bc,c,field,band,depth+1);this.triangle(ab,bc,ca,field,band,depth+1);return;
      }
    }
    if(this.polygon.length<3) return;
    if(depth<4) {
      let refine: boolean=false;
      for(let i: number=0;i<this.polygon.length;i++) {
        const start: FusionVertex=this.polygon[i],end: FusionVertex=this.polygon[(i+1)%this.polygon.length];
        if(Math.abs(start.distance)<0.001&&Math.abs(end.distance)<0.001&&
          Math.abs(field.distance((start.x+end.x)/2,(start.y+end.y)/2))>0.15*this.density) refine=true;
      }
      if(refine) {
        const ab: FusionVertex=this.midpoint(a,b,field),bc: FusionVertex=this.midpoint(b,c,field),ca: FusionVertex=this.midpoint(c,a,field);
        this.triangle(a,ab,ca,field,band,depth+1);this.triangle(ab,b,bc,field,band,depth+1);
        this.triangle(ca,bc,c,field,band,depth+1);this.triangle(ab,bc,ca,field,band,depth+1);return;
      }
    }
    const first: number=this.emit(this.polygon[0],field,band);
    for(let i: number=0;i<this.polygon.length;i++) {
      const v: FusionVertex=this.polygon[i],next: FusionVertex=this.polygon[(i+1)%this.polygon.length];
      const index: number=this.emit(v,field,band),nextIndex: number=this.emit(next,field,band);
      if(Math.abs(v.distance)<0.00001&&Math.abs(next.distance)<0.00001)
        this.mesh.edge.push(this.mesh.positions[index],this.mesh.positions[nextIndex]);
      if(i>0&&i<this.polygon.length-1) this.mesh.indices.push(first,index,nextIndex);
    }
  }
  private sample(v: FusionVertex,field: GlassFusionField,band: number): void {
    if(v.sampled) return;
    v.sampled=true;v.texture.x=v.x;v.texture.y=v.y;
    if(v.distance>=-0.00001||v.distance<=-band) return;
    const t: number=clamp(-v.distance/band), fade: number=t*t*(3-2*t);
    const shift: number=Math.min(10*this.density,band*0.3)*4*fade*(1-fade);
    const epsilon: number=Math.max(0.25,band);
    v.texture.x-=shift*(field.distance(v.x+epsilon,v.y)-field.distance(v.x-epsilon,v.y))/(2*epsilon);
    v.texture.y-=shift*(field.distance(v.x,v.y+epsilon)-field.distance(v.x,v.y-epsilon))/(2*epsilon);
  }
  /** 端点使用连续规则网格和精确原生轮廓，避免自适应网格的T形接点留下纹理接缝。 */
  private terminal(r: GlassFusionRect, field: GlassFusionField, band: number): GlassFusionMesh {
    this.mesh.clipRect = r;
    const columns: number = Math.max(8, Math.min(64, Math.ceil(r.width / (4 * this.density))));
    const rows: number = Math.max(8, Math.min(64, Math.ceil(r.height / (4 * this.density))));
    for (let row: number = 0; row <= rows; row++) for (let column: number = 0; column <= columns; column++) {
      const x: number = r.x + column / columns * r.width, y: number = r.y + row / rows * r.height;
      this.emit(this.allocateVertex(x, y, field.distance(x, y)), field, band);
      if (row < rows && column < columns) {
        const index: number = row * (columns + 1) + column;
        this.mesh.indices.push(index, index + 1, index + columns + 1, index + 1, index + columns + 2, index + columns + 1);
      }
    }
    const radius: number = Math.min(r.radius, r.width / 2, r.height / 2);
    const steps: number = Math.max(4, Math.ceil(Math.PI / 2 / (2 * Math.acos(Math.max(-1, 1 - 0.1 * this.density / Math.max(radius, 0.1 * this.density))))));
    let first: GlassPoint | undefined = undefined, previous: GlassPoint | undefined = undefined;
    for (let corner: number = 0; corner < 4; corner++) {
      const cx: number = r.x + (corner === 0 || corner === 1 ? r.width - radius : radius);
      const cy: number = r.y + (corner === 1 || corner === 2 ? r.height - radius : radius);
      for (let step: number = 0; step <= steps; step++) {
        const angle: number = (-1 + corner + step / steps) * Math.PI / 2;
        const x: number = cx + Math.cos(angle) * radius, y: number = cy + Math.sin(angle) * radius;
        const point: GlassPoint = this.mesh.positions[this.emit(this.allocateVertex(x, y, 0), field, band)];
        if (first === undefined) first = point;
        if (previous !== undefined) this.mesh.edge.push(previous, point);
        previous = point;
      }
    }
    if (previous !== undefined && first !== undefined) this.mesh.edge.push(previous, first);
    return this.mesh;
  }
  update(g: GlassFusionGeometry,progress: number): GlassFusionMesh {
    this.mesh.positions.length=0;this.mesh.texture.length=0;this.mesh.indices.length=0;this.mesh.edge.length=0;
    this.intersectionCount=0;this.mesh.clipRect=undefined;
    if(!validGlassFusion(g)) return this.mesh;
    const p: number=clamp(progress);
    const field: GlassFusionField=new GlassFusionField(g,p);
    const band: number=Math.min(36*this.density,Math.min(g.target.width,g.target.height)*0.4);
    if (p === 0 || p === 1) return this.terminal(p === 0 ? g.source : g.target, field, band);
    const bounds: GlassFusionRect=field.bounds(this.width,this.height);
    if(bounds.width<=0||bounds.height<=0) return this.mesh;
    // 小圆钮也获得完整网格预算；不让整段行程的空白区域稀释轮廓精度。
    // 拓扑预算在一次转场中固定，避免宽高比变化导致网格数跳变。
    for(let row: number=0;row<=this.rows;row++) for(let col: number=0;col<=this.columns;col++) {
      const v: FusionVertex=this.vertices[row*(this.columns+1)+col];
      v.x=bounds.x+col/this.columns*bounds.width;v.y=bounds.y+row/this.rows*bounds.height;
      v.distance=field.distance(v.x,v.y);v.sampled=false;v.outputIndex=-1;
    }
    const stride: number=this.columns+1;
    for(let row: number=0;row<this.rows;row++) for(let col: number=0;col<this.columns;col++) {
      const i: number=row*stride+col;
      this.triangle(this.vertices[i],this.vertices[i+1],this.vertices[i+stride],field,band);
      this.triangle(this.vertices[i+1],this.vertices[i+stride+1],this.vertices[i+stride],field,band);
    }
    return this.mesh;
  }
}
