// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { DirectorySelect } from '../common/DirectorySelect';
import { MemoryScopeChoice, memoryScopeRows } from '../../model/agent/AgentMemoryScopes';
import { DirectoryView } from '../../model/DirectoryTree';
import { appInterface } from '../../backend/AppInterfaceService';
import { FormTextAreaStyle } from '../../utils/FormTextAreaStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { localizedResourceText } from '../../utils/UiFeedback';

export type { MemoryScopeChoice } from '../../model/agent/AgentMemoryScopes';

/** 表单与窗口共用既有外壳；草稿、确认和持久化仍归记忆面板。 */
@CustomDialog
export struct AgentMemoryEditorDialog {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  controller?: CustomDialogController;
  @Prop title: ResourceStr = '';
  @Link options: MemoryScopeChoice[];
  @Link draftText: string;
  @Link draftScope: string;
  @Link busy: boolean;
  @Link errorText: string;
  @Link saveEnabled: boolean;
  onSave: () => void = (): void => {};
  onClose: () => void = (): void => {};

  @Builder
  private headerContent() {
    DialogHeader({ title: this.title, actionLabel: $r('app.string.deck_customize_save'),
      closeLabel: $r('app.string.create_deck_cancel'), actionEnabled: this.saveEnabled && !this.busy,
      closeEnabled: !this.busy, onAction: this.onSave, onClose: this.onClose })
  }

  @Builder
  private formContent() {
    Text($r('app.string.agent_memory_description')).fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_secondary')).width('100%')
    if (this.errorText !== '') {
      Text(this.errorText).fontColor($r('app.color.error_text')).width('100%')
    }
    TextArea({ text: this.draftText,
      placeholder: localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.agent_memory_example')) })
      .attributeModifier(new FormTextAreaStyle()).height(160).maxLength(2000).enabled(!this.busy)
      .onChange((value: string): void => { this.draftText = value; })
    DirectorySelect({ label: $r('app.string.agent_memory_scope'), rows: memoryScopeRows(this.options, this.draftScope),
      value: this.options.find((choice: MemoryScopeChoice): boolean => choice.scope === this.draftScope)?.value ??
        localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.agent_memory_missing_deck')),
      isInteractive: !this.busy,
      onSelect: (scope: string): void => {
        if (!this.busy && this.options.some((choice: MemoryScopeChoice): boolean => choice.scope === scope)) this.draftScope = scope;
      }, onViewChanged: (view: DirectoryView | null): void => { appInterface.observeDirectory('memory_editor_scope', view); } })
    if (this.busy) {
      LoadingProgress().width(应用尺寸.加载指示器尺寸).height(应用尺寸.加载指示器尺寸)
        .color($r('app.color.text_secondary')).alignSelf(ItemAlign.Center)
    }
  }

  build() {
    DialogFrame({ nativeHost: true, canDismiss: !this.busy, onDismiss: this.onClose,
      header: () => { this.headerContent(); }, content: () => { this.formContent(); } })
  }
}
