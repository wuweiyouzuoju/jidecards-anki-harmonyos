// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TtsItem } from '../proto/messages/CardRenderingMessages';

export interface CardTtsSupport {
  backend: string;
  voicePrefix: string;
  minimumSpeed: number;
  maximumSpeed: number;
  otherArguments: string[];
  voiceAvailability: string;
}
export interface CardRenderingSupport {
  avOrder: string;
  mediaPaths: string;
  answerComparison: string;
  clozeTyping: string;
  tts: CardTtsSupport;
}

/** 播放器和 JIDE 共用兼容边界；已安装音色由 CoreSpeechKit 实时查询。 */
export const CARD_RENDERING_SUPPORT: CardRenderingSupport = {
  avOrder: 'core-tag-order; adjacent same-kind items may be batched',
  mediaPaths: 'anki-core', answerComparison: 'anki-core', clozeTyping: 'anki-core',
  tts: { backend: 'HarmonyOS CoreSpeechKit', voicePrefix: 'HarmonyOS_', minimumSpeed: 0.5,
    maximumSpeed: 2, otherArguments: ['volume', 'pitch'], voiceAvailability: 'device-installed voices only' }
};

export function harmonyTtsVoiceName(person: number): string {
  return CARD_RENDERING_SUPPORT.tts.voicePrefix + person;
}

export interface TtsSpeakOptions {
  extraParams: Record<string, Object>;
  unsupported: string[];
  speedAdjusted: boolean;
}

/** SDK 参数范围之外保持可播放，并留下明确的兼容诊断。 */
export function ttsSpeakOptions(item: TtsItem): TtsSpeakOptions {
  const original: number = Number.isFinite(item.speed) && item.speed > 0 ? item.speed : 1;
  const speed: number = Math.min(CARD_RENDERING_SUPPORT.tts.maximumSpeed,
    Math.max(CARD_RENDERING_SUPPORT.tts.minimumSpeed, original));
  const result: TtsSpeakOptions = { extraParams: { 'speed': speed }, unsupported: [], speedAdjusted: speed !== item.speed };
  for (const argument of item.otherArgs) {
    const separator: number = argument.indexOf('=');
    const name: string = argument.substring(0, separator);
    const text: string = argument.substring(separator + 1);
    const value: number = Number(text);
    if (separator > 0 && text.trim() !== '' && Number.isFinite(value) &&
      ((name === 'volume' && value >= 0 && value <= 2) || (name === 'pitch' && value >= 0.5 && value <= 2))) {
      result.extraParams[name] = value;
    } else result.unsupported.push(argument);
  }
  return result;
}
