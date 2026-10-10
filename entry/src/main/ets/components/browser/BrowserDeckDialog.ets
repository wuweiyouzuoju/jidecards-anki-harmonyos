// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { DirectoryTree } from '../common/DirectoryTree';
import { DirectoryRow, DirectoryView } from '../../model/DirectoryTree';
import { deckDirectoryRows } from '../../model/DeckDirectory';
import { appInterface } from '../../backend/AppInterfaceService';
import { 应用尺寸 } from '../../utils/应用尺寸';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';

@Component
export struct BrowserDeckDialog {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop 牌组树: DeckTreeNode | null = null;
  onClose: () => void = (): void => {};
  onSubmit: (id: number) => void = (_id: number): void => {};
  private handleBackRequest(): void { if (!this.busy) this.onClose(); }
  private rows(): DirectoryRow[] { return deckDirectoryRows(this.牌组树); }
  private select(id: string): void {
    if (!this.busy && this.rows().some((row: DirectoryRow): boolean => row.id === id)) this.onSubmit(Number(id));
  }
  @Builder
  private dialogHeader() {
    DialogHeader({ title: $r('app.string.browser_action_change_deck'), showAction: false,
      closeLabel: $r('app.string.browser_detail_cancel'), closeEnabled: !this.busy, onClose: this.onClose })
  }
  @Builder
  private dialogContent() {
    DirectoryTree({ rows: this.rows(), isInteractive: !this.busy, selectionMode: 'none',
      onSelect: (id: string): void => { this.select(id); },
      onViewChanged: (view: DirectoryView | null): void => { appInterface.observeDirectory('browser_change_deck', view); } })
  }
  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
