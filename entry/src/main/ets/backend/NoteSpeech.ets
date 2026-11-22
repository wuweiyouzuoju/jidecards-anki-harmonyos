// SPDX-License-Identifier: AGPL-3.0-or-later
import { textToSpeech } from '@kit.CoreSpeechKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { CoreRpc } from '../proto/generated/CoreRpc';
import { CardRenderingHtmlToTextLineRequest, GenericString } from '../proto/generated/CoreMessages';
import { 后端会话 } from './后端会话';
import { 加载语音人物 } from '../model/TTS语音存储';
import { 按语言取音色人物 } from '../utils/TTS语音助手';
import { pcm16Wav } from '../model/PcmWave';
import { MAX_NOTE_AUDIO_BYTES } from '../model/NoteAudioDraft';
import { stageNoteAudioBytes } from './NoteAudioImport';

export async function noteSpeechText(field: string): Promise<string> {
  const request = new CardRenderingHtmlToTextLineRequest();
  request.setText(field);
  const response = await new CoreRpc(后端会话.获取实例()).CardRendering_html_to_text_line(request.转为字节());
  return new GenericString(response).getVal().trim();
}

const LOG_DOMAIN = 0x0001;
const LOG_TAG = 'NoteSpeech';
const ENGINE_TIMEOUT_MS = 8000;
const STREAM_TIMEOUT_MS = 30000;
const STREAM_SETTLE_MS = 200;
let requestSequence = 0;

/** 单个编辑弹层拥有合成任务；取消后不重试或接纳迟到的音频。 */
export class NoteSpeech {
  private generation: number = 0;
  private abort: (() => void) | undefined;

  cancel(): void {
    this.generation++;
    this.abort?.();
  }

  /** @throws {Error} 合成或缓存失败由音频弹层提示。 */
  async generate(text: string, cacheDir: string): Promise<string> {
    this.cancel();
    const generation = this.generation;
    const language = /[\u3400-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
    const stored = await 加载语音人物(language);
    const candidates = language === 'zh-CN' ? [stored || 13, 13, 0] : [stored || 按语言取音色人物(language), 8];
    let wav: ArrayBuffer | undefined;
    for (const person of new Set<number>(candidates)) {
      if (generation !== this.generation) throw new Error('speech_cancelled');
      try {
        wav = await this.synthesize(text, language, person, generation);
        break;
      } catch (error) {
        if (generation !== this.generation) throw new Error('speech_cancelled');
        const code = (error as BusinessError).code ?? 0;
        const reason = error instanceof Error ? error.message : '';
        hilog.warn(LOG_DOMAIN, LOG_TAG, 'Synthesis attempt failed: language=%{public}s person=%{public}d code=%{public}d stage=%{public}s',
          language, person, code, reason.startsWith('speech_') ? reason : 'engine');
        if (language === 'en-US' && (code === 1002300002 || code === 1002300003)) throw new Error('speech_voice_unavailable');
        if (reason === 'speech_stream_timeout' || reason === 'speech_engine_timeout') break;
      }
    }
    if (generation !== this.generation) throw new Error('speech_cancelled');
    if (!wav) throw new Error('speech_synthesis_failed');
    try {
      return await stageNoteAudioBytes(new Uint8Array(wav), cacheDir);
    } catch (error) {
      hilog.warn(LOG_DOMAIN, LOG_TAG, 'WAV cache write failed: code=%{public}d', (error as BusinessError).code ?? 0);
      throw new Error('speech_cache_failed');
    }
  }

  private openEngine(language: string, person: number): Promise<textToSpeech.TextToSpeechEngine> {
    return new Promise<textToSpeech.TextToSpeechEngine>((resolve, reject) => {
      let pending = true;
      const abandon = (reason: string): void => {
        if (!pending) return;
        pending = false;
        this.abort = undefined;
        clearTimeout(timer);
        reject(new Error(reason));
      };
      const timer = setTimeout((): void => { abandon('speech_engine_timeout'); }, ENGINE_TIMEOUT_MS);
      this.abort = (): void => { abandon('speech_cancelled'); };
      try {
        textToSpeech.createEngine({ language: language, person: person, online: 1, extraParams: {} })
          .then((engine: textToSpeech.TextToSpeechEngine): void => {
            if (!pending) { this.shutdown(engine); return; }
            pending = false;
            this.abort = undefined;
            clearTimeout(timer);
            resolve(engine);
          }).catch((error: Error): void => {
            if (!pending) return;
            pending = false;
            this.abort = undefined;
            clearTimeout(timer);
            reject(error);
          });
      } catch (error) { abandon('speech_engine_start'); }
    });
  }

  private shutdown(engine: textToSpeech.TextToSpeechEngine): void {
    try { engine.shutdown(); } catch (error) { /* 引擎可能已被系统回收。 */ }
  }

  /** @throws {Error} 调用方按音色重试，缓存写入留在重试边界之外。 */
  private async synthesize(text: string, language: string, person: number, generation: number): Promise<ArrayBuffer> {
    const engine = await this.openEngine(language, person);
    try {
      if (generation !== this.generation) throw new Error('speech_cancelled');
      const requestId = 'noteSpeech' + Date.now() + 'n' + (++requestSequence);
      return await this.collect(engine, requestId, text, language);
    } finally { this.shutdown(engine); }
  }

  private collect(engine: textToSpeech.TextToSpeechEngine, requestId: string, text: string,
    language: string): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const parts = new Map<number, ArrayBuffer>();
      let format: textToSpeech.StartResponse | undefined;
      let size = 0;
      let done = false;
      let complete = false;
      let settleTimer = -1;
      const finish = (reason: string, wav?: ArrayBuffer, code: number = 0): void => {
        if (done) return;
        done = true;
        this.abort = undefined;
        clearTimeout(timeout);
        if (settleTimer !== -1) clearTimeout(settleTimer);
        if (wav) resolve(wav);
        else {
          const error = new Error(reason) as BusinessError;
          error.code = code;
          reject(error);
        }
      };
      const seal = (): void => {
        if (size === 0) { finish('speech_empty_stream'); return; }
        const sampleBit = Number(format?.sampleBit) || 16;
        const sampleRate = Number(format?.sampleRate) || 16000;
        const reportedChannel = Number(format?.audioChannel) || 1;
        // API26 仅合成模式会返回语音助手通道 3，实测数据是单声道帧。
        const channels = reportedChannel === 3 ? 1 : reportedChannel;
        hilog.info(LOG_DOMAIN, LOG_TAG, 'PCM metadata: start=%{public}s type=%{public}s bits=%{public}d rate=%{public}d reportedChannel=%{public}d wavChannels=%{public}d bytes=%{public}d chunks=%{public}d',
          String(format !== undefined), String(format?.audioType ?? ''), sampleBit, sampleRate, reportedChannel, channels, size, parts.size);
        if (sampleBit !== 16) { finish('speech_invalid_sample_bits'); return; }
        const pcm = new Uint8Array(size);
        let offset = 0;
        for (let sequence = 0; sequence < parts.size; sequence++) {
          const part = parts.get(sequence);
          if (!part) { finish('speech_stream_gap'); return; }
          pcm.set(new Uint8Array(part), offset);
          offset += part.byteLength;
        }
        // 仅合成模式可能不先通知 Start。按 SDK 的 16 kHz PCM 生成单声道，优先使用明确的格式元数据。
        try { finish('', pcm16Wav(pcm, sampleRate, channels)); }
        catch (error) { finish('speech_invalid_pcm_frame'); }
      };
      const scheduleSeal = (): void => {
        if (settleTimer !== -1) clearTimeout(settleTimer);
        settleTimer = setTimeout(seal, STREAM_SETTLE_MS);
      };
      const timeout = setTimeout((): void => { finish('speech_stream_timeout'); }, STREAM_TIMEOUT_MS);
      this.abort = (): void => { finish('speech_cancelled'); };
      try {
        engine.setListener({
          onStart: (id: string, response: textToSpeech.StartResponse): void => {
            if (!done && id === requestId) format = response;
          },
          onData: (id: string, data: ArrayBuffer, response: textToSpeech.SynthesisResponse): void => {
            if (done || id !== requestId || parts.has(response.sequence) || data.byteLength === 0) return;
            if (!Number.isInteger(response.sequence) || response.sequence < 0 || response.sequence > 100000 ||
              (response.audioType && response.audioType.toLowerCase() !== 'pcm') || size + data.byteLength > MAX_NOTE_AUDIO_BYTES - 44) {
              finish('speech_invalid_stream'); return;
            }
            size += data.byteLength;
            parts.set(response.sequence, data);
            if (complete) scheduleSeal();
          },
          onComplete: (id: string, response: textToSpeech.CompleteResponse): void => {
            if (done || id !== requestId || response.type !== 0) return;
            complete = true;
            scheduleSeal();
          },
          onStop: (id: string, _response: textToSpeech.StopResponse): void => {
            if (id === requestId) finish('speech_stream_stopped');
          },
          onError: (id: string, code: number, _message: string): void => {
            if (id === requestId) finish('speech_engine_callback', undefined, code);
          }
        });
        engine.speak(text, { requestId: requestId, extraParams: { playType: 0, audioType: 'pcm', languageContext: language } });
      } catch (error) { finish('speech_speak_failed', undefined, (error as BusinessError).code ?? 0); }
    });
  }
}
