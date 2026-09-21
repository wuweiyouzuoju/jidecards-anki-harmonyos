// SPDX-License-Identifier: AGPL-3.0-or-later
/** 面板提交时携带的背景图动作。 */
export type 牌组背景动作 = 'keep' | 'remove' | 'replace';

/** 面板 onSave 上抛的结果：新名 + 背景图动作 + 裁剪后的 PixelMap（仅 replace 时有效）。 */
export interface 牌组定制结果 {
  新名: string;
  背景动作: 牌组背景动作;
  背景像素图: PixelMap | null;
}

