// SPDX-License-Identifier: AGPL-3.0-or-later
import { glassSourceVisibility, setGlassSourceFreeze } from '../../utils/GlassBackdrop';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
let nextSource: number = 0;

/** 只包正文与真实底色；所有自绘弹窗必须是本组件外的兄弟节点。 */
@Component
export struct GlassSource {
  @Prop @Watch('sync') sourceEnabled: boolean = true;
  @Prop @Watch('sync') previewWarm: boolean = false;
  @StorageProp('surface_material') @Watch('sync') private material: string = 'flat';
  @StorageProp(APP_FOREGROUND_KEY) @Watch('sync') private foreground: boolean = false;
  @Prop freezeDuringPanels: boolean = false;
  @Prop sourceId: string = `jide-glass-source-${++nextSource}`;
  private visible: boolean = false;
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  private sync(): void {
    glassSourceVisibility(this.getUIContext(), this.sourceId, this.sourceEnabled && this.visible && this.foreground && (this.material === 'glass' || this.previewWarm), this.previewWarm);
  }
  aboutToAppear(): void { setGlassSourceFreeze(this.sourceId, this.freezeDuringPanels); }
  aboutToDisappear(): void { this.visible = false; this.sync(); setGlassSourceFreeze(this.sourceId, false); }
  build() {
    Stack() {
      this.content()
    }.width('100%').height('100%').id(this.sourceId)
      .onVisibleAreaChange([0, 1], (visible: boolean, ratio: number): void => {
        this.visible = visible && ratio > 0; this.sync();
      })
  }
}
