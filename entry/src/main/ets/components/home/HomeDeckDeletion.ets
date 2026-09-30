// SPDX-License-Identifier: AGPL-3.0-or-later
import { 牌组服务 } from '../../backend/牌组服务';
import { 媒体服务 } from '../../backend/媒体服务';
import { DeckMediaCleanup } from '../../model/DeckMediaCleanup';
import { syncActivity } from '../../model/SyncSettings';
import { 牌组汇总, 牌组显示名 } from '../../model/主页模型';
import { resourceText, showToastSafely } from '../../utils/UiFeedback';

export interface HomeDeckDeletionHost {
  getUIContext: () => UIContext;
  findDeck: (deckId: string) => 牌组汇总;
  deferForSync: (action: () => void) => boolean;
  isVisible: () => boolean;
  onDialogChanged: (open: boolean) => void;
  onStateChanged: (busy: boolean, status: Resource) => void;
  onDeleted: (deckId: string) => Promise<boolean>;
  onSettled: () => void;
}

/** 持有删除确认、已接受的写入及可选媒体清理；宿主负责选择、刷新与跨功能占用。
 * 普通牌组删除卡片，筛选牌组归还卡片；媒体清理单独确认，等待期间仍占用删除忙碌状态。
 */
export class HomeDeckDeletion {
  private host: HomeDeckDeletionHost;
  private busy: boolean = false;
  private status: Resource = $r('app.string.deck_media_checking');
  private readonly 牌组服务实例: 牌组服务 = new 牌组服务();
  private readonly deckMediaCleanup: DeckMediaCleanup = new DeckMediaCleanup({
    isSyncing: async (): Promise<boolean> => syncActivity.isActive(),
    unused: async (): Promise<string[]> => await new 媒体服务().unusedFiles(),
    trash: async (files: string[]): Promise<void> => { await new 媒体服务().媒体文件进回收站(files); }
  });

  constructor(host: HomeDeckDeletionHost) {
    this.host = host;
  }

  private setStatus(status: Resource): void {
    this.status = status;
    this.host.onStateChanged(this.busy, status);
  }

  private showMessage(message: Resource): void {
    try { showToastSafely(this.host.getUIContext(), { message: message }); } catch {
      // 展示宿主可能已消失，已接受的写入仍需完成。
    }
  }

  request(deckId: string): void {
    if (this.busy) return;
    if (this.host.deferForSync((): void => { this.request(deckId); })) return;
    const deck: 牌组汇总 = this.host.findDeck(deckId);
    if (deck.id === '') {
      return;
    }
    const displayName: string = 牌组显示名(deck);
    const title: string = resourceText(this.host.getUIContext(),
      $r('app.string.deck_delete_confirm_title')).replace('%s', displayName);
    const message: string = resourceText(this.host.getUIContext(),
      $r('app.string.deck_delete_confirm_message'));
    this.host.onDialogChanged(true);
    this.host.getUIContext().showAlertDialog({
      title: title,
      message: message,
      autoCancel: false,
      cancel: (): void => { this.host.onDialogChanged(false); },
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: $r('app.string.cancel'),
        action: (): void => { this.host.onDialogChanged(false); }
      },
      secondaryButton: {
        value: $r('app.string.deck_menu_delete'),
        fontColor: $r('app.color.error_text'),
        action: (): void => {
          this.host.onDialogChanged(false);
          this.execute(deckId);
        }
      }
    });
  }

  async execute(deckId: string): Promise<void> {
    if (this.busy || this.host.deferForSync((): void => { this.execute(deckId); })) return;
    this.busy = true;
    try {
      this.setStatus($r('app.string.deck_media_checking'));
      let before: string[] | null = null;
      try { before = await this.deckMediaCleanup.snapshot(); } catch {
        // 不可靠的基线不能用于清理；牌组删除本身仍按已确认的意图进行。
      }
      this.setStatus($r('app.string.deck_deleting'));
      let count: number;
      try {
        count = await this.牌组服务实例.删除牌组([Number(deckId)]);
      } catch (error) {
        const reason: string = error instanceof Error ? error.message : `${error}`;
        const failMsg: string = resourceText(this.host.getUIContext(),
          $r('app.string.deck_delete_failed')).replace('%s', reason);
        showToastSafely(this.host.getUIContext(), { message: failMsg });
        return;
      }
      const selectionSaved: boolean = await this.host.onDeleted(deckId);
      let successMsg: string = resourceText(this.host.getUIContext(),
        $r('app.string.deck_delete_success')).replace('%d', count.toString());
      if (!selectionSaved) successMsg += '\n' + resourceText(this.host.getUIContext(),
        $r('app.string.home_selection_save_failed'));
      showToastSafely(this.host.getUIContext(), { message: successMsg });
      await this.offerDeletedDeckMediaCleanup(before);
    } finally {
      this.busy = false;
      this.host.onStateChanged(false, this.status);
      this.host.onSettled();
    }
  }

  private async offerDeletedDeckMediaCleanup(before: string[] | null): Promise<void> {
    if (!this.host.isVisible()) return;
    if (before === null) {
      this.showMessage($r('app.string.deck_media_check_failed'));
      return;
    }
    try {
      this.setStatus($r('app.string.deck_media_checking'));
      const candidates: string[] = await this.deckMediaCleanup.candidates(before);
      if (!this.host.isVisible()) return;
      if (candidates.length === 0) {
        this.showMessage($r('app.string.deck_media_none'));
        return;
      }
      this.setStatus($r('app.string.deck_media_waiting'));
      const confirmed: boolean = await this.confirmDeletedDeckMedia(candidates.length);
      if (!confirmed || !this.host.isVisible()) return;
      this.setStatus($r('app.string.deck_media_checking'));
      const removed: number = await this.deckMediaCleanup.cleanup(candidates);
      const message: string = resourceText(this.host.getUIContext(),
        $r('app.string.deck_media_cleaned')).replace('%d', removed.toString());
      showToastSafely(this.host.getUIContext(), { message: message });
    } catch {
      this.showMessage($r('app.string.deck_media_cleanup_failed'));
    }
  }

  private confirmDeletedDeckMedia(count: number): Promise<boolean> {
    const message: string = resourceText(this.host.getUIContext(),
      $r('app.string.deck_media_confirm_message')).replace('%d', count.toString());
    return new Promise<boolean>((resolve): void => {
      this.host.getUIContext().showAlertDialog({
        title: $r('app.string.deck_media_confirm_title'),
        message: message,
        autoCancel: false,
        alignment: DialogAlignment.Center,
        cancel: (): void => { resolve(false); },
        primaryButton: {
          value: $r('app.string.deck_media_keep'),
          action: (): void => { resolve(false); }
        },
        secondaryButton: {
          value: $r('app.string.deck_media_remove'),
          fontColor: $r('app.color.error_text'),
          action: (): void => { resolve(true); }
        }
      });
    });
  }
}
