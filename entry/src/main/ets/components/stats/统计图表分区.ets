// SPDX-License-Identifier: AGPL-3.0-or-later
import { HelpLabel } from '../common/HelpLabel';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 按下态按钮 } from '../common/按下态按钮';
import { SelectStyle } from '../../utils/SelectStyle';

// 统计图表分区：统计页内每个图表区块的统一外壳（标题 + 内容 + 卡片样式）。
// 用 @BuilderParam 槽位接收内容，visible=false 时不渲染（由偏好面板控制）。
// 可选 i 帮助按钮：传入 帮助标题/帮助正文 时标题右侧显示 i，点击触发 onHelp 回调，
// 由统计页页面级 Stack 统一弹字段帮助面板（确保遮罩全屏 + 浮层居中屏幕）。

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 范围切换条 } from './范围切换条';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl } from '../../model/AppInterface';
import { localizedNamedResourceText, resourceText, namedResourceText } from '../../utils/UiFeedback';

@Component
export struct 统计图表分区 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop 标题: ResourceStr = $r('app.string.stats_no_data');
  @Prop @Watch('publishInterface') interfaceTitleKey: string = '';
  @Prop interfaceId: string = '';
  @Prop @Watch('publishInterface') isInteractive: boolean = true;
  @Prop @Watch('publishInterface') 有数据: boolean = true;
  @Prop 帮助标题: Resource | null = null;
  @Prop 帮助正文: Resource | null = null;
  @Prop @Watch('publishInterface') rangeLabels: Resource[] = [];
  @Prop @Watch('publishInterface') rangeIndex: number = 0;
  @Prop @Watch('publishInterface') actionTitleKey: string = '';
  @Prop @Watch('publishInterface') actionEnabled: boolean = true;
  @Prop @Watch('publishInterface') actionSelected: boolean = false;
  onAction: () => void = (): void => {};
  onRangeChange: (index: number) => void = (): void => {};
  onHelp: (标题: Resource, 正文: Resource) => void = (): void => {};
  @BuilderParam 内容: () => void = this.默认内容;
  private interfaceMounted: boolean = false;
  aboutToAppear(): void { this.interfaceMounted = true; this.publishInterface(); }
  aboutToDisappear(): void { this.interfaceMounted = false; appInterface.leave('stats_' + this.interfaceId); }
  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.interfaceMounted || this.interfaceId === '') return;
    const controls: AppInterfaceControl[] = [];
    if (this.actionTitleKey !== '') controls.push({ id: 'details',
      title: namedResourceText(this.getUIContext(), this.actionTitleKey), titleKey: this.actionTitleKey,
      enabled: this.isInteractive && this.actionEnabled, selected: this.actionSelected });
    if (this.帮助标题 !== null && this.帮助正文 !== null) controls.push({ id: 'help',
      title: namedResourceText(this.getUIContext(), 'field_help_button'), titleKey: 'field_help_button',
      enabled: this.isInteractive, selected: false });
    const labels: string[] = this.rangeLabels.map((label): string => resourceText(this.getUIContext(), label));
    const ids: string[] = labels.map((_label, index): string => 'range-' + index);
    for (let index: number = 0; index < ids.length; index++) {
      const resource: Resource = this.rangeLabels[index];
      const name: string = typeof resource.params?.[0] === 'string' ? resource.params[0] as string : '';
      controls.push({ id: ids[index], title: labels[index], titleKey: name.startsWith('app.string.') ? name.slice(11) : undefined,
        enabled: this.isInteractive, selected: index === this.rangeIndex });
    }
    appInterface.observe({ surface: 'stats_' + this.interfaceId, titleKey: this.interfaceTitleKey,
      sectionId: '', selectedId: this.rangeLabels.length > 0 ? 'range-' + this.rangeIndex : '',
      optionIds: ids, optionLabels: labels, busy: !this.isInteractive, items: controls, controlsComplete: true,
      values: [{ id: 'has_data', value: String(this.有数据) }] });
  }

  @Builder
  private 默认内容(): void {}

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      Row({ space: 应用尺寸.间距_12 }) {
        HelpLabel({ title: this.interfaceTitleKey === '' ? this.标题 : localizedNamedResourceText(this.getUIContext(), this.uiLanguage, this.interfaceTitleKey), textSize: 18, textWeight: FontWeight.Bold,
          showHelp: this.帮助标题 !== null && this.帮助正文 !== null,
          onHelp: (): void => { this.onHelp(this.帮助标题 as Resource, this.帮助正文 as Resource); }
        }).layoutWeight(1)
        if (this.actionTitleKey !== '') {
          按下态按钮({ 文案: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, this.actionTitleKey), singleLine: true,
            是否启用: this.isInteractive && this.actionEnabled,
            点击回调: (): void => { if (this.isInteractive && this.actionEnabled) this.onAction(); } })
            .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
        }
        if (this.rangeLabels.length > 0) {
          范围切换条({
            当前索引: this.rangeIndex,
            标签集: this.rangeLabels,
            onRangeChange: (index: number): void => { this.onRangeChange(index); }
          }).constraintSize({ maxWidth: '48%' })
        }
      }
      .width('100%')

      if (this.有数据) {
        this.内容()
      } else {
        Text($r('app.string.stats_empty_section'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
      }
    }
    .width('100%')
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border(SurfaceBorder.options())
    .borderRadius(应用尺寸.圆角_指标卡)
  }
}
