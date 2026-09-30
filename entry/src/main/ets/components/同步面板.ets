// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../utils/PressFeedback';
import { DialogBackdrop } from './common/DialogBackdrop';
import { resourceText, namedResourceText, showToastSafely } from '../utils/UiFeedback';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
import type { SyncAuth } from '../proto/messages/SyncMessages';

import { 设置面板色板_取, 设置面板色板 } from '../utils/设置面板配色';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import { 颜色键 } from '../model/颜色主题';
import { APP_FOREGROUND_KEY } from '../model/Redemption';

import { SyncSession, SyncSessionSnapshot } from '../model/SyncSession';
import { createSyncSession } from '../backend/AnkiSyncSession';

/** 只展示同步快照并转交用户意图；任务和租约由 SyncSession 持有。 */
@Component
export struct 同步面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(颜色键.动作主色) private dialogActionColor: string = '#2F5FD0';
  @Prop 是否深色: boolean = false;
  @Prop 账号名: string = '';
  @Prop automatic: boolean = false;
  @Prop @Watch('dismissPresentation') backRequest: number = 0;
  @Prop @Watch('showDetails') detailsRequest: number = 0;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('syncForegroundChanged') private syncForeground: boolean = true;
  状态变化回调: (collectionBusy: boolean, modal: boolean) => void = (_busy: boolean, _modal: boolean): void => {};
  // 初始鉴权 由 Index 在挂载本组件时传入（来自 SyncGroup 上抛）
  初始鉴权: SyncAuth | null = null;
  同步完成回调: (fsrsDisabledBySync: boolean) => void = (_fsrsDisabledBySync: boolean): void => {};
  关闭回调: () => void = (): void => {};
  statusChanged: (text: string, indicator: string) => void = (_text: string, _indicator: string): void => {};
  onYield: (automatic: boolean) => void = (_automatic: boolean): void => {};
  onRetry: () => void = (): void => {};

  // @StorageProp 触发颜色主题切换时重 build，让 设置面板色板_取(isDark).主色 即时变化
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';


  private session: SyncSession | null = null;
  @State private state: SyncSessionSnapshot = {
    当前阶段: 'syncing', 状态文案: '', 错误文案: '', 媒体进度文案: '', 当前冲突类型: 'fullSync',
    是否请求中止: false, 是否在媒体阶段: false, detailsVisible: false
  };

  aboutToAppear(): void {
    this.session = createSyncSession(this.初始鉴权, this.automatic, {
      text: (key: string): string => namedResourceText(this.getUIContext(), key),
      toast: (message: string): void => { showToastSafely(this.getUIContext(), { message: message, duration: 3000 }); },
      changed: (state: SyncSessionSnapshot): void => { this.state = state; },
      activityChanged: (busy: boolean, modal: boolean): void => { this.状态变化回调(busy, modal); },
      statusChanged: (text: string, indicator: string): void => { this.statusChanged(text, indicator); },
      collectionCompleted: (disabled: boolean): void => { this.同步完成回调(disabled); },
      close: (): void => { this.关闭回调(); },
      yielded: (automatic: boolean): void => { this.onYield(automatic); }
    });
    this.session.aboutToAppear();
  }
  aboutToDisappear(): void { this.session?.aboutToDisappear(); }
  private showDetails(): void { this.session?.showDetails(); }
  private dismissPresentation(): void { this.session?.dismissPresentation(); }
  private syncForegroundChanged(): void { if (this.syncForeground) this.session?.syncForegroundChanged(); }
  private 冲突确认(upload: boolean): void { this.session?.冲突确认(upload); }
  private 取本地化文案(resource: Resource): string { return resourceText(this.getUIContext(), resource); }
  private 取色板(): 设置面板色板 { return 设置面板色板_取(this.是否深色); }

  @Builder
  private 头部行() {
    DialogHeader({
      title: this.取本地化文案($r('app.string.settings_sync_group')),
      closeLabel: $r('app.string.close'),
      showAction: false,
      onClose: (): void => {
        this.dismissPresentation();
      }
    })
  }

  /** syncing 阶段：LoadingProgress + 文案 + 媒体进度（用户决策 2026-07-23：移除中止按钮）。 */
  @Builder
  private 同步中内容() {
    Row({ space: 8 }) {
      LoadingProgress()
        .width(18)
        .height(18)
        .color(this.取色板().主色)
      Text(this.state.是否在媒体阶段 ? $r('app.string.sync_syncing_media') : $r('app.string.sync_syncing'))
        .fontSize(应用尺寸.字号_正文)
        .fontColor(this.取色板().主文字)
    }
    .width('100%')
    .height(40)

    if (this.state.是否在媒体阶段) {
      Text($r('app.string.sync_collection_complete'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.取色板().次文字)
        .width('100%')
    }

    if (this.state.媒体进度文案 !== '') {
      Text(this.state.媒体进度文案)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.取色板().次文字)
        .width('100%')
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
  }

  /** 冲突详情只在用户主动展开后显示，方向选择执行前再次检查。 */
  @Builder
  private 冲突内容() {
    Text($r('app.string.sync_conflict_title'))
      .fontSize(应用尺寸.字号_正文_中)
      .fontWeight(FontWeight.Medium)
      .fontColor(this.取色板().主文字)
      .width('100%')
    Text(this.state.当前冲突类型 === 'fullDownload' ? $r('app.string.sync_download_only_message')
      : this.state.当前冲突类型 === 'fullUpload' ? $r('app.string.sync_upload_only_message')
      : $r('app.string.sync_conflict_message'))
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor(this.取色板().次文字)
      .width('100%')

    Row({ space: 应用尺寸.间距_10 }) {
      // 上传按钮：fullDownload 场景不展示
      if (this.state.当前冲突类型 !== 'fullDownload') {
        Button() {
          Text() { ThemeTextSpans($r('app.string.sync_conflict_upload'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.dialogActionColor)
        }
          .layoutWeight(1)
          .height(44)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.dialogActionColor)
          .backgroundColor(Color.Transparent)
          .borderRadius(22)
          .attributeModifier(new PressFeedback())
          .stateEffect(false)
          .onClick((): void => {
            this.冲突确认(true);
          })
      }
      // 下载按钮：fullUpload 场景不展示
      if (this.state.当前冲突类型 !== 'fullUpload') {
        Button() {
          Text() { ThemeTextSpans($r('app.string.sync_conflict_download'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.dialogActionColor)
        }
          .layoutWeight(1)
          .height(44)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.dialogActionColor)
          .backgroundColor(Color.Transparent)
          .borderRadius(22)
          .attributeModifier(new PressFeedback())
          .stateEffect(false)
          .onClick((): void => {
            this.冲突确认(false);
          })
      }
    }
    .width('100%')
  }

  /** done 阶段：状态/错误文案 + 关闭按钮。 */
  @Builder
  private 完成内容() {
    if (this.state.状态文案 !== '') {
      Text() { ThemeTextSpans(this.state.状态文案, this.themeAccentColors, this.getUIContext()) }
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.取色板().主色)
        .width('100%')
    }
    if (this.state.错误文案 !== '') {
      Text(this.state.错误文案)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.取色板().错误色)
        .width('100%')
        .maxLines(8)
      Button($r('app.string.sync_retry'))
        .attributeModifier(new PressFeedback())
        .stateEffect(false)
        .onClick((): void => { this.onRetry(); })
    }

  }

  @Builder
  private syncDialog() {
    Stack() {
      // 磨砂玻璃遮罩：canClose=false 时不响应点击
      DialogBackdrop()
        .onClick((): void => {
          this.dismissPresentation();
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_12 }) {
        this.头部行()

        if (this.账号名 !== '') {
          Text(this.账号名)
            .fontSize(应用尺寸.字号_正文)
            .fontColor(this.取色板().次文字)
            .width('100%')
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }

        if (this.state.当前阶段 === 'syncing') {
          this.同步中内容()
        } else if (this.state.当前阶段 === 'conflict') {
          this.冲突内容()
        } else {
          this.完成内容()
        }
      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(20)
      .backgroundColor(this.取色板().背景)
      .borderRadius(应用尺寸.圆角_卡片)
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
    }
    .width('100%')
    .height('100%')
  }

  build() {
    Stack({ alignContent: Alignment.Top }) {
      if (this.state.detailsVisible) {
        this.syncDialog()
      }
    }
    .width('100%')
    .height('100%')
    .hitTestBehavior(!this.state.detailsVisible ?
      HitTestMode.Transparent : HitTestMode.Default)
  }
}
