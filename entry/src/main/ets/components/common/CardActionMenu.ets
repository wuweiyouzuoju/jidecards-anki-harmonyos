// SPDX-License-Identifier: AGPL-3.0-or-later
import { WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY, WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY,
  WINDOW_KEYBOARD_TOP_KEY, keyboardViewportHeight, safeMenuGeometry } from '../../model/WindowSafeLayout';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { AnchoredMenu } from './AnchoredMenu';
import { AnchoredMenuItem } from './MenuItem';
import { MenuSlideScope } from '../../model/MenuSlideSession';
import { ActionMenuNode, ActionMenuRow, actionMenuRows, visibleActionMenuRows } from './ActionMenuTree';
import { ActionMenuAnchor, ActionMenuBubble, ActionMenuPointerSide, AnchoredActionMenuPlacement, ActionMenuPanelPlacement, actionMenuGroupInset, placeActionMenuGroups,
  placeAnchoredActionMenu } from './ActionMenuLayout';
import { MenuBubble } from './MenuBubble';
import { MenuSurface } from './MenuSurface';
import { cardViewportWidth } from '../../model/CardViewportLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';

interface MenuMeasuredHeight { id: string; height: number; }

export interface CardActionMenuEntry extends ActionMenuNode {
  value: ResourceStr;
  icon?: ResourceStr;
  /** 宿主可由 onSelect 按稳定 ID 分发，分支本身无需伪造空动作。 */
  action?: () => void;
  iconTint?: ResourceColor;
  selected?: boolean;
  selectionUsesAccent?: boolean;
  destructive?: boolean;
  divider?: boolean;
  showSelectionMark?: boolean;
  children?: CardActionMenuEntry[];
}

/** 右侧主菜单与左侧子面板共用滚动；深层列表替换子面板，始终不覆盖主菜单。 */
@Component
export struct CardActionMenu {
  private readonly slideScope: MenuSlideScope = new MenuSlideScope();
  @Prop items: CardActionMenuEntry[] = [];
  @Prop expandedIds: string[] = [];
  @Prop menuWidth: number = 应用尺寸.compactMenuWidth;
  @Prop topOffset: number | undefined = undefined;
  /** 列表等上下文菜单传宿主局部行矩形；省略时继续使用工具栏定位。 */
  @Prop anchor: ActionMenuAnchor | undefined = undefined;
  @State private contentWidth: number = 840;
  @State private viewportWidth: number = 840;
  @State private viewportHeight: number = 600;
  @State private viewportLeft: number = 0;
  @State private viewportTop: number = 0;
  @State private rowHeights: number[] = [];
  @State private measuredHeights: MenuMeasuredHeight[] = [];
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private toolbarSafeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  @StorageProp(WINDOW_KEYBOARD_TOP_KEY) private keyboardTop: number = 0;
  onClose: () => void = (): void => {};
  onToggleBranch: (item: CardActionMenuEntry) => void = (_item: CardActionMenuEntry): void => {};
  onSelect: (item: CardActionMenuEntry) => void = (item: CardActionMenuEntry): void => { item.action?.(); };

  private rows(): ActionMenuRow[] { return actionMenuRows(this.items, this.expandedIds); }

  private rowItem(row: ActionMenuRow): CardActionMenuEntry { return row.node as CardActionMenuEntry; }

  private selectEntry(row: ActionMenuRow): void {
    const backGroup: CardActionMenuEntry | undefined = this.sideGroups().find((group: CardActionMenuEntry): boolean =>
      row.key === `${this.groupBranch(group)?.key}/back`);
    if (backGroup !== undefined) {
      const branch: ActionMenuRow | undefined = this.groupBranch(backGroup);
      if (branch !== undefined && branch.enabled) this.onToggleBranch(this.rowItem(branch));
      return;
    }
    const current: ActionMenuRow | undefined = visibleActionMenuRows(this.items, this.expandedIds)
      .find((item: ActionMenuRow): boolean => item.key === row.key);
    if (current === undefined || !current.enabled) return;
    const entry: CardActionMenuEntry = this.rowItem(current);
    if (entry.children !== undefined) {
      // 几何一次到位，面板独占入退场；不在每帧重测整组菜单或等动画结束才更新可操作性。
      this.onToggleBranch(entry);
    } else this.onSelect(entry);
  }

  private sideGroups(): CardActionMenuEntry[] {
    return this.items.filter((item: CardActionMenuEntry): boolean =>
      item.children !== undefined && this.expandedIds.includes(item.id ?? ''));
  }

  private availableWidth(): number {
    return this.anchor === undefined ? this.contentWidth - 24 : Math.max(0,
      this.viewportWidth - Math.max(0, this.safeLeft - this.viewportLeft) - this.safeRight - 24);
  }

  private primaryWidth(): number {
    const available: number = this.availableWidth();
    return Math.min(this.menuWidth, Math.max(48, this.sideGroups().length === 0 ? available : (available - 12) * 0.56));
  }

  private groupWidth(): number {
    return Math.min(应用尺寸.cardActionGroupWidth, Math.max(0, this.availableWidth() - this.primaryWidth() - 12));
  }

  private totalWidth(): number {
    return this.sideGroups().length === 0 ? this.primaryWidth() : this.primaryWidth() + 12 + this.groupWidth();
  }

  private heightOf(id: string, fallback: number): number {
    return this.measuredHeights.find((entry: MenuMeasuredHeight): boolean => entry.id === id)?.height ?? fallback;
  }

  private recordHeight(id: string, height: number): void {
    if (height <= 0 || Math.abs(this.heightOf(id, 0) - height) < 0.5) return;
    this.measuredHeights = [...this.measuredHeights.filter((entry: MenuMeasuredHeight): boolean => entry.id !== id), { id: id, height: height }];
  }

  private groupBranch(group: CardActionMenuEntry): ActionMenuRow | undefined {
    return this.rows().find((row: ActionMenuRow): boolean => row.depth === 1 && row.key.startsWith(`/${group.id}/`) &&
      row.node.children !== undefined && this.expandedIds.includes(row.node.id ?? ''));
  }

  private groupsOnRight(): boolean {
    if (this.anchor === undefined || this.sideGroups().length === 0) return false;
    const left: number = this.anchor.left + (this.anchor.width + this.primaryWidth()) / 2 - this.totalWidth();
    return left < Math.max(0, this.safeLeft - this.viewportLeft) + 12;
  }

  private groupRows(group: CardActionMenuEntry): ActionMenuRow[] {
    const branch: ActionMenuRow | undefined = this.groupBranch(group);
    if (branch === undefined) {
      return this.rows().filter((row: ActionMenuRow): boolean => row.depth === 1 && row.key.startsWith(`/${group.id}/`));
    }
    const back: CardActionMenuEntry = { id: 'back', value: $r('app.string.menu_back_to_parent'),
      icon: $r('app.media.ic_common_arrow_left'), divider: false };
    const rows: ActionMenuRow[] = [{ node: back, key: `${branch.key}/back`, depth: 2, enabled: branch.enabled }];
    return rows.concat(
      this.rows().filter((row: ActionMenuRow): boolean => row.depth === 2 && row.key.startsWith(`${branch.key}/`)));
  }

  private groupHeightId(group: CardActionMenuEntry): string {
    return this.groupBranch(group)?.key ?? group.id ?? '';
  }

  private groupHeights(): number[] {
    return this.sideGroups().map((group: CardActionMenuEntry): number =>
      this.heightOf(this.groupHeightId(group), this.groupRows(group).length * 应用尺寸.menuItemHeight));
  }

  private placements(): ActionMenuPanelPlacement[] {
    const anchors: number[] = this.sideGroups().map((group: CardActionMenuEntry): number => {
      const index: number = this.items.findIndex((item: CardActionMenuEntry): boolean => item.id === group.id);
      return actionMenuGroupInset(this.rowHeights, index, 0, 应用尺寸.menuItemHeight);
    });
    return placeActionMenuGroups(anchors, this.groupHeights(), 应用尺寸.radiusLg + MenuSurface.pointerSpan / 2 + 0.5);
  }

  private groupGap(index: number): number {
    const placements: ActionMenuPanelPlacement[] = this.placements();
    return placements[index].top - (index === 0 ? 0 : placements[index - 1].top + this.groupHeights()[index - 1]);
  }

  private nestedBranch(): ActionMenuRow | undefined {
    return this.rows().find((row: ActionMenuRow): boolean => row.depth === 1 && row.node.children !== undefined &&
      this.expandedIds.includes(row.node.id ?? ''));
  }

  private layoutHeight(): number {
    let height: number = this.items.reduce((sum: number, _item: CardActionMenuEntry, index: number): number =>
      sum + (this.rowHeights[index] ?? 应用尺寸.menuItemHeight), 0);
    const heights: number[] = this.groupHeights();
    this.placements().forEach((placement: ActionMenuPanelPlacement, index: number): void => {
      height = Math.max(height, placement.top + heights[index]);
    });
    return height;
  }

  private anchoredPlacement(): AnchoredActionMenuPlacement | undefined {
    if (this.anchor === undefined) return undefined;
    const safe: number = Math.max(0, this.safeLeft - this.viewportLeft);
    const vertical = safeMenuGeometry(keyboardViewportHeight(this.viewportHeight, this.viewportTop, this.keyboardTop),
      0, Math.max(0, this.toolbarSafeTop - this.viewportTop), this.keyboardTop > 0 ? 0 : this.safeBottom,
      应用尺寸.页面底部间距(this.narrowDeckLayout));
    const bounds: ActionMenuAnchor = { left: safe + 12, top: vertical.top,
      width: this.availableWidth(), height: vertical.maxHeight };
    return placeAnchoredActionMenu(this.anchor, this.totalWidth(), this.layoutHeight(), this.primaryWidth(), bounds,
      MenuSurface.pointerDepth, this.groupsOnRight());
  }

  private menuBubble(): ActionMenuBubble | undefined {
    const placement: AnchoredActionMenuPlacement | undefined = this.anchoredPlacement();
    if (placement === undefined) return undefined;
    return { left: this.groupsOnRight() ? 0 : this.totalWidth() - this.primaryWidth(), width: this.primaryWidth(),
      pointerSide: placement.pointerSide, pointerCenter: placement.pointerCenter };
  }

  private menuTop(): number {
    return this.anchoredPlacement()?.top ?? this.topOffset ??
      应用尺寸.pageContentTop(this.statusBarHeight, this.narrowDeckLayout, this.toolbarSafeTop);
  }

  private dismissTop(): void {
    const branch: ActionMenuRow | undefined = this.nestedBranch();
    if (branch === undefined) this.onClose();
    else this.onToggleBranch(this.rowItem(branch));
  }

  private recordRow(index: number, height: number): void {
    if (height <= 0 || Math.abs((this.rowHeights[index] ?? 0) - height) < 0.5) return;
    const heights: number[] = this.rowHeights.slice();
    heights[index] = height;
    this.rowHeights = heights;
  }

  @Builder
  private menuRow(row: ActionMenuRow, index: number) {
    AnchoredMenuItem({ label: this.rowItem(row).value, slideScope: this.slideScope, slideLayer: row.depth,
      available: row.enabled, divider: this.rowItem(row).divider ?? index > 0,
      icon: this.rowItem(row).icon, iconTint: this.rowItem(row).iconTint, labelAlignment: TextAlign.Start,
      selected: this.rowItem(row).selected === true,
      showSelectionMark: this.rowItem(row).showSelectionMark === true,
      selectionUsesAccent: this.rowItem(row).selectionUsesAccent !== false,
      destructive: this.rowItem(row).destructive === true,
      disclosure: row.node.children !== undefined, expanded: this.expandedIds.includes(row.node.id ?? ''),
      disclosureAngle: row.depth > 0 ? undefined : this.expandedIds.includes(row.node.id ?? '') ? 180 : 90,
      onSelect: (): void => { this.selectEntry(row); } })
  }

  @Builder
  private groupPanels() {
    if (this.sideGroups().length > 0) {
      Column() {
        ForEach(this.sideGroups(), (group: CardActionMenuEntry, groupIndex: number) => {
          Blank().height(this.groupGap(groupIndex))
          Column() {
            MenuBubble({ panelWidth: this.groupWidth(), pointerCenter: this.placements()[groupIndex].pointerCenter,
              pointerSide: this.groupsOnRight() ? ActionMenuPointerSide.Left : ActionMenuPointerSide.Right }) {
              ForEach(this.groupRows(group), (row: ActionMenuRow, index: number) => {
                this.menuRow(row, index)
              }, (row: ActionMenuRow): string => `${row.key}-${row.enabled}-${this.rowItem(row).selected}`)
            }
          }
          .transition(MenuSurface.popupTransition(this.groupsOnRight() ? '0%' : '100%', this.placements()[groupIndex].pointerCenter))
          .onAreaChange((_old: Area, area: Area): void => { this.recordHeight(this.groupHeightId(group), Number(area.height)); })
        }, (group: CardActionMenuEntry): string => group.id ?? '')
      }.width(this.groupWidth() + MenuSurface.pointerDepth)
    }
  }

  @Builder
  private primaryPanel() {
    Column() {
      ForEach(this.rows().filter((row: ActionMenuRow): boolean => row.depth === 0), (row: ActionMenuRow, index: number) => {
        Column() { this.menuRow(row, index) }
          .onAreaChange((_old: Area, area: Area): void => { this.recordRow(index, Number(area.height)); })
      }, (row: ActionMenuRow, index: number): string => `${row.key}-${index}-${row.enabled}-${this.rowItem(row).selected}`)
    }.width(this.primaryWidth()).attributeModifier(new MenuSurface(this.anchor === undefined))
  }

  build() {
    Stack() {
      AnchoredMenu({ menuWidth: this.totalWidth(), alignEnd: true, surfaceVisible: false, slideScope: this.slideScope,
        contentMaxWidth: this.anchor === undefined ? this.contentWidth : this.totalWidth(),
        contentLeft: this.anchoredPlacement()?.left, topOffset: this.menuTop(),
        bubble: this.menuBubble(), maxHeight: this.anchoredPlacement()?.height,
        onClose: (): void => { this.dismissTop(); } }) {
        Stack({ alignContent: Alignment.TopStart }) {
          Row({ space: 6 }) {
            if (this.groupsOnRight()) {
              this.primaryPanel()
              this.groupPanels()
            } else {
              this.groupPanels()
              this.primaryPanel()
            }
          }.alignItems(VerticalAlign.Top).width(this.totalWidth()).position({ x: 0, y: 0 })
        }.width(this.totalWidth()).height(this.layoutHeight())
      }
    }.width('100%').height('100%')
    .onAreaChange((_old: Area, area: Area): void => {
      this.contentWidth = cardViewportWidth(Number(area.width), Number(area.height));
      this.viewportWidth = Number(area.width);
      this.viewportHeight = Number(area.height);
      this.viewportLeft = Number(area.globalPosition.x);
      this.viewportTop = Number(area.globalPosition.y);
    })
  }
}
