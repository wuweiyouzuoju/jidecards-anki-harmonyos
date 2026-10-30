// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedGlassBackdrop, SharedGlassRegion } from 'jide_foundation';
import { GLASS_BACKGROUND_SOURCE } from '../../utils/GlassBackdrop';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { 颜色键 } from '../../model/颜色主题';

let nextBackgroundView: number = 0;
/** 全屏覆盖层只显示根背景原始帧；没有自己的主题纹理、随机运动或动画时钟。 */
@Component
export struct CapturedThemeBackground {
  @StorageProp(APP_FOREGROUND_KEY) private foreground: boolean = false;
  @StorageProp(颜色键.页面底色微染) private base: string = '#e9eef7';
  @State private region: SharedGlassRegion = { left: 0, top: 0, width: 0, height: 0 };
  private readonly viewId: string = `jide-background-view-${++nextBackgroundView}`;

  private measure(): void {
    const node = this.getUIContext().getFrameNodeById(this.viewId);
    if (node === null) return;
    const size = node.getMeasuredSize();
    const position = node.getPositionToWindow();
    this.region = { left: position.x, top: position.y,
      width: this.getUIContext().px2vp(size.width), height: this.getUIContext().px2vp(size.height) };
  }

  build() {
    Stack() {
      SharedGlassBackdrop({ source: GLASS_BACKGROUND_SOURCE, region: this.region, radius: 0,
        role: 'background', active: this.foreground, captureAllowed: (): boolean => this.foreground })
    }.width('100%').height('100%').backgroundColor(this.base).id(this.viewId)
      .onAreaChange((): void => { this.measure(); })
      .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }
}
