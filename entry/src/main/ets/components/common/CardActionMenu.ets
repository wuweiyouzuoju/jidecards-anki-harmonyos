import { takePopupTrigger } from '../../utils/PopupTrigger';
import { GlassFusionRect } from 'jide_foundation';
import { supportsGlassBackdrop } from '../../utils/GlassBackdrop';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { warmGlassSource } from '../../utils/GlassBackdrop';
import { GlassPanel } from './GlassPanel';
import { GlassBubblePanel } from './GlassBubblePanel';
import { WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY, WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY,
  WINDOW_KEYBOARD_TOP_KEY, keyboardViewportHeight, safeMenuGeometry } from '../../model/WindowSafeLayout';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { AnchoredMenu } from './AnchoredMenu';
import { AnchoredMenuItem } from './MenuItem';
import { MenuSlideScope } from '../../model/MenuSlideSession';
import { ActionMenuNode, ActionMenuRow, actionMenuRows, visibleActionMenuRows } from './ActionMenuTree';
import { ActionMenuAnchor, ActionMenuBubble, ActionMenuPointerSide, AnchoredActionMenuPlacement, ActionMenuPanelPlacement, actionMenuGroupInset, placeActionMenuGroups,
  placeAnchoredActionMenu, placeActionMenuOverlay } from './ActionMenuLayout';
import { MenuBubble } from './MenuBubble';
import { MenuSurface } from './MenuSurface';
import { cardViewportWidth } from '../../model/CardViewportLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';

interface MenuMeasuredHeight { id: string; height: number; }
interface MenuScrollOffset { id: string; offset: number; }

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
  children?: CardActionMenuEntry[];
}

/** 两个侧面板保持位置；深层列表朝主菜单方向覆盖，尖角对齐侧面板内的触发行。 */
@Component
export struct CardActionMenu {
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp(APP_FOREGROUND_KEY) private foreground: boolean = false;
  @State private fusionUnavailable: boolean = false;
  private toolbarOrigin: GlassFusionRect | undefined = undefined;
  @State private primaryArea: GlassFusionRect | undefined = undefined;
  @Prop closeRequest: number = 0;
  private usesToolbarFusion(): boolean {
    return this.anchor === undefined && this.toolbarOrigin !== undefined && this.material === 'glass' &&
      this.foreground && !this.fusionUnavailable && supportsGlassBackdrop();
  }
  @State private layerSource: string = '';
  aboutToAppear(): void {
    this.layerSource = 'jide-menu-layer-' + this.getUniqueId();
    this.toolbarOrigin = takePopupTrigger();
  }
  aboutToDisappear(): void {
    warmGlassSource(this.getUIContext(), this.layerSource, false);
  }
  private warmLayers(): void {
    if (this.layerSource !== '') warmGlassSource(this.getUIContext(), this.layerSource, true);
  }
  private readonly primaryScroller: Scroller = new Scroller();
  private readonly groupScrollers: Map<string, Scroller> = new Map<string, Scroller>();
  @State private primaryScrollOffset: number = 0;
  @State private groupScrollOffsets: MenuScrollOffset[] = [];
  private groupScroller(id: string): Scroller {
    let scroller: Scroller | undefined = this.groupScrollers.get(id);
    if (scroller === undefined) { scroller = new Scroller(); this.groupScrollers.set(id, scroller); }
    return scroller;
  }
  private recordGroupScroll(id: string): void {
    const offset: number = this.groupScroller(id).currentOffset().yOffset;
    if (Math.abs(this.groupScrollOffset(id) - offset) < 0.5) return;
    this.groupScrollOffsets = [...this.groupScrollOffsets.filter((item: MenuScrollOffset): boolean => item.id !== id),
      { id: id, offset: offset }];
  }
  private groupScrollOffset(id: string): number {
    return this.groupScrollOffsets.find((item: MenuScrollOffset): boolean => item.id === id)?.offset ?? 0;
  }
  private readonly slideScope: MenuSlideScope = new MenuSlideScope();
  @Prop items: CardActionMenuEntry[] = [];
  @Prop expandedIds: string[] = [];
  @Prop menuWidth: number = 应用尺寸.compactMenuWidth;
  @Prop toolbarRight: number | undefined = undefined;
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
  onPrimaryArea: (area: Area) => void = (_area: Area): void => {};
  onClose: () => void = (): void => {};
  onToggleBranch: (item: CardActionMenuEntry) => void = (_item: CardActionMenuEntry): void => {};
  onSelect: (item: CardActionMenuEntry) => void = (item: CardActionMenuEntry): void => { item.action?.(); };

  private rows(): ActionMenuRow[] { return actionMenuRows(this.items, this.expandedIds); }

  private rowItem(row: ActionMenuRow): CardActionMenuEntry {
    // ForEach 复用行时仍从当前树读取属性，不能保留首次渲染的选中/启用快照。
    return (this.rows().find((current: ActionMenuRow): boolean => current.key === row.key)?.node ?? row.node) as CardActionMenuEntry;
  }

  private rowEnabled(row: ActionMenuRow): boolean {
    return this.rows().find((current: ActionMenuRow): boolean => current.key === row.key)?.enabled ?? false;
  }

  private selectEntry(row: ActionMenuRow): void {
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
    // 首次打开即预留分支宽度，展开时主面板不缩窄、换行或重新裁取玻璃。
    return Math.min(this.menuWidth, Math.max(48, this.hasBranches() ? (available - 12) * 0.56 : available));
  }

  private groupWidth(): number {
    return Math.min(应用尺寸.cardActionGroupWidth, Math.max(0, this.availableWidth() - this.primaryWidth() - 12));
  }

  private hasBranches(): boolean {
    return this.items.some((item: CardActionMenuEntry): boolean => item.children !== undefined);
  }

  private totalWidth(): number {
    // 外层右对齐与主列局部位置必须在同一固定坐标系内；否则两次布局之间主列会被挤出屏幕。
    return this.hasBranches() ? this.primaryWidth() + 12 + this.groupWidth() : this.primaryWidth();
  }

  private heightOf(id: string, fallback: number): number {
    return this.measuredHeights.find((entry: MenuMeasuredHeight): boolean => entry.id === id)?.height ?? fallback;
  }

  private recordHeight(id: string, height: number): void {
    if (height <= 0 || Math.abs(this.heightOf(id, 0) - height) < 0.5) return;
    this.measuredHeights = [...this.measuredHeights.filter((entry: MenuMeasuredHeight): boolean => entry.id !== id), { id: id, height: height }];
  }

  private groupsOnRight(): boolean {
    if (this.anchor === undefined || !this.hasBranches()) return false;
    const left: number = this.anchor.left + (this.anchor.width + this.primaryWidth()) / 2 - this.totalWidth();
    return left < Math.max(0, this.safeLeft - this.viewportLeft) + 12;
  }

  private groupRows(group: CardActionMenuEntry): ActionMenuRow[] {
    return this.rows().filter((row: ActionMenuRow): boolean => row.depth === 1 && row.key.startsWith(`/${group.id}/`));
  }

  private popupRows(): ActionMenuRow[] {
    const branch: ActionMenuRow | undefined = this.nestedBranch();
    if (branch === undefined) return [];
    return this.rows().filter((row: ActionMenuRow): boolean => row.depth === 2 && row.key.startsWith(`${branch.key}/`));
  }

  private availableMenuHeight(): number {
    // 不使用 menuTop()，行锚点的定位反过来依赖面板高度。
    const top: number = this.anchor === undefined ? this.topOffset ??
      应用尺寸.pageContentTop(this.statusBarHeight, this.narrowDeckLayout, this.toolbarSafeTop) : 0;
    return safeMenuGeometry(keyboardViewportHeight(this.viewportHeight, this.viewportTop, this.keyboardTop),
      top, Math.max(0, this.toolbarSafeTop - this.viewportTop), this.keyboardTop > 0 ? 0 : this.safeBottom,
      应用尺寸.页面底部间距(this.narrowDeckLayout)).maxHeight;
  }

  private groupMaxHeight(): number {
    const count: number = Math.max(1, this.sideGroups().length);
    return Math.max(0, (this.availableMenuHeight() - 8 * (count - 1)) / count);
  }

  private groupHeights(): number[] {
    return this.sideGroups().map((group: CardActionMenuEntry): number =>
      Math.min(this.groupMaxHeight(), this.groupRows(group).reduce((sum: number, row: ActionMenuRow): number =>
        sum + this.heightOf(row.key, 应用尺寸.menuItemHeight), 0)));
  }

  private placements(): ActionMenuPanelPlacement[] {
    const anchors: number[] = this.sideGroups().map((group: CardActionMenuEntry): number => {
      const index: number = this.items.findIndex((item: CardActionMenuEntry): boolean => item.id === group.id);
      return actionMenuGroupInset(this.rowHeights, index, 0, 应用尺寸.menuItemHeight) - this.primaryScrollOffset;
    });
    return placeActionMenuGroups(anchors, this.groupHeights(), 应用尺寸.radiusLg + MenuSurface.pointerSpan / 2 + 0.5, 8, this.availableMenuHeight());
  }

  private groupGap(index: number): number {
    const placements: ActionMenuPanelPlacement[] = this.placements();
    return placements[index].top - (index === 0 ? 0 : placements[index - 1].top + this.groupHeights()[index - 1]);
  }

  private nestedBranch(): ActionMenuRow | undefined {
    return this.rows().find((row: ActionMenuRow): boolean => row.depth === 1 && row.node.children !== undefined &&
      this.expandedIds.includes(row.node.id ?? ''));
  }

  private baseHeight(): number {
    let height: number = this.items.reduce((sum: number, _item: CardActionMenuEntry, index: number): number =>
      sum + (this.rowHeights[index] ?? 应用尺寸.menuItemHeight), 0);
    const heights: number[] = this.groupHeights();
    this.placements().forEach((placement: ActionMenuPanelPlacement, index: number): void => {
      height = Math.max(height, placement.top + heights[index]);
    });
    return Math.min(height, this.availableMenuHeight());
  }

  private popupHeight(): number {
    return Math.min(this.availableMenuHeight(), this.heightOf(this.popupHeightId(), this.popupRows().length * 应用尺寸.menuItemHeight));
  }

  private popupHeightId(): string {
    return `${this.nestedBranch()?.key ?? ''}/popup`;
  }

  private popupPlacement(): ActionMenuPanelPlacement | undefined {
    const branch: ActionMenuRow | undefined = this.nestedBranch();
    if (branch === undefined) return undefined;
    const groups: CardActionMenuEntry[] = this.sideGroups();
    const groupIndex: number = groups.findIndex((group: CardActionMenuEntry): boolean => branch.key.startsWith(`/${group.id}/`));
    if (groupIndex < 0) return undefined;
    const rows: ActionMenuRow[] = this.groupRows(groups[groupIndex]);
    const rowIndex: number = rows.findIndex((row: ActionMenuRow): boolean => row.key === branch.key);
    const heights: number[] = rows.map((row: ActionMenuRow): number => this.heightOf(row.key, 应用尺寸.menuItemHeight));
    const triggerCenter: number = this.placements()[groupIndex].top +
      actionMenuGroupInset(heights, rowIndex, 0, 应用尺寸.menuItemHeight) - this.groupScrollOffset(groups[groupIndex].id ?? '');
    return placeActionMenuOverlay(triggerCenter, this.popupHeight(), this.baseHeight(),
      应用尺寸.radiusLg + MenuSurface.pointerSpan / 2 + 0.5);
  }

  private popupX(): number {
    return this.groupsOnRight() ? 0 : this.totalWidth() - this.primaryWidth() - MenuSurface.pointerDepth;
  }

  private popupPointerSide(): ActionMenuPointerSide {
    return this.groupsOnRight() ? ActionMenuPointerSide.Right : ActionMenuPointerSide.Left;
  }

  private layoutHeight(): number {
    const placement: ActionMenuPanelPlacement | undefined = this.popupPlacement();
    return Math.max(this.baseHeight(), placement === undefined ? 0 : placement.top + this.popupHeight());
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

  /** 工具栏已做内容限宽；按真实按钮右缘定位，不能再扣一遍宽屏留白。 */
  private toolbarLeft(): number | undefined {
    if (this.toolbarRight === undefined) return undefined;
    return Math.max(Math.max(0, this.safeLeft - this.viewportLeft),
      Math.min(this.viewportWidth - this.totalWidth(), this.toolbarRight - this.viewportLeft - this.totalWidth()));
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
      available: this.rowEnabled(row) && !(row.depth === 0 && this.nestedBranch() !== undefined),
      divider: this.rowItem(row).divider ?? index > 0,
      icon: this.rowItem(row).icon, iconTint: this.rowItem(row).iconTint, labelAlignment: TextAlign.Center,
      selected: this.rowItem(row).selected === true,
      selectionUsesAccent: this.rowItem(row).selectionUsesAccent !== false,
      destructive: this.rowItem(row).destructive === true,
      disclosure: row.node.children !== undefined, expanded: this.expandedIds.includes(row.node.id ?? ''),
      // 收起向下，展开旋向实际子面板；根分组和覆盖层的方向相反。
      disclosureAngle: this.expandedIds.includes(row.node.id ?? '') ?
        (row.depth > 0 ? (this.groupsOnRight() ? 180 : 0) : (this.groupsOnRight() ? 0 : 180)) : 90,
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
              Scroll(this.groupScroller(group.id ?? '')) {
              Column() {
              ForEach(this.groupRows(group), (row: ActionMenuRow, index: number) => {
                Column() { this.menuRow(row, index) }
                  .onAreaChange((_old: Area, area: Area): void => { this.recordHeight(row.key, Number(area.height)); })
              }, (row: ActionMenuRow): string => row.key)
              }.width(this.groupWidth())
              }.constraintSize({ maxHeight: this.groupMaxHeight() }).scrollBar(BarState.Auto)
                .onDidScroll((): void => { this.recordGroupScroll(group.id ?? ''); })
            }
          }
          
          .onAreaChange((_old: Area, area: Area): void => { this.recordHeight(group.id ?? '', Number(area.height)); })
        }, (group: CardActionMenuEntry): string => group.id ?? '')
      }.width(this.groupWidth() + MenuSurface.pointerDepth)
    }
  }

  @Builder
  private primaryPanel() {
    if (this.anchor !== undefined && this.anchoredPlacement() !== undefined) {
      GlassBubblePanel({ panelWidth: this.primaryWidth(), pointerCenter: this.anchoredPlacement()!.pointerCenter,
        pointerSide: this.anchoredPlacement()!.pointerSide, onPrepared: (): void => { this.warmLayers(); }, content: (): void => { this.primaryScroll(); } })
    } else {
      GlassPanel({ role: 'menu', surfaceVisible: !this.usesToolbarFusion(), externalEntrance: this.usesToolbarFusion(), panelWidth: this.primaryWidth(), onPrepared: (): void => { this.warmLayers(); }, content: (): void => { this.primaryScroll(); } })
    }
  }

  @Builder
  private primaryScroll() {
    Scroll(this.primaryScroller) { this.primaryRows() }.width(this.primaryWidth())
      .constraintSize({ maxHeight: this.availableMenuHeight() }).scrollBar(BarState.Auto)
      .onDidScroll((): void => { this.primaryScrollOffset = this.primaryScroller.currentOffset().yOffset; })
      .onAreaChange((_old: Area, area: Area): void => { this.onPrimaryArea(area);
        this.primaryArea = { x: Number(area.globalPosition.x), y: Number(area.globalPosition.y),
          width: Number(area.width), height: Number(area.height), radius: 应用尺寸.radiusLg };
      })
  }

  @Builder
  private primaryRows() {
    Column() {
      ForEach(this.rows().filter((row: ActionMenuRow): boolean => row.depth === 0), (row: ActionMenuRow, index: number) => {
        Column() { this.menuRow(row, index) }
          .onAreaChange((_old: Area, area: Area): void => { this.recordRow(index, Number(area.height)); })
      }, (row: ActionMenuRow, index: number): string => row.key)
    }.width(this.primaryWidth())
    .hitTestBehavior(this.nestedBranch() === undefined ? HitTestMode.Default : HitTestMode.None)
  }

  build() {
    Stack() {
      AnchoredMenu({ fusionAnchor: this.toolbarOrigin, separateFusionSurface: this.usesToolbarFusion(),
        onFusionUnavailable: (): void => { this.fusionUnavailable = true; }, fusionPanelArea: this.primaryArea, closeRequest: this.closeRequest, menuWidth: this.totalWidth(), alignEnd: true, surfaceVisible: false, slideScope: this.slideScope,
        contentMaxWidth: this.anchor === undefined && this.toolbarRight === undefined ? this.contentWidth : this.totalWidth(),
        contentLeft: this.anchoredPlacement()?.left ?? this.toolbarLeft(), topOffset: this.menuTop(),
        bubble: this.menuBubble(), maxHeight: this.anchoredPlacement()?.height,
        onClose: (): void => { this.dismissTop(); } }) {
        Stack({ alignContent: Alignment.TopStart }) {
          // 父面板始终处于第一个固定槽位，分支增减及左右避让不能替换它的组件位置。
          Stack({ alignContent: Alignment.TopStart }) {
            Column() { this.primaryPanel() }
              .position({ x: this.groupsOnRight() ? 0 : this.totalWidth() - this.primaryWidth(), y: 0 })
            Column() { this.groupPanels() }
              .position({ x: this.groupsOnRight() ? this.primaryWidth() + MenuSurface.pointerDepth : 0, y: 0 })
            // 预留定位区不属于可见菜单；在此点击仍按外部点击关闭。
            Column().width(this.hasBranches() && this.sideGroups().length === 0 ? this.groupWidth() + 12 : 0)
              .height(this.baseHeight()).position({ x: this.groupsOnRight() ? this.primaryWidth() : 0, y: 0 })

          }.width(this.totalWidth()).height(this.baseHeight()).position({ x: 0, y: 0 })
            .id(this.layerSource).onAreaChange((): void => { this.warmLayers(); })
          if (this.popupPlacement() !== undefined) {
            Column() {
              MenuBubble({ source: this.layerSource, panelWidth: this.primaryWidth(), pointerCenter: this.popupPlacement()!.pointerCenter,
                pointerSide: this.popupPointerSide() }) {
                Scroll() {
                Column() {
                ForEach(this.popupRows(), (row: ActionMenuRow, index: number) => {
                  this.menuRow(row, index)
                }, (row: ActionMenuRow): string => row.key)
                }.width(this.primaryWidth())
                }.constraintSize({ maxHeight: this.availableMenuHeight() }).scrollBar(BarState.Auto)
              }
            }.position({ x: this.popupX(), y: this.popupPlacement()!.top }).zIndex(1)
            
            .onAreaChange((_old: Area, area: Area): void => { this.recordHeight(this.popupHeightId(), Number(area.height)); })
          }
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
