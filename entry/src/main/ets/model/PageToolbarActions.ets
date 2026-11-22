// SPDX-License-Identifier: AGPL-3.0-or-later
export const PAGE_TOOLBAR_SCOPE: string = 'pageToolbarActions';
let nextAction: number = 0;
export function nextPageToolbarActionId(): string { return 'toolbar_' + (++nextAction); }
export interface PageToolbarAction {
  id: string; source: ResourceStr; label: ResourceStr; enabled: boolean; selected: boolean;
  feedback: string; area: Area; activate: (area?: Area) => void;
}
/** 每个NavDestination独占作用域；隐藏页的按钮不能进入另一页圆环。 */
@Observed
export class PageToolbarActionScope {
  enabled: boolean = false;
  mounted: boolean = false;
  revision: number = 0;
  left: number = 0;
  top: number = 0;
  width: number = 0;
  private entries: Map<string, PageToolbarAction> = new Map<string, PageToolbarAction>();
  private signatures: Map<string, string> = new Map<string, string>();
  changed: () => void = (): void => {};
  upsert(action: PageToolbarAction): void {
    const signature: string = JSON.stringify([action.source, action.label, action.enabled, action.selected,
      action.feedback, action.area.globalPosition.x, action.area.globalPosition.y, action.area.width, action.area.height]);
    this.entries.set(action.id, action);
    if (this.signatures.get(action.id) === signature) return;
    this.signatures.set(action.id, signature); this.revision++; this.changed();
  }
  remove(id: string): void {
    if (!this.entries.delete(id)) return;
    this.signatures.delete(id); this.revision++; this.changed();
  }
  actions(): PageToolbarAction[] {
    return Array.from(this.entries.values()).filter((action: PageToolbarAction): boolean => {
      const y: number = Number(action.area.globalPosition.y) - this.top;
      return y >= -1 && y < 100;
    }).sort((a: PageToolbarAction, b: PageToolbarAction): number =>
      Number(a.area.globalPosition.x) - Number(b.area.globalPosition.x));
  }
  contains(id: string): boolean { return this.actions().some((action: PageToolbarAction): boolean => action.id === id); }
  side(action: PageToolbarAction): string {
    return Number(action.area.globalPosition.x) + Number(action.area.width) / 2 < this.left + this.width / 2 ? 'left' : 'right';
  }
  dispose(): void { this.mounted = false; this.enabled = false; this.entries.clear(); this.signatures.clear(); this.changed = (): void => {}; }
}
