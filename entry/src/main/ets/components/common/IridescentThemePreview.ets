// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 速览和领赠说明共用已有实际主题截图，按原比例缩放。 */
@Component
export struct IridescentThemePreview {
  build() {
    Image($r('app.media.iridescent_preview'))
      .width('100%')
      .constraintSize({ maxWidth: 260 })
      .aspectRatio(1320 / 2856)
      .objectFit(ImageFit.Contain)
      .borderRadius(应用尺寸.圆角_卡片)
      .accessibilityText($r('app.string.home_intro_theme_preview'))
  }
}
