// SPDX-License-Identifier: AGPL-3.0-or-later
import { MENU_SLIDE_BRANCH_MS } from './InteractionFeedback';
export interface MenuSlideRect { left: number; top: number; width: number; height: number; }
let nextSlideScopeId: number = 0;
export class MenuSlideScope {
  // ArkUI 的 Provide/Consume 会包装对象，命中和释放使用稳定标识。
  readonly id: number = ++nextSlideScopeId;
  clip: MenuSlideRect | null = null;
  offset: number = 0;
  scroll: (delta: number) => void = (_delta: number): void => {};
}
export interface MenuSlideTarget {
  scope: MenuSlideScope;
  rect: MenuSlideRect;
  offset: number;
  layer: number;
  available: () => boolean;
  highlight: (active: boolean) => void;
  select: () => void;
  enter: () => void;
  branch: boolean;
}

/** 单次指针流只由起始按钮持有；目标按实测窗口坐标、裁切、层级与实时可用性命中。 */
export class MenuSlideSession {
  private targets: MenuSlideTarget[] = [];
  private scopes: MenuSlideScope[] = [];
  private active: boolean = false;
  private hovered: MenuSlideTarget | null = null;
  private entered: MenuSlideTarget | null = null;
  private enteredAt: number = 0;
  private edgeScrolling: boolean = false;
  private onCancel: () => void = (): void => {};

  attach(scope: MenuSlideScope): void {
    if (!this.scopes.some((item: MenuSlideScope): boolean => item.id === scope.id)) this.scopes.push(scope);
  }
  detach(scope: MenuSlideScope): void {
    this.scopes = this.scopes.filter((item: MenuSlideScope): boolean => item.id !== scope.id);
    this.targets = this.targets.filter((item: MenuSlideTarget): boolean => item.scope.id !== scope.id);
    if (this.hovered?.scope.id === scope.id) this.setHovered(null, 0);
  }
  register(target: MenuSlideTarget): void { if (!this.targets.includes(target)) this.targets.push(target); }
  remove(target: MenuSlideTarget): void {
    if (this.hovered === target) this.setHovered(null, 0);
    this.targets = this.targets.filter((item: MenuSlideTarget): boolean => item !== target);
  }
  begin(cancel: () => void): void {
    this.setHovered(null, 0); this.active = true; this.onCancel = cancel; this.edgeScrolling = false;
  }
  isActive(): boolean { return this.active; }
  private contains(rect: MenuSlideRect, x: number, y: number): boolean {
    return x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;
  }
  private setHovered(target: MenuSlideTarget | null, now: number): void {
    if (this.hovered === target) return;
    this.hovered?.highlight(false); this.hovered = target;
    this.entered = null; this.enteredAt = now; target?.highlight(true);
  }
  move(x: number, y: number, now: number): void {
    if (!this.active) return;
    const scope: MenuSlideScope | undefined = this.scopes[this.scopes.length - 1];
    if (scope === undefined || scope.clip === null || !this.contains(scope.clip, x, y)) {
      this.edgeScrolling = false; this.setHovered(null, now); return;
    }
    const edge: number = scope.clip.height > 160 ? 18 : 0;
    const delta: number = y < scope.clip.top + edge ? -12 : y > scope.clip.top + scope.clip.height - edge ? 12 : 0;
    this.edgeScrolling = delta !== 0;
    if (this.edgeScrolling) { this.setHovered(null, now); scope.scroll(delta); return; }
    const hits: MenuSlideTarget[] = this.targets.filter((target: MenuSlideTarget): boolean => {
      const rect: MenuSlideRect = { left: target.rect.left, top: target.rect.top + target.offset - scope.offset,
        width: target.rect.width, height: target.rect.height };
      return target.scope.id === scope.id && target.available() && this.contains(rect, x, y);
    });
    hits.sort((a: MenuSlideTarget, b: MenuSlideTarget): number => a.layer - b.layer);
    this.setHovered(hits.length === 0 ? null : hits[hits.length - 1], now);
    const target: MenuSlideTarget | null = this.hovered;
    if (target !== null && target.branch && this.entered !== target && now - this.enteredAt >= MENU_SLIDE_BRANCH_MS) {
      this.entered = target; target.enter();
    }
  }
  finish(): void {
    if (!this.active) return;
    const target: MenuSlideTarget | null = this.hovered;
    const usable: boolean = target !== null && target.available() && !this.edgeScrolling;
    this.active = false; this.setHovered(null, 0);
    if (usable && target !== null) target.select(); else this.onCancel();
  }
  cancel(): void {
    const active: boolean = this.active;
    this.active = false; this.setHovered(null, 0); this.edgeScrolling = false;
    if (active) this.onCancel();
  }
}

// 仅公共菜单控件共享的短期指针路由；不发布业务状态，也不执行领域写入。
export const menuSlideSession: MenuSlideSession = new MenuSlideSession();
