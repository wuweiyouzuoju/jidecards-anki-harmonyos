// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { prepareNoteVideoPreview, releaseNoteVideoPreview, NoteVideoPreviewFile } from '../../backend/NoteVisualImport';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { ImageSurfaceStyle } from '../../utils/ImageSurfaceStyle';
import { NoteImagePreview } from '../common/NoteImagePreview';

/** 选择器与主字段共用；视频只由用户播放，缓存与播放器随组件退出释放。 */
@Component
export struct NoteVisualPreview {
  @Prop @Watch('load') source: string = '';
  @Prop @Watch('load') kind: string = 'image';
  @Prop @Watch('pauseIfBlocked') disabled: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('pauseIfBlocked') private foreground: boolean = true;
  @State private videoSource: string = '';
  @State private failed: boolean = false;
  private video: VideoController = new VideoController();
  private generation: number = 0;
  private disposed: boolean = false;
  private previewFile: NoteVideoPreviewFile | null = null;

  aboutToAppear(): void { this.disposed = false; this.load(); }
  aboutToDisappear(): void { this.disposed = true; this.generation++; this.pause(); this.releasePreview(); }

  private pause(): void {
    try { this.video.pause(); } catch (error) { /* 未准备播放器时退出仍继续清理缓存。 */ }
  }
  private pauseIfBlocked(): void { if (this.disabled || !this.foreground) this.pause(); }
  private releasePreview(): void {
    const owned: NoteVideoPreviewFile | null = this.previewFile;
    this.previewFile = null;
    if (owned !== null) releaseNoteVideoPreview(owned).catch((): void => {});
  }
  private async load(): Promise<void> {
    const generation: number = ++this.generation;
    this.pause(); this.releasePreview(); this.videoSource = ''; this.failed = false;
    if (this.disposed || this.kind !== 'video') return;
    try {
      if (this.source === '') throw new Error('Missing video');
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const owned: NoteVideoPreviewFile = await prepareNoteVideoPreview(this.source, context.cacheDir);
      if (this.disposed || generation !== this.generation) { await releaseNoteVideoPreview(owned); return; }
      this.previewFile = owned; this.videoSource = owned.source;
    } catch (error) { if (!this.disposed && generation === this.generation) this.failed = true; }
  }

  build() {
    if (this.kind !== 'video') {
      NoteImagePreview({ source: this.source })
    } else {
      Column() {
        if (this.failed) {
          Text($r('app.string.note_video_preview_failed')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text')).padding(应用尺寸.卡片内边距)
        } else if (this.videoSource === '') {
          LoadingProgress().width(应用尺寸.按钮高度).height(应用尺寸.按钮高度)
            .color($r('app.color.text_secondary'))
        } else {
          Video({ src: this.videoSource, controller: this.video }).width('100%').height(应用尺寸.noteMediaPreviewHeight)
            .objectFit(ImageFit.Contain).controls(true).autoPlay(false).enabled(!this.disabled && this.foreground)
            .accessibilityText($r('app.string.note_video_preview'))
            .onStart((): void => { this.pauseIfBlocked(); })
            .onError((): void => { this.failed = true; this.pause(); })
        }
      }.width('100%').attributeModifier(new ImageSurfaceStyle())
    }
  }
}
