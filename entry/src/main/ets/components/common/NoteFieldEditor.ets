import { PressFeedback } from '../../utils/PressFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { LengthMetrics } from '@kit.ArkUI';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { FieldEditResult, wrapFieldSelection, nextClozeNumber, NoteFieldEditingOptions,
  NOTE_FIELD_EDITING_SUPPORT } from '../../model/NoteFieldEditing';
import { NoteTextRun, parseNoteRichText, serializeNoteRichText, selectionHasFormat, richResultIsBold,
  FORMAT_BOLD, FORMAT_ITALIC, FORMAT_UNDERLINE, FORMAT_HIGHLIGHT } from '../../model/NoteRichText';
import { FORMAT_SUPERSCRIPT, FORMAT_SUBSCRIPT, noteLinkUrl } from '../../model/NoteRichText';
import { noteEditorHeight, richNoteList, sourceNoteList, sourceNoteClearFormat, richNoteLink,
  sourceNoteLink } from '../../model/NoteHtmlTools';
import { NoteLinkDialog } from './NoteLinkDialog';
import { hasNoteEditingHint, completeNoteEditingHint } from '../../utils/NoteEditingHints';
import { showToastSafely, resourceText, namedResourceText } from '../../utils/UiFeedback';
import { 字段帮助对话框 } from '../字段帮助面板';
export type { NoteFieldEditingOptions } from '../../model/NoteFieldEditing';

/** 三个笔记入口共用；可视编辑仅接管可保真理解的文字 HTML，复杂内容保留源码。 */
@Component
export struct NoteFieldEditor {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('receiveValue') value: string = '';
  @Prop fieldName: string = '';
  @Prop fieldConfig: NoteFieldEditingOptions | null = null;
  @Prop disabled: boolean = false;
  @Prop clozeEnabled: boolean = false;
  @Prop allFields: string[] = [];
  onChange: (value: string) => void = (_value: string): void => {};
  private controller: TextAreaController = new TextAreaController();
  private richController: RichEditorController = new RichEditorController();
  @State private sourceMode: boolean = false;
  @State private typingFormat: number = 0;
  @State private expanded: boolean = false;
  @State private moreFormats: boolean = false;
  private selectionStart: number = -1;
  private selectionEnd: number = -1;
  private disposed: boolean = false;
  private ready: boolean = false;
  private applying: boolean = false;
  private lastSnapshot: string = '';
  private selectionVersion: number = 0;
  private hintDialog: CustomDialogController | null = null;
  private hintSaving: boolean = false;
  private linkDialog: CustomDialogController | null = null;
  @StorageProp(颜色键.动作主色) private accent: string = '#2F5FD0';

  aboutToAppear(): void { this.sourceMode = this.fieldConfig?.plainText === true || parseNoteRichText(this.value) === null; }
  aboutToDisappear(): void {
    this.disposed = true; this.selectionVersion++; this.ready = false;
    this.hintDialog?.close(); this.hintDialog = null;
    this.linkDialog?.close(); this.linkDialog = null;
  }

  private receiveValue(): void {
    if (this.disposed || this.applying || this.sourceMode || this.value === this.lastSnapshot) return;
    const runs: NoteTextRun[] | null = parseNoteRichText(this.value);
    if (runs === null) { this.sourceMode = true; this.ready = false; }
    else if (this.ready) this.loadRich(runs);
  }

  private sourceChanged(text: string): void {
    if (this.disposed || this.disabled) return;
    this.value = text; this.onChange(text);
  }

  private richReady(): void {
    if (this.disposed) return;
    this.ready = true; this.loadRich(parseNoteRichText(this.value) ?? []);
  }

  private style(format: number): RichEditorTextStyle {
    return { fontSize: this.editingFontSize(), fontFamily: this.fieldConfig?.fontName || undefined,
      fontColor: (format & FORMAT_HIGHLIGHT) !== 0 ? '#202020' : $r('app.color.text_primary'),
      fontWeight: (format & FORMAT_BOLD) !== 0 ? FontWeight.Bold : FontWeight.Normal,
      fontStyle: (format & FORMAT_ITALIC) !== 0 ? FontStyle.Italic : FontStyle.Normal,
      fontFeature: (format & FORMAT_SUPERSCRIPT) !== 0 ? '"sups" 1' :
        (format & FORMAT_SUBSCRIPT) !== 0 ? '"subs" 1' : '"sups" 0, "subs" 0',
      decoration: { type: (format & FORMAT_UNDERLINE) !== 0 ? TextDecorationType.Underline : TextDecorationType.None },
      textBackgroundStyle: { color: (format & FORMAT_HIGHLIGHT) !== 0 ? '#FFF176' : Color.Transparent } };
  }

  private editingFontSize(): number {
    const size: number = this.fieldConfig?.fontSize ?? 0;
    return Number.isFinite(size) && size > 0 ? Math.min(NOTE_FIELD_EDITING_SUPPORT.maximumFontSize,
      Math.max(NOTE_FIELD_EDITING_SUPPORT.minimumFontSize, size)) : 应用尺寸.字号_正文;
  }

  private loadRich(runs: NoteTextRun[]): void {
    this.applying = true;
    try {
      this.richController.deleteSpans();
      for (const run of runs) this.richController.addTextSpan(run.text, { style: this.style(run.format),
        paragraphStyle: { textAlign: TextAlign.Start },
        urlStyle: run.url === undefined ? undefined : { url: run.url } });
      this.lastSnapshot = serializeNoteRichText(runs);
      this.richController.setTypingStyle(this.style(this.typingFormat));
    } finally { this.applying = false; }
  }

  private richRuns(): NoteTextRun[] {
    const runs: NoteTextRun[] = [];
    for (const span of this.richController.getSpans()) {
      const text = span as RichEditorTextSpanResult;
      const style: RichEditorTextStyleResult = text.textStyle;
      let format: number = richResultIsBold(style.fontWeight) ? FORMAT_BOLD : 0;
      if (style.fontStyle === FontStyle.Italic) format |= FORMAT_ITALIC;
      if (style.decoration.type === TextDecorationType.Underline) format |= FORMAT_UNDERLINE;
      const background: ResourceColor | undefined = style.textBackgroundStyle?.color;
      if ((typeof background === 'string' && background.toUpperCase().endsWith('FFF176')) ||
        (typeof background === 'number' && (background & 0xFFFFFF) === 0xFFF176)) format |= FORMAT_HIGHLIGHT;
      const feature: string = style.fontFeature ?? '';
      if (feature.indexOf('"sups" 1') >= 0) format |= FORMAT_SUPERSCRIPT;
      if (feature.indexOf('"subs" 1') >= 0) format |= FORMAT_SUBSCRIPT;
      const run: NoteTextRun = { text: text.value.slice(text.offsetInSpan[0], text.offsetInSpan[1]), format: format };
      const url: ResourceStr | undefined = text.urlStyle?.url;
      if (typeof url === 'string' && url !== '') run.url = url;
      runs.push(run);
    }
    return runs;
  }

  private publishRich(): void {
    if (this.applying || !this.ready || this.disposed || this.disabled || this.sourceMode) return;
    const html: string = serializeNoteRichText(this.richRuns());
    if (html === this.lastSnapshot) return;
    this.lastSnapshot = html;
    this.value = html; this.onChange(html);
  }

  private placeholderText(_locale: string = this.uiLanguage): string {
    if ((this.fieldConfig?.description ?? '') !== '') return this.fieldConfig?.description ?? '';
    return resourceText(this.getUIContext(), $r('app.string.note_editor_field_placeholder'), this.fieldName);
  }

  private richSelectionChanged(range: RichEditorRange): void {
    if (this.disposed || this.applying) return;
    this.selectionStart = range.start ?? 0; this.selectionEnd = range.end ?? this.selectionStart;
    if (this.ready) this.richController.setTypingStyle(this.style(this.typingFormat));
  }

  /** 样式更新可能临时收起原生选区；同一范围重新选中，便于连续格式操作。 */
  private applySelectionStyle(style: RichEditorTextStyle, clearLink: boolean = false): void {
    const start: number = this.selectionStart;
    const end: number = this.selectionEnd;
    const update: RichEditorUpdateTextSpanStyleOptions = { start: start, end: end, textStyle: style };
    if (clearLink) update.urlStyle = { url: '' };
    this.applying = true;
    try {
      this.richController.updateSpanStyle(update);
      this.richController.setSelection(start, end, { menuPolicy: MenuPolicy.HIDE });
      this.selectionStart = start; this.selectionEnd = end;
    } finally { this.applying = false; }
    this.publishRich();
  }

  private applyFormat(flag: number): void {
    if (this.disabled || this.disposed) return;
    if (this.sourceMode) {
      const tag: string = flag === FORMAT_BOLD ? 'b' : flag === FORMAT_ITALIC ? 'i' : flag === FORMAT_UNDERLINE ? 'u' :
        flag === FORMAT_HIGHLIGHT ? 'mark' : flag === FORMAT_SUPERSCRIPT ? 'sup' : 'sub';
      this.wrap(`<${tag}>`, `</${tag}>`); return;
    }
    if (!this.ready) return;
    if (this.selectionEnd > this.selectionStart && this.selectionStart >= 0) {
      const enabled: boolean = !selectionHasFormat(this.richRuns(), this.selectionStart, this.selectionEnd, flag);
      const patch: RichEditorTextStyle = {};
      if (flag === FORMAT_BOLD) patch.fontWeight = enabled ? FontWeight.Bold : FontWeight.Normal;
      if (flag === FORMAT_ITALIC) patch.fontStyle = enabled ? FontStyle.Italic : FontStyle.Normal;
      if (flag === FORMAT_UNDERLINE) patch.decoration = { type: enabled ? TextDecorationType.Underline : TextDecorationType.None };
      if (flag === FORMAT_HIGHLIGHT) {
        patch.textBackgroundStyle = { color: enabled ? '#FFF176' : Color.Transparent };
        patch.fontColor = enabled ? '#202020' : $r('app.color.text_primary');
      }
      if (flag === FORMAT_SUPERSCRIPT || flag === FORMAT_SUBSCRIPT) {
        patch.fontFeature = enabled ? (flag === FORMAT_SUPERSCRIPT ? '"sups" 1' : '"subs" 1') : '"sups" 0, "subs" 0';
      }
      this.applySelectionStyle(patch);
    } else {
      this.typingFormat ^= flag;
      if ((this.typingFormat & flag) !== 0 && flag === FORMAT_SUPERSCRIPT) this.typingFormat &= ~FORMAT_SUBSCRIPT;
      if ((this.typingFormat & flag) !== 0 && flag === FORMAT_SUBSCRIPT) this.typingFormat &= ~FORMAT_SUPERSCRIPT;
    }
    // 选区格式不改变持续输入状态；后续输入仍由点亮按钮控制。
    this.richController.setTypingStyle(this.style(this.typingFormat));
  }

  private wrap(prefix: string, suffix: string): void {
    if (this.disabled || this.disposed) return;
    if (!this.sourceMode) {
      if (!this.ready) return;
      const text: string = this.richRuns().map((run: NoteTextRun): string => run.text).join('');
      const caret: number = this.richController.getCaretOffset();
      const start: number = this.selectionStart < 0 ? Math.max(0, caret) : this.selectionStart;
      const end: number = Math.max(start, this.selectionEnd);
      this.applying = true;
      try {
        // 仅插入边界标记，保留选中文字原有样式。
        if (suffix !== '') this.richController.addTextSpan(suffix, { offset: end, style: this.style(this.typingFormat) });
        this.richController.addTextSpan(prefix, { offset: start, style: this.style(this.typingFormat) });
        const next: number = start === end ? start + prefix.length : end + prefix.length + suffix.length;
        this.richController.setCaretOffset(Math.min(next, text.length + prefix.length + suffix.length));
        this.selectionStart = next; this.selectionEnd = next;
      } finally { this.applying = false; }
      this.publishRich(); return;
    }
    const result: FieldEditResult = wrapFieldSelection(this.value, this.selectionStart, this.selectionEnd, prefix, suffix);
    this.value = result.text; this.onChange(result.text);
    this.selectionStart = result.start; this.selectionEnd = result.end;
    const version: number = ++this.selectionVersion;
    setTimeout((): void => {
      if (this.disposed || version !== this.selectionVersion) return;
      try { this.controller.caretPosition(result.start); } catch (error) { /* 内容已保留。 */ }
    }, 0);
  }

  private cloze(same: boolean): void {
    if (this.clozeEnabled) this.wrap(`{{c${nextClozeNumber(this.allFields.concat([this.value]), same)}::`, '}}');
  }

  private insertBreak(): void {
    if (this.disabled || this.disposed) return;
    if (this.sourceMode) { this.wrap('<br>', ''); return; }
    if (!this.ready) return;
    const start: number = this.selectionStart < 0 ? Math.max(0, this.richController.getCaretOffset()) : this.selectionStart;
    const end: number = Math.max(start, this.selectionEnd);
    this.applying = true;
    try {
      if (end > start) this.richController.deleteSpans({ start: start, end: end });
      this.richController.addTextSpan('\n', { offset: start, style: this.style(this.typingFormat) });
      this.richController.setCaretOffset(start + 1);
      this.selectionStart = start + 1; this.selectionEnd = start + 1;
    } finally { this.applying = false; }
    this.publishRich();
  }

  private switchMode(_locale: string = this.uiLanguage): void {
    if (this.disabled || this.disposed) return;
    if (!this.sourceMode) { this.publishRich(); this.sourceMode = true; this.ready = false; }
    else {
      if (parseNoteRichText(this.value) === null) {
        showToastSafely(this.getUIContext(), { message: resourceText(this.getUIContext(), $r('app.string.note_editor_complex_html')) });
        return;
      }
      this.sourceMode = false;
    }
    this.typingFormat = 0; this.selectionStart = -1; this.selectionEnd = -1;
  }

  private toggleExpanded(): void {
    if (!this.disabled && !this.disposed) this.expanded = !this.expanded;
  }

  private toggleMoreFormats(): void {
    if (!this.disabled && !this.disposed) this.moreFormats = !this.moreFormats;
  }

  private selectedRange(): RichEditorRange {
    const length: number = this.sourceMode ? this.value.length :
      this.richRuns().reduce((total: number, run: NoteTextRun): number => total + run.text.length, 0);
    const caret: number = this.sourceMode ? length : Math.max(0, this.richController.getCaretOffset());
    const start: number = Math.max(0, Math.min(length, this.selectionStart < 0 ? caret : this.selectionStart));
    return { start: start, end: Math.max(start, Math.min(length, this.selectionEnd < 0 ? start : this.selectionEnd)) };
  }

  private applySourceEdit(result: FieldEditResult): void {
    this.sourceMode = true; this.ready = false;
    this.value = result.text; this.onChange(result.text);
    this.selectionStart = result.start; this.selectionEnd = result.end;
    const version: number = ++this.selectionVersion;
    setTimeout((): void => {
      if (this.disposed || this.disabled || version !== this.selectionVersion) return;
      try { this.controller.caretPosition(result.start); } catch (_error) { /* 草稿已保留。 */ }
    }, 0);
  }

  private list(ordered: boolean): void {
    if (this.disabled || this.disposed || (!this.sourceMode && !this.ready)) return;
    const range: RichEditorRange = this.selectedRange();
    const runs: NoteTextRun[] = this.sourceMode ? [] : this.richRuns();
    const text: string = this.sourceMode ? this.value : runs.map((run: NoteTextRun): string => run.text).join('');
    let start: number = range.start ?? 0;
    let end: number = range.end ?? start;
    if (start === end) {
      start = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
      const next: number = text.indexOf('\n', end);
      end = next < 0 ? text.length : next;
    }
    const result: FieldEditResult | null = this.sourceMode ? sourceNoteList(this.value, start, end, ordered) :
      richNoteList(runs, start, end, ordered);
    if (result === null) this.sourceSelectionHint();
    else this.applySourceEdit(result);
  }

  private clearFormat(): void {
    if (this.disabled || this.disposed) return;
    if (this.sourceMode) {
      const range: RichEditorRange = this.selectedRange();
      const result: FieldEditResult | null = sourceNoteClearFormat(this.value, range.start ?? 0, range.end ?? 0);
      if (result === null) this.sourceSelectionHint();
      else this.applySourceEdit(result);
      return;
    }
    if (!this.ready) return;
    if (this.selectionEnd > this.selectionStart && this.selectionStart >= 0) {
      this.applySelectionStyle(this.style(0), true);
    } else this.typingFormat = 0;
    this.richController.setTypingStyle(this.style(this.typingFormat));
  }

  private sourceSelectionHint(_locale: string = this.uiLanguage): void {
    showToastSafely(this.getUIContext(), { message: resourceText(this.getUIContext(), $r('app.string.note_editor_source_selection_hint')) });
  }

  private openLink(): void {
    if (this.disabled || this.disposed || this.linkDialog !== null || (!this.sourceMode && !this.ready)) return;
    const range: RichEditorRange = this.selectedRange();
    const start: number = range.start ?? 0;
    const end: number = range.end ?? start;
    const source: boolean = this.sourceMode;
    const snapshot: string = this.value;
    const runs: NoteTextRun[] = source ? [] : this.richRuns();
    const text: string = source ? snapshot : runs.map((run: NoteTextRun): string => run.text).join('');
    const selected: NoteTextRun[] | null = source ? parseNoteRichText(text.slice(start, end)) : null;
    if (source && selected === null) { this.sourceSelectionHint(); return; }
    const label: string = source ? (selected ?? []).map((run: NoteTextRun): string => run.text).join('') : text.slice(start, end);
    this.linkDialog = new CustomDialogController({ builder: NoteLinkDialog({ selectedText: label,
      onClose: (): void => { this.closeLink(); },
      onApply: (url: string, label: string): void => {
        this.closeLink();
        if (this.disabled || this.disposed || this.value !== snapshot || noteLinkUrl(url) === '') return;
        if (source) {
          const result: FieldEditResult | null = sourceNoteLink(snapshot, start, end, url, label);
          if (result === null) this.sourceSelectionHint(); else this.applySourceEdit(result);
        } else {
          const html: string = richNoteLink(runs, start, end, url, label);
          const linked: NoteTextRun[] | null = parseNoteRichText(html);
          if (linked === null) return;
          this.applying = true;
          try { this.value = html; this.onChange(html); this.loadRich(linked); }
          finally { this.applying = false; }
          const caret: number = end > start ? end : start + label.length;
          this.richController.setCaretOffset(caret); this.selectionStart = caret; this.selectionEnd = caret;
        }
      } }), cancel: (): void => { this.linkDialog = null; },
      customStyle: true, autoCancel: true, alignment: DialogAlignment.Center,
      width: '100%', height: '100%', maskColor: Color.Transparent });
    this.linkDialog.open();
  }

  private closeLink(): void { this.linkDialog?.close(); this.linkDialog = null; }

  private activateTool(key: string, label: Resource, action: () => void, _locale: string = this.uiLanguage): void {
    if (this.disabled || this.disposed || this.hintDialog !== null || this.linkDialog !== null || this.hintSaving) return;
    let seen: boolean = false;
    try { seen = hasNoteEditingHint(key); } catch (error) { this.hintFailure(); }
    if (seen) { action(); return; }
    this.hintDialog = new CustomDialogController({
      builder: 字段帮助对话框({ 标题: label,
        正文: this.sourceMode && ['bold', 'italic', 'underline', 'highlight'].indexOf(key) >= 0 ?
          resourceText(this.getUIContext(), $r('app.string.note_editor_hint_source_format')) :
          namedResourceText(this.getUIContext(), `note_editor_hint_${key}`),
        onDismiss: (): void => { this.finishHint(key); } }),
      cancel: (): void => { this.finishHint(key); },
      customStyle: true, autoCancel: true, alignment: DialogAlignment.Center,
      width: '100%', height: '100%', maskColor: Color.Transparent
    });
    this.hintDialog.open();
  }

  private async finishHint(key: string): Promise<void> {
    this.hintDialog = null;
    if (this.disposed || this.hintSaving) return;
    this.hintSaving = true;
    try { await completeNoteEditingHint(key); }
    catch (error) { if (!this.disposed) this.hintFailure(); }
    finally { if (!this.disposed) this.hintSaving = false; }
  }

  private hintFailure(_locale: string = this.uiLanguage): void {
    showToastSafely(this.getUIContext(), { message: resourceText(this.getUIContext(), $r('app.string.note_editor_hint_store_failed')) });
  }

  @Builder
  private tool(key: string, label: Resource, flag: number, action: () => void) {
    // 动态文案在构建函数内读取状态，避免按值参数保留首次文案。
    Button(key === 'source' ?
      (this.sourceMode ? $r('app.string.note_editor_visual') : $r('app.string.note_editor_source')) :
      key === 'expand' ? (this.expanded ? $r('app.string.note_editor_collapse') : $r('app.string.note_editor_expand')) :
      key === 'more' ? (this.moreFormats ? $r('app.string.note_editor_less_formats') : $r('app.string.note_editor_more_formats')) : label)
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor(flag !== 0 && (this.typingFormat & flag) !== 0 ? Color.White : this.accent)
      .backgroundColor(flag !== 0 && (this.typingFormat & flag) !== 0 ? this.accent : Color.Transparent)
      .borderRadius(应用尺寸.圆角_面板)
      .height(应用尺寸.紧凑控件高度).flexShrink(0)
      .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
      .enabled(!this.disabled).focusOnTouch(false)
      .accessibilityDescription(flag !== 0 && (this.typingFormat & flag) !== 0 ?
        $r('app.string.note_editor_format_on') : $r('app.string.note_editor_format_action'))
      .attributeModifier(new PressFeedback())
      .stateEffect(false)
      .onClick((): void => {
        if (key === 'source' || key === 'expand' || key === 'more') action();
        else this.activateTool(key, label, action);
      })
  }

  build() {
    Column({ space: 应用尺寸.间距_5 }) {
      if (this.sourceMode) {
        TextArea({ text: this.value, placeholder: this.placeholderText(), controller: this.controller })
          .width('100%').height(noteEditorHeight(this.expanded)).fontSize(this.editingFontSize())
          .fontFamily(this.fieldConfig?.fontName || 'HarmonyOS Sans')
          .direction(this.fieldConfig?.rtl === true ? Direction.Rtl : Direction.Ltr)
          .textAlign(TextAlign.Start)
          .fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary'))
          .backgroundColor($r('app.color.surface_card'))
          .border(SurfaceBorder.options())
          .borderRadius(应用尺寸.圆角_面板).padding(应用尺寸.间距_10).enabled(!this.disabled)
          .onChange((text: string): void => { this.sourceChanged(text); })
          .onTextSelectionChange((start: number, end: number): void => { this.selectionStart = start; this.selectionEnd = end; })
        Text($r('app.string.note_editor_source_hint'))
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      } else {
        RichEditor({ controller: this.richController })
          .direction(this.fieldConfig?.rtl === true ? Direction.Rtl : Direction.Ltr)
          .width('100%').height(noteEditorHeight(this.expanded)).placeholder(this.placeholderText(), { fontColor: $r('app.color.text_tertiary') })
          .backgroundColor($r('app.color.surface_card'))
          .border(SurfaceBorder.options())
          .borderRadius(应用尺寸.圆角_面板).padding(应用尺寸.间距_10).enabled(!this.disabled)
          .onReady((): void => { this.richReady(); })
          .onSelectionChange((range: RichEditorRange): void => { this.richSelectionChanged(range); })
          .onWillChange((change: RichEditorChangeValue): boolean => change.replacedImageSpans.length === 0 && change.replacedSymbolSpans.length === 0)
          .onDidChange((): void => { this.publishRich(); })
      }
      Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start, alignContent: FlexAlign.Start,
        space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        this.tool('bold', $r('app.string.note_editor_bold'), FORMAT_BOLD, (): void => { this.applyFormat(FORMAT_BOLD); })
        this.tool('italic', $r('app.string.note_editor_italic'), FORMAT_ITALIC, (): void => { this.applyFormat(FORMAT_ITALIC); })
        this.tool('underline', $r('app.string.note_editor_underline'), FORMAT_UNDERLINE, (): void => { this.applyFormat(FORMAT_UNDERLINE); })
        this.tool('highlight', $r('app.string.note_editor_highlight'), FORMAT_HIGHLIGHT, (): void => { this.applyFormat(FORMAT_HIGHLIGHT); })
        this.tool('break', $r('app.string.note_editor_break'), 0, (): void => { this.insertBreak(); })
        this.tool('math', $r('app.string.note_editor_math'), 0, (): void => { this.wrap('\\(', '\\)'); })
        if (this.clozeEnabled) {
          this.tool('cloze_next', $r('app.string.note_editor_cloze_next'), 0, (): void => { this.cloze(false); })
          this.tool('cloze_same', $r('app.string.note_editor_cloze_same'), 0, (): void => { this.cloze(true); })
        }
        this.tool('source', $r('app.string.note_editor_source'),
          0, (): void => { this.switchMode(); })
        this.tool('expand', $r('app.string.note_editor_expand'), 0, (): void => { this.toggleExpanded(); })
        this.tool('more', $r('app.string.note_editor_more_formats'), 0, (): void => { this.toggleMoreFormats(); })
        if (this.moreFormats) {
          this.tool('superscript', $r('app.string.note_editor_superscript'), FORMAT_SUPERSCRIPT,
            (): void => { this.applyFormat(FORMAT_SUPERSCRIPT); })
          this.tool('subscript', $r('app.string.note_editor_subscript'), FORMAT_SUBSCRIPT,
            (): void => { this.applyFormat(FORMAT_SUBSCRIPT); })
          this.tool('bullet_list', $r('app.string.note_editor_bullet_list'), 0, (): void => { this.list(false); })
          this.tool('numbered_list', $r('app.string.note_editor_numbered_list'), 0, (): void => { this.list(true); })
          this.tool('link', $r('app.string.note_editor_link'), 0, (): void => { this.openLink(); })
          this.tool('clear_format', $r('app.string.note_editor_clear_format'), 0, (): void => { this.clearFormat(); })
        }
      }.width('100%')
    }.width('100%')
  }
}
