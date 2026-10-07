import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { ComponentContent } from '@kit.ArkUI';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { FieldEditResult, wrapFieldSelection, nextClozeNumber, NoteFieldEditingOptions,
  NOTE_FIELD_EDITING_SUPPORT, noteFieldExpansionTool, noteEditorTool, noteFieldModeTool,
  noteEditorFormatOptions, NoteEditorFormatOption } from '../../model/NoteFieldEditing';
import { 按下态按钮 } from './按下态按钮';
import { IconActionButton } from './IconActionButton';
import { NoteTextRun, parseNoteRichText, parseNoteVisualText, serializeNoteRichText, selectionHasFormat, richResultIsBold,
  FORMAT_BOLD, FORMAT_ITALIC, FORMAT_UNDERLINE, FORMAT_HIGHLIGHT } from '../../model/NoteRichText';
import { FORMAT_SUPERSCRIPT, FORMAT_SUBSCRIPT, noteLinkUrl } from '../../model/NoteRichText';
import { noteEditorHeight, richNoteList, sourceNoteList, sourceNoteClearFormat, richNoteLink,
  sourceNoteLink, richNoteScript, richNoteWrap, sourceNoteWrap } from '../../model/NoteHtmlTools';
import { NoteLinkDialog } from './NoteLinkDialog';
import { buildNoteEditorWheel, NoteEditorWheelParams, NoteEditorFormatDialog } from '../editor/NoteEditorWheel';
import { NoteEditorWheelState, NoteEditorWheelSession, NOTE_EDITOR_WHEEL_SESSION_KEY } from '../../model/NoteEditorWheel';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { hasNoteEditingHint, completeNoteEditingHint } from '../../utils/NoteEditingHints';
import { showToastSafely, resourceText, namedResourceText } from '../../utils/UiFeedback';
import { 字段帮助对话框 } from '../字段帮助面板';
export type { NoteFieldEditingOptions } from '../../model/NoteFieldEditing';
export { noteFieldMediaTool } from '../../model/NoteFieldEditing';

/** 三个笔记入口共用；可视编辑仅接管可保真理解的文字 HTML，复杂内容保留源码。 */
@Component
export struct NoteFieldEditor {
  @Consume(NOTE_EDITOR_WHEEL_SESSION_KEY) private wheelSession: NoteEditorWheelSession = new NoteEditorWheelSession();
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('receiveValue') value: string = '';
  @Prop fieldName: string = '';
  @Prop fieldConfig: NoteFieldEditingOptions | null = null;
  @Prop @Watch('editingAvailabilityChanged') disabled: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('editingAvailabilityChanged') private foreground: boolean = true;
  @Prop clozeEnabled: boolean = false;
  @Prop allFields: string[] = [];
  onChange: (value: string) => void = (_value: string): void => {};
  private controller: TextAreaController = new TextAreaController();
  private richController: RichEditorController = new RichEditorController();
  @State private sourceMode: boolean = false;
  @State private typingFormat: number = 0;
  @State private expanded: boolean = false;
  @State private sourceToolFocus: boolean = false;
  private selectionStart: number = -1;
  private selectionEnd: number = -1;
  private disposed: boolean = false;
  private ready: boolean = false;
  private applying: boolean = false;
  private lastSnapshot: string = '';
  private selectionVersion: number = 0;
  private hintDialog: CustomDialogController | null = null;
  private hintSaving: boolean = false;
  private hintedAction: (() => void) | null = null;
  private linkDialog: CustomDialogController | null = null;
  private formatDialog: CustomDialogController | null = null;
  private formatVersion: number = 0;
  private wheelContent: ComponentContent<NoteEditorWheelParams> | null = null;
  private wheelVisible: boolean = false;
  private wheelRemoval: number = -1;
  private fieldFocused: boolean = false;
  private wheelActive: boolean = false;
  private lastWheelTool: string = '';
  private inputKey: string = '';

  aboutToAppear(): void {
    this.inputKey = 'note-editor-' + this.getUniqueId();
    this.sourceMode = this.fieldConfig?.plainText === true || parseNoteVisualText(this.value) === null;
    this.wheelSession.register(this.inputKey, !this.disabled && this.foreground, (active: boolean): void => {
      this.wheelActive = active;
      if (active) this.showWheel(); else { this.hideWheel(true); this.closeFormat(); }
    });
  }
  aboutToDisappear(): void {
    this.disposed = true; this.selectionVersion++; this.ready = false; this.hideWheel(true);
    this.wheelSession.remove(this.inputKey);
    this.hintDialog?.close(); this.hintDialog = null;
    this.hintedAction = null;
    this.linkDialog?.close(); this.linkDialog = null;
    this.closeFormat();
  }

  private receiveValue(): void {
    if (this.disposed || this.applying || this.sourceMode || this.value === this.lastSnapshot) return;
    const runs: NoteTextRun[] | null = parseNoteVisualText(this.value);
    if (runs === null) { this.sourceMode = true; this.ready = false; }
    else if (this.ready) this.loadRich(runs);
    this.updateWheel();
  }

  private sourceChanged(text: string): void {
    if (this.disposed || this.disabled) return;
    this.value = text; this.onChange(text);
  }

  private richReady(): void {
    if (this.disposed) return;
    if (this.sourceMode) return;
    this.ready = true; this.loadRich(parseNoteVisualText(this.value) ?? []);
  }

  private style(format: number): RichEditorTextStyle {
    return { fontSize: this.editingFontSize(), fontFamily: this.fieldConfig?.fontName || undefined,
      fontColor: (format & FORMAT_HIGHLIGHT) !== 0 ? '#202020' : $r('app.color.text_primary'),
      fontWeight: (format & FORMAT_BOLD) !== 0 ? FontWeight.Bold : FontWeight.Normal,
      fontStyle: (format & FORMAT_ITALIC) !== 0 ? FontStyle.Italic : FontStyle.Normal,
      fontFeature: '"sups" 0, "subs" 0',
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
    this.updateWheel();
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
    if (!this.sourceMode && (flag === FORMAT_SUPERSCRIPT || flag === FORMAT_SUBSCRIPT)) {
      if (!this.ready) return;
      const range: RichEditorRange = this.selectedRange();
      this.applySourceEdit(richNoteScript(this.richRuns(), range.start ?? 0, range.end ?? 0,
        flag === FORMAT_SUPERSCRIPT));
      return;
    }
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
      this.applySelectionStyle(patch);
    } else {
      this.typingFormat ^= flag;
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
      if (this.disposed || this.disabled || version !== this.selectionVersion) return;
      try { this.controller.caretPosition(result.start); } catch (error) { /* 内容已保留。 */ }
    }, 16);
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
      if (parseNoteVisualText(this.value) === null) {
        showToastSafely(this.getUIContext(), { message: resourceText(this.getUIContext(), $r('app.string.note_editor_complex_html')) });
        return;
      }
      this.sourceMode = false;
    }
    this.typingFormat = 0; this.selectionStart = -1; this.selectionEnd = -1;
    this.focusInput(this.sourceMode);
  }

  private requestMode(source: boolean): void {
    if (this.disposed || this.disabled || !this.foreground) return;
    this.wheelSession.activate(this.inputKey);
    if (this.sourceMode !== source) this.switchMode();
    else this.focusInput(source);
    this.updateWheel();
  }

  private toggleExpanded(): void {
    if (!this.disabled && !this.disposed) this.expanded = !this.expanded;
  }
  private requestExpanded(): void {
    if (this.disabled || this.disposed || !this.foreground) return;
    this.wheelSession.activate(this.inputKey);
    this.toggleExpanded(); this.updateWheel();
  }

  private selectedRange(): RichEditorRange {
    const length: number = this.sourceMode ? this.value.length :
      this.richRuns().reduce((total: number, run: NoteTextRun): number => total + run.text.length, 0);
    const caret: number = this.sourceMode ? length : Math.max(0, this.richController.getCaretOffset());
    const start: number = Math.max(0, Math.min(length, this.selectionStart < 0 ? caret : this.selectionStart));
    return { start: start, end: Math.max(start, Math.min(length, this.selectionEnd < 0 ? start : this.selectionEnd)) };
  }

  private applySourceEdit(result: FieldEditResult): void {
    this.sourceToolFocus = true;
    this.sourceMode = true; this.ready = false;
    this.value = result.text; this.onChange(result.text);
    this.selectionStart = result.start; this.selectionEnd = result.end;
    this.focusInput(true, result.start);
  }

  private focusInput(source: boolean, caret: number = -1): void {
    const version: number = ++this.selectionVersion;
    setTimeout((): void => {
      if (this.disposed || this.disabled || !this.foreground || !this.wheelActive || this.sourceMode !== source || version !== this.selectionVersion) return;
      try {
        this.getUIContext().getFocusController().requestFocus(this.inputKey + (source ? '-source' : '-visual'));
        if (source && caret >= 0) this.controller.caretPosition(caret);
      } catch (_error) { /* 焦点不可恢复时草稿与目标光标仍保留。 */ }
    }, 16);
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
      } }), cancel: (): void => { this.closeLink(); },
      customStyle: true, autoCancel: true, alignment: DialogAlignment.Center,
      width: '100%', height: '100%', maskColor: Color.Transparent });
    this.linkDialog.open();
    this.hideWheel(true);
  }

  private closeLink(): void {
    this.linkDialog?.close(); this.linkDialog = null;
    if (this.wheelActive) this.showWheel();
  }

  private openFormatOptions(key: string): void {
    if (this.disabled || this.disposed || !this.foreground || !this.wheelActive || this.formatDialog !== null ||
      (!this.sourceMode && !this.ready) || noteEditorFormatOptions(key).length === 0) return;
    const range: RichEditorRange = this.selectedRange();
    const start: number = range.start ?? 0;
    const end: number = range.end ?? start;
    const source: boolean = this.sourceMode;
    const snapshot: string = this.value;
    const runs: NoteTextRun[] = source ? [] : this.richRuns();
    const version: number = ++this.formatVersion;
    this.formatDialog = new CustomDialogController({ builder: NoteEditorFormatDialog({ toolId: key,
      fieldName: this.fieldName, source: source, onClose: (): void => { this.closeFormat(version); },
      onSelect: (id: string): void => {
        if (version !== this.formatVersion || this.formatDialog === null) return;
        this.closeFormat();
        const option: NoteEditorFormatOption | undefined = noteEditorFormatOptions(key)
          .find((item: NoteEditorFormatOption): boolean => item.id === id);
        // 弹窗使用打开时的选区；晚回调不能改写新字段、隐藏页面或更新后的草稿。
        if (option === undefined || this.disabled || this.disposed || !this.foreground || !this.wheelActive ||
          this.sourceMode !== source || this.value !== snapshot) return;
        if (key === 'math') {
          this.selectionStart = start; this.selectionEnd = end;
          this.wrap(option.prefix, option.suffix);
          this.focusInput(source, this.selectionStart);
        } else {
          const result: FieldEditResult | null = source ? sourceNoteWrap(snapshot, start, end, option.prefix, option.suffix) :
            richNoteWrap(runs, start, end, option.prefix, option.suffix);
          if (result === null) this.sourceSelectionHint(); else this.applySourceEdit(result);
        }
        this.updateWheel();
      } }), cancel: (): void => { this.closeFormat(version); },
      customStyle: true, autoCancel: true, alignment: DialogAlignment.Center,
      width: '100%', height: '100%', maskColor: Color.Transparent });
    this.formatDialog.open(); this.hideWheel(true);
  }

  private closeFormat(expectedVersion: number = this.formatVersion): void {
    if (expectedVersion !== this.formatVersion) return;
    const dialog: CustomDialogController | null = this.formatDialog;
    this.formatVersion++;
    this.formatDialog = null; dialog?.close();
    if (dialog !== null && this.wheelActive) this.showWheel();
  }

  private activateTool(key: string, label: Resource, action: () => void, _locale: string = this.uiLanguage): void {
    if (this.disabled || this.disposed || this.hintDialog !== null || this.linkDialog !== null ||
      this.formatDialog !== null || this.hintSaving) return;
    let seen: boolean = false;
    try { seen = hasNoteEditingHint(key); } catch (error) { this.hintFailure(); }
    if (seen) { action(); return; }
    this.hintedAction = action;
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
    this.hideWheel(true);
  }

  private async finishHint(key: string): Promise<void> {
    const action: (() => void) | null = this.hintedAction;
    this.hintedAction = null;
    this.hintDialog = null;
    if (this.disposed || this.hintSaving) return;
    this.hintSaving = true;
    try { await completeNoteEditingHint(key); }
    catch (error) { if (!this.disposed) this.hintFailure(); }
    finally {
      if (!this.disposed) {
        this.hintSaving = false;
        if (this.wheelActive && !this.disabled && this.foreground) {
          this.showWheel(); action?.(); this.updateWheel();
        }
      }
    }
  }

  private hintFailure(_locale: string = this.uiLanguage): void {
    showToastSafely(this.getUIContext(), { message: resourceText(this.getUIContext(), $r('app.string.note_editor_hint_store_failed')) });
  }

  private wheelState(): NoteEditorWheelState {
    const active: string[] = [];
    const runs: NoteTextRun[] = this.ready && !this.sourceMode ? this.richRuns() : [];
    for (const tool of ['bold', 'italic', 'underline', 'highlight']) {
      const flag: number = tool === 'bold' ? FORMAT_BOLD : tool === 'italic' ? FORMAT_ITALIC :
        tool === 'underline' ? FORMAT_UNDERLINE : FORMAT_HIGHLIGHT;
      if (!this.sourceMode && (this.selectionEnd > this.selectionStart && this.selectionStart >= 0 ?
        selectionHasFormat(runs, this.selectionStart, this.selectionEnd, flag) : (this.typingFormat & flag) !== 0)) active.push(tool);
    }
    return { cloze: this.clozeEnabled, source: this.sourceMode, expanded: this.expanded, activeIds: active,
      fieldName: this.fieldName };
  }
  private wheelParams(): NoteEditorWheelParams {
    return new NoteEditorWheelParams(this.wheelState(), (id: string): void => { this.executeWheel(id); }, this.wheelVisible,
      this.lastWheelTool, (id: string): void => { if (!this.disposed) this.lastWheelTool = id; },
      (): void => { this.resetWheelFormats(); }, (id: string): void => { this.executeWheel(id, true); });
  }
  private resetWheelFormats(): void {
    if (this.disposed || this.disabled || !this.foreground || !this.wheelActive || !this.wheelVisible) return;
    const caret: number = this.selectedRange().end ?? 0;
    this.typingFormat = 0; this.lastWheelTool = ''; this.selectionStart = -1; this.selectionEnd = -1;
    if (!this.sourceMode && this.ready) {
      this.richController.setTypingStyle(this.style(0));
      this.richController.setSelection(caret, caret, { menuPolicy: MenuPolicy.HIDE });
    } else if (this.sourceMode) this.controller.caretPosition(caret);
    this.updateWheel();
  }
  private fieldFocus(): void { this.fieldFocused = true; this.wheelSession.activate(this.inputKey); }
  private fieldBlur(): void { this.fieldFocused = false; }
  private showWheel(): void {
    if (!this.wheelActive || this.disposed || this.disabled || !this.foreground || this.hintDialog !== null ||
      this.linkDialog !== null || this.formatDialog !== null) return;
    if (this.wheelRemoval >= 0) { clearTimeout(this.wheelRemoval); this.wheelRemoval = -1; }
    this.wheelVisible = true;
    if (this.wheelContent !== null) { this.updateWheel(); return; }
    this.wheelContent = new ComponentContent(this.getUIContext(), wrapBuilder<[NoteEditorWheelParams]>(buildNoteEditorWheel),
      this.wheelParams());
    this.getUIContext().getOverlayManager().addComponentContent(this.wheelContent);
  }
  private updateWheel(): void { this.wheelContent?.update(this.wheelParams()); }
  private hideWheel(immediate: boolean = false): void {
    this.wheelVisible = false;
    if (this.wheelRemoval >= 0) { clearTimeout(this.wheelRemoval); this.wheelRemoval = -1; }
    const content: ComponentContent<NoteEditorWheelParams> | null = this.wheelContent;
    if (content === null) return;
    if (immediate) { this.removeWheel(content); return; }
    this.updateWheel();
    this.wheelRemoval = setTimeout((): void => {
      this.wheelRemoval = -1;
      if (!this.wheelVisible && this.wheelContent === content) this.removeWheel(content);
    }, 240);
  }
  private removeWheel(content: ComponentContent<NoteEditorWheelParams>): void {
    this.wheelContent = null;
    this.getUIContext().getOverlayManager().removeComponentContent(content);
    content.dispose();
  }
  private editingAvailabilityChanged(): void {
    this.wheelSession.setAvailable(this.inputKey, !this.disabled && this.foreground);
    if (this.disabled || !this.foreground) { this.hideWheel(true); this.closeFormat(); }
  }
  private executeWheel(key: string, longPress: boolean = false): void {
    if (this.disposed || this.disabled || !this.foreground || !this.wheelVisible) return;
    if ((key === 'cloze_next' || key === 'cloze_same') && !this.clozeEnabled) return;
    if (longPress && noteEditorTool(key).longPressAction === undefined) return;
    const action: () => void = (): void => {
      switch (key) {
        case 'bold': this.applyFormat(FORMAT_BOLD); break;
        case 'italic': this.applyFormat(FORMAT_ITALIC); break;
        case 'underline': this.applyFormat(FORMAT_UNDERLINE); break;
        case 'highlight': this.applyFormat(FORMAT_HIGHLIGHT); break;
        case 'superscript': this.applyFormat(FORMAT_SUPERSCRIPT); break;
        case 'subscript': this.applyFormat(FORMAT_SUBSCRIPT); break;
        case 'break': this.insertBreak(); break;
        case 'math':
          if (longPress) this.openFormatOptions(key); else this.wrap('\\(', '\\)');
          break;
        case 'font_size':
        case 'heading': this.openFormatOptions(key); break;
        case 'cloze_next': this.cloze(false); break;
        case 'cloze_same': this.cloze(true); break;
        case 'bullet_list': this.list(false); break;
        case 'numbered_list': this.list(true); break;
        case 'link': this.openLink(); break;
        case 'clear_format': this.clearFormat(); break;
      }
      if (!this.fieldFocused && key !== 'link' && this.formatDialog === null) {
        this.focusInput(this.sourceMode, this.sourceMode ? this.selectionStart : -1);
      }
      this.updateWheel();
    };
    this.activateTool(key, $r('app.string.' + noteEditorTool(key).titleKey), action);
  }

  build() {
    Column({ space: 应用尺寸.间距_5 }) {
      Row({ space: 应用尺寸.间距_8 }) {
        按下态按钮({ 文案: $r('app.string.' + noteFieldModeTool('visual').titleKey),
          字号: 应用尺寸.字号_正文_小, 是否启用: !this.disabled, selectable: true, selected: !this.sourceMode, fillWidth: true,
          点击回调: (): void => { this.requestMode(false); } }).layoutWeight(1)
        按下态按钮({ 文案: $r('app.string.' + noteFieldModeTool('source_edit').titleKey),
          字号: 应用尺寸.字号_正文_小, 是否启用: !this.disabled, selectable: true, selected: this.sourceMode, fillWidth: true,
          点击回调: (): void => { this.requestMode(true); } }).layoutWeight(1)
      }.width('100%')
      Stack({ alignContent: Alignment.BottomEnd }) {
        if (this.sourceMode) {
          TextArea({ text: this.value, placeholder: this.placeholderText(), controller: this.controller })
            .id(this.inputKey + '-source')
            .width('100%').height(noteEditorHeight(this.expanded)).fontSize(this.editingFontSize())
            .fontFamily(this.fieldConfig?.fontName || 'HarmonyOS Sans')
            .direction(this.fieldConfig?.rtl === true ? Direction.Rtl : Direction.Ltr)
            .textAlign(TextAlign.Start)
            .fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary'))
            .backgroundColor($r('app.color.surface_card'))
            .border(SurfaceBorder.options())
            .borderRadius(应用尺寸.圆角_面板).padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10,
              top: 应用尺寸.间距_10, bottom: 36 }).enabled(!this.disabled)
            .defaultFocus(this.sourceToolFocus)
            .onFocus((): void => { this.fieldFocus(); }).onBlur((): void => { this.fieldBlur(); })
            .onTouch((event: TouchEvent): void => { if (this.fieldFocused && event.type === TouchType.Down) this.showWheel(); })
            .onChange((text: string): void => { this.sourceChanged(text); })
            .onTextSelectionChange((start: number, end: number): void => { this.selectionStart = start; this.selectionEnd = end; this.updateWheel(); })
        } else {
          RichEditor({ controller: this.richController })
            .id(this.inputKey + '-visual')
            .direction(this.fieldConfig?.rtl === true ? Direction.Rtl : Direction.Ltr)
            .width('100%').height(noteEditorHeight(this.expanded)).placeholder(this.placeholderText(), { fontColor: $r('app.color.text_tertiary') })
            .backgroundColor($r('app.color.surface_card'))
            .border(SurfaceBorder.options())
            .borderRadius(应用尺寸.圆角_面板).padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10,
              top: 应用尺寸.间距_10, bottom: 36 }).enabled(!this.disabled)
            .defaultFocus(this.sourceToolFocus)
            .onFocus((): void => { this.fieldFocus(); }).onBlur((): void => { this.fieldBlur(); })
            .onTouch((event: TouchEvent): void => { if (this.fieldFocused && event.type === TouchType.Down) this.showWheel(); })
            .onReady((): void => { this.richReady(); })
            .onSelectionChange((range: RichEditorRange): void => { this.richSelectionChanged(range); })
            .onWillChange((change: RichEditorChangeValue): boolean => change.replacedImageSpans.length === 0 && change.replacedSymbolSpans.length === 0)
            .onDidChange((): void => { this.publishRich(); })
        }
        IconActionButton({ source: $r('app.media.' + noteFieldExpansionTool(this.expanded).iconKey),
          label: $r('app.string.' + noteFieldExpansionTool(this.expanded).titleKey),
          controlSize: 32, controlGlyphSize: 14, surface: $r('app.color.surface_card'), isInteractive: !this.disabled,
          onAction: (): void => { this.requestExpanded(); } })
          .margin({ right: 4, bottom: 4 }).focusOnTouch(false).focusable(false)
      }.width('100%').height(noteEditorHeight(this.expanded))
      if (this.sourceMode) {
        Text($r('app.string.note_editor_source_hint'))
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      }
    }.width('100%')
  }
}
