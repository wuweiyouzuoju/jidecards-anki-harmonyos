// SPDX-License-Identifier: AGPL-3.0-or-later
import { medalInk, medalNumeral } from '../core/Medals';

/** Harmony SVG 不支持 text；图源由同一生成器省略数字，中心编号使用原生文本，颜色仍读公共色阶。 */
@Component
export struct SharedMedalIcon {
  @Prop source: ResourceStr = '';
  @Prop ordinal: number = 0;
  @Prop glyphSize: number = 64;
  @Prop isDark: boolean = false;

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Image(this.source).width(this.glyphSize).height(this.glyphSize * 140 / 128).objectFit(ImageFit.Contain)
        .supportSvg2(true).accessibilityLevel('no')
      if (this.ordinal > 0) {
        Column() {
          Text(medalNumeral(this.ordinal))
            .fontSize(this.glyphSize * Math.min(40, Math.floor(60 / medalNumeral(this.ordinal).length)) / 128)
            .fontWeight(FontWeight.Medium).fontColor(medalInk(this.ordinal, this.isDark))
        }.width(this.glyphSize).height(this.glyphSize * 88 / 128).justifyContent(FlexAlign.Center)
        .position({ x: 0, y: this.glyphSize * 10 / 128 })
      }
    }.width(this.glyphSize).height(this.glyphSize * 140 / 128).accessibilityLevel('no')
  }
}
