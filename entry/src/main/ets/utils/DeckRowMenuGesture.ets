// SPDX-License-Identifier: AGPL-3.0-or-later

/** 排序时移除子行长按识别器，让 ListItem 的原生拖动接管同一次触摸。 */
export class DeckRowMenuGesture implements GestureModifier {
  private isReordering: boolean;
  private onOpenMenu: (event: GestureEvent) => void;

  constructor(isReordering: boolean, onOpenMenu: (event: GestureEvent) => void) {
    this.isReordering = isReordering;
    this.onOpenMenu = onOpenMenu;
  }

  applyGesture(event: UIGestureEvent): void {
    event.clearGestures();
    if (this.isReordering) return;
    event.addGesture(new LongPressGestureHandler({ repeat: false, duration: 500 })
      .onAction((gesture: GestureEvent): void => { this.onOpenMenu(gesture); }));
  }
}
