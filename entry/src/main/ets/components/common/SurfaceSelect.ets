import { GlassFusionRect } from 'jide_foundation';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassPanel } from './GlassPanel';
import { SelectionValueButton } from './SelectionValueButton';
import { ActionMenuListItem } from './ActionMenuList';
import { SelectionOptions } from './SelectionOptions';
import { localizedResourceText } from '../../utils/UiFeedback';
import { WINDOW_HEIGHT_KEY, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY } from '../../model/WindowSafeLayout';
import { SelectionRect, selectionMenuWidth, selectionMenuMaxHeight, selectionPopupAngle, selectionClosedAngle } from './SelectionMenuLayout';
import { MenuSurface } from './MenuSurface';
import { SelectStyle } from '../../utils/SelectStyle';

interface SelectPopupState { isVisible: boolean; }

/** 公共枚举选择器：弹层无系统阴影，当前选项与点击守卫仍由调用方持有。 */
@Component
export struct SurfaceSelect {
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('系统语言') private language: string = 'zh-Hans';
  @StorageProp(WINDOW_HEIGHT_KEY) private windowHeight: number = 600;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  private triggerRect: SelectionRect = { left: 0, top: 0, width: 0, height: 0 };
  @State private popupAngle: number = 90;
  @State private motionCenterX: string = '50%';
  @State private motionCenterY: string = '0%';
  @State private triggerWidth: number = 0;
  @State private popupWidth: number = 180;
  @Prop options: SelectOption[] = [];
  @Prop selectedIndex: number = -1;
  @Prop value: ResourceStr = '';
  @Prop label: ResourceStr = '';
  @Prop @Watch('availabilityChanged') isInteractive: boolean = true;
  onSelect: (index: number) => void = (_index: number): void => {};
  @State private menuOpen: boolean = false;

  private availabilityChanged(): void { if (!this.isInteractive) this.menuOpen = false; }
  aboutToDisappear(): void { this.menuOpen = false; }
  private open(): void {
    if (!this.isInteractive || this.options.length === 0) return;
    if (!this.menuOpen) this.measureMenu();
    this.menuOpen = !this.menuOpen;
  }
  private measureMenu(): void {
    let widest: number = 0;
    const ui = this.getUIContext();
    for (const option of this.options) {
      const label: string = typeof option.value === 'string' ? option.value : localizedResourceText(ui, this.language, option.value);
      widest = Math.max(widest, ui.px2vp(ui.getMeasureUtils().measureText({ textContent: label,
        fontSize: SelectStyle.controlFont.size, fontWeight: FontWeight.Medium })));
    }
    this.popupWidth = selectionMenuWidth(widest, this.triggerWidth);
  }
  private valueText(): string {
    return typeof this.value === 'string' ? this.value : localizedResourceText(this.getUIContext(), this.language, this.value);
  }
  private valueWidth(): number {
    const ui = this.getUIContext();
    return Math.ceil(ui.px2vp(ui.getMeasureUtils().measureText({ textContent: this.valueText(),
      fontSize: SelectStyle.controlFont.size, fontWeight: SelectStyle.controlFont.weight }))) +
      Number(SelectStyle.controlPadding.left) + Number(SelectStyle.controlPadding.right) + SelectStyle.controlSpace + 24;
  }
  private menuMaxHeight(): number { return selectionMenuMaxHeight(this.windowHeight, this.safeTop, this.safeBottom); }
  private select(id: string): void {
    const index: number = Number(id);
    if (!this.menuOpen || !this.isInteractive || !Number.isInteger(index) || index < 0 || index >= this.options.length) return;
    this.menuOpen = false;
    this.onSelect(index);
  }
  private items(): ActionMenuListItem[] {
    return this.options.map((option: SelectOption, index: number): ActionMenuListItem => ({
      id: String(index), label: option.value, selected: index === this.selectedIndex, available: this.isInteractive
    }));
  }
  private popupArea(area: Area): void {
    if (!this.menuOpen) return;
    this.motionCenterX = `${Math.max(0, Math.min(100,
      (this.triggerRect.left + this.triggerRect.width / 2 - Number(area.globalPosition.x)) / Math.max(1, Number(area.width)) * 100))}%`;
    this.motionCenterY = `${Math.max(0, Math.min(100,
      (this.triggerRect.top + this.triggerRect.height / 2 - Number(area.globalPosition.y)) / Math.max(1, Number(area.height)) * 100))}%`;
    this.popupAngle = selectionPopupAngle(this.triggerRect, { left: Number(area.globalPosition.x),
      top: Number(area.globalPosition.y), width: Number(area.width), height: Number(area.height) });
  }
  private buttonOrigin(): GlassFusionRect {
    return { x: this.triggerRect.left, y: this.triggerRect.top, width: this.triggerRect.width,
      height: this.triggerRect.height, radius: 12 };
  }
  @Builder
  private choices() {
    GlassPanel({ fusionAnchor: this.buttonOrigin(), radius: 12, role: 'menu', centerX: this.motionCenterX, centerY: this.motionCenterY, content: (): void => { this.choiceContent(); } })
      .onAreaChange((_old: Area, area: Area): void => { this.popupArea(area); })
  }
  @Builder
  private choiceContent() {
    Scroll() {
      SelectionOptions({ items: this.items(), isInteractive: this.isInteractive,
        onSelect: (id: string): void => { this.select(id); } })
    }.width(this.popupWidth).constraintSize({ maxHeight: this.menuMaxHeight() }).scrollBar(BarState.Auto)
      .clip(true)
  }
  build() {
    SelectionValueButton({ value: this.valueText(), label: this.label, controlWidth: this.valueWidth(),
      disclosureAngle: this.menuOpen ? this.popupAngle : selectionClosedAngle(this.popupAngle),
      isInteractive: this.isInteractive && this.options.length > 0, onAction: (): void => { this.open(); } })
    .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
    .onAreaChange((_old: Area, area: Area): void => { this.triggerWidth = Number(area.width);
      this.triggerRect = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
        width: Number(area.width), height: Number(area.height) }; })
    .bindPopup(this.menuOpen, {builder: (): void => { this.choices(); }, placement: Placement.BottomRight,
      // 系统默认20vp圆角会裁掉12vp表面的四角描边，宿主与表面必须同半径。
      radius:12, enableArrow:false, autoCancel:true, popupColor:Color.Transparent, backgroundBlurStyle:BlurStyle.NONE,
      shadow:MenuSurface.popupShadow(),
      transition:TransitionEffect.IDENTITY,
      onStateChange:(event: SelectPopupState): void => { this.menuOpen = event.isVisible; }})
  }
}
