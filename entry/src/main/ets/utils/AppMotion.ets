// SPDX-License-Identifier: AGPL-3.0-or-later
import { curves } from '@kit.ArkUI';
import { MOTION_STYLE_KEY, MotionProfile, motionProfile } from '../model/MotionStyle';

/** 在动作发生时读取公共偏好；切换风格不重建页面、清除菜单状态或改变业务时序。 */
export function currentMotionProfile(): MotionProfile {
  return motionProfile(AppStorage.get<string>(MOTION_STYLE_KEY) ?? 'restrained');
}

export function motionAnimation(duration: number): AnimateParam {
  return { duration: duration, curve: currentMotionProfile().springFeedback ?
    curves.springCurve(0, 1, 280, 24) : Curve.EaseOut };
}

export function disclosureAnimation(): AnimateParam {
  return motionAnimation(currentMotionProfile().disclosureMs);
}

/** 仅页面导航使用小幅方向反馈，卡片内容更新不调用。 */
export function navigationEnterOffset(isPush: boolean): number {
  const offset: number = currentMotionProfile().pageOffset;
  return offset === 0 ? 0 : offset * (isPush ? 1 : -1);
}
