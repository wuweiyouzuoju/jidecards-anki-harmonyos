import { PressFeedback } from '../utils/PressFeedback';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { ExpansionReveal } from '../utils/ExpansionReveal';
import { NoteFieldCard } from '../components/common/NoteFieldCard';
import { SettingsToggleRow } from '../components/common/SettingsToggleRow';
import { PrimaryActionButton } from '../components/common/PrimaryActionButton';
import { 按下态按钮 } from '../components/common/按下态按钮';
import { noteDraftChanged, parseNoteTags } from '../model/NoteFieldEditing';
import { NoteTagsField } from '../components/common/NoteTagsField';
import { NoteImagePreview } from '../components/common/NoteImagePreview';
import { noteImagePreviewSource } from '../model/NoteMediaParts';
import { NoteFieldAudio, NoteAudioStatus } from '../model/NoteAudioDraft';
import { NoteAudioPreview } from '../utils/NoteAudioPreview';
import { discardNoteRecordings } from '../utils/NoteAudioRecorder';
import { NoteEditorHeader } from '../components/common/NoteEditorHeader';
import { NoteDraftPreviewInput } from '../model/NoteDraftPreview';
import { confirmNoteDiscard } from '../utils/ConfirmNoteDiscard';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteCreationSession, NoteCreationState } from '../model/NoteCreationSession';
import { NoteDuplicateDialog } from '../components/common/NoteDuplicateDialog';
import { 浏览页参数, NoteDraftPreviewPageParams } from '../model/navigation/PageParams';
import { NoteTypeCatalog } from '../model/NoteTypeCatalog';
import { noteTypeText, noteFieldText } from '../utils/NoteTypeText';
import { appInterface } from '../backend/AppInterfaceService';
import { addNoteInterfaceControls, noteAudioInterfaceObservation, AppInterfaceMenuItem, AppInterfaceControl } from '../model/AppInterface';
import { interfaceControlText } from '../utils/AppInterfaceText';
import { noteFieldDisplayKey, noteTypeDisplayKey } from '../model/NoteTypePresentation';
import { AnkiNoteCreation } from '../backend/AnkiNoteCreation';
import { showToastSafely, namedResourceText } from '../utils/UiFeedback';
import { HelpLabel } from '../components/common/HelpLabel';
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeTextSpans } from '../components/common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { PAGE_COMPACT_LAYOUT_KEY } from '../model/AppLayoutState';
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
import type { NotetypeNameId, NotetypeView, NotetypeField } from '../proto/messages/NotetypeMessages';

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
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp(简洁模式AppStorage键) @Watch('publishInterface') private isSimpleMode: boolean = true;
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(PAGE_SURFACE_KEY) private pageSurface: string = '#F5F7FA';
  /** Navigation 入栈参数 */
  pageDeckId: string = '';
  pageDeckName: string = '';
  pageDeckOptions: 添加笔记牌组选项[] = [];
  /** 页面栈：保存并返回 / 取消时 pop 返回牌组详情 */
  pathStack: NavPathStack = new NavPathStack();

  @State private 牌组ID: number = 0;
  @State private 牌组名: string = '';
  @State private 牌组选项: 添加笔记牌组选项[] = [];
  @State private 已选笔记类型ID: number = 0;
  @State @Watch('publishInterface') private 笔记类型选项: 添加笔记笔记类型选项[] = [];
  @State @Watch('publishInterface') private 字段名列表: string[] = [];
  @State private originalStockKind: number = 0;
  @State private 字段值列表: string[] = [];
  // Core fields.sticky 的渲染快照；配置写入与保留决策仍由会话使用类型属性。
  @State private fieldSticky: boolean[] = [];
  @State private fieldConfigs: NotetypeField[] = [];
  @State private stickySaving: boolean = false;
  @State private fieldEditorVersion: number = 0;
  private draftBaseline: string[] = [];
  private tagsBaseline: string = '';
  private occlusionImage: NoteFieldImage | undefined = undefined;
  @State @Watch('publishInterface') private fieldImages: NoteFieldImage[] = [];
  @State @Watch('publishInterface') private fieldAudios: NoteFieldAudio[] = [];
  @State @Watch('publishInterface') private audioBusy: boolean = false;
  private nextAudioId: number = 0;
  private audioPreview: NoteAudioPreview = new NoteAudioPreview();
  @State @Watch('publishInterface') private pickingFieldImage: boolean = false;
  private imageRequest: number = 0;
  private nextImageId: number = 0;
  private pageActive: boolean = false;
  private readonly creationSession: NoteCreationSession = new NoteCreationSession(new AnkiNoteCreation(),
    (state: NoteCreationState): void => { this.applyCreationState(state); });
  private displayedType: NotetypeView | null = null;
  @State private duplicateSearch: string = '';
  // 名称只用于展示与帮助，编辑能力由 Core 结构提供。
  @State private 笔记类型名: string = '';
  @State private 笔记类型帮助: Resource = $r('app.string.add_note_notetype_help');
  @State private 标签: string = '';
  @State @Watch('publishInterface') private 高级已展开: boolean = false;
  private tagsReveal: ExpansionReveal = new ExpansionReveal();
  @State @Watch('publishInterface') private 错误信息: string = '';
  @State @Watch('publishInterface') private 处理中: boolean = false;
  @State private 显示帮助: boolean = false;
  @State private 帮助标题: Resource = $r('app.string.add_note_deck');
  @State private 帮助正文: Resource = $r('app.string.add_note_deck_help');
  @State @Watch('publishInterface') private confirmingDiscard: boolean = false;
  @State private typeSelectorVersion: number = 0;
  @State private draftPreview: NoteDraftPreviewInput | null = null;
  @State private clozeFieldOrds: number[] = [];
  @State private optionalReverseIndex: number = -1;
  @State private imageOcclusionFields: number[] = [];


  @State @Watch('publishInterface') private 是否图片遮盖模式: boolean = false;
  @State @Watch('publishInterface') private 图片遮盖_源图Uri: string = '';
  @State @Watch('publishInterface') private 图片遮盖_遮罩列表: 遮罩描述[] = [];
  @State private 图片遮盖_标题: string = '';
  @State private 图片遮盖_额外: string = '';
  @State @Watch('publishInterface') private 图片遮盖_显示编辑器: boolean = false;
  @State private masksBackRequest: number = 0;
  // 当前实际是否深色模式（与 首页/学习页 同语义：主题模式 + 系统暗黑模式合成）
  @StorageLink('themeMode') private 主题模式值: 主题模式 = 'system';
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
    this.publishInterface();

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
      const mode: 主题模式 = await 加载主题模式();
      if (!this.pageActive) return;
      this.主题模式值 = mode;
    } catch (错误) {
      if (!this.pageActive) return;
      this.主题模式值 = 'system';
    }
    const simpleMode: boolean = await 加载简洁模式();
    if (!this.pageActive) { return; }
    AppStorage.setOrCreate<boolean>(简洁模式AppStorage键, simpleMode);
    await this.加载初始数据();
  }

  aboutToDisappear(): void {
    this.pageActive = false;
    appInterface.hidePage('add_note'); appInterface.leave('add_note'); appInterface.leave('add_note_types');
    appInterface.leave('note_audio_manage');
    this.tagsReveal.cancel();
    this.audioPreview.dispose().catch((): void => {});
    if (!this.处理中) discardNoteRecordings(this.fieldAudios).catch((): void => {});
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
    if (this.draftPreview !== null) return true;
    if (this.duplicateSearch) { this.creationSession.cancelDuplicate(); return true; }
    if (this.图片遮盖_显示编辑器) { this.masksBackRequest++; return true; }
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
  private 取本地化文案(资源: Resource, _locale: string = this.uiLanguage): string {
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

  private applyCreationState(state: NoteCreationState, _locale: string = this.uiLanguage): void {
    if (!this.pageActive) return;
    this.duplicateSearch = state.duplicateSearch ?? '';
    this.处理中 = state.busy || this.duplicateSearch !== '';
    this.错误信息 = this.duplicateSearch !== '' ? '' :
      (state.error.startsWith('add_note_') || state.error.startsWith('note_audio_')) ? namedResourceText(this.getUIContext(), state.error) : state.error;
    this.笔记类型选项 = state.types;
    this.fieldSticky = (state.view?.fields ?? []).map((field): boolean => field.sticky === true);
    this.fieldConfigs = (state.view?.fields ?? []).slice();
    this.stickySaving = state.stickySaving;
    if (state.view !== this.displayedType) {
      this.displayedType = state.view;
      this.已选笔记类型ID = state.view === null ? 0 : state.view.id;
      this.笔记类型名 = state.view === null ? '' : state.view.name;
      this.optionalReverseIndex = state.view?.optionalReverseFieldOrd ?? -1;
      this.originalStockKind = state.view?.originalStockKind ?? 0;
      this.字段名列表 = state.view === null ? [] : state.view.fieldNames.slice();
      this.字段值列表 = this.字段名列表.map((_name: string): string => '');
      this.fieldImages = [];
      discardNoteRecordings(this.fieldAudios).catch((): void => {});
      this.fieldAudios = [];
      this.audioPreview.stop().catch((): void => {});
      this.occlusionImage = undefined;
      this.fieldEditorVersion++;
      this.clozeFieldOrds = state.view?.clozeFieldOrds ?? [];
      this.imageOcclusionFields = state.view?.imageOcclusionFields ?? [];
      this.是否图片遮盖模式 = this.imageOcclusionFields.length === 4;
      this.笔记类型帮助 = this.笔记类型帮助文案(this.笔记类型名);
      this.图片遮盖_源图Uri = ''; this.图片遮盖_遮罩列表 = [];
      this.图片遮盖_标题 = ''; this.图片遮盖_额外 = ''; this.图片遮盖_显示编辑器 = false;
      this.captureDraftBaseline();
    }
    this.displayedType = state.view;
    if (state.completion !== null && state.completion !== undefined) {
      if (state.completion.exit) { this.pathStack.pop(); return; }
      const next = state.completion.next;
      const io = state.completion.nextOcclusion;
      if (next !== null) {
        this.字段值列表 = next.fields.slice(); this.标签 = next.tags.join(' ');
        this.fieldImages = []; this.fieldAudios = [];
      }
      if (io !== null) {
        this.occlusionImage = io.image;
        this.图片遮盖_源图Uri = io.uri;
        if (io.image !== undefined && io.image.filename !== '') {
          const context = this.取能力上下文();
          if (context !== null && io.image !== undefined) {
            this.图片遮盖_源图Uri = noteImagePreviewSource(context.filesDir, io.image.filename);
            io.image.uri = this.图片遮盖_源图Uri;
          }
        }
        if (io.occlusions === '') this.图片遮盖_遮罩列表 = [];
        this.图片遮盖_标题 = io.header; this.图片遮盖_额外 = io.backExtra;
        this.标签 = io.tags.join(' ');
      }
      this.fieldEditorVersion++;
      this.audioPreview.stop().catch((): void => {});
      this.captureDraftBaseline();
      showToastSafely(this.getUIContext(), { message: namedResourceText(this.getUIContext(), 'add_note_added') });
    }
    this.publishInterface();
  }

  private async 加载初始数据(): Promise<void> {
    const context = this.取能力上下文();
    if (context === null) { this.错误信息 = this.取本地化文案($r('app.string.add_note_notetype_load_failed')); return; }
    await this.creationSession.initialize(context.filesDir);
  }

  private async 加载笔记类型(notetypeId: number): Promise<void> {
    if (this.draftPreview !== null) return;
    if (notetypeId === this.已选笔记类型ID || this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard || !this.pageActive) return;
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
    this.pickingFieldImage = false;
    await this.creationSession.loadType(notetypeId);
    if (this.pageActive) this.typeSelectorVersion++;
  }

  private async changeFieldSticky(index: number, sticky: boolean): Promise<void> {
    if (!this.pageActive || this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard) return;
    await this.creationSession.setFieldSticky(index, sticky);
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
    if (!this.pageActive || this.处理中 || this.confirmingDiscard) return;
    const 下一个 = this.字段值列表.slice();
    下一个[索引] = 值;
    this.字段值列表 = 下一个;
  }

  private updateTags(value: string): void {
    if (!this.pageActive || this.处理中 || this.confirmingDiscard || this.pickingFieldImage || this.audioBusy) return;
    this.标签 = value;
  }

  private updateOcclusionText(value: string, header: boolean): void {
    if (!this.pageActive || this.处理中 || this.confirmingDiscard || this.pickingFieldImage || this.audioBusy) return;
    if (header) this.图片遮盖_标题 = value;
    else this.图片遮盖_额外 = value;
  }

  private 解析标签(): string[] {
    return parseNoteTags(this.标签);
  }

  /** 多挖空字段中至少一处包含有效编号才可保存。 */
  private 提交前校验填空(): boolean {
    if (this.clozeFieldOrds.length === 0) return true;
    return this.clozeFieldOrds.some((index: number): boolean =>
      文本中的填空编号(this.字段值列表[index] ?? '').length > 0);
  }

  private async 提交(exitAfterSave: boolean = false): Promise<void> {
    if (this.draftPreview !== null) return;
    if (!this.pageActive || this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard || this.牌组ID <= 0 || this.已选笔记类型ID === 0) return;
    if (this.是否图片遮盖模式) { await this.图片遮盖_提交(exitAfterSave); return; }
    if (!this.提交前校验填空()) {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_cloze_missing'));
      return;
    }
    await this.creationSession.save({ deckId: this.牌组ID, notetypeId: this.已选笔记类型ID,
      fields: this.字段值列表, tags: this.解析标签(), images: this.fieldImages, audios: this.fieldAudios }, exitAfterSave);
  }

  private applyFieldMedia(index: number, value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]): void {
    if (!this.pageActive || this.处理中 || this.confirmingDiscard) return;
    this.更新字段(index, value);
    this.fieldImages = this.fieldImages.filter((item: NoteFieldImage): boolean => item.fieldIndex !== index)
      .concat(images.map((item: NoteFieldImage): NoteFieldImage => ({ id: ++this.nextImageId,
        fieldIndex: index, uri: item.uri, filename: item.filename, reference: item.reference })));
    this.fieldAudios = this.fieldAudios.filter((item: NoteFieldAudio): boolean => item.fieldIndex !== index)
      .concat(audios.map((item: NoteFieldAudio): NoteFieldAudio => ({ id: ++this.nextAudioId,
        fieldIndex: index, uri: item.uri, filename: item.filename, label: item.label,
        temporary: item.temporary, reference: item.reference })));
  }

  private imagesForField(fieldIndex: number): NoteFieldImage[] {
    return this.fieldImages.filter((attachment: NoteFieldImage): boolean => attachment.fieldIndex === fieldIndex);
  }

  private async 选取图片遮盖源图(_locale: string = this.uiLanguage): Promise<void> {
    if (this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard) {
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
      this.occlusionImage = { id: 0, fieldIndex: 0, uri: uri, filename: '' };
    } catch (error) {
      if (this.pageActive && request === this.imageRequest) {
        this.错误信息 = namedResourceText(this.getUIContext(), 'add_note_image_import_failed');
      }
    } finally {
      if (this.pageActive && request === this.imageRequest) this.pickingFieldImage = false;
    }
  }

  private async 图片遮盖_提交(exitAfterSave: boolean): Promise<void> {
    if (this.处理中 || this.牌组ID === 0 || this.已选笔记类型ID === 0) return;
    if (this.图片遮盖_源图Uri === '') {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_image_occlusion_no_image')); return;
    }
    if (!this.图片遮盖_遮罩列表.some((mask: 遮罩描述): boolean => mask.编号 > 0 && mask.形状 !== 'text')) {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_image_occlusion_need_mask')); return;
    }
    const context = this.取能力上下文();
    if (context === null) return;
    await this.creationSession.saveOcclusion({ deckId: this.牌组ID, uri: this.图片遮盖_源图Uri,
      occlusions: 生成Occlusions字符串(this.图片遮盖_遮罩列表), header: this.图片遮盖_标题,
      backExtra: this.图片遮盖_额外, tags: this.解析标签(), notetypeId: this.已选笔记类型ID,
      image: this.occlusionImage }, exitAfterSave);
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

  private interfaceControls(): AppInterfaceMenuItem[] {
    return addNoteInterfaceControls({ simple: this.isSimpleMode, tagsExpanded: this.高级已展开,
      occlusion: this.是否图片遮盖模式, hasSource: this.图片遮盖_源图Uri !== '', busy: this.处理中,
      blocked: this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard,
      saveEnabled: this.保存按钮可用() && !this.confirmingDiscard, hasTypes: this.笔记类型选项.length > 0 });
  }

  private openDraftPreview(): void {
    if (!this.pageActive || this.draftPreview !== null || this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard || this.已选笔记类型ID === 0) return;
    this.audioPreview.stop().catch((): void => {});
    const fields = this.字段值列表.slice();
    const images = this.fieldImages.slice();
    if (this.是否图片遮盖模式) {
      fields[this.imageOcclusionFields[0]] = 生成Occlusions字符串(this.图片遮盖_遮罩列表);
      fields[this.imageOcclusionFields[1]] = '';
      fields[this.imageOcclusionFields[2]] = this.图片遮盖_标题;
      fields[this.imageOcclusionFields[3]] = this.图片遮盖_额外;
      if (this.图片遮盖_源图Uri !== '') images.push({ id: 0, fieldIndex: this.imageOcclusionFields[1], uri: this.图片遮盖_源图Uri, filename: '' });
    }
    const input: NoteDraftPreviewInput = { notetypeId: this.已选笔记类型ID, fields: fields, tags: this.解析标签(),
      images: images, audios: this.fieldAudios.slice() };
    this.draftPreview = JSON.parse(JSON.stringify(input)) as NoteDraftPreviewInput;
    const params: NoteDraftPreviewPageParams = { input: this.draftPreview };
    try {
      this.pathStack.pushPath({ name: 'NoteDraftPreviewPage', param: params,
        onPop: (): void => { if (this.pageActive) this.draftPreview = null; } });
    } catch (error) {
      this.draftPreview = null;
      this.错误信息 = this.取本地化文案($r('app.string.browser_preview_load_error'));
    }
  }
  private restoreEditorAfterPreview(): void {
    this.draftPreview = null;
  }
  private interfaceLabel(id: string): string { return interfaceControlText(this.getUIContext(), this.interfaceControls(), id, this.uiLanguage); }
  private interfaceEnabled(id: string): boolean {
    return this.interfaceControls().find((item): boolean => item.id === id)?.enabled ?? false;
  }
  private publishAudioStatus(status: NoteAudioStatus | null): void {
    if (status === null || !this.pageActive) appInterface.leave('note_audio_manage');
    else appInterface.observe(noteAudioInterfaceObservation(status));
  }

  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.pageActive) return;
    const controls: AppInterfaceControl[] = this.interfaceControls().map((item): AppInterfaceControl =>
      ({ id: item.id, title: namedResourceText(this.getUIContext(), item.titleKey), titleKey: item.titleKey,
        enabled: item.enabled, selected: item.selected }));
    const fieldIds: string[] = [];
    const labels: string[] = [];
    for (let index: number = 0; index < Math.min(100, this.字段名列表.length); index++) {
      if (this.是否图片遮盖模式 && index !== this.图片遮盖_标题字段索引() && index !== this.图片遮盖_额外字段索引()) continue;
      const name: string = this.字段名列表[index];
      const key: string = noteFieldDisplayKey(name, this.originalStockKind);
      const title: string = noteFieldText(this.getUIContext(), name, this.originalStockKind).slice(0, 160);
      fieldIds.push('field-' + index); labels.push(title);
      controls.push({ id: 'field-' + index, title: title, titleKey: key === '' ? undefined : key,
        enabled: this.interfaceEnabled('back'), selected: false });
      controls.push({ id: 'sticky-' + index, title: namedResourceText(this.getUIContext(), 'note_field_sticky'),
        titleKey: 'note_field_sticky', enabled: this.interfaceEnabled('back'), selected: this.fieldSticky[index] ?? false });
    }
    if (this.是否图片遮盖模式) {
      controls.push({ id: 'sticky-source', title: namedResourceText(this.getUIContext(), 'note_source_image_sticky'),
        titleKey: 'note_source_image_sticky', enabled: this.interfaceEnabled('back'), selected: this.fieldSticky[this.imageOcclusionFields[1]] ?? false });
      controls.push({ id: 'sticky-masks', title: namedResourceText(this.getUIContext(), 'note_masks_sticky'),
        titleKey: 'note_masks_sticky', enabled: this.interfaceEnabled('back'), selected: this.fieldSticky[this.imageOcclusionFields[0]] ?? false });
    }
    appInterface.observe({ surface: 'add_note', sectionId: this.是否图片遮盖模式 ? 'image_occlusion' : 'fields',
      selectedId: String(this.已选笔记类型ID), optionIds: fieldIds, optionLabels: labels,
      optionsTotal: this.是否图片遮盖模式 ? fieldIds.length : this.字段名列表.length,
      busy: this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard,
      items: controls, controlsComplete: true,
      values: [{ id: 'stock_kind', value: String(this.originalStockKind) },
        { id: 'cloze_fields', value: this.clozeFieldOrds.join(',') }, { id: 'reverse_field', value: String(this.optionalReverseIndex) },
        { id: 'image_count', value: String(this.fieldImages.length) }, { id: 'audio_count', value: String(this.fieldAudios.length) },
        { id: 'has_source_image', value: String(this.图片遮盖_源图Uri !== '') },
        { id: 'mask_count', value: String(this.图片遮盖_遮罩列表.length) },
        { id: 'mask_editor_open', value: String(this.图片遮盖_显示编辑器) }, { id: 'has_error', value: String(this.错误信息 !== '') }] });
    const types: 添加笔记笔记类型选项[] = this.笔记类型选项.slice(0, 100);
    appInterface.observe({ surface: 'add_note_types', sectionId: '', selectedId: String(this.已选笔记类型ID),
      optionIds: types.map((item): string => String(item.id)), optionLabels: types.map((item): string => this.displayTypeName(item.name).slice(0, 160)),
      optionsTotal: this.笔记类型选项.length, busy: !this.interfaceEnabled('type'), controlsComplete: true,
      items: types.map((item): AppInterfaceControl => ({ id: String(item.id), title: this.displayTypeName(item.name).slice(0, 160),
        titleKey: noteTypeDisplayKey(item.name) || undefined, enabled: this.interfaceEnabled('type'), selected: item.id === this.已选笔记类型ID })) });
  }

  private displayTypeName(name: string): string {
    return noteTypeText(this.getUIContext(), name);
  }

  private viewDuplicates(): void {
    if (!this.pageActive || this.duplicateSearch === '') return;
    const params: 浏览页参数 = { initialSearch: this.duplicateSearch, initialNotesMode: true };
    this.pathStack.pushPath({ name: 'BrowserPage', param: params });
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
      NoteTagsField({ text: this.标签,
        isInteractive: !this.处理中 && !this.pickingFieldImage && !this.audioBusy && !this.confirmingDiscard,
        onChange: (value: string): void => { this.updateTags(value); } })
      Text($r('app.string.add_note_duplicate_policy'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_tertiary'))
        .width('100%')
    }
    .width('100%')
    .onAreaChange((_oldArea: Area, newArea: Area): void => {
      this.tagsReveal.revealAfterLayout(this.高级已展开, Number(newArea.height));
    })
  }

  private toggleTags(): void {
    if (this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard) { return; }
    this.高级已展开 = !this.高级已展开;
    this.tagsReveal.request(this.高级已展开);
  }

  // 高级设置按钮 + 折叠区：ImageOcclusion 模式与其他笔记类型共用。
  // 抽 @Builder 消除两个分支的高级设置代码重复（BUG-004 修复）。
  @Builder
  private 高级设置折叠区() {
    if (!this.isSimpleMode) {
      Button() {
        Text(this.interfaceLabel('tags_entry'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_secondary'))
      }
        .height(应用尺寸.紧凑控件高度)
        .flexShrink(0)
        .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12 })
        .backgroundColor(Color.Transparent)
        .borderRadius(应用尺寸.圆角_面板)
        .enabled(!this.处理中 && !this.pickingFieldImage && !this.audioBusy && !this.confirmingDiscard)
        .attributeModifier(new PressFeedback())
        .stateEffect(false)
        .onClick((): void => {
          this.toggleTags();
        })

      if (this.高级已展开) {
        this.标签字段块()
      }
    }
  }

  @Builder
  private 顶部条() {
    NoteEditorHeader({ title: $r('app.string.add_note_title'),
      actionLabel: $r('app.string.note_draft_preview'),
      actionEnabled: !this.处理中 && !this.pickingFieldImage && !this.audioBusy && !this.confirmingDiscard && this.已选笔记类型ID > 0,
      closeEnabled: this.interfaceEnabled('back'),
      onBack: (): void => { this.requestExit(); }, onSave: (): void => { this.openDraftPreview(); } })
  }

  build() {
    NavDestination() {
      Stack() {
      Column() {
        this.顶部条()
        // 两种保存操作固定在滚动区外，长字段与键盘不改变保存语义。
        Scroll(this.tagsReveal.scroller) {
          Column({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
            // 帮助紧随字段标签，弹层内容在点击时读取当前类型；选择框靠右。
            Row() {
              HelpLabel({ title: this.interfaceLabel('type'), textSize: 应用尺寸.字号_按钮,
                textColor: $r('app.color.text_secondary'), isHelpEnabled: !this.处理中,
                onHelp: (): void => { this.打开帮助($r('app.string.add_note_notetype'), this.笔记类型帮助); }
              }).layoutWeight(1)
              ForEach([this.typeSelectorVersion], (_version: number) => {
              Select(this.笔记类型下拉选项())
                .selected(this.已选笔记类型索引())
                .value(this.已选笔记类型名())
                .enabled(this.interfaceEnabled('type'))
                .attributeModifier(new SelectStyle($r('app.color.surface_card')))
                .height(SelectStyle.controlHeight)
                .padding(SelectStyle.controlPadding)
                .space(SelectStyle.controlSpace)
                .width(SelectStyle.fieldWidth)
                .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
                .font(SelectStyle.controlFont)
                .optionFont(SelectStyle.optionFont)
                .selectedOptionFont(SelectStyle.selectedOptionFont)
                .textModifier(SelectStyle.labelText())
                .borderRadius(SelectStyle.controlRadius).border(SelectStyle.controlBorder)
                .onSelect((索引: number): void => {
                  this.加载笔记类型(this.笔记类型选项[索引].id);
                })
              }, (version: number): string => version.toString())
            }
            .width('100%')

            // 遮盖使用专属布局；普通字段支持文字与独立图片附件。
            if (this.是否图片遮盖模式) {
              Row({ space: 应用尺寸.间距_8 }) {
                Button(this.interfaceLabel('image'))
                  .height(应用尺寸.紧凑控件高度)
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor(this.动作主色)
                  .backgroundColor($r('app.color.surface_card'))
                  .borderRadius(应用尺寸.圆角_面板).border(SurfaceBorder.options())
                  .enabled(!this.处理中 && !this.pickingFieldImage && !this.audioBusy && !this.confirmingDiscard)
                  .attributeModifier(new PressFeedback())
                  .stateEffect(false)
                  .onClick((): void => { this.选取图片遮盖源图(); })
                if (this.图片遮盖_源图Uri !== '') {
                  Button(this.interfaceLabel('masks'))
                    .height(应用尺寸.紧凑控件高度)
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor(this.动作主色)
                    .backgroundColor($r('app.color.surface_card'))
                    .borderRadius(应用尺寸.圆角_面板).border(SurfaceBorder.options())
                    .enabled(!this.处理中 && !this.pickingFieldImage && !this.audioBusy && !this.confirmingDiscard)
                    .attributeModifier(new PressFeedback())
                    .stateEffect(false)
                    .onClick((): void => { this.图片遮盖_显示编辑器 = true; })
                }
              }
              .width('100%')

              // ② 图片预览 + 编辑遮罩入口
              if (this.图片遮盖_源图Uri !== '') {
                NoteImagePreview({ source: this.图片遮盖_源图Uri })
              }

              // ③ Header / Back Extra 输入（用 字段名列表 中查到的字段名做 placeholder 变量）
              SettingsToggleRow({ title: $r('app.string.note_source_image_sticky'),
                hint: $r('app.string.note_source_image_sticky_hint'), isOn: this.fieldSticky[this.imageOcclusionFields[1]] ?? false,
                isDark: this.是否深色(), tint: this.动作主色, isInteractive: this.interfaceEnabled('back') && !this.stickySaving,
                onChange: (sticky: boolean): void => { this.changeFieldSticky(this.imageOcclusionFields[1], sticky); } })
              SettingsToggleRow({ title: $r('app.string.note_masks_sticky'),
                hint: $r('app.string.note_masks_sticky_hint'), isOn: this.fieldSticky[this.imageOcclusionFields[0]] ?? false,
                isDark: this.是否深色(), tint: this.动作主色, isInteractive: this.interfaceEnabled('back') && !this.stickySaving,
                onChange: (sticky: boolean): void => { this.changeFieldSticky(this.imageOcclusionFields[0], sticky); } })
              if (this.图片遮盖_标题字段索引() >= 0) {
                NoteFieldCard({ fieldName: this.字段名列表[this.图片遮盖_标题字段索引()], fieldIndex: this.图片遮盖_标题字段索引(),
                  originalStockKind: this.originalStockKind, value: this.图片遮盖_标题,
                  fieldConfig: this.fieldConfigs[this.图片遮盖_标题字段索引()] ?? null, mediaEditable: false,
                  disabled: !this.interfaceEnabled('back'), isDark: this.是否深色(), accent: this.动作主色,
                  stickyEditable: true, stickyInteractive: !this.stickySaving, sticky: this.fieldSticky[this.图片遮盖_标题字段索引()] ?? false,
                  onStickyChange: (sticky: boolean): void => { this.changeFieldSticky(this.图片遮盖_标题字段索引(), sticky); },
                  onChange: (value: string): void => { this.updateOcclusionText(value, true); } })
              }
              if (this.图片遮盖_额外字段索引() >= 0) {
                NoteFieldCard({ fieldName: this.字段名列表[this.图片遮盖_额外字段索引()], fieldIndex: this.图片遮盖_额外字段索引(),
                  originalStockKind: this.originalStockKind, value: this.图片遮盖_额外,
                  fieldConfig: this.fieldConfigs[this.图片遮盖_额外字段索引()] ?? null, mediaEditable: false,
                  disabled: !this.interfaceEnabled('back'), isDark: this.是否深色(), accent: this.动作主色,
                  stickyEditable: true, stickyInteractive: !this.stickySaving, sticky: this.fieldSticky[this.图片遮盖_额外字段索引()] ?? false,
                  onStickyChange: (sticky: boolean): void => { this.changeFieldSticky(this.图片遮盖_额外字段索引(), sticky); },
                  onChange: (value: string): void => { this.updateOcclusionText(value, false); } })
              }

              // ④ Tags 折叠在「高级设置」里，与其他笔记类型保持一致（BUG-004 修复）
              this.高级设置折叠区()
            } else {
              ForEach(this.字段名列表, (字段名: string, 索引: number) => {
                NoteFieldCard({ fieldName: 字段名, fieldIndex: 索引, originalStockKind: this.originalStockKind, value: this.字段值列表[索引],
                  fieldConfig: this.fieldConfigs[索引] ?? null,
                  stickyEditable: true, stickyInteractive: !this.stickySaving, sticky: this.fieldSticky[索引] ?? false,
                  onStickyChange: (sticky: boolean): void => { this.changeFieldSticky(索引, sticky); },
                  disabled: !this.interfaceEnabled('back'),
                  reverseToggle: 索引 === this.optionalReverseIndex, isDark: this.是否深色(), accent: this.动作主色,
                  clozeEnabled: this.clozeFieldOrds.indexOf(索引) >= 0, allFields: this.字段值列表,
                  images: this.imagesForField(索引),
                  audios: this.fieldAudios.filter((item: NoteFieldAudio): boolean => item.fieldIndex === 索引),
                  audioPreview: this.audioPreview,
                  onMediaApply: (value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]): void => {
                    this.applyFieldMedia(索引, value, images, audios);
                  },
                  onAudioBusy: (busy: boolean): void => { this.audioBusy = busy; },
                  onAudioStatus: (status: NoteAudioStatus | null): void => { this.publishAudioStatus(status); },
                  onRemoveAudio: (id: number): void => {
                    const removed: NoteFieldAudio[] = this.fieldAudios.filter((item: NoteFieldAudio): boolean => item.id === id);
                    this.fieldAudios = this.fieldAudios.filter((item: NoteFieldAudio): boolean => item.id !== id);
                    discardNoteRecordings(removed).catch((): void => {});
                  },
                  onChange: (value: string): void => { this.更新字段(索引, value); },
                  onRemoveImage: (id: number): void => {
                    this.fieldImages = this.fieldImages.filter((item: NoteFieldImage): boolean => item.id !== id);
                  } })
              }, (字段名: string, 索引: number): string => `${this.fieldEditorVersion}-${this.已选笔记类型ID}-${索引}-${字段名}`)

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

        Row({ space: 应用尺寸.间距_8 }) {
          按下态按钮({ 文案: this.interfaceLabel('save_return'), fillWidth: true,
            是否启用: this.interfaceEnabled('save_return'), 点击回调: (): void => { this.提交(true); } }).layoutWeight(1)
          PrimaryActionButton({ label: this.interfaceLabel('save'), tint: this.动作主色,
            isInteractive: this.interfaceEnabled('save'), onAction: (): void => { this.提交(false); } }).layoutWeight(1)
        }.width('100%').flexShrink(0).padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.操作区顶部间距(this.narrowDeckLayout),
          bottom: 应用尺寸.操作区底部间距(this.narrowDeckLayout, this.导航条高度) })
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

      if (this.duplicateSearch !== '') {
        NoteDuplicateDialog({ onCancel: (): void => { this.creationSession.cancelDuplicate(); },
          onContinue: (): void => { this.creationSession.confirmDuplicate(); },
          onView: (): void => { this.viewDuplicates(); } })
      }

      // T3 遮罩编辑器全屏弹层：覆盖在主内容之上，由 图片遮盖_显示编辑器 控制。
      // 用 Stack + if 实现（与 字段帮助面板 同机制）；编辑器内部自带 c1-c5 按钮 / 撤销 / 清空 / 确定 / 取消。
      if (this.图片遮盖_显示编辑器) {
        Column() {
          图片遮罩编辑器({
            源图Uri: this.图片遮盖_源图Uri,
            initialMasks: this.图片遮盖_遮罩列表,
            backRequest: this.masksBackRequest,
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
    .onShown((): void => { this.restoreEditorAfterPreview(); appInterface.showPage('add_note'); this.publishInterface(); })
    .onHidden((): void => { appInterface.hidePage('add_note'); this.audioPreview.stop().catch((): void => {}); })
    .onBackPressed((): boolean => this.onBackPress())
  }

  /** T3.7：保存按钮可用条件——ImageOcclusion 模式要求已选图 + 至少 1 个遮罩；其他模式与原逻辑一致。 */
  private 保存按钮可用(): boolean {
    if (this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard || this.牌组ID <= 0 || this.已选笔记类型ID === 0) {
      return false;
    }
    if (this.字段名列表.length === 0) {
      return false;
    }
    if (this.是否图片遮盖模式) {
      return this.图片遮盖_源图Uri !== '' && this.图片遮盖_遮罩列表.some((mask: 遮罩描述): boolean => mask.编号 > 0 && mask.形状 !== 'text');
    }
    return true;
  }

  /** ImageOcclusion 模式 Header 字段在 字段名列表 中的索引；找不到返回 -1。 */
  private 图片遮盖_标题字段索引(): number { return this.imageOcclusionFields[2] ?? -1; }
  private 图片遮盖_额外字段索引(): number { return this.imageOcclusionFields[3] ?? -1; }

  private hasDraft(): boolean {
    return noteDraftChanged(this.draftFields(), this.draftBaseline, this.标签, this.tagsBaseline)
      || this.fieldImages.length > 0 || this.fieldAudios.length > 0;
  }

  private draftFields(): string[] {
    return this.是否图片遮盖模式 ? [this.图片遮盖_源图Uri, 生成Occlusions字符串(this.图片遮盖_遮罩列表),
      this.图片遮盖_标题, this.图片遮盖_额外] : this.字段值列表.slice();
  }

  private captureDraftBaseline(): void {
    this.draftBaseline = this.draftFields(); this.tagsBaseline = this.标签;
  }

  private async requestExit(): Promise<void> {
    if (this.draftPreview !== null) return;
    if (!this.pageActive || this.处理中 || this.pickingFieldImage || this.audioBusy || this.confirmingDiscard) return;
    if (!this.hasDraft()) { this.pathStack.pop(); return; }
    this.confirmingDiscard = true;
    const discard: boolean = await confirmNoteDiscard(this.getUIContext());
    if (!this.pageActive) return;
    this.confirmingDiscard = false;
    if (discard && this.pageActive && !this.处理中) this.pathStack.pop();
  }
}
