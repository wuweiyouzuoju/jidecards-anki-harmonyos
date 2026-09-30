// SPDX-License-Identifier: AGPL-3.0-or-later
import { 主题模式, 解析是否深色 } from '../../model/主题设置';

/** 自绘弹窗遮罩统一跟随应用主题并覆盖安全区；关闭决策仍由弹窗所有者提供。 */
@Component
export struct DialogBackdrop {
  @StorageProp('themeMode') private mode: 主题模式 = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;

  build() {
    Column()
      .width('100%').height('100%')
      .backgroundColor(解析是否深色(this.mode, this.systemDark) ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
      .backgroundBlurStyle(BlurStyle.Thin, {
        colorMode: 解析是否深色(this.mode, this.systemDark) ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
        adaptiveColor: AdaptiveColor.DEFAULT
      })
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
