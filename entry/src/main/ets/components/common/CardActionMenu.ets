// SPDX-License-Identifier: AGPL-3.0-or-later
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { AnchoredMenu } from './AnchoredMenu';
import { AnchoredMenuItem } from './MenuItem';
import { ActionMenuNode, ActionMenuRow, actionMenuRows } from './ActionMenuTree';
import { ActionMenuPanelPlacement, actionMenuGroupInset, placeActionMenuGroups } from './ActionMenuLayout';
import { MenuBubble } from './MenuBubble';
import { MenuSurface } from './MenuSurface';
import { cardViewportWidth } from '../../model/CardViewportLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';

interface MenuMeasuredHeight { id: string; height: number; }

export interface CardActionMenuEntry extends MenuElement, ActionMenuNode {
  iconTint?: ResourceColor;
  selected?: boolean;
  selectionUsesAccent?: boolean;
  destructive?: boolean;
  children?: CardActionMenuEntry[];
}

/** 右侧主菜单保持紧凑，左侧分组自然堆叠；宿主拥有展开状态和业务动作，公共外壳独占滚动。 */
@Component
export struct CardActionMenu {
  @Prop @Watch('publishOcclusion') items: CardActionMenuEntry[] = [];
  @Prop @Watch('publishOcclusion') expandedIds: string[] = [];
  @Prop menuWidth: number = 应用尺寸.compactMenuWidth;
  @Prop topOffset: number | undefined = undefined;
  @State private contentWidth: number = 840;
  @State private rowHeights: number[] = [];
  @State private measuredHeights: MenuMeasuredHeight[] = [];
  private lastOcclusion: boolean = false;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  onClose: () => void = (): void => {};
  onToggleBranch: (item: CardActionMenuEntry) => void = (_item: CardActionMenuEntry): void => {};
  onPrimaryObscured: (obscured: boolean) => void = (_obscured: boolean): void => {};
  onSelect: (item: CardActionMenuEntry) => void = (item: CardActionMenuEntry): void => { item.action?.(); };

  private rows(): ActionMenuRow[] { return actionMenuRows(this.items, this.expandedIds); }

  private rowItem(row: ActionMenuRow): CardActionMenuEntry { return row.node as CardActionMenuEntry; }

  private selectEntry(row: ActionMenuRow): void {
    const current: ActionMenuRow | undefined = this.rows().find((item: ActionMenuRow): boolean => item.key === row.key);
    if (current === undefined || !current.enabled || (this.primaryObscured() && current.depth === 0)) return;
    const entry: CardActionMenuEntry = this.rowItem(current);
    if (entry.children !== undefined) {
      this.getUIContext().animateTo({ duration: 150, curve: Curve.EaseOut }, (): void => { this.onToggleBranch(entry); });
    } else this.onSelect(entry);
  }

  private sideGroups(): CardActionMenuEntry[] {
    return this.items.filter((item: CardActionMenuEntry): boolean =>
      item.children !== undefined && this.expandedIds.includes(item.id ?? ''));
  }

  private primaryWidth(): number {
    const available: number = this.contentWidth - 24;
    return Math.min(this.menuWidth, Math.max(48, this.sideGroups().length === 0 ? available : (available - 12) * 0.56));
  }

  private groupWidth(): number {
    return Math.min(应用尺寸.cardActionGroupWidth, Math.max(0, this.contentWidth - 24 - this.primaryWidth() - 12));
  }

  private totalWidth(): number {
    return this.sideGroups().length === 0 ? this.primaryWidth() : this.primaryWidth() + 12 + this.groupWidth();
  }

  aboutToAppear(): void { this.publishOcclusion(); }

  private heightOf(id: string, fallback: number): number {
    return this.measuredHeights.find((entry: MenuMeasuredHeight): boolean => entry.id === id)?.height ?? fallback;
  }

  private recordHeight(id: string, height: number): void {
    if (height <= 0 || Math.abs(this.heightOf(id, 0) - height) < 0.5) return;
    this.measuredHeights = [...this.measuredHeights.filter((entry: MenuMeasuredHeight): boolean => entry.id !== id), { id: id, height: height }];
  }

  private groupRows(group: CardActionMenuEntry): ActionMenuRow[] {
    return this.rows().filter((row: ActionMenuRow): boolean => row.depth === 1 && row.key.startsWith(`/${group.id}/`));
  }

  private groupHeights(): number[] {
    return this.sideGroups().map((group: CardActionMenuEntry): number =>
      this.heightOf(group.id ?? '', (group.children?.length ?? 0) * 应用尺寸.menuItemHeight));
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

  private popupRows(): ActionMenuRow[] {
    const branch: ActionMenuRow | undefined = this.nestedBranch();
    return branch === undefined ? [] : this.rows().filter((row: ActionMenuRow): boolean => row.key.startsWith(`${branch.key}/`));
  }

  private primaryObscured(): boolean { return this.nestedBranch() !== undefined; }

  private popupX(): number { return this.totalWidth() - this.primaryWidth(); }

  private publishOcclusion(): void {
    const obscured: boolean = this.primaryObscured();
    if (obscured === this.lastOcclusion) return;
    this.lastOcclusion = obscured;
    this.onPrimaryObscured(obscured);
  }

  private popupHeight(): number { return this.heightOf('popup', this.popupRows().length * 应用尺寸.menuItemHeight); }

  private layoutHeight(): number {
    let height: number = this.items.reduce((sum: number, _item: CardActionMenuEntry, index: number): number =>
      sum + (this.rowHeights[index] ?? 应用尺寸.menuItemHeight), 0);
    const heights: number[] = this.groupHeights();
    this.placements().forEach((placement: ActionMenuPanelPlacement, index: number): void => {
      height = Math.max(height, placement.top + heights[index]);
    });
    return this.nestedBranch() === undefined ? height : Math.max(height, this.popupHeight());
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
    AnchoredMenuItem({ label: this.rowItem(row).value, available: row.enabled && !(this.primaryObscured() && row.depth === 0), divider: index > 0,
      icon: this.rowItem(row).icon, iconTint: this.rowItem(row).iconTint, labelAlignment: TextAlign.Start,
      selected: this.rowItem(row).selected === true,
      selectionUsesAccent: this.rowItem(row).selectionUsesAccent !== false,
      destructive: this.rowItem(row).destructive === true,
      disclosure: row.node.children !== undefined, expanded: this.expandedIds.includes(row.node.id ?? ''),
      disclosureAngle: row.depth > 0 ? undefined : this.expandedIds.includes(row.node.id ?? '') ? 180 : 90,
      onSelect: (): void => { this.selectEntry(row); } })
      .transition(TransitionEffect.opacity(0).animation({ duration: 150, curve: Curve.EaseOut }))
  }

  build() {
    Stack() {
      AnchoredMenu({ menuWidth: this.totalWidth(), alignEnd: true, surfaceVisible: false,
        contentMaxWidth: this.contentWidth,
        topOffset: this.topOffset ?? 应用尺寸.pageContentTop(this.statusBarHeight, this.narrowDeckLayout),
        onClose: (): void => { this.dismissTop(); } }) {
        Stack({ alignContent: Alignment.TopStart }) {
          Row({ space: 6 }) {
            if (this.sideGroups().length > 0) {
              Column() {
                ForEach(this.sideGroups(), (group: CardActionMenuEntry, groupIndex: number) => {
                  Blank().height(this.groupGap(groupIndex))
                  Column() {
                    MenuBubble({ panelWidth: this.groupWidth(), pointerCenter: this.placements()[groupIndex].pointerCenter }) {
                      ForEach(this.groupRows(group), (row: ActionMenuRow, index: number) => {
                        this.menuRow(row, index)
                      }, (row: ActionMenuRow): string => `${row.key}-${row.enabled}-${this.rowItem(row).selected}`)
                    }
                  }.onAreaChange((_old: Area, area: Area): void => { this.recordHeight(group.id ?? '', Number(area.height)); })
                }, (group: CardActionMenuEntry): string => group.id ?? '')
              }.width(this.groupWidth() + MenuSurface.pointerDepth)
            }
            Column() {
              ForEach(this.rows().filter((row: ActionMenuRow): boolean => row.depth === 0), (row: ActionMenuRow, index: number) => {
                Column() { this.menuRow(row, index) }
                  .onAreaChange((_old: Area, area: Area): void => { this.recordRow(index, Number(area.height)); })
              }, (row: ActionMenuRow, index: number): string => `${row.key}-${index}-${row.enabled}-${this.rowItem(row).selected}`)
            }.width(this.primaryWidth()).attributeModifier(new MenuSurface())
          }.alignItems(VerticalAlign.Top).width(this.totalWidth()).position({ x: 0, y: 0 })
          if (this.nestedBranch() !== undefined) {
            Column() {
              ForEach(this.popupRows(), (row: ActionMenuRow, index: number) => {
                this.menuRow(row, index)
              }, (row: ActionMenuRow): string => `${row.key}-${row.enabled}-${this.rowItem(row).selected}`)
            }.width(this.primaryWidth()).attributeModifier(new MenuSurface())
            .position({ x: this.popupX(), y: 0 }).zIndex(1)
            .onAreaChange((_old: Area, area: Area): void => { this.recordHeight('popup', Number(area.height)); })
          }
        }.width(this.totalWidth()).height(this.layoutHeight())
      }
    }.width('100%').height('100%')
    .onAreaChange((_old: Area, area: Area): void => {
      this.contentWidth = cardViewportWidth(Number(area.width), Number(area.height));
    })
  }
}
