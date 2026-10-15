import { KeyboardShortcutHelp } from '../KeyboardShortcutHelp';
import { TEMPLATE_SHORTCUTS, shortcutCommand } from '../../model/KeyboardShortcuts';
import { StudyKeyboardSession } from '../../model/StudyKeyboard';
import { studyEventChord } from '../../utils/StudyKeyAdapter';
import { IconActionButton } from '../common/IconActionButton';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { LengthMetrics } from '@kit.ArkUI';
import { NoteDraftPreview } from '../common/NoteDraftPreview';
import { NoteDraftPreviewInput } from '../../model/NoteDraftPreview';
import { confirmNoteDiscard } from '../../utils/ConfirmNoteDiscard';
import { notetypeImpactText } from '../../utils/NotetypeImpactText';
import { 按下态按钮 } from '../common/按下态按钮';
import { NotetypeTemplateDraft as 模板项, serializeNotetypeTemplates, previewFieldsUnchanged,
  NotetypeOperationSession, notetypeStructureChanges } from '../../model/NotetypeManagement';
import { DialogFrame } from '../common/DialogFrame';
import { AnchoredMenuItem } from '../common/MenuItem';
import { showToastSafely, resourceText } from '../../utils/UiFeedback';
import { FormSelectRow } from '../common/FormSelectRow';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-NOTETYPE-EDITOR-001
// @名称 笔记类型编辑器
//
// @作用
// 编辑单个笔记类型：名称 + 字段（增删改排序）+ 模板（名称/正面/背面）+ CSS。
// 走 GetNotetypeLegacy → 编辑 JSON → UpdateNotetypeLegacy 路径。
// 对应 Anki 桌面端「管理笔记类型 → 选中类型 → 字段/卡片」标签页。
//
// @输入
// isDark: 是否深色主题
// notetypeId: 待编辑的笔记类型 ID
// notetypeName: 笔记类型名（初始展示用）
// onClose: 关闭回调
// onSaved: 保存成功回调
//
// @输出
// 渲染编辑浮卡面板；用户点保存时调后端 RPC。
//
// @业务规则
// - 加载时调 获取笔记类型旧版 取完整 JSON，解析出 flds/tmpls/css/name
// - 保存时把编辑后的值写回 JSON，调 更新笔记类型旧版 整体提交
// - 保留 JSON 中未编辑的字段（media/sticky/font/reqs 等）不动
// - 字段令牌（{{字段名}}）点击插入到当前模板编辑区
// - 所有用户可见文案走 $r('app.string.notetype_editor_*')
//
// @副作用
// 持有 笔记类型服务 实例；点击保存时调后端 RPC。
// ========================================================

import { 笔记类型服务 } from '../../backend/笔记类型服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';

import { NotetypeFieldDraft as 字段项, serializeNotetypeFields } from '../../model/NotetypeFieldDraft';

interface EditableNotetypeField extends 字段项 { draftId: number; }
interface TemplateSelection { start: number; end: number; }

@Component
export struct 笔记类型编辑器 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (this.keyboardHelpOpen) this.keyboardHelpOpen = false; else this.requestClose();
  }

  @Prop isDark: boolean = false;
  @Prop notetypeId: number = 0;
  @Prop templatesOnly: boolean = false;
  @State private keyboardHelpOpen: boolean = false;
  private readonly keyboardSession: StudyKeyboardSession = new StudyKeyboardSession();
  @Prop notetypeName: string = '';
  onClose: () => void = (): void => {};
  onSaved: () => void = (): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 加载中: boolean = false;
  @State private 保存中: boolean = false;
  @State private 错误信息: string = '';
  @State private 类型名: string = '';
  @State private 字段列表: EditableNotetypeField[] = [];
  @State private 模板列表: 模板项[] = [];
  @State private 当前模板索引: number = 0;
  @State private CSS文本: string = '';
  @State private fieldsExpanded: boolean = false;
  @State private templatesExpanded: boolean = false;
  @State private stylesExpanded: boolean = false;
  @State private 原始JSON: string = '';
  @State private isCloze: boolean = false;
  @State private preview: NoteDraftPreviewInput | null = null;
  @State private previewBusy: boolean = false;
  @State private confirmingSave: boolean = false;
  @State private confirmingClose: boolean = false;
  private baselineDraft: string = '';
  private mounted: boolean = true;
  private readVersion: number = 0;
  private nextFieldId: number = 0;
  private templateFace: string = 'front';
  private frontSelection: TemplateSelection = { start: -1, end: -1 };
  private backSelection: TemplateSelection = { start: -1, end: -1 };
  private readonly frontController: TextAreaController = new TextAreaController();
  private readonly backController: TextAreaController = new TextAreaController();
  private templateInsertionVersion: number = 0;

  private readonly 服务: 笔记类型服务 = new 笔记类型服务();
  private readonly writes: NotetypeOperationSession = new NotetypeOperationSession(this.服务, (): void => {
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
    AppStorage.setOrCreate<number>('cardContentChangedTick', Date.now());
  });

  aboutToAppear(): void {
    this.mounted = true;
    this.类型名 = this.notetypeName;
    this.templatesExpanded = this.templatesOnly;
    this.加载JSON();
  }

  aboutToDisappear(): void { this.mounted = false; this.readVersion++; this.writes.dispose(); }

  private 取本地化文本(资源: Resource, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private async 加载JSON(): Promise<void> {
    const version = ++this.readVersion;
    this.加载中 = true;
    this.错误信息 = '';
    try {
      const json: string = await this.服务.获取笔记类型旧版(this.notetypeId);
      if (!this.mounted || version !== this.readVersion) return;
      this.原始JSON = json;
      this.解析JSON(json);
      this.baselineDraft = this.序列化JSON();
    } catch (error) {
      if (this.mounted && version === this.readVersion) this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (this.mounted && version === this.readVersion) this.加载中 = false;
    }
  }

  private 解析JSON(json: string): void {
    try {
      const obj: Record<string, Object> = JSON.parse(json) as Record<string, Object>;
      this.isCloze = obj['type'] === 1;
      // 名称
      const name: Object | undefined = obj['name'];
      if (typeof name === 'string') {
        this.类型名 = name;
      }
      // CSS
      const css: Object | undefined = obj['css'];
      if (typeof css === 'string') {
        this.CSS文本 = css;
      }
      // 字段
      const flds: Object | undefined = obj['flds'];
      if (Array.isArray(flds)) {
        const 列表: EditableNotetypeField[] = [];
        for (let i = 0; i < flds.length; i++) {
          const f: Record<string, Object> = flds[i] as Record<string, Object>;
          const fname: Object | undefined = f['name'];
          const ford: Object | undefined = f['ord'];
          列表.push({
            draftId: this.nextFieldId++,
            ord: typeof ford === 'number' ? ford : i,
            name: typeof fname === 'string' ? fname : ''
          });
        }
        列表.sort((a: EditableNotetypeField, b: EditableNotetypeField): number => (a.ord ?? 0) - (b.ord ?? 0));
        this.字段列表 = 列表;
      }
      // 模板
      const tmpls: Object | undefined = obj['tmpls'];
      if (Array.isArray(tmpls)) {
        const 列表: 模板项[] = [];
        for (let i = 0; i < tmpls.length; i++) {
          const t: Record<string, Object> = tmpls[i] as Record<string, Object>;
          const tname: Object | undefined = t['name'];
          const tqfmt: Object | undefined = t['qfmt'];
          const tafmt: Object | undefined = t['afmt'];
          const tord: Object | undefined = t['ord'];
          列表.push({
            ord: typeof tord === 'number' ? tord : i,
            name: typeof tname === 'string' ? tname : '',
            qfmt: typeof tqfmt === 'string' ? tqfmt : '',
            afmt: typeof tafmt === 'string' ? tafmt : ''
          });
        }
        列表.sort((a: 模板项, b: 模板项): number => (a.ord ?? 0) - (b.ord ?? 0));
        this.模板列表 = 列表;
        this.当前模板索引 = 0;
        this.resetTemplateSelection();
      }
    } catch (error) {
      this.错误信息 = this.取本地化文本($r('app.string.notetype_editor_parse_error'));
    }
  }

  private 序列化JSON(): string {
    try {
      const obj: Record<string, Object> = JSON.parse(this.原始JSON) as Record<string, Object>;
      // 更新名称
      obj['name'] = this.类型名;
      // 更新 CSS
      obj['css'] = this.CSS文本;
      // 更新字段（保留原始字段对象，只改 name 和 ord）
      const 原flds: Object | undefined = obj['flds'];
      if (Array.isArray(原flds)) {
        obj['flds'] = serializeNotetypeFields(原flds, this.字段列表);
      }
      // 更新模板（保留原始模板对象，只改 name/qfmt/afmt/ord）
      const 原tmpls: Object | undefined = obj['tmpls'];
      if (Array.isArray(原tmpls)) {
        obj['tmpls'] = serializeNotetypeTemplates(原tmpls, this.模板列表);
      }
      return JSON.stringify(obj);
    } catch (error) {
      throw error instanceof Error ? error : new Error(`${error}`);
    }
  }

  private async 保存(): Promise<void> {
    if (!this.mounted || this.保存中 || this.confirmingSave || this.confirmingClose || this.preview !== null || this.加载中 || this.previewBusy || this.原始JSON === '') {
      return;
    }
    this.错误信息 = '';
    try {
      const json: string = this.序列化JSON();
      const changes = notetypeStructureChanges(this.原始JSON, json);
      this.confirmingSave = true;
      const impact = changes.length === 0 ? null : await this.服务.impact(this.notetypeId, this.原始JSON, json);
      if (!this.mounted) return;
      if (impact !== null) {
        this.confirmingSave = true;
        const result = await this.getUIContext().getPromptAction().showDialog({
          title: this.取本地化文本($r('app.string.notetype_impact_title')),
          message: notetypeImpactText(this.getUIContext(), impact, changes),
          buttons: [{ text: this.取本地化文本($r('app.string.cancel')), color: '#666666' },
            { text: this.取本地化文本($r('app.string.notetype_editor_save')), color: this.主色按钮背景 }] });
        const confirmed = result.index === 1;
        this.confirmingSave = false;
        if (!confirmed || !this.mounted || json !== this.序列化JSON()) return;
      }
      this.保存中 = true;
      if (!await this.writes.save(this.notetypeId, this.原始JSON, json, impact) || !this.mounted) return;
      showToastSafely(this.getUIContext(), {
        message: this.取本地化文本($r('app.string.notetype_editor_saved')),
        duration: 2000
      });
      this.onSaved();
      this.onClose();
    } catch (error) {
      if (this.mounted) this.错误信息 = error instanceof Error ?
        (error.message === 'notetype_changed' ? this.取本地化文本($r('app.string.notetype_changed')) :
          error.message === 'notetype_impact_changed' ? this.取本地化文本($r('app.string.notetype_impact_changed')) : error.message) : `${error}`;
    } finally {
      if (this.mounted) { this.保存中 = false; this.confirmingSave = false; }
    }
  }

  private async requestClose(): Promise<void> {
    if (this.preview !== null) { this.preview = null; return; }
    if (!this.mounted || this.保存中 || this.previewBusy || this.confirmingSave || this.confirmingClose) return;
    if (this.原始JSON === '' || this.序列化JSON() === this.baselineDraft) { this.onClose(); return; }
    this.confirmingClose = true;
    try { if (await confirmNoteDiscard(this.getUIContext()) && this.mounted) this.onClose(); }
    finally { if (this.mounted) this.confirmingClose = false; }
  }

  // 字段操作
  private 添加字段(): void {
    this.字段列表.push({ draftId: this.nextFieldId++, ord: null, name: '' });
    // ArkUI @State 数组 push 后需要触发刷新
    this.字段列表 = [...this.字段列表];
  }

  private 删除字段(索引: number): void {
    if (索引 < 0 || 索引 >= this.字段列表.length) return;
    if (this.字段列表.length <= 1) {
      this.错误信息 = this.取本地化文本($r('app.string.notetype_editor_last_field'));
      return;
    }
    this.字段列表.splice(索引, 1);
    // 保留原 ord，数组位置才是新的显示顺序。
    this.字段列表 = [...this.字段列表];
  }

  private 上移字段(索引: number): void {
    if (索引 <= 0 || 索引 >= this.字段列表.length) {
      return;
    }
    const 临时: EditableNotetypeField = this.字段列表[索引 - 1];
    this.字段列表[索引 - 1] = this.字段列表[索引];
    this.字段列表[索引] = 临时;
    this.字段列表 = [...this.字段列表];
  }

  private 下移字段(索引: number): void {
    if (索引 < 0 || 索引 >= this.字段列表.length - 1) {
      return;
    }
    const 临时: EditableNotetypeField = this.字段列表[索引 + 1];
    this.字段列表[索引 + 1] = this.字段列表[索引];
    this.字段列表[索引] = 临时;
    this.字段列表 = [...this.字段列表];
  }

  private fieldIndex(id: number): number {
    return this.字段列表.findIndex((field: EditableNotetypeField): boolean => field.draftId === id);
  }

  private fieldName(id: number): string {
    const index: number = this.fieldIndex(id);
    return index < 0 ? '' : this.字段列表[index].name;
  }

  private updateFieldName(id: number, name: string): void {
    const index: number = this.fieldIndex(id);
    if (index < 0) return;
    const field: EditableNotetypeField = this.字段列表[index];
    this.字段列表[index] = { draftId: field.draftId, ord: field.ord, name: name };
    this.字段列表 = [...this.字段列表];
  }

  private resetTemplateSelection(): void {
    this.templateInsertionVersion++;
    this.frontSelection = { start: -1, end: -1 };
    this.backSelection = { start: -1, end: -1 };
  }

  private selectTemplate(index: number): void {
    if (index < 0 || index >= this.模板列表.length) return;
    this.当前模板索引 = index;
    this.resetTemplateSelection();
  }

  private templateSelection(face: string, start: number, end: number): void {
    const selection: TemplateSelection = { start: start, end: end };
    if (face === 'back') this.backSelection = selection;
    else this.frontSelection = selection;
  }

  private insertFieldToken(name: string): void {
    if (!this.mounted || this.加载中 || this.保存中 || this.confirmingSave || this.confirmingClose ||
      this.preview !== null || this.previewBusy || this.模板列表.length === 0) return;
    const template: 模板项 = this.当前模板();
    const face: string = this.templateFace;
    const text: string = face === 'back' ? template.afmt : template.qfmt;
    const selection: TemplateSelection = face === 'back' ? this.backSelection : this.frontSelection;
    const unset: boolean = selection.start < 0 && selection.end < 0;
    const start: number = unset ? text.length : Math.min(text.length, Math.max(0, Math.min(selection.start, selection.end)));
    const end: number = unset ? start : Math.min(text.length, Math.max(start, Math.max(selection.start, selection.end)));
    const token: string = `{{${name}}}`;
    const result: string = text.slice(0, start) + token + text.slice(end);
    if (face === 'back') this.更新背面模板(result);
    else this.更新正面模板(result);
    const caret: number = start + token.length;
    const version: number = ++this.templateInsertionVersion;
    this.templateSelection(face, caret, caret);
    // 状态应用到原生输入框后恢复光标；切换模板或离开后忽略旧回调。
    setTimeout((): void => {
      if (!this.mounted || version !== this.templateInsertionVersion || this.当前模板() !== template || this.templateFace !== face ||
        (face === 'back' ? template.afmt : template.qfmt) !== result) return;
      try { (face === 'back' ? this.backController : this.frontController).caretPosition(caret); } catch (error) {}
    }, 0);
  }

  // 模板操作
  private addTemplate(): void {
    if (!this.mounted || this.isCloze || this.保存中 || this.confirmingSave || this.confirmingClose || this.preview !== null || this.previewBusy) return;
    const current = this.当前模板();
    this.模板列表 = this.模板列表.concat([{ ord: null, name: this.取本地化文本($r('app.string.notetype_new_template')),
      qfmt: current.qfmt, afmt: current.afmt, sourceOrd: current.ord ?? current.sourceOrd }]);
    this.当前模板索引 = this.模板列表.length - 1;
    this.resetTemplateSelection();
  }

  private removeTemplate(): void {
    if (!this.mounted || this.isCloze || this.保存中 || this.confirmingSave || this.confirmingClose || this.preview !== null || this.previewBusy) return;
    if (this.模板列表.length <= 1) {
      this.错误信息 = this.取本地化文本($r('app.string.notetype_last_template')); return;
    }
    const index = this.当前模板索引;
    const template: 模板项 = this.模板列表[index];
    let settled: boolean = false;
    this.getUIContext().showAlertDialog({ title: this.取本地化文本($r('app.string.notetype_remove_template')),
      message: this.取本地化文本($r('app.string.notetype_remove_template_hint')),
      cancel: (): void => { settled = true; },
      primaryButton: { value: this.取本地化文本($r('app.string.cancel')), action: (): void => { settled = true; } },
      secondaryButton: { value: this.取本地化文本($r('app.string.notetype_mgmt_delete')), action: (): void => {
        if (settled) return;
        settled = true;
        if (!this.mounted || this.保存中 || this.confirmingSave || this.confirmingClose || this.preview !== null ||
          this.模板列表.length <= 1 || this.模板列表[index] !== template || index !== this.当前模板索引) return;
        this.模板列表.splice(index, 1); this.模板列表 = this.模板列表.slice();
        this.当前模板索引 = Math.min(index, this.模板列表.length - 1);
        this.resetTemplateSelection();
      } } });
  }

  private async previewTemplate(): Promise<void> {
    if (!this.mounted || this.保存中 || this.confirmingSave || this.confirmingClose || this.previewBusy || this.原始JSON === '') return;
    if (!previewFieldsUnchanged(this.原始JSON, this.字段列表)) {
      this.错误信息 = this.取本地化文本($r('app.string.notetype_preview_save_fields')); return;
    }
    const original = JSON.parse(this.原始JSON) as Record<string, Object>;
    const templates = serializeNotetypeTemplates(original['tmpls'] as Object[], this.模板列表);
    this.preview = { notetypeId: this.notetypeId, fields: this.字段列表.map((_field: 字段项): string => ''),
      tags: [], images: [], audios: [], templateJson: JSON.stringify(templates[this.当前模板索引]),
      css: this.CSS文本, ordinal: this.当前模板索引, sample: true };
  }

  private moveTemplate(direction: number): void {
    const target = this.当前模板索引 + direction;
    if (!this.mounted || this.isCloze || this.保存中 || this.confirmingSave || this.confirmingClose || this.preview !== null || this.previewBusy || target < 0 || target >= this.模板列表.length) return;
    const templates = this.模板列表.slice();
    const old = templates[target]; templates[target] = templates[this.当前模板索引]; templates[this.当前模板索引] = old;
    this.模板列表 = templates; this.当前模板索引 = target;
  }

  private 当前模板(): 模板项 {
    if (this.当前模板索引 < 0 || this.当前模板索引 >= this.模板列表.length) {
      return { ord: 0, name: '', qfmt: '', afmt: '' };
    }
    return this.模板列表[this.当前模板索引];
  }

  private 更新模板名(名: string): void {
    if (this.当前模板索引 < 0 || this.当前模板索引 >= this.模板列表.length) {
      return;
    }
    const t: 模板项 = this.模板列表[this.当前模板索引];
    t.name = 名;
    this.模板列表 = [...this.模板列表];
  }

  private 更新正面模板(文: string): void {
    if (this.当前模板索引 < 0 || this.当前模板索引 >= this.模板列表.length) {
      return;
    }
    const t: 模板项 = this.模板列表[this.当前模板索引];
    t.qfmt = 文;
    this.模板列表 = [...this.模板列表];
  }

  private 更新背面模板(文: string): void {
    if (this.当前模板索引 < 0 || this.当前模板索引 >= this.模板列表.length) {
      return;
    }
    const t: 模板项 = this.模板列表[this.当前模板索引];
    t.afmt = 文;
    this.模板列表 = [...this.模板列表];
  }

  @Builder
  private 字段行(字段: EditableNotetypeField) {
    Row({ space: 应用尺寸.间距_4 }) {
      TextInput({ text: this.fieldName(字段.draftId) })
        .fontSize(应用尺寸.字号_正文_小)
        .height(应用尺寸.按钮高度)
        .backgroundColor($r('app.color.surface_card'))
        .border(SurfaceBorder.options())
        .borderRadius(应用尺寸.圆角_面板)
        .layoutWeight(1)
        .onChange((值: string) => { this.updateFieldName(字段.draftId, 值); })
      IconActionButton({ source: $r('app.media.ic_common_arrow_up'), label: $r('app.string.icon_field_up'),
        glyphColor: this.主色按钮背景, isInteractive: this.fieldIndex(字段.draftId) > 0,
        onAction: (): void => { this.上移字段(this.fieldIndex(字段.draftId)); } })
      IconActionButton({ source: $r('app.media.ic_common_arrow_down'), label: $r('app.string.icon_field_down'),
        glyphColor: this.主色按钮背景, isInteractive: this.fieldIndex(字段.draftId) < this.字段列表.length - 1,
        onAction: (): void => { this.下移字段(this.fieldIndex(字段.draftId)); } })
      IconActionButton({ source: $r('app.media.ic_study_delete'), label: $r('app.string.icon_field_delete'),
        iconFill: $r('app.color.error_text'),
        onAction: (): void => { this.删除字段(this.fieldIndex(字段.draftId)); } })
    }
    .width('100%')
  }

  @Builder
  private 字段令牌行(id: number) {
    按下态按钮({ 文案: `{{${this.fieldName(id)}}}`, 字号: 应用尺寸.字号_正文_小,
      themeText: true, 字色: this.主色按钮背景, preserveInputFocus: true,
      点击回调: (): void => { this.insertFieldToken(this.fieldName(id)); } })
  }

  @Builder
  private dialogHeader() {
    DialogHeader({
      title: $r('app.string.notetype_editor_title'), showHelp: true,
      onHelp: (): void => { this.keyboardHelpOpen = true; },
      showActionLabel: this.保存中, actionLabel: this.保存中 ? $r('app.string.notetype_editor_saving') : $r('app.string.notetype_editor_save'),
      actionEnabled: !this.加载中 && !this.保存中 && !this.previewBusy && this.原始JSON !== '',
      closeLabel: $r('app.string.create_deck_cancel'),
      closeEnabled: !this.保存中 && !this.confirmingSave && !this.confirmingClose,
      onClose: (): void => { this.requestClose(); },
      onAction: () => { this.保存(); }
    })
  }

  @Builder
  private dialogContent() {
    Column({ space: 应用尺寸.间距_12 }) {
      // 加载中
      if (this.加载中) {
        Row({ space: 应用尺寸.间距_8 }) {
          LoadingProgress()
            .width(20)
            .height(20)
            .color($r('app.color.text_secondary'))
          Text($r('app.string.notetype_editor_loading'))
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

      if (!this.加载中) {
        if (!this.templatesOnly) {
        // === 名称区 ===
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.notetype_editor_name'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          TextInput({ text: this.类型名 })
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .backgroundColor($r('app.color.surface_card'))
            .border(SurfaceBorder.options())
            .borderRadius(应用尺寸.圆角_面板)
            .onChange((值: string) => { this.类型名 = 值; })
        }
        .width('100%')

        AnchoredMenuItem({
          label: $r('app.string.notetype_editor_fields'),
          labelAlignment: TextAlign.Start,
          disclosure: true,
          expanded: this.fieldsExpanded,
          available: !this.保存中,
          onSelect: (): void => { this.fieldsExpanded = !this.fieldsExpanded; }
        })
        if (this.fieldsExpanded) {
          // === 字段区 ===
          Column({ space: 应用尺寸.间距_5 }) {
            Row() {
              按下态按钮({ 文案: $r('app.string.notetype_editor_add_field'), themeText: true,
                字色: this.主色按钮背景, 点击回调: (): void => { this.添加字段(); } })
            }
            .width('100%')

            ForEach(this.字段列表, (字段: EditableNotetypeField) => {
              this.字段行(字段)
            }, (字段: EditableNotetypeField): string => `${字段.draftId}`)
          }
          .width('100%')
        }

        }
        AnchoredMenuItem({
          label: $r('app.string.notetype_editor_templates'),
          labelAlignment: TextAlign.Start,
          disclosure: true,
          expanded: this.templatesExpanded,
          available: !this.保存中,
          onSelect: (): void => { this.templatesExpanded = !this.templatesExpanded; }
        })
        if (this.templatesExpanded) {
          // === 模板区 ===
          Column({ space: 应用尺寸.间距_5 }) {
            Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
              按下态按钮({ 文案: $r('app.string.notetype_template_up'), 是否启用: !this.isCloze && this.当前模板索引 > 0,
                点击回调: (): void => { this.moveTemplate(-1); } })
              按下态按钮({ 文案: $r('app.string.notetype_template_down'), 是否启用: !this.isCloze && this.当前模板索引 < this.模板列表.length - 1,
                点击回调: (): void => { this.moveTemplate(1); } })
              按下态按钮({ 文案: $r('app.string.notetype_add_template'),
                是否启用: !this.保存中 && !this.previewBusy && !this.isCloze,
                点击回调: (): void => { this.addTemplate(); } })
              按下态按钮({ 文案: $r('app.string.notetype_remove_template'), 字色: $r('app.color.error_text'),
                是否启用: !this.保存中 && !this.previewBusy && !this.isCloze && this.模板列表.length > 1,
                点击回调: (): void => { this.removeTemplate(); } })
              按下态按钮({ 文案: $r('app.string.notetype_template_preview'),
                是否启用: !this.保存中 && !this.previewBusy,
                点击回调: (): void => { this.previewTemplate(); } })
            }.width('100%')
            Text(this.isCloze ? $r('app.string.notetype_cloze_template_hint') : $r('app.string.notetype_template_change_hint'))
              .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
            if (this.previewBusy) { LoadingProgress().width(24).height(24) }
            // 模板选择器
            if (this.模板列表.length > 1) {
              FormSelectRow({ label: $r('app.string.notetype_current_template'),
                options: this.模板列表.map((t: 模板项): SelectOption => { return { value: t.name }; }),
                selectedIndex: this.当前模板索引, value: this.当前模板().name,
                isInteractive: !this.保存中 && !this.previewBusy,
                onSelect: (index: number): void => { this.selectTemplate(index); } })
            }

            // 模板名
            Text($r('app.string.notetype_editor_template_name'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
            TextInput({ text: this.当前模板().name })
              .height(应用尺寸.按钮高度)
              .fontSize(应用尺寸.字号_正文_小)
              .backgroundColor($r('app.color.surface_card'))
              .border(SurfaceBorder.options())
              .borderRadius(应用尺寸.圆角_面板)
              .onChange((值: string) => { this.更新模板名(值); })

            // 字段令牌（点击插入）
            if (this.字段列表.length > 0) {
              Text($r('app.string.notetype_editor_tokens'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
              Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
                ForEach(this.字段列表, (字段: EditableNotetypeField) => {
                  this.字段令牌行(字段.draftId)
                }, (字段: EditableNotetypeField): string => `${字段.draftId}`)
              }
              .width('100%')
            }

            // 正面模板
            Text($r('app.string.notetype_editor_front_template'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
            TextArea({ text: this.当前模板().qfmt, controller: this.frontController })
              .fontSize(应用尺寸.字号_正文_小)
              .backgroundColor($r('app.color.surface_card'))
              .border(SurfaceBorder.options())
              .borderRadius(应用尺寸.圆角_面板)
              .constraintSize({ minHeight: 80 })
              .width('100%')
              .onFocus((): void => { this.templateFace = 'front'; })
              .onTextSelectionChange((start: number, end: number): void => { this.templateSelection('front', start, end); })
              .onChange((值: string) => { this.更新正面模板(值); })

            // 背面模板
            Text($r('app.string.notetype_editor_back_template'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
            TextArea({ text: this.当前模板().afmt, controller: this.backController })
              .fontSize(应用尺寸.字号_正文_小)
              .backgroundColor($r('app.color.surface_card'))
              .border(SurfaceBorder.options())
              .borderRadius(应用尺寸.圆角_面板)
              .constraintSize({ minHeight: 80 })
              .width('100%')
              .onFocus((): void => { this.templateFace = 'back'; })
              .onTextSelectionChange((start: number, end: number): void => { this.templateSelection('back', start, end); })
              .onChange((值: string) => { this.更新背面模板(值); })
          }
          .width('100%')
        }

        AnchoredMenuItem({
          label: $r('app.string.notetype_editor_css'),
          labelAlignment: TextAlign.Start,
          disclosure: true,
          expanded: this.stylesExpanded,
          available: !this.保存中,
          onSelect: (): void => { this.stylesExpanded = !this.stylesExpanded; }
        })
        if (this.stylesExpanded) {
          // === CSS 区 ===
          Column({ space: 应用尺寸.间距_5 }) {
            TextArea({ text: this.CSS文本 })
              .fontSize(应用尺寸.字号_正文_小)
              .backgroundColor($r('app.color.surface_card'))
              .border(SurfaceBorder.options())
              .borderRadius(应用尺寸.圆角_面板)
              .constraintSize({ minHeight: 100 })
              .width('100%')
              .onChange((值: string) => { this.CSS文本 = 值; })
          }
          .width('100%')
        }

        if (this.保存中 || this.confirmingSave) {
          Row({ space: 应用尺寸.间距_8 }) {
            LoadingProgress()
              .width(20)
              .height(20)
              .color($r('app.color.text_secondary'))
            Text($r('app.string.notetype_editor_saving'))
              .fontSize(应用尺寸.字号_正文_中)
              .fontColor($r('app.color.text_secondary'))
          }
          .width('100%')
          .justifyContent(FlexAlign.Center)
        }
      }
    }
    .width('100%')
    .enabled(!this.保存中 && !this.confirmingSave && !this.confirmingClose && this.preview === null)
  }

  build() {
    Stack() {
      DialogFrame({
      header: () => { this.dialogHeader(); },
      content: () => { this.dialogContent(); },
      canDismiss: !this.保存中 && !this.confirmingSave && !this.confirmingClose && this.preview === null,
      onDismiss: (): void => { this.requestClose(); }
      })
      if (this.preview !== null) {
        NoteDraftPreview({ input: this.preview, isDark: this.isDark,
          onClose: (): void => { this.preview = null; } })
      }
      if (this.keyboardHelpOpen) {
        KeyboardShortcutHelp({ scope: 'template', shortcuts: TEMPLATE_SHORTCUTS,
          onClose: (): void => { this.keyboardHelpOpen = false; } })
      }
    }.width('100%').height('100%').onKeyPreIme((event: KeyEvent): boolean => {
      const fresh: boolean = this.keyboardSession.update(event.keyCode, event.type === KeyType.Down);
      if (event.type !== KeyType.Down) return false;
      const chord: string = studyEventChord(event);
      if (this.keyboardHelpOpen) { if (fresh && chord === 'escape') this.keyboardHelpOpen = false; return true; }
      if (this.preview !== null || this.保存中 || this.加载中 || this.confirmingSave || this.confirmingClose) return false;
      if (shortcutCommand(TEMPLATE_SHORTCUTS, chord) === 'preview') { if (fresh) this.previewTemplate(); return true; }
      if (chord === 'escape') { if (fresh) this.requestClose(); return true; }
      return false;
    })
  }
}
