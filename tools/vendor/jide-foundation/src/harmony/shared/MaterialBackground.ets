// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedGlassBackdrop } from './GlassBackdrop';

/** 常驻模块与按钮共享背景源；尺寸由原控件拥有，光学层退出命中与读屏。 */
export class SharedMaterialBackgroundOptions {
  source: string = '';
  radius: number = 16;
  contourPath: string = '';
  tint: string = '#00000000';
  dark: boolean = false;
  captureAllowed: (initialFrame?: boolean) => boolean = (): boolean => false;
}

@Component
export struct SharedMaterialBackground {
  @Prop options: SharedMaterialBackgroundOptions = new SharedMaterialBackgroundOptions();
  build() {
    Stack() {
      SharedGlassBackdrop({ source: this.options.source, radius: this.options.radius, contourPath: this.options.contourPath,
        tint: this.options.tint, dark: this.options.dark,
        role: 'material', active: true, captureAllowed: this.options.captureAllowed })
    }.width('100%').height('100%').borderRadius(this.options.radius).clip(true)
      .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')

  }
}

