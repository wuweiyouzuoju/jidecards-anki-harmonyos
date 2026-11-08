// SPDX-License-Identifier: AGPL-3.0-or-later
import { image } from '@kit.ImageKit';

export interface BackdropFrame {
  pixels: image.PixelMap;
  frosted: image.PixelMap;
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

export interface BackdropConsumer {
  freezeBackdrop: boolean;
  updateFrame(frame: BackdropFrame | undefined): void;
}
