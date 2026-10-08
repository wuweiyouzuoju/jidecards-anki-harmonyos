// SPDX-License-Identifier: AGPL-3.0-or-later
import { currentMotionProfile } from './AppMotion';

// ========================================================
// @块ID UTIL-TRANSITION-DURATION-001
// @名称 全屏转场时长与曲线
//
// @作用
// 按 AppGallery 设计规范要求，全屏页面转场（NavDestination 推栈、全屏面板/弹窗）
// 时长按设备物理对角线英寸分档：
//   - < 8.5 英寸（手机）  ≥ 200 ms
//   - 8.5–12 英寸（小平板）≥ 250 ms
//   - > 12 英寸（平板）   ≥ 300 ms
// 曲线优先使用弹簧曲线（curves.springCurve）。
//
// @输入
// 首次调用读 display.getDefaultDisplaySync()；每次调用读取当前动效档位。
//
// @输出
// 取全屏转场时长(): number  —— 分档基础时长（200/250/300）加当前档位增量
// 取全屏转场曲线(): ICurve  —— 克制（1,228,22）或灵动（1,280,24）弹簧曲线
//
// @业务规则
// 物理英寸 = sqrt(width² + height²) / densityDPI。
// 设备尺寸分档首次计算并缓存；动效档位每次读取，切换后影响下一次转场。
// 取不到屏幕信息时回退到 250ms（中等档），既不短于手机档 200ms，也不至于让大屏设备过快。
// 弹簧曲线参数取 ArkUI 官方示例常用值（stiffness=228, damping=22），自然不弹跳。
//
// @Invariants
// - 返回的时长必须满足 AppGallery 评价要求（按设备尺寸分档不低于 200/250/300ms）
// - 缓存值在进程生命周期内不变（屏幕旋转/分屏场景下物理英寸不变，无需重算）
//
// @Extension Points
// - 若未来需支持可访问性「减少动画」偏好，可在 取全屏转场时长() 内读 preferences 缩短或归零
// - 若需为不同转场类型（push/pop/modal）使用不同曲线，可新增 取转场曲线(类型) 重载
//
// @副作用
// 首次调用读 display.getDefaultDisplaySync()（同步系统调用）。
// ========================================================

import { display } from '@kit.ArkUI';
import { curves } from '@kit.ArkUI';

/** 手机档（< 8.5 英寸）最低时长。 */
const 时长_手机: number = 200;
/** 小平板档（8.5–12 英寸）最低时长。 */
const 时长_小平板: number = 250;
/** 平板档（> 12 英寸）最低时长。 */
const 时长_平板: number = 300;
/** 取不到屏幕信息时的回退值（中等档，既不违反手机档下限也不至于让大屏过快）。 */
const 时长_回退: number = 250;

/** 8.5 英寸阈值（手机 / 小平板分界）。 */
const 阈值_8_5英寸: number = 8.5;
/** 12 英寸阈值（小平板 / 平板分界）。 */
const 阈值_12英寸: number = 12;

/** 弹簧曲线参数（参考 ArkUI 官方示例：自然过渡，无弹跳）。 */
const 弹簧_质量: number = 1;
const 弹簧_刚度: number = 228;
const 弹簧_阻尼: number = 22;
const 弹簧_初速度: number = 0;

/** 时长缓存（首次计算后写入，进程生命周期内不变）。 */
let 缓存时长: number | null = null;
/** 曲线缓存（ICurve 实例复用，避免每次 transition 重建）。 */
let 缓存曲线: ICurve | null = null;

/**
 * 计算设备物理对角线英寸。
 * 物理英寸 = sqrt(width_px² + height_px²) / densityDPI。
 * 取不到屏幕信息时返回 0（调用方回退到中等档）。
 */
function 计算物理英寸(): number {
  try {
    const 显示器: display.Display = display.getDefaultDisplaySync();
    const 宽px: number = 显示器.width;
    const 高px: number = 显示器.height;
    const dpi: number = 显示器.densityDPI;
    if (宽px <= 0 || 高px <= 0 || dpi <= 0) {
      return 0;
    }
    return Math.sqrt(宽px * 宽px + 高px * 高px) / dpi;
  } catch (error) {
    return 0;
  }
}

/**
 * 取全屏转场时长（按设备物理英寸分档）。
 * 首次调用计算并缓存；后续直接返回缓存值。
 */
function baseTransitionDuration(): number {
  if (缓存时长 !== null) {
    return 缓存时长;
  }
  const 英寸: number = 计算物理英寸();
  if (英寸 <= 0) {
    缓存时长 = 时长_回退;
    return 缓存时长;
  }
  if (英寸 < 阈值_8_5英寸) {
    缓存时长 = 时长_手机;
  } else if (英寸 <= 阈值_12英寸) {
    缓存时长 = 时长_小平板;
  } else {
    缓存时长 = 时长_平板;
  }
  return 缓存时长;
}

/**
 * 取全屏转场曲线（弹簧曲线）。
 * 克制曲线复用缓存实例；当前档位在每次转场时读取。
 */
export function 取全屏转场曲线(): ICurve {
  if (缓存曲线 === null) {
    缓存曲线 = curves.springCurve(弹簧_初速度, 弹簧_质量, 弹簧_刚度, 弹簧_阻尼);
  }
  if (currentMotionProfile().springFeedback) { return curves.springCurve(0, 1, 280, 24); }
  return 缓存曲线;
}

/** 屏幕尺寸缓存与用户偏好分离，切换风格立即影响下一次转场。 */
export function 取全屏转场时长(): number {
  return baseTransitionDuration() + currentMotionProfile().fullScreenExtraMs;
}
