// SPDX-License-Identifier: AGPL-3.0-or-later
import type { StudyCard } from '../proto/messages/SchedulerMessages';
import type { RenderedCard } from '../proto/messages/CardRenderingMessages';

export const CONTINUATION_MIN_VERSION: number = 3151;
export const CONTINUATION_PARAM: string = 'jidecards.continuation.v1';
export const CONTINUATION_MAX_CHARS: number = 24000;
export interface ContinuationSupport {
  entry: string; surfaces: string[]; requires: string[]; restored: string[]; excluded: string[]; sourceExits: boolean; agentCanInitiate: boolean;
}
export const CONTINUATION_SUPPORT: ContinuationSupport = {
  entry: 'HarmonyOS system continuation icon', surfaces: ['home', 'study'],
  requires: ['same Huawei account', 'WLAN and Bluetooth', 'system continuation enabled', 'app installed on both devices', 'collections synchronized first'],
  restored: ['selected deck', 'current Core queue card', 'question or answer side', 'typed answer'],
  excluded: ['collection transfer', 'unsaved editors', 'whiteboard', 'recording', 'choice questions', 'custom template form inputs'],
  sourceExits: false, agentCanInitiate: false
};

export interface StudyContinuation {
  cardId: number; noteId: number; fingerprint: string; answerShown: boolean; typedAnswer: string;
}
export interface ContinuationPayload {
  version: number; id: string; createdAt: number; deckId: string; study: StudyContinuation | null;
}
export function hasContinuationTemplateInput(rendered: RenderedCard): boolean {
  return new RegExp('<(?:input|textarea|select)\\b|contenteditable\\s*=', 'i').test(JSON.stringify(rendered));
}
export function studyContinuationFingerprint(card: StudyCard, rendered: RenderedCard): string {
  // 仅校验身份/内容/原始 Core 状态，不传递或重建任何调度状态。
  const value: string = JSON.stringify([card.cardId, card.noteId, card.deckId, card.templateIdx,
    card.states.current, rendered]);
  let first: number = 2166136261;
  let second: number = 5381;
  for (let i: number = 0; i < value.length; i++) {
    first = Math.imul(first ^ value.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ value.charCodeAt(i);
  }
  return (first >>> 0).toString(16) + ':' + (second >>> 0).toString(16);
}
export function decodeContinuation(text: string, now: number = Date.now()): ContinuationPayload {
  if (text.length > CONTINUATION_MAX_CHARS) throw new Error('continuation_invalid');
  const value = JSON.parse(text) as ContinuationPayload;
  if (value === null || typeof value !== 'object' || value.version !== 1 ||
    typeof value.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.id) ||
    !Number.isSafeInteger(Number(value.deckId)) || !Number.isSafeInteger(value.createdAt) || Math.abs(now - value.createdAt) > 10 * 60 * 1000 ||
    typeof value.deckId !== 'string' || (value.deckId !== '' && !/^[1-9][0-9]{0,15}$/.test(value.deckId))) throw new Error('continuation_invalid');
  const study = value.study;
  if (study !== null && (typeof study !== 'object' || value.deckId === '' ||
    !Number.isSafeInteger(study.cardId) || study.cardId <= 0 || !Number.isSafeInteger(study.noteId) || study.noteId <= 0 ||
    typeof study.fingerprint !== 'string' || !/^[a-f0-9]{1,8}:[a-f0-9]{1,8}$/.test(study.fingerprint) ||
    typeof study.answerShown !== 'boolean' || typeof study.typedAnswer !== 'string' || study.typedAnswer.length > 4000)) throw new Error('continuation_invalid');
  return value;
}

/** UI 只发布显式快照提供者；Ability 和根宿主共用此进程内接续拥有者。 */
export class ContinuationSession {
  private source: (() => ContinuationPayload | null) | null = null;
  private receiver: (() => boolean) | null = null;
  private study: (() => StudyContinuation | null) | null = null;
  private pending: ContinuationPayload | null = null;
  private seen: string[] = [];
  private listener: (() => void) | null = null;
  bind(source: (() => ContinuationPayload | null) | null, receiver: (() => boolean) | null): () => void {
    this.source = source; this.receiver = receiver; this.changed();
    return (): void => {
      if (this.source !== source || this.receiver !== receiver) return;
      this.source = null; this.receiver = null; this.changed();
    };
  }
  bindStudy(source: (() => StudyContinuation | null) | null): () => void {
    this.study = source; this.changed();
    return (): void => { if (this.study === source) { this.study = null; this.changed(); } };
  }
  studySnapshot(): StudyContinuation | null { return this.study === null ? null : this.study(); }
  capture(): ContinuationPayload | null { return this.source === null ? null : this.source(); }
  canReceive(): boolean { return this.receiver === null || this.receiver(); }
  setListener(listener: (() => void) | null): void { this.listener = listener; this.changed(); }
  changed(): void { this.listener?.(); }
  receive(text: string, now: number = Date.now()): boolean {
    const value = decodeContinuation(text, now);
    if (this.seen.includes(value.id)) return false;
    if (!this.canReceive()) throw new Error('continuation_busy');
    this.seen.push(value.id); this.seen = this.seen.slice(-32); this.pending = value;
    return true;
  }
  discard(): void { this.pending = null; }
  hasPending(): boolean { return this.pending !== null; }
  take(): ContinuationPayload | null { const value = this.pending; this.pending = null; return value; }
}
export const continuationSession: ContinuationSession = new ContinuationSession();
