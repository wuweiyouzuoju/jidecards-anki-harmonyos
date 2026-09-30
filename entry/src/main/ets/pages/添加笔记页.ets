import { PressFeedback } from '../utils/PressFeedback';
import { NoteFieldCard } from '../components/common/NoteFieldCard';
import { NoteEditorHeader } from '../components/common/NoteEditorHeader';
import { confirmNoteDiscard } from '../utils/ConfirmNoteDiscard';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteCreationSession, NoteCreationState } from '../model/NoteCreationSession';
import { NoteTypeCatalog } from '../model/NoteTypeCatalog';
import { noteTypeText, noteFieldText } from '../utils/NoteTypeText';
import { AnkiNoteCreation } from '../backend/AnkiNoteCreation';
import { namedResourceText } from '../utils/UiFeedback';
import { HelpLabel } from '../components/common/HelpLabel';
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeTextSpans } from '../components/common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { DECK_LIST_NARROW_KEY } from '../model/DeckListAppearance';
import { 简洁模式AppStorage键, 加载简洁模式 } from '../model/简洁模式存储';

// 添加笔记页：独立全屏建卡页（Task 9）。
// 由 首页.ets 通过 Navigation pathStack 以 NavDestination 形式入栈（与 学习页 同机制），
// 取代原 添加笔记面板 弹层。Cloze 字段复用选区工具栏和保存前预校验。
// Task 10：笔记类型加载失败时 try/catch 捕获，错误信息在 错误信息 显示，不静默 rejection。
// 图片遮盖类型使用选图与遮罩编辑器创建卡片。

import { common } from '@kit.AbilityKit';
import { NoteFieldImage } from '../model/NoteImageDraft';
import { 文本中的填空编号 } from '../model/填空解析器';
import { 生成Occlusions字符串 } from '../model/图片遮罩模型';
import type { 遮罩描述 } from '../model/图片遮罩模型';
import { 加载主题模式 } from '../model/主题存储';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 字段帮助面板 } from '../components/字段帮助面板';
import { 图片遮罩编辑器 } from '../components/图片遮罩编辑器';
import { 从图库选取图片 } from '../utils/文件导入助手';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { CustomTransition } from '../utils/自定义转场';
import type { NotetypeNameId, NotetypeView } from '../proto/messages/NotetypeMessages';

/** 建卡目标牌组候选（通过 Navigation param 传入） */
export interface 添加笔记牌组选项 {
  id: number;
  name: string;
}

/** 笔记类型下拉候选 */
export interface 添加笔记笔记类型选项 {
  id: number;
  name: string;
}

/** Select 组件所需选项结构 */
interface 添加笔记下拉选项 {
  value: string;
}

/** Navigation 入栈参数（与 学习页参数 同风格） */
export interface 添加笔记页参数 {
  deckId?: string;
  deckName?: string;
  deckOptions?: 添加笔记牌组选项[];
}

@Component
export struct 添加笔记页 {
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp(简洁模式AppStorage键) private isSimpleMode: boolean = true;
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(PAGE_SURFACE_KEY) private pageSurface: string = '#F5F7FA';
  /** Navigation 入栈参数 */
  pageDeckId: string = '';
  pageDeckName: string = '';
  pageDeckOptions: 添加笔记牌组选项[] = [];
  /** 页面栈：保存成功 / 取消时 pop 返回牌组详情 */
  pathStack: NavPathStack = new NavPathStack();

  @State private 牌组ID: number = 0;
  @State private 牌组名: string = '';
  @State private 牌组选项: 添加笔记牌组选项[] = [];
  @State private 已选笔记类型ID: number = 0;
  @State private 笔记类型选项: 添加笔记笔记类型选项[] = [];
  @State private 字段名列表: string[] = [];
  @State private originalStockKind: number = 0;
  @State private 字段值列表: string[] = [];
  @State private fieldImages: NoteFieldImage[] = [];
  @State private pickingFieldImage: boolean = false;
  private imageRequest: number = 0;
  private nextImageId: number = 0;
  private pageActive: boolean = false;
  private readonly creationSession: NoteCreationSession = new NoteCreationSession(new AnkiNoteCreation(),
    (state: NoteCreationState): void => { this.applyCreationState(state); });
  private displayedType: NotetypeView | null = null;
  // 名称只用于展示与帮助，编辑能力由 Core 结构提供。
  @State private 笔记类型名: string = '';
  @State private 笔记类型帮助: Resource = $r('app.string.add_note_notetype_help');
  @State private 标签: string = '';
  @State private 高级已展开: boolean = false;
  @State private 错误信息: string = '';
  @State private 处理中: boolean = false;
  @State private 显示帮助: boolean = false;
  @State private 帮助标题: Resource = $r('app.string.add_note_deck');
  @State private 帮助正文: Resource = $r('app.string.add_note_deck_help');
  @State private confirmingDiscard: boolean = false;
  @State private typeSelectorVersion: number = 0;
  @State private clozeFieldOrds: number[] = [];
  @State private optionalReverseIndex: number = -1;
  @State private imageOcclusionFields: number[] = [];


  @State private 是否图片遮盖模式: boolean = false;
  @State private 图片遮盖_源图Uri: string = '';
  @State private 图片遮盖_遮罩列表: 遮罩描述[] = [];
  @State private 图片遮盖_标题: string = '';
  @State private 图片遮盖_额外: string = '';
  @State private 图片遮盖_显示编辑器: boolean = false;
  // 当前实际是否深色模式（与 首页/学习页 同语义：主题模式 + 系统暗黑模式合成）
  @State private 主题模式值: 主题模式 = 'system';
  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;

  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  // 手势导航条高度（底部固定按钮排需抬高避让导航条）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  // 状态栏高度（沉浸式全屏下，顶部条需让出状态栏区域，避免返回按钮叠在状态栏上）
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  /** NavDestination 透明度（由 customNavContentTransition 回调控制，实现淡入淡出转场）。 */
  @State private 转场透明度: number = 1;

  async aboutToAppear(): Promise<void> {
    this.pageActive = true;

    this.牌组ID = this.pageDeckId === '' ? 0 : parseInt(this.pageDeckId);
    this.牌组名 = this.pageDeckName;
    this.牌组选项 = this.pageDeckOptions;
    // 注册自定义转场回调：首页 Navigation.customNavContentTransition 通过此 name 查找回调，
    // 在 animateTo 内调用起点/终点回调修改 转场透明度，实现淡入淡出（替代系统默认左右平移）。
    // key 用 'AddNotePage'（NavPathStack pushPath 时传的 name，与 from.name / to.name 一致）。
    CustomTransition.getInstance().注册NavParam('AddNotePage',
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 1 : 0;
      },
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 0 : 1;
      }
    );
    // 加载主题模式用于图片遮罩编辑器的深色判断；失败回退默认 'system'，不阻塞建卡流程。
    try {
      this.主题模式值 = await 加载主题模式();
    } catch (错误) {
      this.主题模式值 = 'system';
    }
    const simpleMode: boolean = await 加载简洁模式();
    if (!this.pageActive) { return; }
    AppStorage.setOrCreate<boolean>(简洁模式AppStorage键, simpleMode);
    await this.加载初始数据();
  }

  aboutToDisappear(): void {
    this.pageActive = false;
    this.creationSession.dispose();
    this.imageRequest++;
    // 注销自定义转场回调，避免内存泄漏与野回调
    CustomTransition.getInstance().注销NavParam('AddNotePage');
  }

  /**
   * 系统返回键 / 屏幕边缘滑动返回：编辑器/帮助浮层打开时优先关闭，否则走 NavPathStack 默认 pop。
   * Invariants: 图片遮盖编辑器优先于帮助浮层（编辑器更靠上层）。
   */
  onBackPress(): boolean {
    if (this.图片遮盖_显示编辑器) { this.图片遮盖_显示编辑器 = false; return true; }
    if (this.显示帮助) { this.显示帮助 = false; return true; }
    this.requestExit();
    return true;
  }

  /** 暗色模式判断：主题模式值=system 时跟随系统，否则按显式选择。与 学习页.ets 同语义。 */
  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const 上下文: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return 上下文 === undefined ? null : 上下文;
  }

  /** 读取本地化文案，context 不可用时回退空串。 */
  private 取本地化文案(资源: Resource): string {
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return '';
    }
    try {
      return 上下文.resourceManager.getStringSync(资源.id);
    } catch (错误) {
      return '';
    }
  }

  private applyCreationState(state: NoteCreationState): void {
    if (!this.pageActive) return;
    this.处理中 = state.busy;
    this.错误信息 = state.error.startsWith('add_note_') ? namedResourceText(this.getUIContext(), state.error) : state.error;
    this.笔记类型选项 = state.types;
    if (state.view !== this.displayedType) {
      this.displayedType = state.view;
      this.已选笔记类型ID = state.view === null ? 0 : state.view.id;
      this.笔记类型名 = state.view === null ? '' : state.view.name;
      this.optionalReverseIndex = state.view?.optionalReverseFieldOrd ?? -1;
      this.originalStockKind = state.view?.originalStockKind ?? 0;
      this.字段名列表 = state.view === null ? [] : state.view.fieldNames.slice();
      this.字段值列表 = this.字段名列表.map((_name: string): string => '');
      this.clozeFieldOrds = state.view?.clozeFieldOrds ?? [];
      this.imageOcclusionFields = state.view?.imageOcclusionFields ?? [];
      this.是否图片遮盖模式 = this.imageOcclusionFields.length === 4;
      this.笔记类型帮助 = this.笔记类型帮助文案(this.笔记类型名);
      this.图片遮盖_源图Uri = ''; this.图片遮盖_遮罩列表 = [];
      this.图片遮盖_标题 = ''; this.图片遮盖_额外 = ''; this.图片遮盖_显示编辑器 = false;
    }
    if (state.saved) this.pathStack.pop();
  }

  private async 加载初始数据(): Promise<void> {
    const context = this.取能力上下文();
    if (context === null) { this.错误信息 = this.取本地化文案($r('app.string.add_note_notetype_load_failed')); return; }
    await this.creationSession.initialize(context.filesDir);
  }

  private async 加载笔记类型(notetypeId: number): Promise<void> {
    if (notetypeId === this.已选笔记类型ID || this.处理中 || this.pickingFieldImage || this.confirmingDiscard || !this.pageActive) return;
    if (this.hasDraft()) {
      this.confirmingDiscard = true;
      const discard: boolean = await confirmNoteDiscard(this.getUIContext());
      if (!this.pageActive) return;
      this.confirmingDiscard = false;
      // Select 先更新自身选中项；取消时重建，恢复仍在编辑的真实类型。
      this.typeSelectorVersion++;
      if (!discard) return;
    }
    this.imageRequest++;
    this.fieldImages = [];
    this.pickingFieldImage = false;
    await this.creationSession.loadType(notetypeId);
  }

  /** 先按实际编辑能力提供帮助；标准名称补充说明，自定义类型保留通用入口。 */
  private 笔记类型帮助文案(名: string): Resource {
    if (this.optionalReverseIndex >= 0) return $r('app.string.add_note_notetype_basic_optional_reversed_help');
    if (this.是否图片遮盖模式) return $r('app.string.add_note_notetype_image_occlusion_help');
    if (this.clozeFieldOrds.length > 0) return $r('app.string.add_note_notetype_cloze_help');
    if (NoteTypeCatalog.Basic笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_basic_help');
    }
    if (NoteTypeCatalog.Basic反转笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_basic_reversed_help');
    }
    if (NoteTypeCatalog.Basic可选反转笔记类型名集合.indexOf(名) >= 0) {
      return this.optionalReverseIndex >= 0 ? $r('app.string.add_note_notetype_basic_optional_reversed_help') :
        $r('app.string.add_note_notetype_custom_help');
    }
    if (NoteTypeCatalog.Basic输入答案笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_basic_type_answer_help');
    }
    if (NoteTypeCatalog.填空笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_cloze_help');
    }
    if (NoteTypeCatalog.图片遮盖笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_image_occlusion_help');
    }
    return $r('app.string.add_note_notetype_help');
  }

  private 更新字段(索引: number, 值: string): void {
    const 下一个 = this.字段值列表.slice();
    下一个[索引] = 值;
    this.字段值列表 = 下一个;
  }

  private 解析标签(): string[] {
    const 已见: string[] = [];
    for (const 标签 of this.标签.split(/\s+/)) {
      const 已修剪 = 标签.trim();
      if (已修剪 !== '' && 已见.indexOf(已修剪) < 0) {
        已见.push(已修剪);
      }
    }
    return 已见;
  }

  /** 多挖空字段中至少一处包含有效编号才可保存。 */
  private 提交前校验填空(): boolean {
    if (this.clozeFieldOrds.length === 0) return true;
    return this.clozeFieldOrds.some((index: number): boolean =>
      文本中的填空编号(this.字段值列表[index] ?? '').length > 0);
  }

  private async 提交(): Promise<void> {
    if (this.处理中 || this.pickingFieldImage || this.confirmingDiscard || this.牌组ID === 0 || this.已选笔记类型ID === 0) return;
    if (this.是否图片遮盖模式) { await this.图片遮盖_提交(); return; }
    if (!this.提交前校验填空()) {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_cloze_missing'));
      return;
    }
    await this.creationSession.save({ deckId: this.牌组ID, notetypeId: this.已选笔记类型ID,
      fields: this.字段值列表, tags: this.解析标签(), images: this.fieldImages });
  }

  private async pickFieldImage(fieldIndex: number): Promise<void> {
    if (this.处理中 || this.pickingFieldImage || this.confirmingDiscard) { return; }
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    if (!context) { return; }
    const request: number = ++this.imageRequest;
    this.pickingFieldImage = true;
    try {
      const uri: string | null = await 从图库选取图片(context);
      if (!this.pageActive || request !== this.imageRequest || uri === null) { return; }
      const attachment: NoteFieldImage = {
        id: ++this.nextImageId, fieldIndex: fieldIndex, uri: uri, filename: ''
      };
      this.fieldImages = this.fieldImages.concat([attachment]);
      this.错误信息 = '';
    } finally {
      if (this.pageActive && request === this.imageRequest) { this.pickingFieldImage = false; }
    }
  }

  private imagesForField(fieldIndex: number): NoteFieldImage[] {
    return this.fieldImages.filter((attachment: NoteFieldImage): boolean => attachment.fieldIndex === fieldIndex);
  }

  private async 选取图片遮盖源图(): Promise<void> {
    if (this.处理中 || this.pickingFieldImage || this.confirmingDiscard) {
      return;
    }
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return;
    }
    const request: number = ++this.imageRequest;
    this.pickingFieldImage = true;
    try {
      const uri: string | null = await 从图库选取图片(上下文);
      if (!this.pageActive || request !== this.imageRequest || uri === null || uri === '') return;
      this.图片遮盖_源图Uri = uri;
      this.图片遮盖_遮罩列表 = [];
    } finally {
      if (this.pageActive && request === this.imageRequest) this.pickingFieldImage = false;
    }
  }

  private async 图片遮盖_提交(): Promise<void> {
    if (this.处理中 || this.牌组ID === 0 || this.已选笔记类型ID === 0) return;
    if (this.图片遮盖_源图Uri === '') {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_image_occlusion_no_image')); return;
    }
    if (this.图片遮盖_遮罩列表.length === 0) {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_image_occlusion_need_mask')); return;
    }
    const context = this.取能力上下文();
    if (context === null) return;
    await this.creationSession.saveOcclusion({ deckId: this.牌组ID, uri: this.图片遮盖_源图Uri,
      occlusions: 生成Occlusions字符串(this.图片遮盖_遮罩列表), header: this.图片遮盖_标题,
      backExtra: this.图片遮盖_额外, tags: this.解析标签(), notetypeId: this.已选笔记类型ID });
  }

  private 打开帮助(标题: Resource, 正文: Resource): void {
    this.帮助标题 = 标题;
    this.帮助正文 = 正文;
    this.显示帮助 = true;
  }

  private 已选笔记类型索引(): number {
    const 索引 = this.笔记类型选项.findIndex(
      (笔记类型: 添加笔记笔记类型选项): boolean => 笔记类型.id === this.已选笔记类型ID);
    return 索引 < 0 ? 0 : 索引;
  }

  private 已选笔记类型名(): string {
    for (const 笔记类型 of this.笔记类型选项) {
      if (笔记类型.id === this.已选笔记类型ID) {
        return this.displayTypeName(笔记类型.name);
      }
    }
    return '';
  }

  private 笔记类型下拉选项(): 添加笔记下拉选项[] {
    const 选项列表: 添加笔记下拉选项[] = [];
    for (const 笔记类型 of this.笔记类型选项) {
      选项列表.push({ value: this.displayTypeName(笔记类型.name) });
    }
    return 选项列表;
  }

  private displayTypeName(name: string): string {
    return noteTypeText(this.getUIContext(), name);
  }

  @Builder
  private 带帮助的标签(标签文案: Resource, 取帮助: () => Resource) {
    // 点击时读取帮助，避免切换笔记类型后仍显示旧说明。
    HelpLabel({ title: 标签文案, textSize: 应用尺寸.字号_正文_小,
      textColor: $r('app.color.text_secondary'), isHelpEnabled: !this.处理中,
      onHelp: (): void => { this.打开帮助(标签文案, 取帮助()); }
    }).width('100%')
  }

  // 标签字段块：ImageOcclusion 模式与其他笔记类型共用，统一放在「高级设置」折叠区里。
  // 抽 @Builder 消除两个分支的 Tags 代码重复（BUG-004 修复）。
  @Builder
  private 标签字段块() {
    Column({ space: 应用尺寸.间距_5 }) {
      this.带帮助的标签($r('app.string.add_note_tags'), (): Resource => $r('app.string.add_note_tags_help'))
      TextInput({ placeholder: $r('app.string.add_note_tags_placeholder'), text: this.标签 })
        .width('100%')
        .height(应用尺寸.按钮高度)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .placeholderColor($r('app.color.text_tertiary'))
        .backgroundColor($r('app.color.surface_card'))
        .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
        .borderRadius(应用尺寸.圆角_面板)
        .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
        .enabled(!this.处理中 && !this.pickingFieldImage && !this.confirmingDiscard)
        .onChange((值: string): void => {
          this.标签 = 值;
        })
      Text($r('app.string.add_note_duplicate_rejected'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_tertiary'))
        .width('100%')
    }
    .width('100%')
  }

  // 高级设置按钮 + 折叠区：ImageOcclusion 模式与其他笔记类型共用。
  // 抽 @Builder 消除两个分支的高级设置代码重复（BUG-004 修复）。
  @Builder
  private 高级设置折叠区() {
    if (!this.isSimpleMode) {
      Button() {
        Text($r('app.string.add_note_tags'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_secondary'))
      }
        .height(应用尺寸.紧凑控件高度)
        .flexShrink(0)
        .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12 })
        .backgroundColor(Color.Transparent)
        .borderRadius(应用尺寸.圆角_面板)
        .enabled(!this.处理中 && !this.pickingFieldImage && !this.confirmingDiscard)
        .attributeModifier(new PressFeedback())
        .stateEffect(false)
        .onClick((): void => {
          this.高级已展开 = !this.高级已展开;
        })

      if (this.高级已展开) {
        this.标签字段块()
      }
    }
  }

  @Builder
  private 顶部条() {
    NoteEditorHeader({ title: $r('app.string.add_note_title'),
      actionLabel: this.处理中 ? $r('app.string.add_note_saving') : $r('app.string.add_note_save'),
      actionEnabled: this.保存按钮可用() && !this.confirmingDiscard, accent: this.动作主色,
      closeEnabled: !this.处理中 && !this.pickingFieldImage && !this.confirmingDiscard,
      onBack: (): void => { this.requestExit(); }, onSave: (): void => { this.提交(); } })
  }

  build() {
    NavDestination() {
      Stack() {
      Column() {
        this.顶部条()
        // 保存位于顶栏，滚动区优先留给正反面内容。
        Scroll() {
          Column({ space: 应用尺寸.间距_14 }) {
            // 帮助紧随字段标签，弹层内容在点击时读取当前类型；选择框靠右。
            Row() {
              HelpLabel({ title: $r('app.string.add_note_notetype'), textSize: 应用尺寸.字号_按钮,
                textColor: $r('app.color.text_secondary'), isHelpEnabled: !this.处理中,
                onHelp: (): void => { this.打开帮助($r('app.string.add_note_notetype'), this.笔记类型帮助); }
              }).layoutWeight(1)
              ForEach([this.typeSelectorVersion], (_version: number) => {
              Select(this.笔记类型下拉选项())
                .selected(this.已选笔记类型索引())
                .value(this.已选笔记类型名())
                .enabled(!this.处理中 && !this.pickingFieldImage && !this.confirmingDiscard && this.笔记类型选项.length > 0)
                .attributeModifier(new SelectStyle($r('app.color.surface_card')))
                .height(SelectStyle.controlHeight)
                .padding(SelectStyle.controlPadding)
                .space(SelectStyle.controlSpace)
                .width(SelectStyle.fieldWidth)
                .constraintSize(SelectStyle.fieldConstraint)
                .font(SelectStyle.controlFont)
                .optionFont(SelectStyle.optionFont)
                .selectedOptionFont(SelectStyle.selectedOptionFont)
                .textModifier(SelectStyle.labelText())
                .borderRadius(SelectStyle.controlRadius)
                .onSelect((索引: number): void => {
                  this.加载笔记类型(this.笔记类型选项[索引].id);
                })
              }, (version: number): string => version.toString())
            }
            .width('100%')

            // 遮盖使用专属布局；普通字段支持文字与独立图片附件。
            if (this.是否图片遮盖模式) {
              Row({ space: 应用尺寸.间距_8 }) {
                Button(this.图片遮盖_源图Uri === ''
                  ? $r('app.string.add_note_image_occlusion_pick_image')
                  : $r('app.string.add_note_image_occlusion_change_image'))
                  .height(应用尺寸.紧凑控件高度)
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor(this.动作主色)
                  .backgroundColor($r('app.color.surface_card'))
                  .borderRadius(应用尺寸.圆角_面板)
                  .enabled(!this.处理中 && !this.pickingFieldImage && !this.confirmingDiscard)
                  .attributeModifier(new PressFeedback())
                  .stateEffect(false)
                  .onClick((): void => { this.选取图片遮盖源图(); })
                if (this.图片遮盖_源图Uri !== '') {
                  Button($r('app.string.add_note_image_occlusion_edit_masks'))
                    .height(应用尺寸.紧凑控件高度)
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor(this.动作主色)
                    .backgroundColor($r('app.color.surface_card'))
                    .borderRadius(应用尺寸.圆角_面板)
                    .enabled(!this.处理中 && !this.pickingFieldImage && !this.confirmingDiscard)
                    .attributeModifier(new PressFeedback())
                    .stateEffect(false)
                    .onClick((): void => { this.图片遮盖_显示编辑器 = true; })
                }
              }
              .width('100%')

              // ② 图片预览 + 编辑遮罩入口
              if (this.图片遮盖_源图Uri !== '') {
                Image(this.图片遮盖_源图Uri)
                  .width('100%')
                  .height(应用尺寸.卡片高度)
                  .objectFit(ImageFit.Contain)
                  .borderRadius(应用尺寸.圆角_面板)
                  .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
              }

              // ③ Header / Back Extra 输入（用 字段名列表 中查到的字段名做 placeholder 变量）
              if (this.图片遮盖_标题字段索引() >= 0) {
                Column({ space: 应用尺寸.间距_5 }) {
                  Text(noteFieldText(this.getUIContext(), this.字段名列表[this.图片遮盖_标题字段索引()], this.originalStockKind))
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_secondary'))
                    .width('100%')
                  TextArea({
                    placeholder: noteFieldText(this.getUIContext(), this.字段名列表[this.图片遮盖_标题字段索引()], this.originalStockKind),
                    text: this.图片遮盖_标题
                  })
                    .width('100%')
                    .height(56)
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary'))
                    .placeholderColor($r('app.color.text_tertiary'))
                    .backgroundColor($r('app.color.surface_card'))
                    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                    .borderRadius(应用尺寸.圆角_面板)
                    .padding(应用尺寸.间距_10)
                    .enabled(!this.处理中 && !this.pickingFieldImage && !this.confirmingDiscard)
                    .onChange((值: string): void => {
                      this.图片遮盖_标题 = 值;
                    })
                }
                .width('100%')
              }
              if (this.图片遮盖_额外字段索引() >= 0) {
                Column({ space: 应用尺寸.间距_5 }) {
                  Text(noteFieldText(this.getUIContext(), this.字段名列表[this.图片遮盖_额外字段索引()], this.originalStockKind))
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_secondary'))
                    .width('100%')
                  TextArea({
                    placeholder: noteFieldText(this.getUIContext(), this.字段名列表[this.图片遮盖_额外字段索引()], this.originalStockKind),
                    text: this.图片遮盖_额外
                  })
                    .width('100%')
                    .height(56)
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary'))
                    .placeholderColor($r('app.color.text_tertiary'))
                    .backgroundColor($r('app.color.surface_card'))
                    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                    .borderRadius(应用尺寸.圆角_面板)
                    .padding(应用尺寸.间距_10)
                    .enabled(!this.处理中 && !this.pickingFieldImage && !this.confirmingDiscard)
                    .onChange((值: string): void => {
                      this.图片遮盖_额外 = 值;
                    })
                }
                .width('100%')
              }

              // ④ Tags 折叠在「高级设置」里，与其他笔记类型保持一致（BUG-004 修复）
              this.高级设置折叠区()
            } else {
              ForEach(this.字段名列表, (字段名: string, 索引: number) => {
                NoteFieldCard({ fieldName: 字段名, originalStockKind: this.originalStockKind, value: this.字段值列表[索引],
                  disabled: this.处理中 || this.pickingFieldImage || this.confirmingDiscard,
                  reverseToggle: 索引 === this.optionalReverseIndex, isDark: this.是否深色(), accent: this.动作主色,
                  clozeEnabled: this.clozeFieldOrds.indexOf(索引) >= 0, allFields: this.字段值列表,
                  images: this.imagesForField(索引),
                  onChange: (value: string): void => { this.更新字段(索引, value); },
                  onAddImage: (): void => { this.pickFieldImage(索引); },
                  onRemoveImage: (id: number): void => {
                    this.fieldImages = this.fieldImages.filter((item: NoteFieldImage): boolean => item.id !== id);
                  } })
              }, (字段名: string, 索引: number): string => `${索引}-${字段名}`)

              this.高级设置折叠区()
            }
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
        .align(Alignment.TopStart)
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout)
        })

        // 错误固定显示，避免字段较多时被滚出屏幕。
        if (this.错误信息 !== '') {
          Text(this.错误信息)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
            .padding({
              left: 应用尺寸.页面内边距_水平,
              right: 应用尺寸.页面内边距_水平
            })
        }

        Column().height(应用尺寸.间距_8 + this.导航条高度).flexShrink(0)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.pageSurface)

      if (this.显示帮助) {
        字段帮助面板({
          标题: this.帮助标题,
          正文: this.帮助正文,
          onClose: (): void => {
            this.显示帮助 = false;
          }
        })
      }

      // T3 遮罩编辑器全屏弹层：覆盖在主内容之上，由 图片遮盖_显示编辑器 控制。
      // 用 Stack + if 实现（与 字段帮助面板 同机制）；编辑器内部自带 c1-c5 按钮 / 撤销 / 清空 / 确定 / 取消。
      if (this.图片遮盖_显示编辑器) {
        Column() {
          图片遮罩编辑器({
            源图Uri: this.图片遮盖_源图Uri,
            initialMasks: this.图片遮盖_遮罩列表,
            是否深色: this.是否深色(),
            onConfirm: (遮罩列表: 遮罩描述[]): void => {
              this.图片遮盖_遮罩列表 = 遮罩列表;
              this.图片遮盖_显示编辑器 = false;
            },
            onCancel: (): void => {
              this.图片遮盖_显示编辑器 = false;
            }
          })
        }
        .width('100%')
        .height('100%')
        .backgroundColor($r('app.color.surface_page'))
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
          bottom: 应用尺寸.toolbarVerticalInset + this.导航条高度
        })
      }
    }
    .width('100%')
    .height('100%')
    }
    .hideTitleBar(true)
    .backgroundColor(Color.Transparent)
    .opacity(this.转场透明度)
    .onBackPressed((): boolean => this.onBackPress())
  }

  /** T3.7：保存按钮可用条件——ImageOcclusion 模式要求已选图 + 至少 1 个遮罩；其他模式与原逻辑一致。 */
  private 保存按钮可用(): boolean {
    if (this.处理中 || this.pickingFieldImage) {
      return false;
    }
    if (this.字段名列表.length === 0) {
      return false;
    }
    if (this.是否图片遮盖模式) {
      return this.图片遮盖_源图Uri !== '' && this.图片遮盖_遮罩列表.length > 0;
    }
    return true;
  }

  /** ImageOcclusion 模式 Header 字段在 字段名列表 中的索引；找不到返回 -1。 */
  private 图片遮盖_标题字段索引(): number { return this.imageOcclusionFields[2] ?? -1; }
  private 图片遮盖_额外字段索引(): number { return this.imageOcclusionFields[3] ?? -1; }

  private hasDraft(): boolean {
    return this.字段值列表.some((value: string): boolean => value !== '') || this.标签.trim() !== ''
      || this.fieldImages.length > 0 || this.图片遮盖_源图Uri !== '';
  }

  private async requestExit(): Promise<void> {
    if (this.处理中 || this.pickingFieldImage || this.confirmingDiscard) return;
    if (!this.hasDraft()) { this.pathStack.pop(); return; }
    this.confirmingDiscard = true;
    const discard: boolean = await confirmNoteDiscard(this.getUIContext());
    if (!this.pageActive) return;
    this.confirmingDiscard = false;
    if (discard && this.pageActive && !this.处理中) this.pathStack.pop();
  }
}
