// SPDX-License-Identifier: AGPL-3.0-or-later
import { accentToPicker, pickerToAccent, pickerHue, PickerColor } from '../../model/ColorPicker';
import { validAccent } from '../../model/AppearanceCustomization';

/** 色环和方形明暗区共用HSV值；精确输入由宿主HEX框提供。 */
@Component
export struct AppearanceColorPicker {
  @Prop @Watch('syncColor') color: string = '#5B6B8A';
  @Prop isInteractive: boolean = true;
  onChange: (color: string) => void = (_color: string): void => {};
  @State private hue: number = 0;
  @State private saturation: number = 0;
  @State private pickerBrightness: number = 0;
  private readonly canvas: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private ready: boolean = false;
  private activeGesture: string = '';
  aboutToAppear(): void { this.syncColor(); }
  private syncColor(): void {
    if (!validAccent(this.color)) return;
    const value: PickerColor = accentToPicker(this.color, this.hue);
    this.hue = value.hue; this.saturation = value.saturation; this.pickerBrightness = value.brightness;
    this.draw();
  }
  private change(channel: number, value: number): void {
    if (!this.isInteractive) return;
    if (channel === 0) this.hue = value;
    else if (channel === 1) this.saturation = value;
    else this.pickerBrightness = value;
    this.draw(); this.onChange(pickerToAccent(this.hue, this.saturation, this.pickerBrightness));
  }
  private draw(): void {
    if (!this.ready) return;
    const ctx: CanvasRenderingContext2D = this.canvas;
    ctx.clearRect(0, 0, 208, 208);
    ctx.lineWidth = 22;
    for (let angle: number = 0; angle < 360; angle++) {
      ctx.beginPath(); ctx.strokeStyle = pickerToAccent(angle, 100, 100);
      ctx.arc(104, 104, 89, angle * Math.PI / 180, (angle + 1.5) * Math.PI / 180); ctx.stroke();
    }
    // 色块四角距色环内缘约10vp，绘制与命中范围一致，间隙不触发取色。
    ctx.fillStyle = pickerToAccent(this.hue, 100, 100); ctx.fillRect(56, 56, 96, 96);
    const white: CanvasGradient = ctx.createLinearGradient(56, 0, 152, 0);
    white.addColorStop(0, '#FFFFFF'); white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white; ctx.fillRect(56, 56, 96, 96);
    const black: CanvasGradient = ctx.createLinearGradient(0, 56, 0, 152);
    black.addColorStop(0, 'rgba(0,0,0,0)'); black.addColorStop(1, '#000000');
    ctx.fillStyle = black; ctx.fillRect(56, 56, 96, 96);
    this.marker(104 + 89 * Math.cos(this.hue * Math.PI / 180), 104 + 89 * Math.sin(this.hue * Math.PI / 180));
    this.marker(56 + this.saturation * 0.96, 152 - this.pickerBrightness * 0.96);
  }
  private marker(x: number, y: number): void {
    this.canvas.beginPath(); this.canvas.arc(x, y, 6, 0, Math.PI * 2);
    this.canvas.lineWidth = 4; this.canvas.strokeStyle = '#FFFFFF'; this.canvas.stroke();
    this.canvas.lineWidth = 1; this.canvas.strokeStyle = '#222222'; this.canvas.stroke();
  }
  private begin(x: number, y: number): void {
    if (!this.isInteractive) return;
    const distance: number = Math.sqrt((x - 104) ** 2 + (y - 104) ** 2);
    this.activeGesture = distance >= 78 && distance <= 104 ? 'hue' :
      x >= 56 && x <= 152 && y >= 56 && y <= 152 ? 'square' : '';
    this.move(x, y);
  }
  private move(x: number, y: number): void {
    if (!this.isInteractive) return;
    if (this.activeGesture === 'hue') this.change(0, pickerHue(x - 104, y - 104));
    else if (this.activeGesture === 'square') {
      this.saturation = Math.max(0, Math.min(100, (x - 56) / 0.96));
      this.change(2, Math.max(0, Math.min(100, (152 - y) / 0.96)));
    }
  }
  private pan(event: GestureEvent, start: boolean): void {
    if (event.fingerList.length === 0) return;
    const finger: FingerInfo = event.fingerList[0];
    if (start) this.begin(finger.localX, finger.localY);
    else this.move(finger.localX, finger.localY);
  }
  build() {
    Canvas(this.canvas).width(208).height(208)
      .accessibilityText($r('app.string.appearance_element_color'))
      .onReady((): void => { this.ready = true; this.draw(); })
      .gesture(PanGesture({ direction: PanDirection.All, distance: 0 })
        .onActionStart((event: GestureEvent): void => { this.pan(event, true); })
        .onActionUpdate((event: GestureEvent): void => { this.pan(event, false); })
        .onActionEnd((): void => { this.activeGesture = ''; })
        .onActionCancel((): void => { this.activeGesture = ''; }))
      .onTouch((event: TouchEvent): void => {
        if (event.type === TouchType.Down && event.touches.length > 0) this.begin(event.touches[0].x, event.touches[0].y);
        if (event.type === TouchType.Up || event.type === TouchType.Cancel) this.activeGesture = '';
      })
  }
}
