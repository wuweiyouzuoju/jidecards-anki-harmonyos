// SPDX-License-Identifier: AGPL-3.0-or-later
import { IBestImageCropper, IBestImageCropperController } from '@ibestservices/ibest-ui';
/** 牌组背景与全局壁纸共用裁剪器；草稿、提交和 PixelMap 所有权归各自宿主。 */
@Component
export struct ImageCropViewport {
  @Prop uri: string = '';
  @Prop cropWidth: number = 0;
  @Prop cropHeight: number = 0;
  @Prop viewportHeight: number = 0;
  @Prop accent: ResourceColor = '#2F5FD0';
  controller: IBestImageCropperController = new IBestImageCropperController();
  build() {
    Row() {
      if (this.uri !== '' && this.cropWidth > 0 && this.cropHeight > 0) {
        IBestImageCropper({ componentWidth: this.cropWidth, componentHeight: this.viewportHeight,
          url: this.uri, shape: 'rect', centerWidth: this.cropWidth, centerHeight: this.cropHeight,
          showBorder: true, bdColor: this.accent, maxScale: 4, enableRotate: false, controller: this.controller })
      }
    }.width('100%').justifyContent(FlexAlign.Center)
  }
}
