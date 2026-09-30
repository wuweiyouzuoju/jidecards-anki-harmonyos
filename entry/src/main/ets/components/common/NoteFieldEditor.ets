import { PressFeedback } from '../../utils/PressFeedback';
import { LengthMetrics } from '@kit.ArkUI';
import { noteClozeDecorations } from '../../model/NoteClozeDecoration';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { FieldEditResult, wrapFieldSelection, nextClozeNumber } from '../../model/NoteFieldEditing';
import { NoteTextRun, parseNoteRichText, serializeNoteRichText, selectionHasFormat, richResultIsBold,
  FORMAT_BOLD, FORMAT_ITALIC, FORMAT_UNDERLINE, FORMAT_HIGHLIGHT } from '../../model/NoteRichText';
import { hasNoteEditingHint, completeNoteEditingHint } from '../../utils/NoteEditingHints';
import { namedResourceText, resourceText, showToastSafely } from '../../utils/UiFeedback';
import { 字段帮助对话框 } from '../字段帮助面板';

/** 三个笔记入口共用；可视编辑仅接管可保真理解的文字 HTML，复杂内容保留源码。 */
@Component
export struct NoteFieldEditor {
  @Prop @Watch('receiveValue') value: string = '';
  @Prop fieldName: string = '';
  @Prop disabled: boolean = false;
  @Prop clozeEnabled: boolean = false;
  @Prop allFields: string[] = [];
  onChange: (value: string) => void = (_value: string): void => {};
  private controller: TextAreaController = new TextAreaController();
  private richController: RichEditorController = new RichEditorController();
  @State private sourceMode: boolean = false;
  @State private typingFormat: number = 0;
  private selectionStart: number = -1;
  private selectionEnd: number = -1;
  private disposed: boolean = false;
  private ready: boolean = false;
  private applying: boolean = false;
  private lastSnapshot: string = '';
  private decoratedSnapshot: string = '';
  private selectionVersion: number = 0;
  private hintDialog: CustomDialogController | null = null;
  private hintSaving: boolean = false;
  @StorageProp(颜色键.动作主色) private accent: string = '#2F5FD0';

  aboutToAppear(): void { this.sourceMode = parseNoteRichText(this.value) === null; }
  aboutToDisappear(): void {
    this.disposed = true; this.selectionVersion++; this.ready = false;
    this.hintDialog?.close(); this.hintDialog = null;
  }

  private receiveValue(): void {
    if (this.disposed || this.applying || this.sourceMode || this.value === this.lastSnapshot) return;
    const runs: NoteTextRun[] | null = parseNoteRichText(this.value);
    if (runs === null) { this.sourceMode = true; this.ready = false; }
    else if (this.ready) this.loadRich(runs);
  }

  private style(format: number): RichEditorTextStyle {
    return { fontSize: 应用尺寸.字号_正文,
      fontColor: (format & FORMAT_HIGHLIGHT) !== 0 ? '#202020' : $r('app.color.text_primary'),
      fontWeight: (format & FORMAT_BOLD) !== 0 ? FontWeight.Bold : FontWeight.Normal,
      fontStyle: (format & FORMAT_ITALIC) !== 0 ? FontStyle.Italic : FontStyle.Normal,
      decoration: { type: (format & FORMAT_UNDERLINE) !== 0 ? TextDecorationType.Underline : TextDecorationType.None },
      textBackgroundStyle: { color: (format & FORMAT_HIGHLIGHT) !== 0 ? '#FFF176' : Color.Transparent } };
  }

  private loadRich(runs: NoteTextRun[]): void {
    this.applying = true;
    try {
      this.decoratedSnapshot = '';
      this.richController.deleteSpans();
      for (const run of runs) this.richController.addTextSpan(run.text, { style: this.style(run.format) });
      this.lastSnapshot = serializeNoteRichText(runs);
      this.richController.setTypingStyle(this.style(this.typingFormat));
    } finally { this.applying = false; }
    this.decorateCloze();
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
      runs.push({ text: text.value.slice(text.offsetInSpan[0], text.offsetInSpan[1]), format: format });
    }
    return runs;
  }

  private publishRich(): void {
    if (this.applying || !this.ready || this.disposed || this.sourceMode) return;
    const html: string = serializeNoteRichText(this.richRuns());
    this.decorateCloze();
    if (html === this.lastSnapshot) return;
    this.lastSnapshot = html;
    this.value = html; this.onChange(html);
  }

  private placeholderText(): string {
    return resourceText(this.getUIContext(), $r('app.string.note_editor_field_placeholder'), this.fieldName);
  }

  /** 只更新视觉背景，灰底不参与 HTML 序列化；预上屏时不干预中文输入。 */
  private decorateCloze(): void {
    if (!this.clozeEnabled || this.sourceMode || this.applying) return;
    for (const span of this.richController.getSpans()) {
      const text: RichEditorTextSpanResult = span as RichEditorTextSpanResult;
      if (text.previewText !== undefined && text.previewText !== '') return;
    }
    const runs: NoteTextRun[] = this.richRuns();
    const snapshot: string = serializeNoteRichText(runs);
    if (snapshot === this.decoratedSnapshot) return;
    this.applying = true;
    try {
      for (const part of noteClozeDecorations(runs)) {
        this.richController.updateSpanStyle({ start: part.start, end: part.end,
          textStyle: { textBackgroundStyle: { color: part.highlight ? '#FFF176' :
            part.cloze ? $r('app.color.note_editor_cloze_background') : Color.Transparent } } });
      }
      this.decoratedSnapshot = snapshot;
      this.richController.setTypingStyle(this.style(this.typingFormat));
    } finally { this.applying = false; }
  }

  private applyFormat(flag: number): void {
    if (this.disabled || this.disposed) return;
    if (this.sourceMode) {
      const tag: string = flag === FORMAT_BOLD ? 'b' : flag === FORMAT_ITALIC ? 'i' : flag === FORMAT_UNDERLINE ? 'u' : 'mark';
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
      const end: number = this.selectionEnd;
      this.richController.updateSpanStyle({ start: this.selectionStart, end: end, textStyle: patch });
      this.richController.setCaretOffset(end);
      this.selectionStart = end; this.selectionEnd = end;
      this.publishRich();
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

  private switchMode(): void {
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

  private activateTool(key: string, label: Resource, action: () => void): void {
    if (this.disabled || this.disposed || this.hintDialog !== null || this.hintSaving) return;
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

  private hintFailure(): void {
    showToastSafely(this.getUIContext(), { message: resourceText(this.getUIContext(), $r('app.string.note_editor_hint_store_failed')) });
  }

  @Builder
  private tool(key: string, label: Resource, flag: number, action: () => void) {
    // 动态文案在构建函数内读取状态，避免按值参数保留首次文案。
    Button(key === 'source' ?
      (this.sourceMode ? $r('app.string.note_editor_visual') : $r('app.string.note_editor_source')) : label)
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
      .onClick((): void => { if (key === 'source') action(); else this.activateTool(key, label, action); })
  }

  build() {
    Column({ space: 应用尺寸.间距_5 }) {
      if (this.sourceMode) {
        TextArea({ text: this.value, placeholder: this.placeholderText(), controller: this.controller })
          .width('100%').height(112).fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
          .borderRadius(应用尺寸.圆角_面板).padding(应用尺寸.间距_10).enabled(!this.disabled)
          .onChange((text: string): void => { this.value = text; this.onChange(text); })
          .onTextSelectionChange((start: number, end: number): void => { this.selectionStart = start; this.selectionEnd = end; })
        Text($r('app.string.note_editor_source_hint'))
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      } else {
        RichEditor({ controller: this.richController })
          .width('100%').height(112).placeholder(this.placeholderText(), { fontColor: $r('app.color.text_tertiary') })
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
          .borderRadius(应用尺寸.圆角_面板).padding(应用尺寸.间距_10).enabled(!this.disabled)
          .onReady((): void => { this.ready = true; this.loadRich(parseNoteRichText(this.value) ?? []); })
          .onSelectionChange((range: RichEditorRange): void => {
            this.selectionStart = range.start ?? 0; this.selectionEnd = range.end ?? this.selectionStart;
            if (!this.applying && this.ready) this.richController.setTypingStyle(this.style(this.typingFormat));
          })
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
      }.width('100%')
    }.width('100%')
  }
}
