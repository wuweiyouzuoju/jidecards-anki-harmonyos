// SPDX-License-Identifier: AGPL-3.0-or-later
import { CustomTransition } from './自定义转场';
import { SurfaceTransition } from './SurfaceTransition';
import { navigationEnterOffset } from './AppMotion';

export interface HomeNavigationTransitionHost {
  getUIContext: () => UIContext | undefined;
  setBackgroundActive: (active: boolean) => void;
  setHomeOpacity: (opacity: number) => void;
  setHomeOffset?: (offset: number) => void;
}

/** 退出内容立即隐藏，进入内容淡入；透明页面不可交叉淡化，否则文字会叠影。
 * 首页 NavBar 没有目的地注册，通过宿主单独控制内容透明度，根背景不参与淡入。
 * 旧转场结束不能解冻新转场的背景；仅向仍运行的转场通知一次完成。
 */
export class HomeNavigationTransition {
  private generation: number = 0;
  private host: HomeNavigationTransitionHost;

  constructor(host: HomeNavigationTransitionHost) {
    this.host = host;
  }

  create(from: NavContentInfo, to: NavContentInfo,
    operation: NavigationOperation): NavigationAnimatedTransition | undefined {
    const isPush: boolean = operation === NavigationOperation.PUSH;
    const fromName: string = from.name ?? '';
    const toName: string = to.name ?? '';
    let backgroundGeneration: number = 0;
    let transitionEnded: boolean = false;
    let finishRequested: boolean = false;
    return {
      timeout: 1200,
      onTransitionEnd: (): void => {
        if (transitionEnded) return;
        transitionEnded = true;
        if (backgroundGeneration === this.generation) {
          this.host.setBackgroundActive(false);
        }
      },
      transition: (transitionProxy: NavigationTransitionProxy): void => {
        if (transitionEnded) return;
        // 转场期间冻结当前彩雾；旧转场结束不能恢复新转场暂停的背景。
        backgroundGeneration = ++this.generation;
        this.host.setBackgroundActive(true);
        const from终点 = CustomTransition.getInstance().取终点回调(fromName);
        const to起点 = CustomTransition.getInstance().取起点回调(toName);
        const to终点 = CustomTransition.getInstance().取终点回调(toName);
        if (from.index === -1) this.host.setHomeOpacity(0);
        if (from终点 !== null) from终点(isPush, true);
        if (to.index === -1) this.host.setHomeOpacity(0);
        if (to.index === -1) this.host.setHomeOffset?.(navigationEnterOffset(isPush));
        if (to起点 !== null) {
          to起点(isPush, false);
        }
        const showDestination = (): void => {
          // 系统取消或新转场接管后，迟到的动画闭包不能重新显示旧页面。
          if (transitionEnded || backgroundGeneration !== this.generation) return;
          if (to.index === -1) this.host.setHomeOpacity(1);
          if (to.index === -1) this.host.setHomeOffset?.(0);
          if (to终点 !== null) to终点(isPush, false);
        };
        const finishTransition = (): void => {
          if (transitionEnded || finishRequested) return;
          finishRequested = true;
          transitionProxy.finishTransition();
        };
        const context: UIContext | undefined = this.host.getUIContext();
        if (context === undefined) {
          showDestination();
          finishTransition();
          return;
        }
        const animation: AnimateParam = SurfaceTransition.pageAnimation();
        animation.onFinish = (): void => { finishTransition(); };
        context.animateTo(animation, showDestination);
      }
    };
  }
}
