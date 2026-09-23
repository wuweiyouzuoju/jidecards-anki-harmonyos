// SPDX-License-Identifier: AGPL-3.0-or-later
import { DataTransferSession, DataTransferState, initialTransferState } from '../model/home/DataTransferSession';
import { AnkiDataTransfer } from '../backend/AnkiDataTransfer';

import { initializeRedemption } from '../utils/RedemptionStore';
import { UNLOCKED_CONTENTS_KEY, isThemeAvailable } from '../model/ThemeCatalog';
import { common } from '@kit.AbilityKit';

import { hilog } from '@kit.PerformanceAnalysisKit';
import { 设置面板 } from '../components/设置面板';
import { 许可证面板 } from '../components/许可证面板';
import { DataTransferFeature } from '../components/home/DataTransferFeature';
import type { 数据迁移模式, 导出牌组选项 } from '../model/DataTransferIntent';
import type { SyncAuth } from '../proto/messages/SyncMessages';
import { 牌组服务 } from '../backend/牌组服务';
import { 后端会话 } from '../backend/后端会话';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 加载主题模式, 保存主题模式 } from '../model/主题存储';
import { 颜色主题, 默认颜色主题 } from '../model/颜色主题';
import { 加载颜色主题, 保存颜色主题 } from '../model/颜色主题存储';
import { 应用颜色主题 } from '../utils/颜色主题管理器';
import { 应用主题 } from '../utils/主题控制器';
import { 加载已隐藏牌组ID列表, 取消隐藏全部牌组 } from '../model/隐藏牌组存储';
import { 刷新桌面卡片数据 } from '../model/FSRS控制器';
import { 平铺牌组树 } from '../model/牌组层级';
import { 牌组汇总 } from '../model/主页模型';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import { CustomTransition } from '../utils/自定义转场';

import { 浏览页参数 } from '../model/navigation/PageParams';

@Component
export struct 设置页 {
  @State private transfer: DataTransferState = initialTransferState();
  private disposed: boolean = false;
  private readonly transferSession: DataTransferSession = new DataTransferSession(new AnkiDataTransfer(),
    (state: DataTransferState): void => { this.transfer = state; },
    (): Promise<void> => this.加载牌组列表(),
    (): void => this.显示提示($r('app.string.transfer_done')));
  private 打开数据迁移(mode: 数据迁移模式, deckId: number, allowDeckSelection: boolean): void {
    this.transferSession.open(mode, deckId, allowDeckSelection);
  }
  @State private activeSection: string = '';
  pathStack?: NavPathStack;
  openAiSettings: boolean = false;
  onManualSync: () => void = (): void => {};
  private readonly 牌组服务实例: 牌组服务 = new 牌组服务();

  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;
  @State private 主题模式值: 主题模式 = 'system';
  @StorageLink('colorTheme') private 颜色主题值: 颜色主题 = 默认颜色主题;
  @State private 转场透明度: number = 1;

  // 弹层状态
  @State private 显示许可证: boolean = false;

  // 牌组列表（用于导出选项）
  @State private 牌组列表: 导出牌组选项[] = [];

  async aboutToAppear(): Promise<void> {
    // 先注册再做异步加载，确保首帧入场也能接到统一淡入淡出回调。
    CustomTransition.getInstance().注册NavParam('SettingsPage',
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 1 : 0;
      },
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 0 : 1;
      }
    );
    this.主题模式值 = await 加载主题模式();
    try { await initializeRedemption(); } catch (error) {
      hilog.warn(0x0000, '设置页', 'Redemption initialization unavailable; fingerprint panel can retry');
    }
    this.颜色主题值 = await 加载颜色主题();
    await this.加载牌组列表();
  }

  aboutToDisappear(): void {
    this.disposed = true;
    this.transferSession.dispose();
    CustomTransition.getInstance().注销NavParam('SettingsPage');
  }

  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  private 显示提示(message: Resource): void {
    try {
      this.getUIContext().getPromptAction().showToast({ message: message });
    } catch (error) {
      // 页面销毁或系统提示服务不可用时，不影响主界面的连续操作。
    }
  }

  private 切换主题(mode: 主题模式): void {
    this.主题模式值 = mode;
    this.应用激活主题(mode);
    保存主题模式(mode);
    刷新桌面卡片数据().catch((错误: Object): void => {
      hilog.error(0x0000, '设置页', `切换主题后刷新桌面卡片数据失败: ${错误}`);
    });
  }

  private 应用激活主题(mode: 主题模式): void {
    AppStorage.setOrCreate<主题模式>('themeMode', mode);
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context !== null) {
      应用主题(context, mode, this.系统暗黑模式);
    }
    应用颜色主题(this.颜色主题值, this.是否深色());
  }

  private 切换颜色主题(theme: 颜色主题): void {
    if (!isThemeAvailable(theme, AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [])) return;
    this.颜色主题值 = theme;
    AppStorage.setOrCreate<颜色主题>('colorTheme', theme);
    应用颜色主题(theme, this.是否深色());
    保存颜色主题(theme);
    刷新桌面卡片数据().catch((错误: Object): void => {
      hilog.error(0x0000, '设置页', `切换颜色主题后刷新桌面卡片数据失败: ${错误}`);
    });
  }

  private async 加载牌组列表(): Promise<void> {
    try {
      const context: common.UIAbilityContext | null = this.取能力上下文();
      if (context === null) return;
      await 后端会话.获取实例().确保已打开(context.filesDir);
      const tree: DeckTreeNode = await this.牌组服务实例.获取牌组树();
      const allDecks: 牌组汇总[] = 平铺牌组树(tree);
      if (this.disposed) return;
      this.牌组列表 = allDecks.map((deck: 牌组汇总): 导出牌组选项 => ({
        id: Number(deck.id), name: deck.fullName
      }));
    } catch (error) {
      // 加载失败时牌组列表为空，导出牌组选项不可用
    }
  }


  private async 显示隐藏牌组对话框(): Promise<void> {
    try {
      const hiddenIds: string[] = await 加载已隐藏牌组ID列表();
      if (hiddenIds.length === 0) {
        this.getUIContext().getPromptAction().showToast({
          message: this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.hidden_decks_empty').id)
        });
        return;
      }
      const title: string = this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.hidden_decks_title').id);
      const message: string = `${hiddenIds.length}`;
      this.getUIContext().showAlertDialog({
        title: title,
        message: message,
        autoCancel: false,
        alignment: DialogAlignment.Center,
        primaryButton: {
          value: $r('app.string.cancel'),
          action: (): void => {}
        },
        secondaryButton: {
          value: $r('app.string.hidden_decks_unhide'),
          fontColor: $r('app.color.action_primary'),
          action: (): void => {
            this.确认全部取消隐藏();
          }
        }
      });
    } catch (error) {
      // 加载失败静默降级
    }
  }

  private async 确认全部取消隐藏(): Promise<void> {
    try {
      await 取消隐藏全部牌组();
      // 通知首页刷新数据
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
    } catch (error) {
      // 恢复失败静默降级
    }
  }

  private 打开带搜索浏览页(搜索串: string): void {
    const params: 浏览页参数 = { initialSearch: 搜索串 };
    this.pathStack?.pushPath({
      name: 'BrowserPage',
      param: params
    });
  }

  private 返回(): void {
    if (this.pathStack !== undefined && this.pathStack.size() > 0) {
      this.pathStack.pop();
    }
  }

  build() {
    NavDestination() {
      Stack() {
        设置面板({
          activeSection: this.activeSection,
          openAiSettings: this.openAiSettings,
          当前主题模式: this.主题模式值,
          是否深色: this.是否深色(),
          当前颜色主题: this.颜色主题值,
          主题模式切换回调: (mode: 主题模式): void => {
            this.切换主题(mode);
          },
          颜色主题切换回调: (theme: 颜色主题): void => {
            this.切换颜色主题(theme);
          },
          打开许可证回调: (): void => {
            this.显示许可证 = true;
          },
          导入数据回调: (): void => {
            this.打开数据迁移('importDeck', 0, true);
          },
          导出数据回调: (): void => {
            this.打开数据迁移('exportDeck', 0, true);
          },
          点击已隐藏牌组回调: (): void => {
            this.显示隐藏牌组对话框();
          },
          跳转浏览页回调: (initialSearch: string): void => {
            this.打开带搜索浏览页(initialSearch);
          },
          先备份后同步回调: (): void => {
            this.打开数据迁移('exportPersonalData', 0, false);
          },
          打开同步弹窗回调: (auth: SyncAuth, accountName: string): void => {
            this.onManualSync();
          },
          关闭回调: (): void => {
            this.返回();
          }
        })

        if (this.显示许可证) {
          许可证面板({
            isDark: this.是否深色(),
            onClose: (): void => {
              this.显示许可证 = false;
            }
          })
        }

        DataTransferFeature({ state: this.transfer, session: this.transferSession,
          deckOptions: this.牌组列表, isDark: this.是否深色() })
      }
      .width('100%')
      .height('100%')
      .alignContent(Alignment.Center)
    }
    .hideTitleBar(true)
    .backgroundColor(Color.Transparent)
    .onBackPressed((): boolean => {
      if (this.transfer.phase !== 'idle') return true;
      if (this.transfer.visible) { this.transferSession.close(); return true; }
      if (this.activeSection !== '') { this.activeSection = ''; return true; }
      return false;
    })
    .opacity(this.转场透明度)
  }
}
