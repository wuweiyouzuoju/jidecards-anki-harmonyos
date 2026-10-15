import { KeyboardShortcutHelp } from '../KeyboardShortcutHelp';
import { EDITOR_SHORTCUTS, FIELD_SHORTCUTS, editorShortcutCommand } from '../../model/KeyboardShortcuts';
import { StudyKeyboardSession } from '../../model/StudyKeyboard';
import { studyEventChord } from '../../utils/StudyKeyAdapter';
import { BrowserDeckDialog } from './BrowserDeckDialog';
import { BrowserNotetypeFeature } from './BrowserNotetypeFeature';
import { 笔记类型编辑器 } from '../settings/笔记类型编辑器';
import { AnchoredMenuItem } from '../common/MenuItem';
import { NoteEditorProperties } from '../../backend/NoteEditorProperties';
import { NoteEditorState } from '../../model/NoteEditorSession';
import { DeckTreeNode } from '../../proto/messages/DeckMessages';
import { 变更笔记类型请求 } from '../../proto/messages/NotetypeMessages';
import { mapEditorFields, mapEditorImages, mapEditorAudios } from '../../model/NoteEditorDraftMapping';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteTagsField } from '../common/NoteTagsField';
import { ExpansionReveal } from '../../utils/ExpansionReveal';
import { common } from '@kit.AbilityKit';
import { 图片遮罩编辑器 } from '../图片遮罩编辑器';
import { 遮罩描述, parseOcclusionMasks, serializeOcclusionDocument } from '../../model/图片遮罩模型';
import { noteMediaParts, NoteMediaPart, noteImagePreviewSource } from '../../model/NoteMediaParts';
import { PressFeedback } from '../../utils/PressFeedback';
import { NoteFieldCard } from '../editor/NoteFieldCard';
import { NoteEditorHeader } from '../common/NoteEditorHeader';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { NoteDraftPreviewInput } from '../../model/NoteDraftPreview';
import { EditableNote } from '../../proto/messages/NoteMessages';
import { NotetypeField } from '../../proto/messages/NotetypeMessages';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { NoteFieldAudio, NoteAudioStatus } from '../../model/NoteAudioDraft';
import { NoteAudioPreview } from '../../utils/NoteAudioPreview';
import { discardNoteRecordings } from '../../utils/NoteAudioRecorder';
import { discardNoteDrawingImages } from '../../backend/NoteDrawingStore';
import { noteDraftChanged, parseNoteTags } from '../../model/NoteFieldEditing';
import { confirmNoteDiscard } from '../../utils/ConfirmNoteDiscard';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';
import { appInterface } from '../../backend/AppInterfaceService';
import { noteEditInterfaceControls, noteAudioInterfaceObservation, AppInterfaceMenuItem, AppInterfaceControl } from '../../model/AppInterface';
import { interfaceControlText } from '../../utils/AppInterfaceText';
import { noteFieldText } from '../../utils/NoteTypeText';
import { noteFieldDisplayKey } from '../../model/NoteTypePresentation';
import { browserKeyName } from '../../utils/BrowserKeyAdapter';



// 独立编辑页的表单：拥有字段/标签/附件草稿和放弃确认，读写由宿主页负责。
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';

@Component
export struct 浏览编辑区 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(PAGE_SURFACE_KEY) private pageSurface: string = '#F5F7FA';
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrow: boolean = false;
  @StorageProp('导航条高度') private navigationBarHeight: number = 0;
  @Prop @Watch('requestClose') backRequest: number = 0;
  @Prop @Watch('restoreAfterPreview') previewReturnRequest: number = 0;
  @Prop clozeFieldOrds: number[] = [];
  @Prop optionalReverseFieldOrd: number = -1;
  @Prop imageOcclusionFields: number[] = [];
  @State private showingMasks: boolean = false;
  @State private masksBackRequest: number = 0;
  @State private maskImageSource: string = '';
  private maskSource: string = '';
  private maskDraft: 遮罩描述[] = [];
  @State @Watch('publishInterface') private images: NoteFieldImage[] = [];
  @State @Watch('publishInterface') private audios: NoteFieldAudio[] = [];
  @State @Watch('publishInterface') private audioBusy: boolean = false;
  private nextAudioId: number = 0;
  private audioPreview: NoteAudioPreview = new NoteAudioPreview();
  @State @Watch('publishInterface') private confirmingClose: boolean = false;
  private nextImageId: number = 0;
  @Prop isDark: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop @Watch('publishInterface') errorMessage: string = '';
  @Prop @Watch('publishInterface') originalStockKind: number = 0;
  @Prop @Watch('publishInterface') fieldNames: string[] = [];
  @Prop fieldConfigs: NotetypeField[] = [];
  @Prop initialFieldValues: string[] = [];
  @Prop initialTags: string = '';
  @Prop note: EditableNote | null = null;
  @State private preview: NoteDraftPreviewInput | null = null;
  @State @Watch('publishInterface') private keyboardHelpOpen: boolean = false;
  @State @Watch('publishInterface') private propertyMode: string = '';
  @State @Watch('publishInterface') private propertyBusy: boolean = false;
  @State private propertyBack: number = 0;
  @State private deckTree: DeckTreeNode | null = null;
  @State private tagsFocusRequest: number = 0;
  @State private fieldFocusRequest: number = 0;
  @State private focusedField: number = -1;
  @State @Watch('publishInterface') private pendingMapping: number[] | null = null;
  private readonly properties: NoteEditorProperties = new NoteEditorProperties();
  private readonly keyboardSession: StudyKeyboardSession = new StudyKeyboardSession();
  onReload: () => Promise<NoteEditorState | null> = async (): Promise<NoteEditorState | null> => null;

  onPreview: (input: NoteDraftPreviewInput, onReturn: () => void) => boolean =
    (_input: NoteDraftPreviewInput, _onReturn: () => void): boolean => false;
  onCancel: () => void = (): void => {};
  onCloseCancelled: () => void = (): void => {};
  onSave: (fields: string[], tags: string[], images: NoteFieldImage[], audios: NoteFieldAudio[]) => Promise<boolean> =
    async (_fields: string[], _tags: string[], _images: NoteFieldImage[], _audios: NoteFieldAudio[]): Promise<boolean> => false;

  @State @Watch('publishInterface') private fieldValues: string[] = [];
  @State @Watch('publishInterface') private tags: string = '';
  private tagsReveal: ExpansionReveal = new ExpansionReveal();
  @State private 本地错误: string = '';
  private disposed: boolean = false;
  private interfaceMounted: boolean = false;

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';

  aboutToAppear(): void {
    // 从父级传入的初始值拷贝到内部状态（仅初始化，后续编辑不影响 initialFieldValues）
    this.fieldValues = this.initialFieldValues.slice();
    this.tags = this.initialTags;
    this.interfaceMounted = true;
    this.publishInterface();
  }

  aboutToDisappear(): void {
    this.tagsReveal.cancel(); this.properties.dispose(); this.keyboardSession.reset();
    this.disposed = true;
    this.interfaceMounted = false;
    appInterface.leave('edit_note_form');
    appInterface.leave('note_audio_manage');
    this.audioPreview.dispose().catch((): void => {});
    if (!this.busy) discardNoteRecordings(this.audios).catch((): void => {});
    if (!this.busy) this.cleanupDrawingImages(this.images);
  }

  private cleanupDrawingImages(images: NoteFieldImage[]): void {
    if (images.length === 0) return;
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    discardNoteDrawingImages(images, context.cacheDir).catch((): void => {});
  }

  private interfaceControls(): AppInterfaceMenuItem[] {
    return noteEditInterfaceControls(this.busy, this.busy || this.audioBusy || this.confirmingClose || this.propertyBusy || this.pendingMapping !== null || this.propertyMode !== '' || this.keyboardHelpOpen, this.fieldNames.length);
  }
  private publishAudioStatus(status: NoteAudioStatus | null): void {
    if (status === null || this.disposed || !this.interfaceMounted) appInterface.leave('note_audio_manage');
    else appInterface.observe(noteAudioInterfaceObservation(status));
  }
  private interfaceLabel(id: string): string { return interfaceControlText(this.getUIContext(), this.interfaceControls(), id, this.uiLanguage); }
  private interfaceEnabled(id: string): boolean {
    return this.interfaceControls().find((item): boolean => item.id === id)?.enabled ?? false;
  }
  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.interfaceMounted || this.disposed) return;
    const controls: AppInterfaceControl[] = this.interfaceControls().map((item): AppInterfaceControl =>
      ({ id: item.id, title: namedResourceText(this.getUIContext(), item.titleKey), titleKey: item.titleKey,
        enabled: item.enabled, selected: false }));
    const names: string[] = this.fieldNames.slice(0, 100);
    const labels: string[] = [];
    for (let index: number = 0; index < names.length; index++) {
      const key: string = noteFieldDisplayKey(names[index], this.originalStockKind);
      const title: string = noteFieldText(this.getUIContext(), names[index], this.originalStockKind).slice(0, 160);
      labels.push(title);
      controls.push({ id: 'field-' + index, title: title, titleKey: key === '' ? undefined : key,
        enabled: this.interfaceEnabled('tags'), selected: index === this.optionalReverseFieldOrd && (this.fieldValues[index] ?? '').trim().length > 0 });
    }
    appInterface.observe({ surface: 'edit_note_form', sectionId: '', selectedId: '',
      optionIds: names.map((_name, index): string => 'field-' + index), optionLabels: labels, optionsTotal: this.fieldNames.length,
      busy: this.busy || this.audioBusy || this.confirmingClose || this.propertyBusy || this.pendingMapping !== null, items: controls, controlsComplete: true,
      values: [{ id: 'property_panel', value: this.propertyMode }, { id: 'mapping_refresh_pending', value: String(this.pendingMapping !== null) }, { id: 'stock_kind', value: String(this.originalStockKind) }, { id: 'cloze_fields', value: this.clozeFieldOrds.join(',') },
        { id: 'reverse_field', value: String(this.optionalReverseFieldOrd) }, { id: 'image_count', value: String(this.images.filter((item: NoteFieldImage): boolean => item.kind !== 'video').length) },
        { id: 'video_count', value: String(this.images.filter((item: NoteFieldImage): boolean => item.kind === 'video').length) },
        { id: 'audio_count', value: String(this.audios.length) }, { id: 'tags_length', value: String(this.tags.length) },
        { id: 'has_error', value: String(this.errorMessage !== '' || this.本地错误 !== '') }] });
  }

  private 更新字段(索引: number, 值: string): void {
    const 新值 = this.fieldValues.slice();
    新值[索引] = 值;
    this.fieldValues = 新值;
  }

  private applyFieldMedia(index: number, value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]): void {
    if (this.disposed || this.busy || this.confirmingClose) return;
    this.更新字段(index, value);
    this.images = this.images.filter((item: NoteFieldImage): boolean => item.fieldIndex !== index)
      .concat(images.map((item: NoteFieldImage): NoteFieldImage => ({ id: ++this.nextImageId,
        fieldIndex: index, uri: item.uri, filename: item.filename, reference: item.reference, kind: item.kind })));
    this.audios = this.audios.filter((item: NoteFieldAudio): boolean => item.fieldIndex !== index)
      .concat(audios.map((item: NoteFieldAudio): NoteFieldAudio => ({ id: ++this.nextAudioId,
        fieldIndex: index, uri: item.uri, filename: item.filename, label: item.label,
        temporary: item.temporary, reference: item.reference })));
  }

  /** 把 tags 输入串按空白拆分、去空、去重，返回标签数组。 */
  private 解析标签(): string[] {
    return parseNoteTags(this.tags);
  }

  /** 提交：调 onSave 上抛字段/标签；失败时草稿保留，由父级 errorMessage 提示。 */
  private async 提交(): Promise<void> {
    if (this.busy || this.audioBusy || this.confirmingClose || this.showingMasks || this.preview !== null || this.propertyMode !== '' || this.propertyBusy || this.pendingMapping !== null || this.fieldNames.length === 0) {
      return;
    }
    this.本地错误 = '';
    const savingImages: NoteFieldImage[] = this.images.slice();
    try {
      // 保存后的导航由页面唯一持有，不能再触发取消回调导致二次 pop。
      const saved: boolean = await this.onSave(this.fieldValues.slice(), this.解析标签(), savingImages, this.audios.slice());
      if (saved || this.disposed) this.cleanupDrawingImages(savingImages);
    } catch (_错误) {
      // 父级通过 errorMessage 提供本地化错误文案；草稿保留
      if (this.disposed) this.cleanupDrawingImages(savingImages);
    }
  }

  private async requestClose(): Promise<void> {
    if (this.keyboardHelpOpen) { this.keyboardHelpOpen = false; return; }
    if (this.propertyMode !== '') { if (this.propertyMode === 'templates') this.propertyBack++; else if (!this.propertyBusy) this.propertyMode = ''; return; }
    if (this.preview !== null) return;
    if (this.busy || this.audioBusy || this.confirmingClose || this.disposed) return;
    if (this.showingMasks) { this.masksBackRequest++; return; }
    if (this.images.length === 0 && this.audios.length === 0 && !noteDraftChanged(this.fieldValues, this.initialFieldValues, this.tags, this.initialTags)) {
      this.onCancel(); return;
    }
    this.confirmingClose = true;
    const discard: boolean = await confirmNoteDiscard(this.getUIContext());
    if (this.disposed) return;
    this.confirmingClose = false;
    if (discard && !this.disposed && !this.busy) this.onCancel();
    else this.onCloseCancelled();
  }
  private handleEditorKey(event: KeyEvent): boolean {
    const fresh: boolean = this.keyboardSession.update(event.keyCode, event.type === KeyType.Down);
    if (event.type !== KeyType.Down) return false;
    const chord: string = studyEventChord(event);
    if (this.keyboardHelpOpen) { if (fresh && chord === 'escape') this.keyboardHelpOpen = false; return true; }
    if (this.propertyMode !== '') return false;
    const command: string = editorShortcutCommand(chord, this.disposed || this.busy || this.audioBusy ||
      this.confirmingClose || this.showingMasks || this.preview !== null || this.propertyBusy || this.pendingMapping !== null);
    if (command === '') {
      if (fresh && chord === 'escape') { this.requestClose(); return true; }
      return false;
    }
    if (!fresh) return true;
    if (command === 'save') this.提交();
    else if (command === 'preview') this.openPreview();
    else if (command === 'tags') this.tagsFocusRequest++;
    else if (command.startsWith('field_')) { this.focusedField = Number(command.slice(6)); this.fieldFocusRequest++; }
    else this.openProperty(command);
    return true;
  }
  private async openProperty(mode: string): Promise<void> {
    if (this.note === null || this.disposed || this.busy || this.audioBusy || this.confirmingClose ||
      this.preview !== null || this.propertyBusy || this.propertyMode !== '' || this.pendingMapping !== null) return;
    this.audioPreview.stop().catch((): void => {});
    if (mode === 'deck') {
      this.propertyBusy = true;
      try { const tree = await this.properties.decks(); if (!this.disposed) this.deckTree = tree; }
      catch (error) { if (!this.disposed) this.本地错误 = resourceText(this.getUIContext(), $r('app.string.browser_action_deck_error')); return; }
      finally { if (!this.disposed) this.propertyBusy = false; }
    }
    if (!this.disposed) this.propertyMode = mode;
  }
  private async moveDeck(id: number): Promise<void> {
    if (this.note === null || this.propertyBusy || this.busy || this.disposed) return;
    this.propertyBusy = true;
    const saved: boolean = await this.properties.move(this.note, id);
    if (this.disposed) return;
    this.propertyBusy = false;
    if (saved) this.propertyMode = '';
    else this.本地错误 = resourceText(this.getUIContext(), $r('app.string.browser_action_deck_error'));
  }
  private async changeType(input: 变更笔记类型请求): Promise<void> {
    if (this.note === null || this.propertyBusy || this.busy || this.disposed) return;
    this.propertyBusy = true;
    const mapping: number[] = input.newFields.slice();
    const saved: boolean = await this.properties.changeType(this.note, input);
    if (this.disposed) return;
    this.propertyBusy = false;
    if (!saved) { this.本地错误 = resourceText(this.getUIContext(), $r('app.string.browser_action_deck_error')); return; }
    this.propertyMode = ''; this.pendingMapping = mapping;
    await this.reloadProperties();
  }
  private async reloadProperties(): Promise<void> {
    if (this.propertyBusy || this.disposed) return;
    this.propertyBusy = true;
    const state: NoteEditorState | null = await this.onReload();
    if (this.disposed) return;
    this.propertyBusy = false;
    if (state === null) { this.本地错误 = resourceText(this.getUIContext(), $r('app.string.browser_detail_load_error')); return; }
    if (this.pendingMapping !== null) {
      const mapping: number[] = this.pendingMapping;
      this.fieldValues = mapEditorFields(this.fieldValues, mapping);
      const removedImages = this.images.filter((item: NoteFieldImage): boolean => !mapping.includes(item.fieldIndex));
      const removedAudios = this.audios.filter((item: NoteFieldAudio): boolean => !mapping.includes(item.fieldIndex));
      this.images = mapEditorImages(this.images, mapping); this.audios = mapEditorAudios(this.audios, mapping);
      this.nextImageId = this.images.length; this.nextAudioId = this.audios.length;
      this.cleanupDrawingImages(removedImages); discardNoteRecordings(removedAudios).catch((): void => {});
      this.pendingMapping = null;
    }
    this.本地错误 = ''; this.publishInterface();
  }

  private openPreview(_locale: string = this.uiLanguage): void {
    if (this.disposed || this.preview !== null || this.showingMasks || this.busy || this.audioBusy || this.confirmingClose || this.note === null) return;
    this.audioPreview.stop().catch((): void => {});
    const input: NoteDraftPreviewInput = { notetypeId: this.note.notetypeId, note: this.note,
      fields: this.fieldValues.slice(), tags: this.解析标签(), images: this.images.slice(), audios: this.audios.slice() };
    this.preview = JSON.parse(JSON.stringify(input)) as NoteDraftPreviewInput;
    if (!this.onPreview(this.preview, (): void => { if (!this.disposed) this.preview = null; })) {
      this.preview = null;
      this.本地错误 = resourceText(this.getUIContext(), $r('app.string.browser_preview_load_error'));
    }
  }
  private restoreAfterPreview(): void {
    this.preview = null;
  }

  private openMasks(_locale: string = this.uiLanguage): void {
    if (this.busy || this.audioBusy || this.confirmingClose || this.imageOcclusionFields.length !== 4) return;
    const imageField: number = this.imageOcclusionFields[1];
    const image: NoteMediaPart | undefined = noteMediaParts(this.fieldValues[imageField] ?? '')
      .find((part: NoteMediaPart): boolean => part.kind === 'image');
    if (image === undefined) { this.本地错误 = resourceText(this.getUIContext(), $r('app.string.note_image_preview_failed')); return; }
    const pending: NoteFieldImage | undefined = this.images.find((item: NoteFieldImage): boolean => item.fieldIndex === imageField && item.reference === image.text);
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    this.maskImageSource = pending?.uri ?? noteImagePreviewSource(context.filesDir, image.filename);
    if (this.maskImageSource === '') { this.本地错误 = resourceText(this.getUIContext(), $r('app.string.note_image_preview_failed')); return; }
    this.maskSource = this.fieldValues[this.imageOcclusionFields[0]] ?? '';
    this.maskDraft = parseOcclusionMasks(this.maskSource);
    this.showingMasks = true;
  }

  private confirmMasks(masks: 遮罩描述[]): void {
    if (this.disposed || this.busy || !this.showingMasks || this.imageOcclusionFields.length !== 4) return;
    this.更新字段(this.imageOcclusionFields[0], serializeOcclusionDocument(this.maskSource, masks));
    this.showingMasks = false;
  }

  build() {
    Stack() {
    Column() {
      if (this.showingMasks) {
        图片遮罩编辑器({ 源图Uri: this.maskImageSource, initialMasks: this.maskDraft, 是否深色: this.isDark, backRequest: this.masksBackRequest,
          onCancel: (): void => { this.showingMasks = false; },
          onConfirm: (masks: 遮罩描述[]): void => { this.confirmMasks(masks); } })
      } else {
      NoteEditorHeader({ title: $r('app.string.note_editor_edit_title'), showKeyboardHelp: true,
        onKeyboardHelp: (): void => { this.keyboardHelpOpen = true; },
        actionLabel: $r('app.string.note_draft_preview'),
        actionEnabled: !this.busy && !this.audioBusy && !this.confirmingClose && this.note !== null,
        closeEnabled: this.interfaceEnabled('back'),
        onBack: (): void => { this.requestClose(); }, onSave: (): void => { this.openPreview(); } })
      Scroll(this.tagsReveal.scroller) {
        Column({ space: 应用尺寸.页面分组间距(this.narrow) }) {
          Row({ space: 应用尺寸.间距_8 }) {
            AnchoredMenuItem({ label: $r('app.string.add_note_deck'), disclosure: true,
              available: this.interfaceEnabled('deck'), onSelect: (): void => { this.openProperty('deck'); } }).layoutWeight(1)
            AnchoredMenuItem({ label: $r('app.string.add_note_notetype'), disclosure: true,
              available: this.interfaceEnabled('notetype'), onSelect: (): void => { this.openProperty('notetype'); } }).layoutWeight(1)
            AnchoredMenuItem({ label: $r('app.string.notetype_editor_templates'), disclosure: true,
              available: this.interfaceEnabled('templates'), onSelect: (): void => { this.openProperty('templates'); } }).layoutWeight(1)
          }.width('100%')
          if (this.pendingMapping !== null) {
            Button($r('app.string.common_retry')).attributeModifier(new PressFeedback()).stateEffect(false).onClick((): void => { this.reloadProperties(); })
          }

          if (this.imageOcclusionFields.length === 4) {
            Button($r('app.string.add_note_image_occlusion_edit_masks')).attributeModifier(new PressFeedback())
              .stateEffect(false).enabled(!this.busy && !this.audioBusy && !this.confirmingClose)
              .onClick((): void => { this.openMasks(); })
          }
          ForEach(this.fieldNames, (name: string, index: number) => {
            NoteFieldCard({ fieldName: name, fieldIndex: index, focusRequest: this.focusedField === index ? this.fieldFocusRequest : 0, originalStockKind: this.originalStockKind, value: this.fieldValues[index] ?? '',
              fieldConfig: this.fieldConfigs[index] ?? null,
              disabled: this.busy || this.audioBusy || this.confirmingClose || this.propertyBusy || this.pendingMapping !== null || this.propertyMode !== '' || this.keyboardHelpOpen,
              reverseToggle: index === this.optionalReverseFieldOrd, editing: true,
              isDark: this.isDark, accent: this.主色按钮背景,
              clozeEnabled: this.clozeFieldOrds.indexOf(index) >= 0, allFields: this.fieldValues,
              images: this.images.filter((item: NoteFieldImage): boolean => item.fieldIndex === index),
              audios: this.audios.filter((item: NoteFieldAudio): boolean => item.fieldIndex === index),
              audioPreview: this.audioPreview,
              onMediaApply: (value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]): void => {
                this.applyFieldMedia(index, value, images, audios);
              },
              onAudioBusy: (busy: boolean): void => { this.audioBusy = busy; },
              onAudioStatus: (status: NoteAudioStatus | null): void => { this.publishAudioStatus(status); },
              onRemoveAudio: (id: number): void => {
                const removed: NoteFieldAudio[] = this.audios.filter((item: NoteFieldAudio): boolean => item.id === id);
                this.audios = this.audios.filter((item: NoteFieldAudio): boolean => item.id !== id);
                discardNoteRecordings(removed).catch((): void => {});
              },
              onChange: (value: string): void => { this.更新字段(index, value); },
              onRemoveImage: (id: number): void => {
                this.cleanupDrawingImages(this.images.filter((image: NoteFieldImage): boolean => image.id === id));
                this.images = this.images.filter((image: NoteFieldImage): boolean => image.id !== id);
              } })
          }, (name: string, index: number): string => `${index}-${name}`)
          Column({ space: 应用尺寸.间距_8 }) {
            Text(this.interfaceLabel('tags')).fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary')).width('100%')
            NoteTagsField({ text: this.tags, focusRequest: this.tagsFocusRequest, scroller: this.tagsReveal.scroller, isInteractive: this.interfaceEnabled('tags'),
              onChange: (value: string): void => { this.tags = value; } })
          }.width('100%')
        }.width('100%')
      }.width('100%').layoutWeight(1).scrollBar(BarState.Auto).edgeEffect(EdgeEffect.Spring)
        .align(Alignment.TopStart)
        .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.页面内容顶部间距(this.narrow) })
      if (this.errorMessage !== '' || this.本地错误 !== '') {
        Text(this.errorMessage !== '' ? this.errorMessage : this.本地错误)
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text'))
          .width('100%').maxLines(3).padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平 })
      }
      Row() {
        PrimaryActionButton({ label: this.interfaceLabel('save'), tint: this.主色按钮背景,
          feedback: this.busy ? 'busy' : this.errorMessage !== '' ? 'failure' : 'idle',
          isInteractive: this.interfaceEnabled('save'), onAction: (): void => { this.提交(); } })
      }.width('100%').flexShrink(0).padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.操作区顶部间距(this.narrow),
        bottom: 应用尺寸.操作区底部间距(this.narrow, this.navigationBarHeight) })
      }
    }.width('100%').height('100%').backgroundColor(this.pageSurface)
      if (this.propertyMode === 'deck') {
        BrowserDeckDialog({ 牌组树: this.deckTree, busy: this.propertyBusy, isDark: this.isDark,
          onClose: (): void => { if (!this.propertyBusy) this.propertyMode = ''; }, onSubmit: (id: number): void => { this.moveDeck(id); } })
      }
      if (this.propertyMode === 'notetype' && this.note !== null) {
        BrowserNotetypeFeature({ firstId: this.note.id, notes: true, busy: this.propertyBusy, isDark: this.isDark,
          onClose: (): void => { if (!this.propertyBusy) this.propertyMode = ''; },
          onSubmit: (input: 变更笔记类型请求): void => { this.changeType(input); } })
      }
      if (this.propertyMode === 'templates' && this.note !== null) {
        笔记类型编辑器({ notetypeId: this.note.notetypeId, templatesOnly: true, backRequest: this.propertyBack, isDark: this.isDark,
          onClose: (): void => { this.propertyMode = ''; }, onSaved: (): void => { this.propertyMode = ''; this.reloadProperties(); } })
      }
      if (this.keyboardHelpOpen) {
        KeyboardShortcutHelp({ scope: 'editor', shortcuts: EDITOR_SHORTCUTS.concat(FIELD_SHORTCUTS),
          onClose: (): void => { this.keyboardHelpOpen = false; } })
      }
    }.width('100%').height('100%')
      .onKeyPreIme((event: KeyEvent): boolean => this.handleEditorKey(event))
      .onKeyEvent((event: KeyEvent): void => { event.stopPropagation(); })
  }
}
