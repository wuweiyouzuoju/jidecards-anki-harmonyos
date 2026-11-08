// SPDX-License-Identifier: AGPL-3.0-or-later
import { DEFAULT_DIALOG_BACKDROP_BLUR } from './PopupAppearance';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { dialogHierarchy, DialogSurfaceSize } from '../../model/DialogHierarchy';
import { 主题模式, 解析是否深色 } from '../../model/主题设置';

/** 自绘弹窗遮罩统一跟随应用主题并覆盖安全区；关闭决策仍由弹窗所有者提供。 */
@Component
export struct DialogBackdrop {
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: 主题模式 = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;

  // 纯菜单遮罩不参与表单尺寸层级，不能让新增磨砂改变二级窗口尺寸。
  @Prop tracksHierarchy: boolean = true;
  @Prop materialOverride: string = '';
  @Prop blurRadius: number = DEFAULT_DIALOG_BACKDROP_BLUR;
  @Prop widthPercent: number = Number.parseFloat(应用尺寸.dialogWidth);
  @Prop maximumWidth: number = 应用尺寸.dialogMaxWidth;
  onSize: (width: string, maximumWidth: number) => void = (_width: string, _maximumWidth: number): void => {};
  private surfaceId: number = 0;

  aboutToAppear(): void {
    if (!this.tracksHierarchy) return;
    const size: DialogSurfaceSize = dialogHierarchy.enter(this.widthPercent, this.maximumWidth);
    this.surfaceId = size.id;
    this.onSize(`${size.widthPercent}%`, size.maximumWidth);
  }

  aboutToDisappear(): void { dialogHierarchy.leave(this.surfaceId); }

  build() {
    Column()
      .width('100%').height('100%')
      .backgroundColor(解析是否深色(this.mode, this.systemDark) ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
      // 遮罩独占页面磨砂；菜单正文与牌组预览在其上层保持清晰。
      .backgroundEffect((this.materialOverride || this.material) === 'glass' && this.blurRadius > 0 ?
        { radius: this.blurRadius, saturation: 1, brightness: 1, color: Color.Transparent } : undefined)
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
