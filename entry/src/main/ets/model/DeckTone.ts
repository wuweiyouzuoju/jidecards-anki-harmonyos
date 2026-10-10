// SPDX-License-Identifier: AGPL-3.0-or-later

/** 数值及持久化映射保持兼容；历史黑色继续显示，但不作为新的候选项。 */
export enum 牌组色调 {
  Blue,
  Purple,
  Mint,
  Amber,
  Black,
  Red,
  None
}

export interface DeckToneChoice { tone: 牌组色调; titleKey: string; colorKey: string; iconKey: string; }

/** 色调菜单与 JIDE 共用候选、顺序及名称，颜色仍由主题资源拥有。 */
export const DECK_TONE_CHOICES: DeckToneChoice[] = [
  { tone: 牌组色调.Blue, titleKey: 'deck_tone_blue', colorKey: 'deck_blue', iconKey: 'ic_deck_tone' },
  { tone: 牌组色调.Purple, titleKey: 'deck_tone_purple', colorKey: 'deck_purple', iconKey: 'ic_deck_tone' },
  { tone: 牌组色调.Mint, titleKey: 'deck_tone_mint', colorKey: 'deck_mint', iconKey: 'ic_deck_tone' },
  { tone: 牌组色调.Amber, titleKey: 'deck_tone_amber', colorKey: 'deck_amber', iconKey: 'ic_deck_tone' },
  { tone: 牌组色调.Red, titleKey: 'deck_tone_red', colorKey: 'deck_red', iconKey: 'ic_deck_tone' },
  { tone: 牌组色调.None, titleKey: 'deck_tone_none', colorKey: '', iconKey: 'ic_deck_tone_none' }
];
