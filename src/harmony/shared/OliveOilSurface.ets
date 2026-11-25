// SPDX-License-Identifier: AGPL-3.0-or-later
import { OliveGeometry, olivePath } from '../../core/OliveOil';

/** 几何锚点在一次转场中保持快照；仅对标量progress插值，每帧重算真实轮廓。 */
class OliveFrame implements AnimatableArithmetic<OliveFrame> {
  progress: number;
  geometry: OliveGeometry;
  constructor(progress: number, geometry: OliveGeometry) { this.progress = progress; this.geometry = geometry; }
  plus(other: OliveFrame): OliveFrame { return new OliveFrame(this.progress + other.progress, this.geometry); }
  subtract(other: OliveFrame): OliveFrame { return new OliveFrame(this.progress - other.progress, this.geometry); }
  multiply(scale: number): OliveFrame { return new OliveFrame(this.progress * scale, this.geometry); }
  equals(other: OliveFrame): boolean {
    return this.progress === other.progress && JSON.stringify(this.geometry) === JSON.stringify(other.geometry);
  }
}
@AnimatableExtend(Path)
function oliveOutline(frame: OliveFrame) {
  .commands(olivePath(frame.geometry, frame.progress))
}

/** 在宿主背景层绘制共享轮廓；不拦截点击，不拥有导航和业务状态。 */
@Component
export struct OliveOilSurface {
  @Prop progress: number = 0;
  @Prop geometry: OliveGeometry = { sources: [], destinations: [], axis: 'vertical', mode: 'group', radius: 22 };
  @Prop color: ResourceColor = '#FFFFFF';
  @Prop viewportWidth: number = 320;
  @Prop viewportHeight: number = 360;

  build() {
    Shape() {
      Path().oliveOutline(new OliveFrame(this.progress, this.geometry)).fill(this.color).strokeWidth(0)
    }.viewPort({ x: 0, y: 0, width: this.viewportWidth + 'px', height: this.viewportHeight + 'px' })
      .width('100%').height('100%').hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }
}
