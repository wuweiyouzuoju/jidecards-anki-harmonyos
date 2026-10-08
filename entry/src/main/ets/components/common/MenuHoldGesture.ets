// SPDX-License-Identifier: AGPL-3.0-or-later
import { MenuHoldController } from '../../model/MenuHoldController';

/** ArkUI 事件只转换一次，第二指或系统取消统一复位。 */
export function menuHoldTouch(controller: MenuHoldController, event: TouchEvent): void {
  if (event.type === TouchType.Cancel || event.touches.length > 1) { controller.cancel(); return; }
  const touch: TouchObject | undefined = event.changedTouches[0];
  if (touch === undefined) return;
  if (event.type === TouchType.Down) controller.down(touch.id, touch.windowX, touch.windowY);
  else if (event.type === TouchType.Up) controller.up(touch.id, touch.windowX, touch.windowY);
  else controller.move(touch.id, touch.windowX, touch.windowY);
}
