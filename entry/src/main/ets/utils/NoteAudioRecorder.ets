// SPDX-License-Identifier: AGPL-3.0-or-later
import { common, abilityAccessCtrl } from '@kit.AbilityKit';
import { media } from '@kit.MediaKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { NoteFieldAudio } from '../model/NoteAudioDraft';

/** 只删除本功能创建的缓存录音；绝不操作媒体库或用户选择的原文件。 */
export async function discardNoteRecordings(audios: NoteFieldAudio[]): Promise<void> {
  for (const item of audios) {
    if (item.temporary && !new RegExp('[/\\\\]collection\\.media[/\\\\]').test(item.uri) &&
      new RegExp('/note-(?:recording|audio)-[0-9-]+\\.(?:m4a|mp3|aac|wav|ogg|flac)$').test(item.uri)) {
      try { await fs.unlink(item.uri); }
      catch (error) { hilog.warn(0x0001, 'NoteAudio', 'Recording cleanup failed: %{public}s', `${error}`); }
    }
  }
}

/** 拥有当前录音的 recorder/fd；完成后仅把缓存路径转给表单草稿。 */
export class NoteAudioRecorder {
  private recorder: media.AVRecorder | null = null;
  private file: fs.File | null = null;
  private path: string = '';
  private generation: number = 0;
  private pending: Promise<boolean> | null = null;
  private failed: boolean = false;
  private errorCode: number = 0;
  private stage: string = 'idle';

  failureCode(): number { return this.errorCode; }

  private reportFailure(error: Error): void {
    const code: number = (error as BusinessError).code;
    if (Number.isFinite(code)) this.errorCode = code;
    hilog.error(0x0001, 'NoteAudio', 'Recording failed: stage=%{public}s code=%{public}d', this.stage, this.errorCode);
  }

  /** @throws {Error} 权限拒绝/录制失败交给表单显示。 */
  async start(context: common.UIAbilityContext, onError: () => void): Promise<boolean> {
    if (this.pending !== null || this.recorder !== null) throw new Error('Recording already active');
    const generation: number = ++this.generation;
    this.failed = false;
    this.errorCode = 0;
    this.pending = this.startInternal(context, generation, onError);
    try { return await this.pending; } finally { this.pending = null; }
  }

  /** @throws {Error} 由 start/组件边界处理。 */
  private async startInternal(context: common.UIAbilityContext, generation: number, onError: () => void): Promise<boolean> {
    let recorder: media.AVRecorder | null = null;
    let file: fs.File | null = null;
    let path: string = '';
    let transferred: boolean = false;
    try {
      this.stage = 'permission';
      const permission = await abilityAccessCtrl.createAtManager().requestPermissionsFromUser(context,
        ['ohos.permission.MICROPHONE']);
      if (generation !== this.generation) return false;
      if (permission.authResults[0] !== 0) {
        this.errorCode = 201;
        throw new Error('Microphone permission denied');
      }
      this.stage = 'file';
      path = `${context.cacheDir}/note-recording-${Date.now()}-${generation}.m4a`;
      file = await fs.open(path, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      this.stage = 'create';
      recorder = await media.createAVRecorder();
      recorder.on('stateChange', (state: media.AVRecorderState): void => {
        hilog.info(0x0001, 'NoteAudio', 'Recorder state=%{public}s', state);
      });
      recorder.on('error', (error: BusinessError): void => {
        if (generation === this.generation && !this.failed) {
          this.failed = true; this.reportFailure(error); onError();
        }
      });
      const profile: media.AVRecorderProfile = {
        audioBitrate: 96000, audioChannels: 1, audioCodec: media.CodecMimeType.AUDIO_AAC,
        audioSampleRate: 44100, fileFormat: media.ContainerFormatType.CFT_MPEG_4A
      };
      const config: media.AVRecorderConfig = {
        audioSourceType: media.AudioSourceType.AUDIO_SOURCE_TYPE_MIC, profile: profile, url: `fd://${file.fd}`
      };
      if (generation !== this.generation) return false;
      // 同一 prepare API 的 callback 重载保留正确的 SDK 权限元数据。
      // Promise 重载把说明文字并入 @permission，误判已声明的 MICROPHONE。
      const activeRecorder: media.AVRecorder = recorder;
      this.stage = 'prepare';
      await new Promise<void>((resolve, reject): void => {
        try {
          activeRecorder.prepare(config, (error: BusinessError): void => {
            if (error) reject(error); else resolve();
          });
        } catch (error) { reject(error as Error); }
      });
      if (generation !== this.generation) return false;
      this.stage = 'start';
      await recorder.start();
      if (generation !== this.generation || this.failed) throw new Error('Recording interrupted');
      this.recorder = recorder; this.file = file; this.path = path;
      transferred = true;
      this.stage = 'recording';
      return true;
    } catch (error) {
      this.reportFailure(error as Error);
      throw error as Error;
    } finally {
      if (!transferred) {
        try { if (recorder !== null) await recorder.release(); }
        finally {
          try { if (file !== null) await fs.close(file); }
          finally { if (path !== '') await this.remove(path); }
        }
      }
    }
  }

  /** @throws {Error} 只在正在录音时暂停；错误由字段处理并释放资源。 */
  async pause(): Promise<void> { await this.changePause(true); }

  /** @throws {Error} 只在暂停后继续，保留同一个录音文件。 */
  async resume(): Promise<void> { await this.changePause(false); }

  /** @throws {Error} 状态流转失败不能显示为已成功暂停/继续。 */
  private async changePause(paused: boolean): Promise<void> {
    const generation: number = this.generation;
    const recorder: media.AVRecorder | null = this.recorder;
    this.stage = paused ? 'pause' : 'resume';
    try {
      if (recorder === null || this.failed || recorder.state !== (paused ? 'started' : 'paused')) {
        throw new Error('Recording unavailable');
      }
      if (paused) await recorder.pause(); else await recorder.resume();
      if (generation !== this.generation || this.failed) throw new Error('Recording interrupted');
      this.stage = paused ? 'paused' : 'recording';
    } catch (error) {
      this.reportFailure(error as Error);
      throw error as Error;
    }
  }

  /** @throws {Error} 无效/被系统中断的录音不会作为成功附件交回表单。 */
  async finish(): Promise<string> {
    const generation: number = this.generation;
    const recorder: media.AVRecorder | null = this.recorder;
    const path: string = this.path;
    if (recorder === null || this.failed) { await this.cancel(); throw new Error('Recording unavailable'); }
    let success: boolean = false;
    try {
      this.stage = 'stop';
      await recorder.stop();
      if (this.failed || generation !== this.generation) throw new Error('Recording interrupted');
      await this.release();
      if ((await fs.stat(path)).size <= 0) throw new Error('Empty recording');
      if (generation !== this.generation) throw new Error('Recording interrupted');
      success = true;
      return path;
    } catch (error) {
      this.reportFailure(error as Error);
      throw error as Error;
    } finally {
      if (!success) { await this.release(); await this.remove(path); }
    }
  }

  /** @throws {Error} 由组件取消/离页边界处理，失败不转为成功录音。 */
  async cancel(): Promise<void> {
    this.generation++;
    if (this.pending !== null) { try { await this.pending; } catch (error) { /* start 已有 UI 错误边界。 */ } }
    const path: string = this.path;
    await this.release();
    if (path !== '') await this.remove(path);
  }

  /** @throws {Error} 平台释放失败由 finish/cancel 的 UI 边界处理，fd 仍在 finally 关闭。 */
  private async release(): Promise<void> {
    const recorder: media.AVRecorder | null = this.recorder;
    const file: fs.File | null = this.file;
    this.recorder = null; this.file = null; this.path = '';
    try { if (recorder !== null) await recorder.release(); }
    finally { if (file !== null) await fs.close(file); }
  }
  private async remove(path: string): Promise<void> {
    try { await fs.unlink(path); }
    catch (error) { hilog.warn(0x0001, 'NoteAudio', 'Recording cleanup failed: %{public}s', `${error}`); }
  }
}
