// SPDX-License-Identifier: AGPL-3.0-or-later
import { HomeDeckCommands } from '../../backend/HomeDeckCommands';
import { 牌组定制面板, 牌组定制结果 } from '../牌组定制面板';
import { 牌组汇总, 空牌组汇总 } from '../../model/主页模型';
import { resourceText, showToastSafely } from '../../utils/UiFeedback';

@Component
export struct DeckCustomizationFeature {
  @Prop isDark: boolean = false;
  @Prop deck: 牌组汇总 = 空牌组汇总;
  onBusy: (busy: boolean) => void = (): void => {};
  onClose: () => void = (): void => {};
  onSaved: () => Promise<void> = async (): Promise<void> => {};
  @State private busy: boolean = false;
  @State private error: string = '';
  private disposed: boolean = false;
  private readonly commands: HomeDeckCommands = new HomeDeckCommands();

  aboutToDisappear(): void { this.disposed = true; }

  private async save(result: 牌组定制结果): Promise<void> {
    if (this.busy || this.disposed) return;
    if (result.新名.trim() === '') {
      this.error = resourceText(this.getUIContext(), $r('app.string.deck_customize_name_empty'));
      return;
    }
    const deck: 牌组汇总 = this.deck;
    this.busy = true;
    this.error = '';
    this.onBusy(true);
    try {
      const saved: boolean = await this.commands.customize(deck.id, deck.name, deck.displayName, result);
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      if (this.disposed) return;
      if (!saved) {
        this.error = resourceText(this.getUIContext(), $r('app.string.deck_customize_background_save_failed'));
        return;
      }
      try { await this.onSaved(); }
      catch (error) {
        if (!this.disposed) showToastSafely(this.getUIContext(), { message: `${error}` });
      }
      if (!this.disposed) this.onClose();
    } catch (error) {
      if (this.disposed) return;
      this.error = error instanceof Error ? error.message : `${error}`;
      if (this.error === '') this.error = resourceText(this.getUIContext(), $r('app.string.deck_customize_rename_failed'));
    } finally {
      if (!this.disposed) { this.busy = false; this.onBusy(false); }
    }
  }

  build() {
    牌组定制面板({ isDark: this.isDark, deck: this.deck, busy: this.busy, errorMessage: this.error,
      onClose: (): void => { if (!this.busy) this.onClose(); },
      onSave: (result: 牌组定制结果): void => { this.save(result); } })
  }
}
