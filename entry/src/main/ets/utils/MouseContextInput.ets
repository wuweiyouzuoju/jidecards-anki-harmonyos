// SPDX-License-Identifier: AGPL-3.0-or-later
import { WindowPoint } from '../model/WindowSafeLayout';

/** 右键按下只派发一次；松开不再触发，也不冒泡到外层选择入口。 */
export function mouseContextPoint(event: MouseEvent, enabled: boolean = true): WindowPoint | undefined {
  if (event.button !== MouseButton.Right) return undefined;
  event.stopPropagation();
  if (!enabled || event.action !== MouseAction.Press ||
    !Number.isFinite(event.windowX) || !Number.isFinite(event.windowY)) return undefined;
  return { x: event.windowX, y: event.windowY };
}
