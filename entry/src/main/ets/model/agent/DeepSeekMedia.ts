// SPDX-License-Identifier: AGPL-3.0-or-later
import { pcm16Wav } from '../PcmWave';

export const AGENT_VOICE_SAMPLE_RATE: number = 16000;
export const AGENT_VOICE_SECONDS: number = 120;
export const AGENT_VOICE_BYTES: number = AGENT_VOICE_SAMPLE_RATE * 2 * AGENT_VOICE_SECONDS;

export function deepSeekOcrRequested(userText: string): boolean {
  return /(?:deepseek|深度求索)\s*(?:ocr|文字识别|扫描识别)|ocr\s*(?:by|with|用)\s*deepseek/i.test(userText)
    && !/(?:不(?:要|用)?|别|禁止|do not|don't|without)\s*(?:使用|用|use)?\s*(?:deepseek|深度求索)/i.test(userText);
}

export function agentVoiceWav(pcm: Uint8Array): ArrayBuffer {
  if (pcm.length === 0 || pcm.length > AGENT_VOICE_BYTES || pcm.length % 2 !== 0) throw new Error('agent_voice_empty');
  return pcm16Wav(pcm, AGENT_VOICE_SAMPLE_RATE, 1);
}

export type AgentVoiceFailure = 'permission' | 'empty' | 'credential' | 'balance' | 'format' | 'busy' | 'timeout' | 'other';

export function agentVoiceFailure(code: string): AgentVoiceFailure {
  switch (code) {
    case 'agent_voice_permission': return 'permission';
    case 'agent_voice_empty': return 'empty';
    case 'deepseek_media_key_missing':
    case 'deepseek_media_http_401':
    case 'deepseek_media_http_403': return 'credential';
    case 'deepseek_media_http_402': return 'balance';
    case 'deepseek_media_http_400':
    case 'deepseek_media_http_413':
    case 'deepseek_media_http_415': return 'format';
    case 'deepseek_media_http_429':
    case 'deepseek_media_http_503': return 'busy';
    case 'deepseek_media_http_408':
    case 'deepseek_media_http_504': return 'timeout';
    default: return 'other';
  }
}

interface DeepSeekTranscription { text?: string; }
interface DeepSeekOcrPage { index: number; text: string; finish_reason: string; }
interface DeepSeekOcrResponse { page_count?: number; pages?: DeepSeekOcrPage[]; }

export interface DeepSeekPageText { text: string; truncated: boolean; }

export function deepSeekTranscript(body: string): string {
  const result = JSON.parse(body) as DeepSeekTranscription;
  const text = typeof result?.text === 'string' ? result.text.trim() : '';
  if (text.length === 0) throw new Error('agent_voice_empty');
  return text;
}

export function deepSeekOcrPage(body: string): DeepSeekPageText {
  const result = JSON.parse(body) as DeepSeekOcrResponse;
  const page = result?.pages?.[0];
  if (result?.page_count !== 1 || result.pages?.length !== 1 || !page || page.index !== 0 ||
    typeof page.text !== 'string' || (page.finish_reason !== 'stop' && page.finish_reason !== 'length')) {
    throw new Error('deepseek_ocr_failed');
  }
  const text = page.text.replace(/<｜box｜>[\s\S]*?<｜\/box｜>/g, '').replace(/<｜\/?ref｜>/g, '').trim();
  if (text.length === 0) throw new Error('no_extractable_text');
  return { text: text, truncated: page.finish_reason === 'length' };
}
