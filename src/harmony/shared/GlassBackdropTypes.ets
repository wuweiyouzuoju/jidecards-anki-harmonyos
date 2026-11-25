// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassCaptureGeometry } from '../../core/GlassCapture';
import { image } from '@kit.ImageKit';

export interface BackdropFrame {
  sourceGeometry?: GlassCaptureGeometry;
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
  captureRegion?: GlassCaptureGeometry;
  freezeBackdrop: boolean;
  plain?: boolean;
  cached?: boolean;
  updateFrame(frame: BackdropFrame | undefined): void;
}
