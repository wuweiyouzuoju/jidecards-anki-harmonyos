// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText, showToastSafely } from '../../utils/UiFeedback';
import { common } from '@kit.AbilityKit';
import { promptAction } from '@kit.ArkUI';
import { pasteboard } from '@kit.BasicServicesKit';
import { 云端牌组服务, 云端牌组服务错误 } from '../../backend/云端牌组服务';
import { 后端会话 } from '../../backend/后端会话';
import { 执行牌组导入 } from '../../backend/数据迁移服务';
import { CloudDeckImportController, CloudDeckImportBackend, CloudDeckImportProgress } from '../../model/CloudDeckImportController';
import { 云端牌组目录, 云端牌组目录项 } from '../../model/云端牌组模型';
import { 标记已完成云端牌组引导, 标记已用尽云端牌组下载配额 } from '../../model/云端牌组引导存储';
import { 云端牌组弹窗 } from '../云端牌组弹窗';
import { 颜色键 } from '../../model/颜色主题';
const 云端牌组最多选择数量: number = 3;

@Component
export struct CloudDeckFeature {
  @Prop isDark: boolean = false;
  云端牌组从菜单打开: boolean = false;
  @Prop @Watch('backChanged') backRequest: number = 0;
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  onClose: (welcome: boolean) => void = (_welcome: boolean): void => {};
  onBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  onQuota: (exhausted: boolean) => void = (_exhausted: boolean): void => {};
  onImported: () => Promise<void> = async (): Promise<void> => {};
  private readonly 云端牌组服务实例: 云端牌组服务 = new 云端牌组服务();
  private readonly cloudImportController: CloudDeckImportController = new CloudDeckImportController();
  private cloudCatalogVersion: number = 0;
  private disposed: boolean = false;
  @State private 云端牌组加载中: boolean = false;
  @State @Watch('busyChanged') private 云端牌组忙碌: boolean = false;
  @State private 云端牌组错误: string = '';
  @State private 云端牌组列表: 云端牌组目录项[] = [];
  @State private 云端牌组选中ID列表: string[] = [];
  @State private 云端牌组成功ID列表: string[] = [];
  @State private 云端牌组失败ID列表: string[] = [];
  @State private 云端牌组当前名称: string = '';
  @State private 云端牌组当前阶段: string = '';
  @State private 云端牌组进度: number = 0;
  @State private 云端牌组已处理数: number = 0;
  @State private 云端牌组任务数: number = 0;

  aboutToAppear(): void { this.加载云端牌组目录(); }
  aboutToDisappear(): void { this.disposed = true; this.cloudCatalogVersion++; }
  private busyChanged(): void { if (!this.disposed) this.onBusy(this.云端牌组忙碌); }
  private backChanged(): void { this.云端牌组弹窗按主按钮出口(); }
  private 取能力上下文(): common.UIAbilityContext | null {
    return AppStorage.get<common.UIAbilityContext>('abilityContext') ?? null;
  }
  private 显示提示(message: Resource): void { if (!this.disposed) showToastSafely(this.getUIContext(), { message: resourceText(this.getUIContext(), message) }); }
  private 取本地化文本(resource: Resource): string { return resourceText(this.getUIContext(), resource); }
  private 云端牌组错误文案(error: Error): string {
    let resource: Resource = $r('app.string.cloud_deck_load_failed');
    if (error instanceof 云端牌组服务错误) {
      if (error.code === 'not_configured') {
        resource = $r('app.string.cloud_deck_not_configured');
      } else if (error.code === 'catalog' || error.code === 'invalid_url') {
        resource = $r('app.string.cloud_deck_invalid_catalog');
      }
    }
    return resourceText(this.getUIContext(), resource);
  }

  private async 加载云端牌组目录(): Promise<void> {
    const version: number = ++this.cloudCatalogVersion;
    this.云端牌组加载中 = true;
    this.云端牌组错误 = '';
    try {
      const context: common.UIAbilityContext | null = this.取能力上下文();
      if (context !== null) {
        this.云端牌组服务实例.清理残留下载(context.filesDir);
      }
      const catalog: 云端牌组目录 = await this.云端牌组服务实例.加载目录();
      if (this.disposed || version !== this.cloudCatalogVersion) return;
      this.云端牌组列表 = catalog.decks;
    } catch (error) {
      if (this.disposed || version !== this.cloudCatalogVersion) return;
      const normalized: Error = error instanceof Error ? error : new Error(`${error}`);
      this.云端牌组列表 = [];
      this.云端牌组错误 = this.云端牌组错误文案(normalized);
    } finally {
      if (!this.disposed && version === this.cloudCatalogVersion) this.云端牌组加载中 = false;
    }
  }

  private async 完成云端牌组首次引导(): Promise<void> {
    if (this.云端牌组忙碌) return;
    if (this.云端牌组成功ID列表.length === 0) return;
    const 已保存: boolean = await 标记已完成云端牌组引导();
    if (this.disposed) return;
    if (!已保存) {
      this.显示提示($r('app.string.cloud_deck_save_failed'));
      return;
    }
    this.onClose(!this.云端牌组从菜单打开);

  }

  private 云端牌组弹窗按主按钮出口(): void {
    if (this.云端牌组忙碌) {
      return;
    }
    if (!this.云端牌组从菜单打开 && this.云端牌组成功ID列表.length > 0) {
      this.完成云端牌组首次引导();
      return;
    }
    this.跳过云端牌组引导();
  }

  private async 跳过云端牌组引导(): Promise<void> {
    if (this.disposed || this.云端牌组忙碌) return;
    if (this.云端牌组从菜单打开) {
      this.onClose(!this.云端牌组从菜单打开);

      return;
    }
    try {
      const result: promptAction.ShowDialogSuccessResponse =
        await this.getUIContext().getPromptAction().showDialog({
          title: this.取本地化文本($r('app.string.cloud_deck_skip_confirm_title')),
          message: this.取本地化文本($r('app.string.cloud_deck_skip_confirm_message')),
          buttons: [
            { text: this.取本地化文本($r('app.string.cancel')), color: '#666666' },
            { text: this.取本地化文本($r('app.string.cloud_deck_enter')), color: this.动作主色 }
          ]
        });
      if (this.disposed || result.index !== 1) {
        return;
      }
    } catch (error) {
      // 弹窗失败不阻断：留在原弹窗上，用户可以重新点「稍后再说」。
      return;
    }
    const 已保存: boolean = await 标记已完成云端牌组引导();
    if (this.disposed) return;
    if (!已保存) {
      this.显示提示($r('app.string.cloud_deck_save_failed'));
      return;
    }
    this.onClose(true);
  }

  private async 复制云端牌组QQ群号(): Promise<void> {
    const groupNumber: string = '726837065';
    try {
      const data: pasteboard.PasteData =
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, groupNumber);
      await pasteboard.getSystemPasteboard().setData(data);
      this.显示提示($r('app.string.about_qq_group_copied'));
    } catch (error) {
      this.显示提示($r('app.string.cloud_deck_qq_copy_failed', groupNumber));
    }
  }

  private 切换云端牌组选择(deckId: string): void {
    if (this.云端牌组忙碌 || this.云端牌组成功ID列表.indexOf(deckId) >= 0) return;
    const index: number = this.云端牌组选中ID列表.indexOf(deckId);
    if (index >= 0) {
      this.云端牌组选中ID列表 = this.云端牌组选中ID列表.filter(
        (id: string): boolean => id !== deckId);
      return;
    }
    if (this.云端牌组选中ID列表.length >= 云端牌组最多选择数量) {
      this.显示提示($r('app.string.cloud_deck_selection_limit', 云端牌组最多选择数量));
      return;
    }
    this.云端牌组选中ID列表 = this.云端牌组选中ID列表.concat([deckId]);
  }

  private async 下载选中云端牌组(): Promise<void> {
    if (this.云端牌组忙碌 || this.云端牌组选中ID列表.length === 0) return;
    if (this.云端牌组选中ID列表.length > 云端牌组最多选择数量) {
      this.显示提示($r('app.string.cloud_deck_selection_limit', 云端牌组最多选择数量));
      return;
    }
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) return;

    const selectedDecks: 云端牌组目录项[] = [];
    for (const deck of this.云端牌组列表) {
      if (deck.accessType === 'public' && this.云端牌组选中ID列表.indexOf(deck.id) >= 0) {
        selectedDecks.push(deck);
      }
    }
    if (selectedDecks.length === 0) return;

    this.云端牌组忙碌 = true;
    const backend: CloudDeckImportBackend = {
      prepare: (): Promise<void> => 后端会话.获取实例().确保已打开(context.filesDir),
      download: (deck: 云端牌组目录项, progress: (processed: number, total: number) => void): Promise<string> =>
        this.云端牌组服务实例.下载牌组(context, context.filesDir, deck, progress),
      importDeck: async (path: string): Promise<void> => { await 执行牌组导入(path); }
    };
    const result: CloudDeckImportProgress = await this.cloudImportController.run(
      selectedDecks, this.云端牌组成功ID列表, backend, (state: CloudDeckImportProgress): void => {
        if (this.disposed) return;
        this.云端牌组当前名称 = state.name;
        this.云端牌组当前阶段 = state.stage;
        this.云端牌组进度 = state.percent;
        this.云端牌组已处理数 = state.processed;
        this.云端牌组任务数 = state.total;
        this.云端牌组成功ID列表 = state.successIds;
        this.云端牌组失败ID列表 = state.failedIds;
      });
    const successIds: string[] = result.successIds;
    const failedIds: string[] = result.failedIds;
    try {
      if (successIds.length > 0) AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      if (successIds.length > 0 && !this.disposed) {
        await this.onImported();
      }
    } catch (error) {
      if (!this.disposed) this.云端牌组错误 = error instanceof Error ? error.message : String(error);
    } finally {
      if (!this.disposed) {
        this.云端牌组当前阶段 = '';
        this.云端牌组选中ID列表 = failedIds.concat([]);
      }
      this.云端牌组服务实例.清理残留下载(context.filesDir);
      // 只要有 ≥1 个牌组导入成功就锁死配额：否则「留一个失败」就能阻止弹窗收尾，
      // 用户可反复分批下载，把整个目录搬空。锁死只影响下次入口，当前弹窗仍可重试失败项。
      let 配额已锁定: boolean = true;
      if (successIds.length > 0) {
        配额已锁定 = await 标记已用尽云端牌组下载配额();
        if (!this.disposed) this.onQuota(配额已锁定);
      }
      if (this.disposed) return;
      this.云端牌组忙碌 = false;
      if (!配额已锁定) {
        this.显示提示($r('app.string.cloud_deck_save_failed'));
      } else {
        this.显示提示(failedIds.length > 0 ?
          $r('app.string.cloud_deck_install_partial') : $r('app.string.cloud_deck_install_complete'));
        if (failedIds.length === 0 && successIds.length > 0) {
          await this.完成云端牌组首次引导();
        }
      }
    }
  }
  build() {
    云端牌组弹窗({
      isDark: this.isDark,
      从菜单打开: this.云端牌组从菜单打开,
      loading: this.云端牌组加载中,
      busy: this.云端牌组忙碌,
      errorMessage: this.云端牌组错误,
      decks: this.云端牌组列表,
      selectedIds: this.云端牌组选中ID列表,
      successIds: this.云端牌组成功ID列表,
      failedIds: this.云端牌组失败ID列表,
      currentDeckName: this.云端牌组当前名称,
      currentStage: this.云端牌组当前阶段,
      progressPercent: this.云端牌组进度,
      completedCount: this.云端牌组已处理数,
      taskCount: this.云端牌组任务数,
      onToggle: (deckId: string): void => {
        this.切换云端牌组选择(deckId);
      },
      onRetry: (): void => {
        this.加载云端牌组目录();
      },
      onDownload: (): void => {
        this.下载选中云端牌组();
      },
      onEnter: (): void => {
        this.完成云端牌组首次引导();
      },
      onSkip: (): void => {
        this.跳过云端牌组引导();
      },
      onCopyQQGroup: (): void => {
        this.复制云端牌组QQ群号();
      }
    })
  }
}
