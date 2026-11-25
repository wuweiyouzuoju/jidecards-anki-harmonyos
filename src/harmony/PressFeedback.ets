// SPDX-License-Identifier: AGPL-3.0-or-later
import { motionProfile } from '../core/Motion';
import { SharedPressFeedback } from './shared/PressFeedback';

/** 宿主显式传入当前动效，不订阅全局存储或接管触摸。 */
export class FoundationPressFeedback extends SharedPressFeedback {
  constructor(style: string) { super(1, 0.4, (): number => motionProfile(style).pressScale); }
}
