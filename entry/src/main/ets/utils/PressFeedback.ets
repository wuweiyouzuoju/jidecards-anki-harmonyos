// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedPressFeedback } from 'jide_foundation';
import { currentMotionProfile } from './AppMotion';

/** 开菜单的按钮保持光学锚点稳定；其余按钮沿用系列按压反馈。 */
export class PressFeedback extends SharedPressFeedback {
  constructor(restingOpacity: number = 1, disabledOpacity: number = 0.4, stableAnchor: boolean = false) {
    super(restingOpacity, disabledOpacity, (): number => stableAnchor ? 1 : currentMotionProfile().pressScale,
      stableAnchor ? 1 : 0.72);
  }
}
