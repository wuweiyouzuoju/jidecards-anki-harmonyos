// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceTransition } from '../../utils/SurfaceTransition';

export type NativeDialogDismiss = (action: DismissDialogAction) => void;
export type NativeDialogFactory = (dismiss: NativeDialogDismiss) => CustomDialogController;

export interface NativeDialogPresentation {
  autoCancel: boolean;
  customStyle: boolean;
  alignment: DialogAlignment;
  width: Dimension;
  height: Dimension;
  maskColor: ResourceColor;
  openAnimation: AnimateParam;
  closeAnimation: AnimateParam;
}

/** 只拥有原生窗口；构建器留在组件字段中，草稿、提交和忙碌策略由业务拥有。 */
export class NativeDialogHost {
  private controller: CustomDialogController | null = null;
  private generation: number = 0;
  private active: boolean = true;

  activate(): void { this.active = true; }
  current(): CustomDialogController | null { return this.controller; }

  /** 有参数的提交回调也必须检查打开时的窗口身份。 */
  captureCurrent(): () => boolean {
    const generation: number = this.generation;
    return (): boolean => this.active && generation === this.generation;
  }

  /** 按钮关闭也绑定本次窗口，旧内容的回调不能操作新窗口。 */
  guard(callback: () => void): () => void {
    const isCurrent: () => boolean = this.captureCurrent();
    return (): void => { if (isCurrent()) callback(); };
  }

  /** 外壳提供遮罩和关闭策略；原生窗口只承载全窗口内容及一次动效。 */
  presentation(): NativeDialogPresentation {
    return { autoCancel: false, customStyle: true, alignment: DialogAlignment.Center,
      width: '100%', height: '100%', maskColor: Color.Transparent,
      openAnimation: SurfaceTransition.dialogEnterAnimation(), closeAnimation: SurfaceTransition.dialogExitAnimation() };
  }

  open(create: NativeDialogFactory, canDismiss: () => boolean = (): boolean => true): void {
    if (!this.active) return;
    this.close();
    const generation: number = this.generation;
    const dismiss = (action: DismissDialogAction): void => {
      // 关闭动画期间的旧回调不得读已销毁组件，或关闭下一次打开的窗口。
      if (!this.active || generation !== this.generation) { action.dismiss(); return; }
      if (!canDismiss()) return;
      if (this.active && generation === this.generation) this.release();
      action.dismiss();
    };
    try {
      this.controller = create(dismiss);
      this.controller.open();
    } catch (error) {
      this.close();
      throw error as Error;
    }
  }

  /** 窗口自身已关闭时只释放引用；不会重复执行业务关闭回调。 */
  release(): void { this.generation++; this.controller = null; }

  close(): void {
    const controller: CustomDialogController | null = this.controller;
    this.release();
    controller?.close();
  }

  dispose(): void { this.active = false; this.close(); }
}
