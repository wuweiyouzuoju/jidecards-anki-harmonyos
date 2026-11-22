// SPDX-License-Identifier: AGPL-3.0-or-later
import { setGlassNavigationActive } from './GlassBackdrop';
import { CustomTransition } from './自定义转场';
import { SurfaceTransition } from './SurfaceTransition';
import { navigationEnterOffset } from './AppMotion';
import { AppLog } from '../model/AppLog';

export interface HomeNavigationTransitionHost {
  getUIContext: () => UIContext | undefined;
  setBackgroundActive: (active: boolean) => void;
  setHomeOpacity: (opacity: number) => void;
  setHomeOffset?: (offset: number) => void;
}

/** 目的地完成首屏数据准备后再隐藏来源并进入转场，透明页面避免交叉淡化。
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
    const createdAt: number = Date.now();
    AppLog.info('PageTransition', `[PagePerf] ${fromName || 'Home'} -> ${toName || 'Home'} created`);
    let backgroundGeneration: number = 0;
    let transitionEnded: boolean = false;
    let finishRequested: boolean = false;
    let restoreSource: (() => void) | undefined;
    return {
      timeout: 1200,
      onTransitionEnd: (completed: boolean): void => {
        if (transitionEnded) return;
        transitionEnded = true;
        AppLog.info('PageTransition', `[PagePerf] ${toName || 'Home'} ended ms=${Date.now() - createdAt} completed=${completed}`);
        if (backgroundGeneration === this.generation) {
          if (!completed) restoreSource?.();
          setGlassNavigationActive(false);
          this.host.setBackgroundActive(false);
        }
      },
      transition: (transitionProxy: NavigationTransitionProxy): void => {
        if (transitionEnded) return;
        // 转场期间冻结当前彩雾；旧转场结束不能恢复新转场暂停的背景。
        backgroundGeneration = ++this.generation;
        this.host.setBackgroundActive(true);
        setGlassNavigationActive(true);
        const beginTransition = (): void => {
          if (transitionEnded || backgroundGeneration !== this.generation) return;
          AppLog.info('PageTransition', `[PagePerf] ${toName || 'Home'} entrance ms=${Date.now() - createdAt}`);
          const from终点 = CustomTransition.getInstance().取终点回调(fromName);
          const to起点 = CustomTransition.getInstance().取起点回调(toName);
          const to终点 = CustomTransition.getInstance().取终点回调(toName);
          const showDestination = (): void => {
            // 系统取消或新转场接管后，迟到的动画闭包不能重新显示旧页面。
            if (transitionEnded || backgroundGeneration !== this.generation) return;
            if (to.index === -1) {
              this.host.setHomeOpacity(1);
              this.host.setHomeOffset?.(0);
            }
            if (to终点 !== null) to终点(isPush, false);
          };
          const finishTransition = (): void => {
            if (transitionEnded || finishRequested || backgroundGeneration !== this.generation) return;
            finishRequested = true;
            transitionProxy.finishTransition();
          };
          const context: UIContext | undefined = this.host.getUIContext();
          const hideSource = (): void => {
            if (from.index === -1) this.host.setHomeOpacity(0);
            if (from终点 !== null) from终点(isPush, true);
          };
          restoreSource = (): void => {
            if (to.index === -1) this.host.setHomeOpacity(0);
            if (to终点 !== null) to终点(isPush, true);
            if (from.index === -1) {
              this.host.setHomeOpacity(1);
              this.host.setHomeOffset?.(0);
            }
            if (from终点 !== null) from终点(isPush, false);
          };
          hideSource();
          if (to.index === -1) {
            this.host.setHomeOpacity(0);
            this.host.setHomeOffset?.(navigationEnterOffset(isPush));
          }
          if (to起点 !== null) to起点(isPush, false);
          if (context === undefined) {
            showDestination();
            finishTransition();
            return;
          }
          const animation: AnimateParam = SurfaceTransition.pageAnimation();
          animation.onFinish = (): void => { finishTransition(); };
          context.animateTo(animation, showDestination);
        };
        const prepare = CustomTransition.getInstance().preparation(toName);
        if (prepare === null) beginTransition();
        else {
          try { prepare().then(beginTransition, beginTransition); }
          catch (_error) { beginTransition(); }
        }
      }
    };
  }
}
