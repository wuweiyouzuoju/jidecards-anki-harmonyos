// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteDraftPreviewInput } from '../NoteDraftPreview';

/** 导航只携带数据，NavPathStack 由根宿主注入组件，不进入跨页参数协议。 */
export interface 设置页参数 {
  openAiSettings?: boolean;
  sectionId?: string;
  initialActionId?: string;
}

export interface 浏览页参数 {
  deckId?: string;
  initialSearch?: string;
  initialNotesMode?: boolean;
  initialPreviewCardId?: number;
  selectForAgentEdit?: boolean;
}

export interface EditNotePageParams {
  targetId: number;
  isNote: boolean;
}

export interface NoteDraftPreviewPageParams {
  input: NoteDraftPreviewInput;
}

export interface DeckOptionsPageParams {
  deckId: number;
  deckName: string;
}

export interface 添加笔记牌组选项 { id: number; name: string; }
export interface 添加笔记笔记类型选项 { id: number; name: string; }
export interface 添加笔记页参数 { deckId?: string; deckName?: string; deckOptions?: 添加笔记牌组选项[]; }
