// SPDX-License-Identifier: AGPL-3.0-or-later
import { Driver, ON } from '@kit.TestKit';

/** @throws {Error} 实际主应用页面不可达或截图失败。 */
export async function checkLocaleLayout(expectedTitle: string, path: string, requireHomeReady: boolean,
  checkDoubleColumns: boolean): Promise<void> {
  const driver: Driver = Driver.create();
  const title = await driver.waitForComponent(ON.text(expectedTitle), 10000);
  if (title === null) throw new Error('localized home content is not visible');
  if (requireHomeReady) {
    const ready = await driver.waitForComponent(ON.id('home-deck-list-ready'), 15000);
    if (ready === null) throw new Error('home data did not finish loading');
    await new Promise<void>((done): void => { setTimeout(done, 350); });
    if (checkDoubleColumns) {
      const viewport = await ready.getBounds();
      const groups = await driver.findComponents(ON.type('FlowItem'));
      if (groups.length < 2) throw new Error('double-column validation needs two visible root groups');
      for (const group of groups) {
        const bounds = await group.getBounds();
        if (bounds.right - bounds.left > (viewport.right - viewport.left) / 2 + 2) {
          throw new Error('a deck group exceeds its half-width column');
        }
        const cards = await driver.findComponents(ON.type('Stack').within(ON.id(await group.getId())));
        if (cards.length === 0) throw new Error('a visible deck group has no card frames');
        for (const card of cards) {
          const frame = await card.getBounds();
          if (frame.left < bounds.left - 2 || frame.right > bounds.right + 2) {
            throw new Error('a deck card overflows its group column');
          }
        }
      }
    }
  }
  if (!(await driver.screenCap(path))) throw new Error('screen capture failed');
}
