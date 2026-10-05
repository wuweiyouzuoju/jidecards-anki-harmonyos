// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AppInterfaceControl } from '../model/AppInterface';
import { DialogFrame } from './common/DialogFrame';
import { DialogHeader } from './common/DialogHeader';
import { DataActionRow } from './settings/DataActionRow';
import { AnkiCollectionHistoryBackend } from '../backend/CollectionHistoryBackend';
import { CollectionHistorySession, CollectionHistoryState } from '../model/CollectionHistorySession';
import { appInterface } from '../backend/AppInterfaceService';
import { namedResourceText } from '../utils/UiFeedback';
import { 应用尺寸 } from '../utils/应用尺寸';

@Component
export struct CollectionHistoryDialog {
  @Prop @Watch('handleBack') backRequest: number = 0;
  @State private state: CollectionHistoryState = new CollectionHistoryState();
  onClose: () => void = (): void => {};
  onBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  onChanged: () => Promise<void> = async (): Promise<void> => {};
  private session: CollectionHistorySession = new CollectionHistorySession(new AnkiCollectionHistoryBackend(),
    (state: CollectionHistoryState): void => { this.state = state; this.onBusy(state.busy); this.publish(); },
    (): Promise<void> => this.onChanged(), (): void => {
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      AppStorage.setOrCreate<number>('cardContentChangedTick', Date.now());
    });
  aboutToAppear(): void { this.session.load(); }
  aboutToDisappear(): void { this.session.dispose(); appInterface.leave('collection_history'); }
  private handleBack(): void { if (!this.state.busy) this.onClose(); }
  private publish(): void {
    appInterface.observe({ surface: 'collection_history', sectionId: '', selectedId: '', busy: this.state.busy,
      optionIds: [], optionLabels: [], controlsComplete: true,
      items: ['undo', 'redo', 'reload', 'close'].map((id: string): AppInterfaceControl => ({ id: id, title: '',
        titleKey: id === 'close' ? 'browser_detail_cancel' : id === 'reload' ? 'collection_history_reload' : 'collection_history_' + id,
        enabled: !this.state.busy && (id === 'undo' ? !!this.state.status?.undo : id === 'redo' ? !!this.state.status?.redo : true), selected: false })),
      values: [{ id: 'undo_operation', value: this.state.status?.undo ?? '' },
        { id: 'redo_operation', value: this.state.status?.redo ?? '' }, { id: 'has_error', value: String(this.state.error !== '') },
        { id: 'error_kind', value: this.state.error }, { id: 'error_detail', value: this.state.errorDetail }] });
  }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.collection_history_title'), closeLabel: $r('app.string.browser_detail_cancel'),
      showAction: false, closeEnabled: !this.state.busy, onClose: (): void => { this.handleBack(); } })
  }
  @Builder
  private content() {
    if (this.state.busy) {
      Text($r('app.string.common_loading')).fontColor($r('app.color.text_secondary'))
    }
    DataActionRow({ title: $r('app.string.collection_history_undo'),
      hint: this.state.status?.undo || $r('app.string.collection_history_empty'),
      isInteractive: !this.state.busy && !!this.state.status?.undo, onAction: (): void => { this.session.apply(false); } })
    DataActionRow({ title: $r('app.string.collection_history_redo'),
      hint: this.state.status?.redo || $r('app.string.collection_history_empty'),
      isInteractive: !this.state.busy && !!this.state.status?.redo, onAction: (): void => { this.session.apply(true); } })
    if (this.state.error !== '') {
      Text(namedResourceText(this.getUIContext(), this.state.error)).fontColor($r('app.color.text_secondary'))
      if (this.state.errorDetail !== '') {
        Text(this.state.errorDetail).fontColor($r('app.color.text_secondary')).fontSize(应用尺寸.字号_说明)
      }
    }
    DataActionRow({ title: $r('app.string.collection_history_reload'), isInteractive: !this.state.busy,
      onAction: (): void => { this.session.load(); } })
  }
  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.state.busy,
      header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: (): void => { this.handleBack(); } })
  }
}
