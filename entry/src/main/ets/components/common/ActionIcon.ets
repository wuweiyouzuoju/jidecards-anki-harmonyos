// SPDX-License-Identifier: AGPL-3.0-or-later

/** 图标共用几何；菜单内填色与状态图标的整体染色分别有明确入口。 */
@Component
export struct ActionIcon {
  @Prop source: ResourceStr = '';
  @Prop tint: ResourceColor = $r('app.color.menu_icon_fill');
  @Prop glyphSize: number = 18;
  @Prop strokeColor: string = '';

  private iconFilter(): ColorFilter {
    const identity: number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    if (!/^#[0-9a-fA-F]{6}$/.test(this.strokeColor)) return new ColorFilter(identity);
    const red: number = Number.parseInt(this.strokeColor.slice(1, 3), 16) / 255;
    const green: number = Number.parseInt(this.strokeColor.slice(3, 5), 16) / 255;
    const blue: number = Number.parseInt(this.strokeColor.slice(5, 7), 16) / 255;
    if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue)) return new ColorFilter(identity);
    return new ColorFilter([0, 0, 0, 0, red, 0, 0, 0, 0, green, 0, 0, 0, 0, blue, 0, 0, 0, 1, 0]);
  }

  build() {
    Image(this.source)
      .width(this.glyphSize).height(this.glyphSize).flexShrink(0)
      .objectFit(ImageFit.Contain).fillColor(this.tint)
      .colorFilter(this.iconFilter())
      .hitTestBehavior(HitTestMode.None)
      .accessibilityLevel('no')
  }
}
