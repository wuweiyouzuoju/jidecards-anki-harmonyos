// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteDraftPreviewInput, NoteDraftPreviewSession, DraftPreviewState, initialDraftPreviewState } from '../../model/NoteDraftPreview';
import { AnkiNoteDraftPreview } from '../../backend/AnkiNoteDraftPreview';
import { NotetypeTemplatePreview } from '../settings/NotetypeTemplatePreview';
import { DialogFrame } from './DialogFrame';
import { DialogHeader } from './DialogHeader';
import { NoteEditorHeader } from './NoteEditorHeader';
import { localizedNamedResourceText } from '../../utils/UiFeedback';

/** 新增、编辑与模板样例共用 Core 预览；外壳切换不改变草稿或媒体责任。 */
@Component
export struct NoteDraftPreview {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop input: NoteDraftPreviewInput;
  @Prop isDark: boolean = false;
  @Prop fullScreen: boolean = false;
  @Prop isVisible: boolean = true;
  onClose: () => void = (): void => {};
  @State private state: DraftPreviewState = initialDraftPreviewState();
  private releaseCard: () => Promise<void> = (): Promise<void> => Promise.resolve();
  private session: NoteDraftPreviewSession = new NoteDraftPreviewSession(new AnkiNoteDraftPreview(),
    (state: DraftPreviewState): void => { this.state = state; });
  aboutToAppear(): void { this.session.open(this.input).catch((): void => {}); }
  aboutToDisappear(): void {
    this.session.dispose(this.releaseCard()).catch((error: Error): void => { console.warn(error.message); });
  }
  @Builder
  private header() {
    DialogHeader({ title: this.input.sample ? $r('app.string.notetype_template_preview') : $r('app.string.note_draft_preview'),
      closeLabel: $r('app.string.close'), onClose: this.onClose })
  }
  @Builder
  private content() {
    Column({ space: 8 }) {
      if (this.state.busy) { LoadingProgress().width(32).height(32) }
      if (this.state.error !== '') {
        Text(this.state.error.startsWith('note_preview_') ? localizedNamedResourceText(this.getUIContext(), this.uiLanguage, this.state.error) : this.state.error)
          .fontColor($r('app.color.error_text'))
      }
    }.width('100%')
  }
  build() {
    if (this.state.rendered !== null) {
      ForEach([this.state.revision], (_revision: number) => {
        NotetypeTemplatePreview({ rendered: this.state.rendered!, isDark: this.isDark, options: this.state.options,
          selected: this.state.selected, media: this.state.media, sample: this.input.sample ?? false,
          fullScreen: this.fullScreen, isVisible: this.isVisible,
          onReleaseAvailable: (release: () => Promise<void>): void => { this.releaseCard = release; },
          onSelect: (index: number): void => { this.session.select(index); }, onClose: this.onClose })
      }, (revision: number): string => String(revision))
    } else if (this.fullScreen) {
      Column() {
        NoteEditorHeader({ title: this.input.sample ? $r('app.string.notetype_template_preview') : $r('app.string.note_draft_preview'),
          showAction: false, onBack: this.onClose })
        Column() { this.content() }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
      }.width('100%').height('100%')
    } else {
      DialogFrame({ header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: this.onClose })
    }
  }
}
