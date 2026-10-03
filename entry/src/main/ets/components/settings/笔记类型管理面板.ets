// SPDX-License-Identifier: AGPL-3.0-or-later
import { noteTypeText } from '../../utils/NoteTypeText';
import { LengthMetrics } from '@kit.ArkUI';
import { PressFeedback } from '../../utils/PressFeedback';
import { resourceText, showToastSafely } from '../../utils/UiFeedback';
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { DialogHeader } from '../common/DialogHeader';
import { DialogFrame } from '../common/DialogFrame';
import { 按下态按钮 } from '../common/按下态按钮';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { FormSelectRow } from '../common/FormSelectRow';
import { NotetypeOperationSession } from '../../model/NotetypeManagement';
import { notetypeImpactText } from '../../utils/NotetypeImpactText';
import { confirmNoteDiscard } from '../../utils/ConfirmNoteDiscard';
import { syncActivity } from '../../model/SyncSettings';
// ========================================================
// @块ID UI-NOTETYPE-MGMT-001
// @名称 笔记类型管理面板
//
// @作用
// 列出所有笔记类型，支持新建（从标准类型克隆）、删除、点击进入编辑器。
// 对应 Anki 桌面端「管理笔记类型」对话框。
//
// @输入
// isDark: 是否深色主题
// onClose: 关闭回调
// onEdit: (id: number, name: string) => void  打开编辑器回调
//
// @输出
// 渲染笔记类型列表浮卡面板；用户操作时调后端 RPC。
//
// @业务规则
// - 列表来自 笔记类型服务.获取笔记类型名列表()
// - 新建可选 Core 标准类型，克隆可选既有类型；都经 AddNotetypeLegacy 取得新 ID
// - 删除走 笔记类型服务.移除笔记类型，至少保留一个类型
// - 所有用户可见文案走 $r('app.string.notetype_mgmt_*')
//
// @副作用
// 持有 笔记类型服务 实例；点击按钮时调后端 RPC。
// ========================================================

import { 笔记类型服务 } from '../../backend/笔记类型服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 标准笔记类型种类 } from '../../proto/messages/NotetypeMessages';
import type { NotetypeNameId } from '../../proto/messages/NotetypeMessages';

@Component
export struct 笔记类型管理面板 {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    this.requestClose();
  }

  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onEdit: (id: number, name: string) => void = (id: number, name: string): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 加载中: boolean = false;
  @State private 处理中: boolean = false;
  @State private 类型列表: NotetypeNameId[] = [];
  @State private 错误信息: string = '';
  @State private createVisible: boolean = false;
  @State private createName: string = '';
  @State private stockKind: number = 0;
  @State private cloneSourceId: number = 0;
  @State private createError: string = '';
  @State private confirmingClose: boolean = false;
  private createInitialName: string = '';
  private readVersion: number = 0;
  private mounted: boolean = true;

  private readonly 服务: 笔记类型服务 = new 笔记类型服务();
  private readonly writes: NotetypeOperationSession = new NotetypeOperationSession(this.服务, (): void => {
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
    AppStorage.setOrCreate<number>('cardContentChangedTick', Date.now());
  });

  aboutToAppear(): void {
    this.mounted = true;
    this.刷新列表();
  }

  aboutToDisappear(): void { this.mounted = false; this.readVersion++; this.writes.dispose(); }

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private async 刷新列表(): Promise<void> {
    const version = ++this.readVersion;
    this.加载中 = true;
    this.错误信息 = '';
    try {
      const types = await this.服务.获取笔记类型名列表();
      if (this.mounted && version === this.readVersion) this.类型列表 = types;
    } catch (error) {
      if (this.mounted && version === this.readVersion) this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (this.mounted && version === this.readVersion) this.加载中 = false;
    }
  }

  private async 新建笔记类型(): Promise<void> {
    if (!this.mounted || this.处理中 || this.confirmingClose || this.createName.trim() === '') {
      return;
    }
    this.处理中 = true;
    this.createError = '';
    try {
      const newId: number = await this.writes.create(this.stockKind, this.cloneSourceId, this.createName);
      if (!this.mounted) return;
      if (newId > 0) {
        this.createVisible = false;
        showToastSafely(this.getUIContext(), {
          message: this.取本地化文本($r('app.string.notetype_mgmt_created')),
          duration: 2000
        });
        this.onEdit(newId, this.createName.trim());
      }
    } catch (error) {
      if (this.mounted) this.createError = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (this.mounted) this.处理中 = false;
    }
  }

  private async 确认删除(类型: NotetypeNameId): Promise<void> {
    if (!this.mounted || this.处理中 || this.加载中 || this.confirmingClose || this.createVisible) return;
    if (this.类型列表.length <= 1) {
      this.错误信息 = this.取本地化文本($r('app.string.notetype_mgmt_last_one'));
      return;
    }
    this.处理中 = true;
    this.错误信息 = '';
    try {
      await syncActivity.waitForCollection();
      if (!this.mounted) return;
      const json = await this.服务.获取笔记类型旧版(类型.id);
      const impact = await this.服务.impact(类型.id, json, json);
      if (!this.mounted) return;
      const result = await this.getUIContext().getPromptAction().showDialog({
        title: this.取本地化文本($r('app.string.notetype_mgmt_delete')),
        message: noteTypeText(this.getUIContext(), 类型.name) + '\n' + notetypeImpactText(this.getUIContext(), impact, [], true),
        buttons: [{ text: this.取本地化文本($r('app.string.cancel')), color: '#666666' },
          { text: this.取本地化文本($r('app.string.notetype_mgmt_delete')), color: '#D94838' }] });
      if (!this.mounted || result.index !== 1) return;
      if (!await this.writes.remove(类型.id, json, impact) || !this.mounted) return;
      await this.刷新列表();
    } catch (error) {
      if (this.mounted) this.错误信息 = error instanceof Error ?
        (error.message === 'notetype_impact_changed' ? this.取本地化文本($r('app.string.notetype_impact_changed')) : error.message) : `${error}`;
    } finally {
      if (this.mounted) this.处理中 = false;
    }
  }

  private async requestClose(): Promise<void> {
    if (!this.mounted || this.加载中 || this.处理中 || this.confirmingClose) return;
    if (!this.createVisible) { this.onClose(); return; }
    if (this.createName === this.createInitialName && this.stockKind === 0) { this.createVisible = false; return; }
    this.confirmingClose = true;
    try { if (await confirmNoteDiscard(this.getUIContext()) && this.mounted) this.createVisible = false; }
    finally { if (this.mounted) this.confirmingClose = false; }
  }

  @Builder
  private 类型行(类型: NotetypeNameId) {
    Column({ space: 应用尺寸.间距_8 }) {
        Text(noteTypeText(this.getUIContext(), 类型.name))
          .fontSize(应用尺寸.字号_正文)
          .fontColor(设置面板色板_取(this.isDark).主文字)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%')
          .textAlign(TextAlign.Start)

      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
      按下态按钮({ 文案: $r('app.string.notetype_clone'), 是否启用: !this.加载中 && !this.处理中,
        点击回调: (): void => { this.openCreate(类型.id, 类型.name); } })
      // 编辑按钮
      Text() { ThemeTextSpans($r('app.string.notetype_mgmt_edit'), this.themeAccentColors, this.getUIContext()) }
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.主色按钮背景)
        .padding({ left: 12, right: 12, top: 6, bottom: 6 })
        .attributeModifier(new PressFeedback())
        .enabled(!this.处理中 && !this.加载中)
        .onClick(() => {
          this.onEdit(类型.id, 类型.name);
        })

      // 删除按钮
      Text($r('app.string.notetype_mgmt_delete'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.error_text'))
        .padding({ left: 12, right: 12, top: 6, bottom: 6 })
        .attributeModifier(new PressFeedback())
        .enabled(!this.处理中 && !this.加载中)
        .onClick(() => {
          this.确认删除(类型);
        })
      }.width('100%')
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding({ top: 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
  }

  private openCreate(sourceId: number = 0, sourceName: string = ''): void {
    if (!this.mounted || this.加载中 || this.处理中 || this.confirmingClose || this.createVisible) return;
    this.cloneSourceId = sourceId;
    this.stockKind = 0;
    this.createName = sourceId > 0 ? sourceName + ' ' + this.取本地化文本($r('app.string.notetype_copy_suffix')) : '';
    this.createInitialName = this.createName;
    this.createError = '';
    this.createVisible = true;
  }

  private stockNames(): string[] {
    return ['Basic', 'Basic (and reversed card)', 'Basic (optional reversed card)', 'Basic (type in the answer)',
      'Cloze', 'Image Occlusion'].map((name: string): string => noteTypeText(this.getUIContext(), name));
  }

  @Builder
  private createHeader() {
    DialogHeader({ title: this.cloneSourceId > 0 ? $r('app.string.notetype_clone') : $r('app.string.notetype_mgmt_add'),
      actionLabel: $r('app.string.notetype_create_confirm'), actionEnabled: !this.处理中 && !this.confirmingClose && this.createName.trim() !== '',
      closeEnabled: !this.处理中 && !this.confirmingClose, closeLabel: $r('app.string.cancel'),
      onAction: (): void => { this.新建笔记类型(); }, onClose: (): void => { this.requestClose(); } })
  }

  @Builder
  private createContent() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text($r('app.string.notetype_editor_name')).fontColor($r('app.color.text_secondary')).width('100%')
      TextInput({ text: this.createName }).attributeModifier(new FormInputStyle()).enabled(!this.处理中)
        .onChange((value: string): void => { this.createName = value; })
      if (this.cloneSourceId === 0) {
        FormSelectRow({ label: $r('app.string.notetype_stock_source'),
          options: this.stockNames().map((name: string): SelectOption => { return { value: name }; }),
          selectedIndex: this.stockKind, value: this.stockNames()[this.stockKind], isInteractive: !this.处理中,
          onSelect: (index: number): void => { this.stockKind = index; } })
      } else {
        Text($r('app.string.notetype_clone_hint')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
      }
      if (this.处理中) { LoadingProgress().width(24).height(24) }
      if (this.createError !== '') { Text(this.createError).fontColor($r('app.color.error_text')).width('100%') }
    }.width('100%')
  }

  @Builder
  private mainHeader() {
    DialogHeader({
      title: $r('app.string.notetype_mgmt_title'),
      actionLabel: $r('app.string.notetype_mgmt_add'),
      actionEnabled: !this.处理中 && !this.加载中,
      closeLabel: $r('app.string.close'),
      closeEnabled: !this.加载中 && !this.处理中,
      onClose: () => { this.requestClose(); },
      onAction: () => { this.openCreate(); }
    })
  }

  @Builder
  private listContent() {
    // 说明文案
    Text($r('app.string.notetype_mgmt_description'))
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_secondary'))
      .width('100%')

    // busy 指示
    if (this.加载中 || this.处理中) {
      Row({ space: 应用尺寸.间距_8 }) {
        LoadingProgress()
          .width(20)
          .height(20)
          .color($r('app.color.action_primary'))
        Text(this.处理中 ? $r('app.string.notetype_mgmt_processing') : $r('app.string.notetype_mgmt_loading'))
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')
      .justifyContent(FlexAlign.Center)
    }

    // 错误信息
    if (this.错误信息 !== '') {
      Text(this.错误信息)
        .fontSize(应用尺寸.字号_正文_中)
        .fontColor($r('app.color.error_text'))
        .width('100%')
    }

    Column({ space: 应用尺寸.间距_4 }) {
      if (this.类型列表.length === 0 && !this.加载中) {
        Text($r('app.string.notetype_mgmt_empty')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
      }
      ForEach(this.类型列表, (类型: NotetypeNameId) => {
        this.类型行(类型)
      }, (类型: NotetypeNameId): string => `${类型.id}`)
    }.width('100%').alignItems(HorizontalAlign.Start)

  }

  build() {
    Stack() {
      DialogFrame({ header: () => { this.mainHeader(); }, content: () => { this.listContent(); },
        canDismiss: !this.加载中 && !this.处理中 && !this.confirmingClose && !this.createVisible,
        onDismiss: (): void => { this.requestClose(); } })
        .enabled(!this.createVisible && !this.confirmingClose)
      if (this.createVisible) {
        DialogFrame({ header: () => { this.createHeader(); }, content: () => { this.createContent(); },
          canDismiss: !this.处理中 && !this.confirmingClose, onDismiss: (): void => { this.requestClose(); } })
      }
    }.width('100%').height('100%')
  }
}
