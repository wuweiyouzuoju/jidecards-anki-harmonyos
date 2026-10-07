// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './common/DialogFrame';
import { DialogHeader } from './common/DialogHeader';
import { PrimaryActionButton } from './common/PrimaryActionButton';
import { appInterface } from '../backend/AppInterfaceService';
import { 应用尺寸 } from '../utils/应用尺寸';

/** Script failure is explicit; continuing opts into standard Core scheduling for this session. */
@Component
export struct CustomSchedulingWarning {
  @Prop script: string = '';
  @Prop error: string = '';
  onExit: () => void = (): void => {};
  onContinue: () => void = (): void => {};
  aboutToAppear(): void {
    appInterface.observe({ surface: 'custom_scheduling_warning', sectionId: '', selectedId: '', busy: false,
      optionIds: ['exit', 'continue'], optionLabels: [], controlsComplete: true,
      items: [{ id: 'exit', title: '', titleKey: 'custom_scheduling_exit', iconKey: 'ic_common_close', enabled: true, selected: false },
        { id: 'continue', title: '', titleKey: 'custom_scheduling_continue', enabled: true, selected: false }],
      values: [{ id: 'supported', value: 'true' }, { id: 'execution_failed', value: 'true' },
        { id: 'error', value: this.error }, { id: 'acknowledged', value: 'false' }] });
  }
  aboutToDisappear(): void { appInterface.leave('custom_scheduling_warning'); }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.custom_scheduling_title'), closeLabel: $r('app.string.custom_scheduling_exit'),
      onClose: this.onExit, showAction: false })
  }
  @Builder
  private content() {
    Text($r('app.string.custom_scheduling_hint')).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
    Text(this.error).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
    Text($r('app.string.custom_scheduling_script')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
    Scroll() {
      Text(this.script).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
    }.height(160).width('100%')
    PrimaryActionButton({ label: $r('app.string.custom_scheduling_continue'), onAction: this.onContinue })
  }
  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: false,
      header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: this.onExit })
  }
}
