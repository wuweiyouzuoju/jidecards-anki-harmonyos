// SPDX-License-Identifier: AGPL-3.0-or-later
import { OliveOilSurface, OliveOilSession, OliveState, OliveGeometry, createOliveOilSession,
  oliveOilAnimation, SharedActionButton, SharedPageBackground, visualPalette } from 'jide_foundation';
@Entry
@Component
struct OliveOilShowcase {
  @State private progress: number = 0;
  @State private visible: boolean = true;
  @State private expanded: boolean = false;
  @State private transitioning: boolean = false;
  @State private reduced: boolean = false;
  @State private dark: boolean = false;
  @State private mode: number = 0;
  @State private inspecting: boolean = false;
  private session: OliveOilSession | undefined = undefined;
  aboutToAppear(): void {
    this.session = createOliveOilSession((s: OliveState): void => {
      if(this.inspecting){return;}
      if (s.phase === 'measure') { this.session?.startSurface(); return; }
      this.transitioning = s.isTransitioning; this.expanded = s.contentExpanded;
      if (s.durationMs > 0) {
        this.getUIContext().animateTo(oliveOilAnimation(s), (): void => {
          this.progress = s.progress; this.visible = s.contentVisible;
        });
      } else { this.progress = s.progress; this.visible = s.contentVisible; }
    });
  }
  aboutToDisappear(): void { this.session?.dispose(); }
  onPageHide(): void { this.session?.settle(); }
  private geometry(): OliveGeometry {
    if(this.mode===1){return {sources:[{x:12,y:130,width:296,height:52}],
      destinations:[{x:12,y:130,width:66,height:52},{x:88,y:130,width:66,height:52},
        {x:164,y:130,width:66,height:52},{x:240,y:130,width:68,height:52}],axis:'horizontal',mode:'group',radius:26};}
    if(this.mode===2){return {sources:[{x:36,y:36,width:46,height:46},{x:142,y:22,width:46,height:46},
      {x:236,y:64,width:46,height:46},{x:252,y:166,width:46,height:46}],
      destinations:[{x:132,y:244,width:56,height:56}],axis:'vertical',mode:'radial',radius:23};}
    return {sources:[{x:12,y:12,width:296,height:86},{x:12,y:110,width:296,height:58},
      {x:12,y:180,width:296,height:58},{x:12,y:250,width:296,height:58}],
      destinations:[{x:12,y:12,width:296,height:100},{x:12,y:128,width:296,height:180}],axis:'vertical',mode:'cluster',radius:22};
  }
  private choose(value: number): void {
    this.inspecting=false; this.session?.settle(); this.mode=value; this.progress=this.expanded?1:0;
  }
  build() {
    Stack() {
      SharedPageBackground({isDark:this.dark})
      Scroll() {
        Column({space:12}) {
          Text('橄榄油').fontSize(30).fontWeight(FontWeight.Bold).fontColor(visualPalette(this.dark).text).width('100%')
          Text('融合 · 拉伸 · 收颈 · 分裂').fontSize(14).fontColor(visualPalette(this.dark).secondaryText).width('100%')
          Row({space:8}) {
            Button('卡片').onClick(():void=>{this.choose(0);})
            Button('评分').onClick(():void=>{this.choose(1);})
            Button('轮盘').onClick(():void=>{this.choose(2);})
          }.width('100%').justifyContent(FlexAlign.SpaceBetween)
          Stack({alignContent:Alignment.TopStart}) {
            OliveOilSurface({progress:this.reduced&&!this.inspecting?(this.expanded?1:0):this.progress,
              geometry:this.geometry(),color:this.dark?'#D930496D':'#E6FFFFFF',viewportWidth:320,viewportHeight:320})
          }.width('100%').aspectRatio(1)
          Text(this.expanded?'新内容先出现，轮廓继续变化':'同类表面先融合为共同体')
            .fontSize(14).fontColor(visualPalette(this.dark).text).opacity(this.visible?1:0)
          SharedActionButton({label:this.expanded?'融合返回':'播放橄榄油',isDark:this.dark,isInteractive:!this.transitioning,
            onAction:():void=>{if(this.inspecting){this.inspecting=false;this.session?.settle();}
              this.session?.transition(!this.expanded,this.reduced,true);}})
          Text('逐帧检查：'+Math.round(this.progress*100)+'%').fontSize(13).fontColor(visualPalette(this.dark).secondaryText)
          Slider({value:this.progress*100,min:0,max:100,step:1}).onChange((v:number):void=>{
            if(!this.inspecting){this.inspecting=true;this.session?.settle();}this.progress=v/100;this.visible=true;
          }).accessibilityText('橄榄油形状进度')
          Row() {
            Text('减少动态效果').fontColor(visualPalette(this.dark).text).layoutWeight(1)
            Toggle({type:ToggleType.Switch,isOn:this.reduced}).onChange((v:boolean):void=>{
              this.inspecting=false;this.session?.settle();this.reduced=v;
            }).accessibilityText('减少动态效果')
          }.width('100%')
          Row() {
            Text('深色外观').fontColor(visualPalette(this.dark).text).layoutWeight(1)
            Toggle({type:ToggleType.Switch,isOn:this.dark}).onChange((v:boolean):void=>{this.dark=v;}).accessibilityText('深色外观')
          }.width('100%')
          Text('独立公共组件样例 · 不读写产品数据').fontSize(12).fontColor(visualPalette(this.dark).secondaryText)
        }.padding(16).width('100%').constraintSize({maxWidth:560})
      }.width('100%').height('100%').scrollBar(BarState.Off)
    }.width('100%').height('100%')
  }
}
