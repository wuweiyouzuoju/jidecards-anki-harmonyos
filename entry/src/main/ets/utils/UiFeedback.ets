// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext, promptAction } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

/** 资源失败不能再次打断错误展示；记录键名并显示明确的缺失标记，不伪装成成功文案。 */
export function resourceText(context: UIContext, resource: Resource, ...args: Array<string | number>): string {
  try {
    const host = context.getHostContext();
    if (host === undefined) { throw new Error('UI context unavailable'); }
    // $r 的第一个参数是资源名，后续参数才是占位符值；显式参数优先。
    if (args.length === 0 && resource.params !== undefined) {
      for (let index: number = 1; index < resource.params.length; index++) {
        const value: Object = resource.params[index];
        if (typeof value === 'string' || typeof value === 'number') args.push(value);
      }
    }
    return host.resourceManager.getStringSync(resource.id, ...args);
  } catch (error) {
    const name: string = resource.params !== undefined && typeof resource.params[0] === 'string'
      ? resource.params[0] as string : `${resource.id}`;
    hilog.error(0x4342, 'jidecards', 'Resource text unavailable: %{public}s', name);
    return `[${name}]`;
  }
}

/** 动态资源名与静态资源使用相同的失败边界。 */
export function namedResourceText(context: UIContext, name: string, ...args: Array<string | number>): string {
  try {
    const host = context.getHostContext();
    if (host === undefined) { throw new Error('UI context unavailable'); }
    return host.resourceManager.getStringByNameSync(name, ...args);
  } catch (error) {
    hilog.error(0x4342, 'jidecards', 'Resource text unavailable: %{public}s', name);
    return `[${name}]`;
  }
}

/** Toast 是尽力展示的反馈，不得把已完成的数据写入变成失败或制造未处理拒绝。 */
export function showToastSafely(context: UIContext, options: promptAction.ShowToastOptions): void {
  try {
    // 短提示统一不带句末句号，省略号和正文中的标点保持原样。
    const message: string = typeof options.message === 'string'
      ? options.message : resourceText(context, options.message);
    options.message = message.replace(/。+\s*$/, '').replace(/([^\.])\.\s*$/, '$1');
    context.getPromptAction().showToast(options);
  } catch (error) {
    hilog.warn(0x4342, 'jidecards', 'Toast unavailable; operation result is unchanged');
  }
}
