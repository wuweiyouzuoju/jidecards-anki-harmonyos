// SPDX-License-Identifier: AGPL-3.0-or-later
import { inputMethod } from '@kit.IMEKit';
import { SharedIconButton } from './IconButton';

/** Toolbar search: fixed right edge, symmetric capsule, guarded focus, and a shared submit/return path. */
@Component
export struct SharedExpandingSearch {
  @Prop value: string = '';
  @Prop placeholder: string = '';
  @Prop label: string = '搜索';
  @Prop inputId: string = 'jide-expanding-search-input';
  @Prop controlSize: number = 32;
  @Prop surfaceColor: ResourceColor = Color.White;
  /** Value-only drawing parameters survive reactive prop updates; products share their visual tokens. */
  @Prop surfaceOutline: BorderOptions | undefined = undefined;
  @Prop surfaceShadow: ShadowOptions | undefined = undefined;
  @Prop surfaceRadius: number = 0;
  @Prop lineColor: ResourceColor = '#CFD7E3';
  @Prop textColor: ResourceColor = Color.Black;
  @Prop placeholderColor: ResourceColor = '#667085';
  @Prop isEnabled: boolean = true;
  @Prop @Watch('closeRequested') closeRequest: number = 0;
  @BuilderParam glyph: () => void;
  @BuilderParam closeGlyph: () => void = this.defaultCloseGlyph;
  readAnimation: () => AnimateParam = (): AnimateParam => ({ duration: 300, curve: Curve.EaseInOut });
  onChange: (value: string) => void = (): void => {};
  onSubmit: (value: string) => void = (): void => {};
  onExpandedChange: (expanded: boolean) => void = (): void => {};
  @State private expanded: boolean = false;
  @State private availableWidth: number = 32;
  private active: boolean = false;
  private generation: number = 0;
  aboutToAppear(): void { this.active = true; }
  aboutToDisappear(): void { this.active = false; this.generation++; }
  private closeRequested(): void { if (this.expanded) this.close(false); }
  private hideKeyboard(): void {
    this.getUIContext().getFocusController().clearFocus();
    try { inputMethod.getController().stopInputSession().catch((): void => {}); } catch (_error) {}
  }
  private focus(generation: number): void {
    if (!this.active || !this.expanded || !this.isEnabled || generation !== this.generation) return;
    try {
      this.getUIContext().getFocusController().requestFocus(this.inputId);
      inputMethod.getController().showTextInput().catch((): void => {});
    } catch (_error) {}
  }
  private close(submit: boolean): void {
    if (!this.expanded || !this.active) return;
    this.generation++; this.hideKeyboard();
    if (submit) this.onSubmit(this.value);
    this.getUIContext().animateTo(this.readAnimation(), (): void => {
      this.expanded = false; this.onExpandedChange(false);
    });
  }
  private activate(): void {
    if (!this.isEnabled || !this.active) return;
    if (this.expanded) { this.close(true); return; }
    const generation = ++this.generation, animation = this.readAnimation();
    animation.onFinish = (): void => this.focus(generation);
    this.getUIContext().animateTo(animation, (): void => {
      this.expanded = true; this.onExpandedChange(true);
    });
  }
  @Builder
  private defaultCloseGlyph() {
    Text('×').fontSize(20).fontColor(this.placeholderColor).hitTestBehavior(HitTestMode.None)
  }
  build() {
    Stack({ alignContent: Alignment.End }) {
      Stack() {
      Row() {
        SharedIconButton({ label: this.label, isInteractive: this.isEnabled, controlSize: this.controlSize,
          circular: true, radius: this.controlSize / 2, surfaceColor: this.expanded || this.surfaceOutline !== undefined ? Color.Transparent : this.surfaceColor,
          frameLineWidth: this.expanded || this.surfaceOutline !== undefined ? 0 : 1, frameLineColor: this.lineColor,
          glyph: (): void => { this.glyph(); }, onAction: (): void => this.activate() })
          .id(this.inputId + '-toggle')
        if (this.expanded) {
          TextInput({ text: this.value, placeholder: this.placeholder }).height(this.controlSize).layoutWeight(1)
            .fontSize(13).fontColor(this.textColor).placeholderColor(this.placeholderColor)
            .backgroundColor(Color.Transparent).borderWidth(0).padding({ left: 2, right: 0 })
            .enterKeyType(EnterKeyType.Search).cancelButton({ style: CancelButtonStyle.INVISIBLE }).enableKeyboardOnFocus(true).enabled(this.isEnabled).maxLength(200)
            .onChange((value: string): void => { if (this.expanded && this.isEnabled) this.onChange(value); })
            .onSubmit((): void => this.close(true)).id(this.inputId)
          SharedIconButton({ label: '收起搜索栏', isInteractive: this.isEnabled, controlSize: this.controlSize,
            circular: true, radius: this.controlSize / 2, surfaceColor: Color.Transparent, frameLineWidth: 0,
            glyph: (): void => { this.closeGlyph(); }, onAction: (): void => this.close(false) })
            .id(this.inputId + '-close')
        }
      }.width('100%').height(this.controlSize)
        .borderRadius(this.surfaceRadius > 0 ? this.surfaceRadius : this.controlSize / 2).clip(true)
      }.width(this.expanded ? this.availableWidth : this.controlSize).height(this.controlSize)
        .borderRadius(this.surfaceRadius > 0 ? this.surfaceRadius : this.controlSize / 2)
        .backgroundColor(this.expanded || this.surfaceOutline !== undefined ? this.surfaceColor : Color.Transparent)
        .border(this.surfaceOutline ?? { width: this.expanded ? 1 : 0, color: this.lineColor })
        .shadow(this.surfaceShadow ?? { radius: 0, color: Color.Transparent, offsetX: 0, offsetY: 0 })
        .id(this.inputId + '-capsule')
    }.width('100%').height(this.controlSize).hitTestBehavior(HitTestMode.Transparent)
      .onAreaChange((_old: Area, area: Area): void => { this.availableWidth = Math.max(this.controlSize, Number(area.width)); })
  }
}
