// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { 颜色键 } from '../../model/颜色主题';

/** 编辑表单分组只拥有卡片表面和内边距，业务与弹窗仍由原宿主负责。 */
@Component
export struct EditorSectionCard {
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @BuilderParam content: () => void = this.emptyContent;
  @Builder
  private emptyContent(): void {}

  build() {
    Column({ space: 应用尺寸.间距_8 }) { this.content() }
      .width('100%').padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card')).border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_卡片)
      .attributeModifier(SeriesVisual.surfaceFor(this.material, SeriesVisual.isDark(this.mode, this.systemDark), this.actionColor))
  }
}
