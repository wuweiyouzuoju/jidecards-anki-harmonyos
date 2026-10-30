// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { dialogHierarchy, DialogSurfaceSize } from '../../model/DialogHierarchy';
import { 主题模式, 解析是否深色 } from '../../model/主题设置';

/** 自绘弹窗遮罩统一跟随应用主题并覆盖安全区；关闭决策仍由弹窗所有者提供。 */
@Component
export struct DialogBackdrop {
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp('themeMode') private mode: 主题模式 = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;

  @Prop widthPercent: number = Number.parseFloat(应用尺寸.dialogWidth);
  @Prop maximumWidth: number = 应用尺寸.dialogMaxWidth;
  onSize: (width: string, maximumWidth: number) => void = (_width: string, _maximumWidth: number): void => {};
  private surfaceId: number = 0;

  aboutToAppear(): void {
    const size: DialogSurfaceSize = dialogHierarchy.enter(this.widthPercent, this.maximumWidth);
    this.surfaceId = size.id;
    this.onSize(`${size.widthPercent}%`, size.maximumWidth);
  }

  aboutToDisappear(): void { dialogHierarchy.leave(this.surfaceId); }

  build() {
    Column()
      .width('100%').height('100%')
      .backgroundColor(解析是否深色(this.mode, this.systemDark) ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
      // 页面背景默认磨砂；玻璃档透视原页面，弹窗本体保持有限透明。
      .backgroundBlurStyle(BlurStyle.NONE, {
        colorMode: 解析是否深色(this.mode, this.systemDark) ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
        adaptiveColor: AdaptiveColor.DEFAULT
      })
      .backdropBlur(8)
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
