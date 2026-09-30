// SPDX-License-Identifier: AGPL-3.0-or-later
import { CustomTransition } from './自定义转场';
import { 取全屏转场时长 } from './转场时长';

export interface HomeNavigationTransitionHost {
  getUIContext: () => UIContext | undefined;
  setBackgroundActive: (active: boolean) => void;
  setHomeOpacity: (opacity: number) => void;
}

/** 退出内容立即隐藏，进入内容淡入；透明页面不可交叉淡化，否则文字会叠影。
 * 首页 NavBar 没有目的地注册，通过宿主单独控制内容透明度，根背景不参与淡入。
 * 旧转场结束不能解冻新转场的背景；每次动画完成必须通知系统结束转场。
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
    const 转场时长: number = 取全屏转场时长();
    const 转场曲线: Curve = Curve.EaseOut;
    const fromName: string = from.name ?? '';
    const toName: string = to.name ?? '';
    let backgroundGeneration: number = 0;
    return {
      timeout: 1200,
      onTransitionEnd: (): void => {
        if (backgroundGeneration === this.generation) {
          this.host.setBackgroundActive(false);
        }
      },
      transition: (transitionProxy: NavigationTransitionProxy): void => {
        // 转场期间冻结当前彩雾；旧转场结束不能恢复新转场暂停的背景。
        backgroundGeneration = ++this.generation;
        this.host.setBackgroundActive(true);
        const from终点 = CustomTransition.getInstance().取终点回调(fromName);
        const to起点 = CustomTransition.getInstance().取起点回调(toName);
        const to终点 = CustomTransition.getInstance().取终点回调(toName);
        if (from.index === -1) this.host.setHomeOpacity(0);
        if (from终点 !== null) from终点(isPush, true);
        if (to.index === -1) this.host.setHomeOpacity(0);
        if (to起点 !== null) {
          to起点(isPush, false);
        }
        const showDestination = (): void => {
          if (to.index === -1) this.host.setHomeOpacity(1);
          if (to终点 !== null) to终点(isPush, false);
        };
        const context: UIContext | undefined = this.host.getUIContext();
        if (context === undefined) {
          showDestination();
          transitionProxy.finishTransition();
          return;
        }
        context.animateTo({
          duration: 转场时长,
          curve: 转场曲线,
          expectedFrameRateRange: { min: 60, max: 120, expected: 60 },
          onFinish: (): void => {
            transitionProxy.finishTransition();
          }
        }, showDestination);
      }
    };
  }
}
