// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentMode } from './AgentTypes';
import type { NotetypeTemplatePreview } from '../../proto/messages/NotetypeMessages';

export interface AgentTaskSetup {
  templateCount?: number;
  templatePreviews?: NotetypeTemplatePreview[];
  mode: AgentMode;
  deckId: number;
  deckName: string;
  notetypeId: number;
  notetypeName: string;
  fieldNames: string[];
  noteTypeKind: number;
  clozeFieldOrds: number[];
  expanded: boolean;
}

export interface AgentTaskSnapshot {
  templateCount?: number;
  templatePreviews?: NotetypeTemplatePreview[];
  mode: AgentMode;
  deckId: number;
  deckName: string;
  notetypeId: number;
  notetypeName: string;
  fieldNames: string[];
  noteTypeKind: number;
  clozeFieldOrds: number[];
  userText: string;
  localContext: string;
  omittedMedia: boolean;
  batchLimit: number;
}

interface AgentProviderTaskConfiguration {
  templateCount?: number;
  templatePreviews?: NotetypeTemplatePreview[];
  mode: AgentMode;
  deckId: number;
  deckName: string;
  notetypeId: number;
  notetypeName: string;
  fieldNames: string[];
  noteTypeKind: number;
  clozeFieldOrds: number[];
  batchLimit: number;
}

export type AgentReadinessReason =
  'ready' | 'missing_deck' | 'missing_notetype' |
  'missing_input' | 'missing_provider' | 'busy';

export function evaluateAgentReadiness(setup: AgentTaskSetup, input: string,
  providerReady: boolean, busy: boolean = false): AgentReadinessReason {
  if (busy) { return 'busy'; }
  if (input.trim().length === 0) { return 'missing_input'; }
  if (!providerReady) { return 'missing_provider'; }
  return 'ready';
}

export function buildAgentTaskProviderText(snapshot: AgentTaskSnapshot): string {
  const configuration: AgentProviderTaskConfiguration = {
    mode: snapshot.mode, deckId: snapshot.deckId, deckName: snapshot.deckName,
    notetypeId: snapshot.notetypeId, notetypeName: snapshot.notetypeName,
    fieldNames: snapshot.fieldNames.slice(), noteTypeKind: snapshot.noteTypeKind,
    clozeFieldOrds: snapshot.clozeFieldOrds.slice(), batchLimit: snapshot.batchLimit,
    templateCount: snapshot.templateCount, templatePreviews: snapshot.templatePreviews?.slice()
  };
  const mediaNotice: string = snapshot.omittedMedia ?
    '\n媒体说明：二进制媒体未发送，不得声称已经看见或听见。' : '';
  return `任务配置：${JSON.stringify(configuration)}\n用户要求：${snapshot.userText}` +
    `\n应用内本地上下文（稳定 ID，仅限本轮）：\n${snapshot.localContext}${mediaNotice}`;
}

export function buildAgentTaskVisibleText(snapshot: AgentTaskSnapshot): string {
  if (snapshot.mode !== 'create') { return snapshot.userText; }
  return `目标：${snapshot.deckName} · 笔记类型：${snapshot.notetypeName}\n${snapshot.userText}`;
}
