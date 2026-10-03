// SPDX-License-Identifier: AGPL-3.0-or-later
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { 按下态按钮 } from '../common/按下态按钮';

import type { AgentAction } from '../../model/agent/AgentAction';
import type { AgentExtensionArguments } from '../../model/agent/AgentExtensionTools';
import type { AgentMemoryChange } from '../../model/agent/AgentMemory';
import type { AgentSettingChange } from '../../model/agent/AgentSettingsTools';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { AgentStylePreview } from './AgentStylePreview';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';

interface AnalysisPreview { query: string; totalMatched: number; alreadyRead: number; }

/** 用户确认的是可见提案内容，技术参数不进入默认确认界面。 */
@Component
export struct AgentActionCard {
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
    if (this.action.kind === 'setting_change') { return $r('app.string.ai_agent_action_setting'); }
    return $r('app.string.ai_agent_action_analysis');
  }
  private design(): AgentExtensionArguments { return JSON.parse(this.action.payloadJson) as AgentExtensionArguments; }
  private memory(): AgentMemoryChange { return JSON.parse(this.action.payloadJson) as AgentMemoryChange; }
  private analysis(): AnalysisPreview { return JSON.parse(this.action.payloadJson) as AnalysisPreview; }
  private setting(): AgentSettingChange { return JSON.parse(this.action.payloadJson) as AgentSettingChange; }
  private settingLabel(): Resource {
    const id: string = this.setting().settingId;
    if (id === 'color_theme') { return $r('app.string.appearance_color_theme'); }
    if (id === 'card_text_size') { return $r('app.string.card_text_size'); }
    if (id === 'deck_list_narrow') { return $r('app.string.deck_width'); }
    if (id === 'study_haptics') { return $r('app.string.settings_study_haptics'); }
    return $r('app.string.settings_fsrs_label');
  }
  private settingScope(): Resource {
    const change: AgentSettingChange = this.setting();
    if (change.settingId === 'color_theme') { return $r('app.string.ai_agent_setting_color_scope'); }
    if (change.settingId === 'fsrs_enabled') {
      return change.after === 'true' && change.before !== change.after ?
        $r('app.string.ai_agent_setting_fsrs_enable_scope') : $r('app.string.ai_agent_setting_fsrs_scope');
    }
    return $r('app.string.ai_agent_setting_device_scope');
  }
  private settingValue(value: string): string {
    if (this.setting().settingId === 'card_text_size') { return `${value}%`; }
    if (this.setting().settingId === 'deck_list_narrow') {
      return resourceText(this.getUIContext(), value === 'true' ? $r('app.string.deck_width_narrow') : $r('app.string.deck_width_wide'));
    }
    return this.setting().settingId === 'color_theme' ? namedResourceText(this.getUIContext(), 'theme_color_' + value) :
      resourceText(this.getUIContext(), value === 'true' ? $r('app.string.ai_agent_setting_on') : $r('app.string.ai_agent_setting_off'));
  }

  private layoutText(back: boolean): string {
    const design: AgentExtensionArguments = this.design();
    const front: string = design.kind === 'cloze' ? resourceText(this.getUIContext(),
      back ? $r('app.string.ai_agent_cloze_back_sample') : $r('app.string.ai_agent_cloze_front_sample'),
      design.frontFields[0]) : design.frontFields.map((name: string): string => `‹${name}›`).join('\n');
    return back ? `${front}\n\n${design.backFields.map((name: string): string => `${name}\n‹${name}›`).join('\n\n')}` : front;
  }

  private resolve(confirm: boolean): void {
    if (this.disabled || this.action.status !== 'pending') return;
    if (confirm) this.onConfirm();
    else this.onCancel();
  }

  @Builder
  private preview() {
    if (this.action.kind === 'create_deck') {
      Text(this.design().name).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
    } else if (this.action.kind === 'create_notetype') {
      Text(this.design().name).fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.text_primary')).width('100%')
      Text(this.design().kind === 'cloze' ? $r('app.string.note_type_cloze') : $r('app.string.note_type_basic'))
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      Text($r('app.string.ai_agent_design_fields')).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('100%')
      ForEach(this.design().fields, (name: string, index: number) => {
        Text(`${index + 1}. ${name}`).fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary')).width('100%')
      }, (name: string, index: number): string => `${index}-${name}`)
      Text($r('app.string.ai_agent_preview_front')).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('100%')
      AgentStylePreview({ style: this.design().style ?? {}, sampleText: this.layoutText(false), showHint: false })
      Text($r('app.string.ai_agent_preview_back')).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('100%')
      AgentStylePreview({ style: this.design().style ?? {}, sampleText: this.layoutText(true), showHint: false })
      Text($r('app.string.ai_agent_layout_preview_hint')).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
    } else if (this.action.kind === 'memory_change') {
      Text(this.memory().operation === 'delete' ? $r('app.string.ai_agent_memory_delete') :
        (this.memory().operation === 'update' ? $r('app.string.ai_agent_memory_update') : $r('app.string.ai_agent_memory_create')))
        .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      if (this.memory().before !== null) {
        Text($r('app.string.ai_agent_memory_before')).fontWeight(FontWeight.Medium)
          .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
        Text(this.memory().before!.text)
          .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      }
      if (this.memory().operation !== 'delete') {
        Text($r('app.string.ai_agent_memory_after')).fontWeight(FontWeight.Medium)
          .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
        Text(this.memory().text)
          .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      }
      Text(this.memory().scope === 'global' ? $r('app.string.ai_agent_memory_global') : this.memory().scope)
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
    } else if (this.action.kind === 'setting_change') {
      Text(this.settingLabel())
        .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      Text($r('app.string.ai_agent_setting_before_after', this.settingValue(this.setting().before), this.settingValue(this.setting().after)))
        .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      Text(this.settingScope())
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
    } else {
      Text(this.analysis().query.length > 0 ? this.analysis().query : $r('app.string.ai_agent_edit_all_decks'))
        .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      Text($r('app.string.ai_agent_analysis_count', `${this.analysis().totalMatched}`, `${this.analysis().alreadyRead}`))
        .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      Text($r('app.string.ai_agent_analysis_cost')).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
    }
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      Text(this.title()).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.text_primary')).width('100%')
      this.preview()
      if (this.action.status === 'pending') {
        Column({ space: 应用尺寸.间距_8 }) {
          PrimaryActionButton({ label: $r('app.string.ai_agent_action_confirm'), isInteractive: !this.disabled,
            tint: this.primaryBackground, onAction: (): void => { this.resolve(true); } })
          按下态按钮({ 文案: $r('app.string.ai_agent_action_cancel'), 是否启用: !this.disabled,
            字色: this.actionColor, fillWidth: true, 点击回调: (): void => { this.resolve(false); } })
        }.width('100%').margin({ top: 应用尺寸.间距_8 })
      } else {
        if (this.action.kind === 'setting_change' && this.action.resultJson.includes('"status":"partial"')) {
          Text(this.action.resultJson.includes('"saved":true') ? $r('app.string.ai_agent_setting_apply_failed') :
            $r('app.string.ai_agent_setting_save_unverified')).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary')).width('100%')
        }
        Text(this.action.status === 'completed' ? $r('app.string.ai_agent_action_completed') :
          (this.action.status === 'cancelled' ? $r('app.string.ai_agent_action_cancelled') :
            (this.action.status === 'executing' ? $r('app.string.ai_agent_action_executing') : $r('app.string.ai_agent_action_failed'))))
          .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary')).width('100%')
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start).padding(应用尺寸.卡片内边距)
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_面板)
    .backgroundColor($r('app.color.surface_card'))
  }
}
