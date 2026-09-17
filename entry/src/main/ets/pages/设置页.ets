// SPDX-License-Identifier: AGPL-3.0-or-later

import { initializeRedemption } from '../utils/RedemptionStore';
import { UNLOCKED_CONTENTS_KEY, isThemeAvailable } from '../model/ThemeCatalog';
import { common } from '@kit.AbilityKit';
import { promptAction } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 设置面板 } from '../components/设置面板';
import { 许可证面板 } from '../components/许可证面板';
import { 同步面板 } from '../components/同步面板';
import { 数据迁移协调器 } from '../components/home/数据迁移协调器';
import { 数据迁移意图, 数据迁移模式, 导出牌组选项 } from '../components/数据迁移面板';
import type { SyncAuth } from '../proto/messages/SyncMessages';
import { 牌组服务 } from '../backend/牌组服务';
import { 后端会话 } from '../backend/后端会话';
import { 导出集合, 导出牌组, 完成导出, 执行牌组导入, 暂存导入文件, 替换集合 } from '../backend/数据迁移服务';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 加载主题模式, 保存主题模式 } from '../model/主题存储';
import { 颜色主题, 默认颜色主题 } from '../model/颜色主题';
import { 加载颜色主题, 保存颜色主题 } from '../model/颜色主题存储';
import { 应用颜色主题 } from '../utils/颜色主题管理器';
import { 应用主题 } from '../utils/主题控制器';
import { 加载已隐藏牌组ID列表, 取消隐藏全部牌组 } from '../model/隐藏牌组存储';
import { 加载FSRS开启状态, 设置FSRS开启状态, 刷新桌面卡片数据 } from '../model/FSRS控制器';
import { 选取数据文件 } from '../utils/文件导入助手';
import { 平铺牌组树 } from '../model/牌组层级';
import { 牌组汇总 } from '../model/主页模型';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import { CustomTransition } from '../utils/自定义转场';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import { 浏览页参数 } from './浏览页';

export interface 设置页参数 {
  pathStack?: NavPathStack;
  openAiSettings?: boolean;
}

@Component
export struct 设置页 {
  pathStack?: NavPathStack;
  openAiSettings: boolean = false;
  private readonly 牌组服务实例: 牌组服务 = new 牌组服务();

  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;
  @State private 主题模式值: 主题模式 = 'system';
  @StorageLink('colorTheme') private 颜色主题值: 颜色主题 = 默认颜色主题;
  @State private 转场透明度: number = 1;

  // 弹层状态
  @State private 显示许可证: boolean = false;
  @State private 显示同步面板: boolean = false;
  @State private 同步面板认证: SyncAuth | null = null;
  @State private 同步面板账号名: string = '';

  // 数据迁移状态
  @State private 显示数据迁移: boolean = false;
  @State private 数据迁移初始模式: 数据迁移模式 = 'exportDeck';
  @State private 数据迁移初始牌组ID: number = 0;
  @State private 数据迁移允许选牌组: boolean = false;
  @State private 数据迁移中: boolean = false;
  @State private 数据迁移错误: string = '';
  @State private 数据迁移阶段: number = -1;
  @State private 个人数据替换步骤: number = 0;

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
      this.牌组列表 = allDecks.map((deck: 牌组汇总): 导出牌组选项 => ({
        id: Number(deck.id), name: deck.fullName
      }));
    } catch (error) {
      // 加载失败时牌组列表为空，导出牌组选项不可用
    }
  }

  private 打开数据迁移(mode: 数据迁移模式, deckId: number, allowDeckSelection: boolean): void {
    this.数据迁移初始模式 = mode;
    this.数据迁移初始牌组ID = deckId;
    this.数据迁移允许选牌组 = allowDeckSelection;
    this.数据迁移错误 = '';
    this.个人数据替换步骤 = 0;
    this.显示数据迁移 = true;
  }

  private async 处理数据迁移(intent: 数据迁移意图): Promise<void> {
    if (this.数据迁移中) return;
    if (intent.kind === 'importDeck') {
      await this.从选择器导入牌组();
      return;
    }
    if (intent.kind === 'replacePersonalData') {
      await this.确认个人数据替换();
      return;
    }
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) return;
    this.数据迁移中 = true;
    this.数据迁移错误 = '';
    this.数据迁移阶段 = 0;
    try {
      const path: string = intent.kind === 'exportDeck'
        ? await 导出牌组(context.filesDir, intent.deckId, intent.options)
        : await 导出集合(context.filesDir, intent.options);
      this.数据迁移阶段 = 1;
      const extension: string = intent.kind === 'exportDeck' ? '.apkg' : '.colpkg';
      const fileName: string = intent.kind === 'exportDeck' ? 'jidecards-deck.apkg' : 'jidecards-data.colpkg';
      const savedPath: string | null = await 完成导出(context, path, fileName, extension);
      if (savedPath !== null) {
        this.显示提示($r('app.string.transfer_done'));
        this.显示数据迁移 = false;
        this.个人数据替换步骤 = 0;
      }
    } catch (error) {
      this.数据迁移错误 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.数据迁移中 = false;
      this.数据迁移阶段 = -1;
    }
  }

  private async 从选择器导入牌组(): Promise<void> {
    if (this.数据迁移中) return;
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) return;
    const uri: string | null = await 选取数据文件(context, ['.apkg']);
    if (uri === null) return;
    if (!this.显示数据迁移) {
      this.打开数据迁移('importDeck', 0, false);
    }
    this.数据迁移中 = true;
    this.数据迁移错误 = '';
    this.数据迁移阶段 = 0;
    try {
      await 后端会话.获取实例().确保已打开(context.filesDir);
      const stagedPath: string = 暂存导入文件(context.filesDir, uri);
      this.数据迁移阶段 = 1;
      await 执行牌组导入(stagedPath);
      this.数据迁移阶段 = 2;
      this.显示提示($r('app.string.transfer_done'));
      this.显示数据迁移 = false;
      this.个人数据替换步骤 = 0;
      // 通知首页刷新数据
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      // 刷新本页牌组列表
      await this.加载牌组列表();
    } catch (error) {
      const failureDetail: string = error instanceof Error ? error.message : `${error}`;
      this.打开数据迁移('importDeck', 0, false);
      this.数据迁移错误 = failureDetail;
      this.显示提示($r('app.string.transfer_failed'));
    } finally {
      this.数据迁移中 = false;
      this.数据迁移阶段 = -1;
    }
  }

  private async 确认个人数据替换(): Promise<void> {
    if (this.数据迁移中) return;
    if (this.个人数据替换步骤 === 0) {
      this.个人数据替换步骤 = 1;
      return;
    }
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) return;
    const uri: string | null = await 选取数据文件(context, ['.colpkg']);
    if (uri === null) return;
    this.数据迁移中 = true;
    this.数据迁移错误 = '';
    try {
      await 替换集合(context.filesDir, uri, true, (stage: number) => { this.数据迁移阶段 = stage; });
      this.数据迁移阶段 = 4;
      this.个人数据替换步骤 = 0;
      this.显示提示($r('app.string.transfer_done'));
      this.显示数据迁移 = false;
      // 通知首页刷新数据
      AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      // 刷新本页牌组列表
      await this.加载牌组列表();
    } catch (error) {
      this.数据迁移错误 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.数据迁移中 = false;
      this.数据迁移阶段 = -1;
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

  private fsrsPromptActive: boolean = false;

  private async 同步后检查FSRS(fsrsDisabledBySync: boolean): Promise<void> {
    if (!fsrsDisabledBySync || this.fsrsPromptActive) return;
    this.fsrsPromptActive = true;
    try {
      const fsrsEnabled: boolean | null = await 加载FSRS开启状态();
      if (fsrsEnabled === false) {
        const result: promptAction.ShowDialogSuccessResponse = await this.getUIContext().getPromptAction().showDialog({
          title: this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.sync_fsrs_disabled_title').id),
          message: this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.sync_fsrs_disabled_message').id),
          buttons: [
            {
              text: this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.sync_fsrs_disabled_reenable').id),
              color: '#2F5FD0'
            },
            {
              text: this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.sync_fsrs_disabled_keep').id),
              color: '#666666'
            }
          ]
        });
        if (result.index === 0) {
          try {
            await 设置FSRS开启状态(true);
          } catch (error) {
            this.getUIContext().getPromptAction().showToast({
              message: this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.sync_fsrs_reenable_error').id)
            });
          }
        }
      }
    } catch (error) {
      // 拉取 FSRS 状态失败或弹窗失败都不阻断，静默降级
    } finally {
      this.fsrsPromptActive = false;
    }
  }

  private 返回(): void {
    if (this.显示同步面板) return;
    if (this.pathStack !== undefined && this.pathStack.size() > 0) {
      this.pathStack.pop();
    }
  }

  build() {
    NavDestination() {
      Stack() {
        设置面板({
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
            this.同步面板认证 = auth;
            this.同步面板账号名 = accountName;
            this.显示同步面板 = true;
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

        if (this.显示同步面板) {
          同步面板({
            是否深色: this.是否深色(),
            账号名: this.同步面板账号名,
            初始鉴权: this.同步面板认证,
            同步完成回调: (fsrsDisabledBySync: boolean): void => {
              // 通知首页刷新数据
              AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
              this.同步后检查FSRS(fsrsDisabledBySync);
            },
            关闭回调: (): void => {
              this.显示同步面板 = false;
              this.同步面板认证 = null;
              this.同步面板账号名 = '';
            }
          })
        }

        数据迁移协调器({
          显示: this.显示数据迁移,
          进行中: this.数据迁移中,
          错误: this.数据迁移错误,
          阶段: this.数据迁移阶段,
          个人数据替换步骤: this.个人数据替换步骤,
          初始模式: this.数据迁移初始模式,
          初始牌组ID: this.数据迁移初始牌组ID,
          允许选牌组: this.数据迁移允许选牌组,
          牌组选项列表: this.牌组列表,
          是否深色: this.是否深色(),
          onIntent: (intent: 数据迁移意图): void => {
            this.处理数据迁移(intent);
          },
          onClose: (): void => {
            if (!this.数据迁移中) {
              this.显示数据迁移 = false;
              this.个人数据替换步骤 = 0;
            }
          }
        })
      }
      .width('100%')
      .height('100%')
      .alignContent(Alignment.Center)
    }
    .hideTitleBar(true)
    .backgroundColor(Color.Transparent)
    .onBackPressed((): boolean => this.显示同步面板)
    .opacity(this.转场透明度)
  }
}
