// SPDX-License-Identifier: AGPL-3.0-or-later
export const MOTION_STYLE_KEY: string = 'motion_style';
export const MOTION_STYLES: string[] = ['restrained', 'lively'];

export interface MotionProfile {
  menuScale: number;
  menuEnterMs: number;
  menuExitMs: number;
  dialogScale: number;
  fullScreenExtraMs: number;
  disclosureMs: number;
  pressScale: number;
  springFeedback: boolean;
  pageOffset: number;
  wheelOpenMs: number;
  wheelCloseMs: number;
  wheelSnapMs: number;
  toolbarSnapMs: number;
  statusMs: number;
  textMs: number;
  textOffset: number;
  wheelMoveMs: number;
  listChangeMs: number;
}

export function isMotionStyle(value: string): boolean { return MOTION_STYLES.includes(value); }
export function motionStyleTitleKey(value: string): string {
  return value === 'lively' ? 'motion_style_lively' : 'motion_style_restrained';
}

/** 只描述应用控件反馈；卡片翻面、评分与模板内容不属于动效风格。 */
export function motionProfile(style: string): MotionProfile {
  if (style === 'lively') {
    return { menuScale: 0.94, menuEnterMs: 220, menuExitMs: 140, dialogScale: 0.92,
      fullScreenExtraMs: 40, disclosureMs: 220, pressScale: 0.975, springFeedback: true, pageOffset: 16,
      wheelOpenMs: 300, wheelCloseMs: 220, wheelSnapMs: 240, toolbarSnapMs: 240,
      statusMs: 180, textMs: 180, textOffset: 4, wheelMoveMs: 240, listChangeMs: 180 };
  }
  return { menuScale: 0.98, menuEnterMs: 150, menuExitMs: 150, dialogScale: 0.96,
    fullScreenExtraMs: 0, disclosureMs: 150, pressScale: 1, springFeedback: false, pageOffset: 0,
    wheelOpenMs: 260, wheelCloseMs: 220, wheelSnapMs: 180, toolbarSnapMs: 150,
    statusMs: 120, textMs: 120, textOffset: 0, wheelMoveMs: 180, listChangeMs: 120 };
}
