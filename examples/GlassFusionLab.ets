// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedGlassFusion, SharedGlassRegion, GlassFusionGeometry, warmSharedGlassSource } from 'jide_foundation';

/** 独立可复现实验；源中不包含触发按钮或控制台，不写产品偏好和业务数据。 */
@Entry
@Component
struct GlassFusionLab {
  @State private dark: boolean = false;
  @State private budget: number = 256;
  @State private gpuExperiment: boolean = false;
  @State private expanded: boolean = true;
  @State private mounted: boolean = false;
  @State private status: string = '准备';
  @State private region: SharedGlassRegion = {left:0,top:0,width:0,height:0};
  private captureAllowed: () => boolean = (): boolean=>true;
  private geometry(): GlassFusionGeometry {
    const r: SharedGlassRegion=this.region;
    return {source:{x:r.left+24,y:r.top+20,width:44,height:44,radius:16},
      target:{x:r.left+24,y:r.top+84,width:Math.min(260,Math.max(100,r.width-48)),height:Math.min(320,Math.max(160,r.height-110)),radius:16}};
  }
  aboutToDisappear(): void {
    warmSharedGlassSource(this.getUIContext(),'glass-fusion-lab-source',false,this.captureAllowed);
  }
  private reset(): void {this.mounted=false;this.status='准备';}
  build() {
    Column({space:12}) {
      Text('玻璃融合实验').fontSize(22).fontColor(this.dark?'#FFFFFF':'#18202B')
      Text('独立背景、可反向、无业务写入；日志标签 GlassFusion').fontSize(14).fontColor(this.dark?'#FFFFFF':'#18202B')
      Row({space:8}) {
        Button('CPU／GPU').onClick((): void=>{this.reset();this.gpuExperiment=!this.gpuExperiment;})
        Button('明／暗').onClick((): void=>{this.reset();this.dark=!this.dark;})
        ForEach([128,256,512],(cells: number)=>{
          Button(String(cells)).onClick((): void=>{this.reset();this.budget=cells;})
        })
      }
      Row({space:8}) {
        Button('展开／收起').onClick((): void=>{
          if(!this.mounted){this.expanded=true;this.mounted=true;}else this.expanded=!this.expanded;
          this.status='播放中';
        })
        Button('快速反向').onClick((): void=>{if(this.mounted)this.expanded=!this.expanded;})
        Button('销毁').onClick((): void=>{this.reset();})
      }
      Text((this.gpuExperiment?'GPU':'CPU')+' · '+this.status+' · '+String(this.budget)).fontSize(14).fontColor(this.dark?'#FFFFFF':'#18202B')
      Stack({alignContent:Alignment.TopStart}) {
        Column({space:20}) {
          ForEach([0,1,2,3,4,5,6,7],(index: number)=>{
            Row({space:8}) {
              Text(String(index)).fontSize(24).fontColor(this.dark?'#B7C1D1':'#33425A')
              Divider().strokeWidth(2).color(index%2===0?'#487CCA':'#BA9035').layoutWeight(1)
            }.width('100%')
          })
        }.padding(12).width('100%').height('100%').backgroundColor(this.dark?'#18202B':'#E9EEF7')
          .id('glass-fusion-lab-source')
          .onAreaChange((_old: Area,area: Area): void=>{
            this.reset();this.region={left:Number(area.globalPosition.x),top:Number(area.globalPosition.y),width:Number(area.width),height:Number(area.height)};
          })
          .onVisibleAreaChange([0,1],(visible: boolean): void=>{
            warmSharedGlassSource(this.getUIContext(),'glass-fusion-lab-source',visible,this.captureAllowed);
          })
        if(this.mounted&&this.region.width>0) {
          SharedGlassFusion({source:'glass-fusion-lab-source',region:this.region,geometry:this.geometry(),expanded:this.expanded,
            dark:this.dark,gpuExperiment:this.gpuExperiment,meshBudget:this.budget,experiment:'lab-'+String(this.budget),
            onComplete:(reason: string): void=>{this.status=reason;}})
            .position({x:0,y:0}).hitTestBehavior(HitTestMode.None)
        }
      }.width('100%').layoutWeight(1)
    }.padding(16).width('100%').height('100%').backgroundColor(this.dark?'#101820':'#F5F7FA')
  }
}
