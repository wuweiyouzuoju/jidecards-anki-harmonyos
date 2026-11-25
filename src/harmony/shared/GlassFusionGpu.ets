// SPDX-License-Identifier: AGPL-3.0-or-later
import { image } from '@kit.ImageKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import glassGpu from 'libjide_glass_gpu.so';
import { BackdropFrame, BackdropConsumer } from './GlassBackdropTypes';
import { GlassFusionGeometry } from '../../core/GlassFusion';

/** TEXTURE表面将同一张磨砂图交给GPU，只在背景帧变化时上传；逐帧只更新21个标量。 */
export class GlassFusionGpuController extends XComponentController implements BackdropConsumer {
  freezeBackdrop: boolean = true;
  ready: () => void = (): void => {};
  failed: (reason: string) => void = (_reason: string): void => {};
  private handle: number = 0;
  private generation: number = 0;
  private frame: BackdropFrame | undefined = undefined;
  private uploaded: image.PixelMap | undefined = undefined;
  private uploading: image.PixelMap | undefined = undefined;
  private uniforms: Float64Array = new Float64Array(21);
  private configured: boolean = false;
  private drawn: boolean = false;
  private disposed: boolean = false;
  private drawTotal: number = 0;
  private drawPeak: number = 0;
  private draws: number = 0;

  onSurfaceCreated(surfaceId: string): void {
    if(this.disposed) return;
    try {
      this.handle=glassGpu.create(BigInt(surfaceId));
      if(this.handle===0) {this.failed('gpu_surface_unavailable');return;}
      this.updateFrame(this.frame);
    } catch(error) {this.fail(error);}
  }
  onSurfaceDestroyed(_surfaceId: string): void {this.release();}
  private release(): void {
    this.generation++;
    if(this.handle!==0) {glassGpu.destroy(this.handle);this.handle=0;}
    this.uploaded=undefined;this.uploading=undefined;this.drawn=false;
  }
  private fail(error: Error | string): void {
    hilog.warn(0x4342,'GlassFusionGpu','GPU unavailable: %{public}s',String(error));
    this.failed('gpu_unavailable');
  }
  updateFrame(frame: BackdropFrame | undefined): void {
    this.frame=frame;
    if(frame===undefined) {this.generation++;this.uploaded=undefined;this.uploading=undefined;return;}
    if(frame===undefined||this.handle===0||this.disposed) return;
    this.uniforms[15]=frame.left;this.uniforms[16]=frame.top;this.uniforms[17]=frame.width;this.uniforms[18]=frame.height;
    if(this.uploaded===frame.frosted||this.uploading===frame.frosted) return;
    this.uploading=frame.frosted;
    const generation: number=this.generation,handle: number=this.handle;
    try {
      const size: image.Size=frame.frosted.getImageInfoSync().size;
      if(size.width<=0||size.height<=0||size.width>2048||size.height>2048) {this.fail('gpu_texture_size');return;}
      const buffer: ArrayBuffer=new ArrayBuffer(size.width*size.height*4);
      const area: image.PositionArea={pixels:buffer,offset:0,stride:size.width*4,region:{x:0,y:0,size:size}};
      // readPixels输出紧密BGRA，避免底图行对齐或源格式差异产生色偏/斜纹。
      frame.frosted.readPixels(area).then((): void=>{
        if(this.disposed||generation!==this.generation||handle!==this.handle) return;
        if(!glassGpu.upload(handle,buffer,size.width,size.height,true)) {this.fail('gpu_upload');return;}
        this.uploaded=frame.frosted;this.uploading=undefined;this.draw();
      }).catch((error: Error): void=>{if(!this.disposed&&generation===this.generation)this.fail(error);});
    } catch(error) {this.fail(error);}
  }
  configure(width: number,height: number,left: number,top: number,g: GlassFusionGeometry,progress: number,dark: boolean,density: number): void {
    const a=g.source,b=g.target,u=this.uniforms;
    u[0]=width;u[1]=height;u[2]=a.x;u[3]=a.y;u[4]=a.width;u[5]=a.height;u[6]=a.radius;
    u[7]=b.x;u[8]=b.y;u[9]=b.width;u[10]=b.height;u[11]=b.radius;u[12]=progress;
    u[13]=left;u[14]=top;u[19]=dark?1:0;u[20]=density;this.configured=true;this.draw();
  }
  private draw(): void {
    if(this.disposed||!this.configured||this.uploaded===undefined||this.handle===0) return;
    try {
      const start: number=Date.now();
      if(!glassGpu.draw(this.handle,this.uniforms)) {this.fail('gpu_draw');return;}
      const elapsed: number=Date.now()-start;this.draws++;this.drawTotal+=elapsed;this.drawPeak=Math.max(this.drawPeak,elapsed);
      if(!this.drawn) {this.drawn=true;this.ready();}
    } catch(error) {this.fail(error);}
  }
  drawMetrics(): string {return (this.drawTotal/Math.max(1,this.draws)).toFixed(2)+','+this.drawPeak;}
  dispose(): void {this.disposed=true;this.frame=undefined;this.release();}
}
