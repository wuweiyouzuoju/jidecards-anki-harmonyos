// SPDX-License-Identifier: AGPL-3.0-or-later

/** 导航只携带数据，NavPathStack 由根宿主注入组件，不进入跨页参数协议。 */
export interface 设置页参数 {
  openAiSettings?: boolean;
}

export interface 浏览页参数 {
  deckId?: string;
  initialSearch?: string;
  selectForAgentEdit?: boolean;
  editCardId?: number;
}
