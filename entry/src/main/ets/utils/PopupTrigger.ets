// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassFusionRect, glassPopupTriggerRect } from 'jide_foundation';

/** 仅UI层的一次点击交接；不用上一次操作的位置伪造后续弹窗起点。 */
let pending: GlassFusionRect | undefined = undefined;
let capturedAt: number = 0;
export function rememberPopupTrigger(area: Area, radius: number = 16): void {
  const width: number = Number(area.width), height: number = Number(area.height);
  if (width <= 0 || height <= 0) return;
  pending = glassPopupTriggerRect(Number(area.globalPosition.x), Number(area.globalPosition.y), width, height, radius);
  capturedAt = Date.now();
}
export function takePopupTrigger(): GlassFusionRect | undefined {
  const result: GlassFusionRect | undefined = Date.now() - capturedAt <= 800 ? pending : undefined;
  pending = undefined;
  return result;
}
