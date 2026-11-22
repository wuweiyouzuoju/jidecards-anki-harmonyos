// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { dialogHierarchy, DialogSurfaceSize } from '../../model/DialogHierarchy';
import { 主题模式, 解析是否深色 } from '../../model/主题设置';
import { BackdropHorizontalTransform, backdropHorizontalTransform, WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY,
  WINDOW_SIZE_KEY, WindowSizeVp } from '../../model/WindowSafeLayout';

/** 自绘弹窗遮罩统一跟随应用主题并覆盖安全区；关闭决策仍由弹窗所有者提供。 */
@Component
export struct DialogBackdrop {
  @StorageProp('themeMode') private mode: 主题模式 = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  @StorageProp(WINDOW_SIZE_KEY) private windowSize: WindowSizeVp = { width: 0, height: 0 };
  @State private viewportLeft: number = 0;
  @State private viewportWidth: number = 0;

  // 纯菜单遮罩不参与表单尺寸层级，不能让新增磨砂改变二级窗口尺寸。
  @Prop tracksHierarchy: boolean = true;
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

  private horizontal(): BackdropHorizontalTransform {
    return backdropHorizontalTransform(this.viewportLeft, this.viewportWidth, this.windowSize.width, this.safeLeft, this.safeRight);
  }

  build() {
    Stack() {
      Column()
        .width('100%').height('100%')
        .backgroundColor(解析是否深色(this.mode, this.systemDark) ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .expandSafeArea([SafeAreaType.SYSTEM, SafeAreaType.CUTOUT], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        // 页面壳可能用 padding 避让侧边；压暗层跨过该留白，正文仍按原边界布局。
        .scale({ x: this.horizontal().scale, y: 1, centerX: this.horizontal().pivot })
    }.width('100%').height('100%')
      .onAreaChange((_oldArea: Area, area: Area): void => {
        this.viewportLeft = Number(area.globalPosition.x);
        this.viewportWidth = Number(area.width);
      })
  }
}
