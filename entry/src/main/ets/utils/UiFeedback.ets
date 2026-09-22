// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext, promptAction } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

/** 资源失败不能再次打断错误展示；记录键名并显示明确的缺失标记，不伪装成成功文案。 */
export function resourceText(context: UIContext, resource: Resource, ...args: Array<string | number>): string {
  try {
    const host = context.getHostContext();
    if (host === undefined) { throw new Error('UI context unavailable'); }
    return host.resourceManager.getStringSync(resource.id, ...args);
  } catch (error) {
    const name: string = resource.params !== undefined && typeof resource.params[0] === 'string'
      ? resource.params[0] as string : `${resource.id}`;
    hilog.error(0x4342, 'jidecards', 'Resource text unavailable: %{public}s', name);
    return `[${name}]`;
  }
}

/** 动态资源名与静态资源使用相同的失败边界。 */
export function namedResourceText(context: UIContext, name: string): string {
  try {
    const host = context.getHostContext();
    if (host === undefined) { throw new Error('UI context unavailable'); }
    return host.resourceManager.getStringByNameSync(name);
  } catch (error) {
    hilog.error(0x4342, 'jidecards', 'Resource text unavailable: %{public}s', name);
    return `[${name}]`;
  }
}

/** Toast 是尽力展示的反馈，不得把已完成的数据写入变成失败或制造未处理拒绝。 */
export function showToastSafely(context: UIContext, options: promptAction.ShowToastOptions): void {
  try {
    context.getPromptAction().showToast(options);
  } catch (error) {
    hilog.warn(0x4342, 'jidecards', 'Toast unavailable; operation result is unchanged');
  }
}
