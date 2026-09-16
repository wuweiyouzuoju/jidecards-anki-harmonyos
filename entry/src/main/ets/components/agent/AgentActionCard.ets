// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import type { AgentAction } from '../../model/agent/AgentAction';
import type { AgentExtensionArguments } from '../../model/agent/AgentExtensionTools';
import type { AgentMemoryChange } from '../../model/agent/AgentMemory';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';

interface AnalysisPreview { query: string; totalMatched: number; alreadyRead: number; }

/** 用户确认的是可见提案内容，技术参数不进入默认确认界面。 */
@Component
export struct AgentActionCard {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop action: AgentAction;
  @Prop disabled: boolean = false;
  @StorageProp(颜色键.主色按钮背景) private primaryBackground: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  onConfirm: () => void = (): void => {};
  onCancel: () => void = (): void => {};

  private title(): ResourceStr {
    if (this.action.kind === 'create_deck') { return $r('app.string.ai_agent_action_deck'); }
    if (this.action.kind === 'create_notetype') { return $r('app.string.ai_agent_action_notetype'); }
    if (this.action.kind === 'memory_change') { return $r('app.string.ai_agent_action_memory'); }
    return $r('app.string.ai_agent_action_analysis');
  }
  private design(): AgentExtensionArguments { return JSON.parse(this.action.payloadJson) as AgentExtensionArguments; }
  private memory(): AgentMemoryChange { return JSON.parse(this.action.payloadJson) as AgentMemoryChange; }
  private analysis(): AnalysisPreview { return JSON.parse(this.action.payloadJson) as AnalysisPreview; }

  @Builder
  private preview() {
    if (this.action.kind === 'create_deck') {
      Text(this.design().name).fontSize(应用尺寸.字号_正文)
    } else if (this.action.kind === 'create_notetype') {
      Text(this.design().name).fontSize(应用尺寸.字号_正文)
      Text(this.design().fields.join(' · ')).fontColor($r('app.color.text_secondary'))
      Text($r('app.string.ai_agent_preview_front')).fontWeight(FontWeight.Medium)
      Text(this.design().frontFields.map((name: string): string => `‹${name}›`).join('\n'))
        .width('100%').padding(12).backgroundColor($r('app.color.surface_card'))
      Text($r('app.string.ai_agent_preview_back')).fontWeight(FontWeight.Medium)
      Text(this.design().frontFields.concat(this.design().backFields).map(
        (name: string): string => `‹${name}›`).join('\n'))
        .width('100%').padding(12).backgroundColor($r('app.color.surface_card'))
      Text($r('app.string.ai_agent_layout_preview_hint')).fontColor($r('app.color.text_secondary'))
    } else if (this.action.kind === 'memory_change') {
      Text(this.memory().operation === 'delete' ? $r('app.string.ai_agent_memory_delete') :
        (this.memory().operation === 'update' ? $r('app.string.ai_agent_memory_update') : $r('app.string.ai_agent_memory_create')))
      if (this.memory().before !== null) {
        Text($r('app.string.ai_agent_memory_before')).fontWeight(FontWeight.Medium)
        Text(this.memory().before!.text)
      }
      if (this.memory().operation !== 'delete') {
        Text($r('app.string.ai_agent_memory_after')).fontWeight(FontWeight.Medium)
        Text(this.memory().text)
      }
      Text(this.memory().scope === 'global' ? $r('app.string.ai_agent_memory_global') : this.memory().scope)
        .fontColor($r('app.color.text_secondary'))
    } else {
      Text(this.analysis().query.length > 0 ? this.analysis().query : $r('app.string.ai_agent_edit_all_decks'))
      Text($r('app.string.ai_agent_analysis_count', `${this.analysis().totalMatched}`, `${this.analysis().alreadyRead}`))
      Text($r('app.string.ai_agent_analysis_cost')).fontColor($r('app.color.text_secondary'))
    }
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      Text(this.title()).fontWeight(FontWeight.Bold).width('100%')
      this.preview()
      if (this.action.status === 'pending') {
        Row({ space: 12 }) {
          Button() {
            Text() { ThemeTextSpans($r('app.string.ai_agent_action_cancel'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.actionColor)
          }.enabled(!this.disabled).onClick(this.onCancel)
            .height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_按钮)
            .backgroundColor($r('app.color.surface_card')).fontColor(this.actionColor)
            .borderRadius(应用尺寸.圆角_胶囊)
          Button($r('app.string.ai_agent_action_confirm')).enabled(!this.disabled).onClick(this.onConfirm)
            .height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_按钮)
            .backgroundColor(this.primaryBackground).fontColor($r('app.color.action_on_primary'))
            .borderRadius(应用尺寸.圆角_胶囊)
        }
      } else {
        Text(this.action.status === 'completed' ? $r('app.string.ai_agent_action_completed') :
          (this.action.status === 'cancelled' ? $r('app.string.ai_agent_action_cancelled') :
            (this.action.status === 'executing' ? $r('app.string.ai_agent_action_executing') : $r('app.string.ai_agent_action_failed'))))
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start).padding(应用尺寸.卡片内边距)
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_面板)
  }
}
