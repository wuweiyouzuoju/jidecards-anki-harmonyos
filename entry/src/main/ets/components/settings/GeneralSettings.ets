// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';
import { 当前语言模式, 语言模式, 设置语言模式 } from '../../model/语言存储';
import { 保存显示今日进度卡, 主页今日进度卡AppStorage键 } from '../../model/主页偏好';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';

/** 常规设置沿用原语言与首页偏好的保存协议。 */
@Component
export struct GeneralSettings {
  @Prop 是否深色: boolean = false;
  @StorageLink(主页今日进度卡AppStorage键) private 显示今日进度卡: boolean = true;
  @StorageProp(颜色键.主色按钮背景) private actionColor: string = '#2F5FD0';
  打开说明回调: (标题: Resource, 正文: Resource) => void = (_标题: Resource, _正文: Resource): void => {};

  private 取本地化文本(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }
  private 切换今日进度卡(开启: boolean): void { 保存显示今日进度卡(开启); }
  private 语言模式标签(模式: 语言模式): Resource {
    if (模式 === 'en') return $r('app.string.language_english');
    return $r('app.string.language_chinese');
  }

  private 选择语言(模式: 语言模式): void {
    // BUG-009 修复：onConfigurationUpdate 触发 UI 重建时，Select 重建会重新触发 onSelect，
    // 导致 选择语言 被循环调用（日志确认近 2 秒内被调用 30+ 次，每 ~60ms 一次）。
    // 去重检查：已是目标语言则直接 return，打断循环。
    const 切换前: 语言模式 = 当前语言模式();
    if (切换前 === 模式) {
      return;
    }
    设置语言模式(模式);
  }

  // ---- 语言 Select 选项 / 索引 ----
  private 语言选项(): SelectOption[] {
    return [
      { value: this.取本地化文本($r('app.string.language_chinese')) },
      { value: this.取本地化文本($r('app.string.language_english')) }
    ];
  }

  private 语言索引(): number {
    return 当前语言模式() === 'en' ? 1 : 0;
  }


  build() {
    设置分组卡片({ 标题: $r('app.string.settings_general_display'), 是否深色: this.是否深色 }) {
      Column({ space: 4 }) {
          // 语言行 Select（zh-Hans/en）
          Row() {
            Text($r('app.string.settings_language'))
              .fontSize(15)
              .fontColor(设置面板色板_取(this.是否深色).主文字)
              .layoutWeight(1)
            Select(this.语言选项())
              .selected(this.语言索引())
              .value(this.取本地化文本(this.语言模式标签(当前语言模式())))
              .attributeModifier(new SelectStyle())
              .font(SelectStyle.controlFont)
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((索引: number): void => {
                const 模式列表: 语言模式[] = ['zh-Hans', 'en'];
                this.选择语言(模式列表[索引]);
              })
          }
          .width('100%')
          .height(48)
          Row() {
            Row() {
              Text($r('app.string.settings_home_today_summary'))
                .fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Button($r('app.string.field_help_button'))
                .type(ButtonType.Normal)
                .backgroundColor(Color.Transparent)
                .fontSize(14)
                .fontColor(设置面板色板_取(this.是否深色).三级文字)
                .width(28)
                .height(28)
                .padding(0)
                .margin({ left: 4 })
                .onClick(() => {
                  this.打开说明回调(
                    $r('app.string.settings_home_today_summary'),
                    $r('app.string.settings_home_today_summary_hint')
                  );
                })
            }
            .layoutWeight(1)

            Toggle({ type: ToggleType.Switch, isOn: this.显示今日进度卡 })
              .selectedColor(this.actionColor)
              .onChange((值: boolean): void => {
                this.切换今日进度卡(值);
              })
          }
          .width('100%')
          .height(48)
      }.width('100%')
    }
  }
}
