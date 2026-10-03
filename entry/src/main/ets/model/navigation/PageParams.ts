// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteDraftPreviewInput } from '../NoteDraftPreview';

/** 导航只携带数据，NavPathStack 由根宿主注入组件，不进入跨页参数协议。 */
export interface 设置页参数 {
  openAiSettings?: boolean;
}

export interface 浏览页参数 {
  deckId?: string;
  initialSearch?: string;
  initialNotesMode?: boolean;
  selectForAgentEdit?: boolean;
}

export interface EditNotePageParams {
  targetId: number;
  isNote: boolean;
}

export interface NoteDraftPreviewPageParams {
  input: NoteDraftPreviewInput;
}
