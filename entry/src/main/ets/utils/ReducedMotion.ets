// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { settings } from '@kit.BasicServicesKit';

/**
 * 读取系统“动画时长缩放”作为减少动态效果信号：0 表示动画关闭。
 * 系统设置不可读时保持正常动效，不影响业务时序。
 */
export function prefersReducedMotion(context: UIContext): boolean {
  const host = context.getHostContext();
  if (host === undefined) return false;
  try {
    const scale: string = settings.getValueSync(host, 'animator_duration_scale', '1');
    return Number(scale) === 0;
  } catch (_error) {
    return false;
  }
}
