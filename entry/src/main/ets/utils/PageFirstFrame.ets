// SPDX-License-Identifier: AGPL-3.0-or-later
import { FrameCallback, UIContext } from '@kit.ArkUI';

/** 将目的地首次布局留在来源页后面，避免 List 深度构建占用入场动画的第一帧。 */
export class PageFirstFrame extends FrameCallback {
  private finish: (() => void) | undefined = undefined;
  private timeout: number = -1;
  private pending: Promise<void> | undefined = undefined;

  wait(context: UIContext): Promise<void> {
    if (this.pending !== undefined) return this.pending;
    this.pending = new Promise<void>((resolve: () => void): void => { this.finish = resolve; });
    // 页面销毁或窗口不再产帧时也释放导航等待，不依赖永远不会到来的 idle。
    this.timeout = setTimeout((): void => { this.complete(); }, 250);
    try { context.postFrameCallback(this); } catch (error) { this.complete(); }
    return this.pending;
  }

  onIdle(_timeLeftInNano: number): void { this.complete(); }

  complete(): void {
    if (this.timeout !== -1) { clearTimeout(this.timeout); this.timeout = -1; }
    const finish: (() => void) | undefined = this.finish;
    this.finish = undefined;
    finish?.();
  }
}
