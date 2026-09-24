// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { HomeDeckCommands } from '../../backend/HomeDeckCommands';
import { 创建牌组面板 } from '../创建牌组面板';
import type { 牌组汇总 } from '../../model/主页模型';
import { resourceText, showToastSafely } from '../../utils/UiFeedback';

@Component
export struct CreateDeckFeature {
  @Prop isDark: boolean = false;
  @Prop parentId: string = '';
  @Prop decks: 牌组汇总[] = [];
  onBusy: (busy: boolean) => void = (): void => {};
  onClose: () => void = (): void => {};
  onCreated: (id: string, name: string) => Promise<void> = async (): Promise<void> => {};
  @State private busy: boolean = false;
  @State private error: string = '';
  private disposed: boolean = false;
  private readonly commands: HomeDeckCommands = new HomeDeckCommands();

  aboutToDisappear(): void { this.disposed = true; }

  private async create(name: string): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true;
    this.error = '';
    this.onBusy(true);
    try {
      const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
      if (context === undefined) throw new Error(resourceText(this.getUIContext(), $r('app.string.ability_context_unavailable')));
      const id: number = await this.commands.create(context.filesDir, name);
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      if (this.disposed) return;
      // 已创建成功，后续首页刷新失败不能把表单恢复成可再次提交。
      try { await this.onCreated(String(id), name); }
      catch (error) {
        if (!this.disposed) showToastSafely(this.getUIContext(), { message: `${error}` });
      }
      if (!this.disposed) this.onClose();
    } catch (error) {
      if (!this.disposed) this.error = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (!this.disposed) { this.busy = false; this.onBusy(false); }
    }
  }

  build() {
    创建牌组面板({ isDark: this.isDark, busy: this.busy, errorMessage: this.error,
      parentOptions: this.decks, initialParentId: this.parentId,
      onCancel: (): void => { if (!this.busy) this.onClose(); },
      onConfirm: (name: string): void => { this.create(name); } })
  }
}
