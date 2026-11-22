// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo as fs } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import { deepSeekOcrPage, deepSeekTranscript } from '../../model/agent/DeepSeekMedia';
import type { DeepSeekPageText } from '../../model/agent/DeepSeekMedia';

const TOOL_URL: string = 'https://api.deepseek.com/v1/tools/';
interface ToolHeaders { Authorization: string; 'Content-Type': string; }
interface SpeechRequest { text: string; format: string; filter_markdown: boolean; }

/** Standalone APIs share the saved model key. Each owner can cancel only its own request. */
export class DeepSeekMediaService {
  private active: http.HttpRequest | null = null;

  cancel(): void {
    const request = this.active;
    this.active = null;
    request?.destroy();
  }

  /** @throws {Error} HTTP and response errors are reported through the caller. */
  private async request(tool: string, key: string, parts: http.MultiFormData[], body: string): Promise<http.HttpResponse> {
    if (key.trim().length === 0) throw new Error('deepseek_media_key_missing');
    if (this.active !== null) throw new Error('deepseek_media_busy');
    const client = http.createHttp();
    this.active = client;
    const headers: ToolHeaders = { Authorization: 'Bearer ' + key,
      'Content-Type': parts.length > 0 ? 'multipart/form-data' : 'application/json' };
    try {
      const response = await client.request(TOOL_URL + tool, {
        method: http.RequestMethod.POST, header: headers, usingCache: false,
        connectTimeout: 15000, readTimeout: 190000, maxLimit: 32 * 1024 * 1024,
        expectDataType: tool === 'tts' ? http.HttpDataType.ARRAY_BUFFER : http.HttpDataType.STRING,
        multiFormDataList: parts.length > 0 ? parts : undefined, extraData: body.length > 0 ? body : undefined
      });
      if (this.active !== client) throw new Error('cancelled');
      if (response.responseCode !== 200) throw new Error('deepseek_media_http_' + response.responseCode);
      return response;
    } finally {
      if (this.active === client) this.cancel();
    }
  }

  /** @throws {Error} Empty or invalid transcription is not inserted into the input. */
  async transcribe(key: string, wav: ArrayBuffer): Promise<string> {
    const result = await this.request('asr', key, [{ name: 'file', contentType: 'audio/wav',
      remoteFileName: 'speech.wav', data: wav }], '');
    if (typeof result.result !== 'string') throw new Error('deepseek_asr_failed');
    return deepSeekTranscript(result.result);
  }

  /** @throws {Error} A failed OCR job can return HTTP 200 with an error body. */
  async recognize(key: string, jpeg: ArrayBuffer): Promise<DeepSeekPageText> {
    const parts: http.MultiFormData[] = [
      { name: 'purpose', contentType: 'text/plain', data: 'rich_layout_recognition' },
      { name: 'file', contentType: 'image/jpeg', remoteFileName: 'page.jpg', data: jpeg }
    ];
    const result = await this.request('ocr', key, parts, '');
    if (typeof result.result !== 'string') throw new Error('deepseek_ocr_failed');
    return deepSeekOcrPage(result.result);
  }

  /** @throws {Error} Only a valid WAV response is eligible for playback. */
  async speak(key: string, text: string): Promise<ArrayBuffer> {
    const payload: SpeechRequest = { text: text, format: 'wav', filter_markdown: true };
    const result = await this.request('tts', key, [], JSON.stringify(payload));
    const wav = result.result;
    if (!(wav instanceof ArrayBuffer) || wav.byteLength < 44 ||
      new DataView(wav).getUint32(0) !== 0x52494646 || new DataView(wav).getUint32(8) !== 0x57415645) {
      throw new Error('deepseek_tts_failed');
    }
    return wav;
  }
}


/** @throws {Error} Only this feature's privately named cache file is written. */
export async function writeAgentSpeech(cacheDir: string, wav: ArrayBuffer): Promise<string> {
  const path = cacheDir + '/jide-deepseek-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.wav';
  try {
    const file = await fs.open(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    try {
      for (let offset = 0; offset < wav.byteLength;) {
        const count = await fs.write(file.fd, wav.slice(offset, Math.min(offset + 65536, wav.byteLength)));
        if (count <= 0) throw new Error('deepseek_tts_write_failed');
        offset += count;
      }
    } finally { await fs.close(file); }
    return path;
  } catch (error) {
    await removeAgentSpeech(path);
    throw error as Error;
  }
}

export async function removeAgentSpeech(path: string): Promise<void> {
  if (path.length === 0) return;
  try { await fs.unlink(path); } catch (error) { /* The cache file may already be gone. */ }
}
