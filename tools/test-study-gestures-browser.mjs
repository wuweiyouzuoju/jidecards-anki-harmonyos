// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { buildStudyGestureScript } from '../entry/src/main/ets/model/StudyGestures.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const context = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const actions = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('studyAction', (...args) => actions.push(args));
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0}#card{height:2000px;background:#eee}button{height:50px;width:100px}</style>
    <div id="card"><button id="control">Audio</button><details><summary>Hint</summary>Hidden text</details></div>`);
  await page.evaluate(() => { window.jideStudyInput = { onAction: (...args) => window.studyAction(...args) }; });
  await page.evaluate(buildStudyGestureScript(1, 1, true));
  const settle = () => page.waitForTimeout(400);
  await page.touchscreen.tap(200, 300); await page.waitForTimeout(80); await page.touchscreen.tap(200, 300); await settle();
  assert.deepEqual(actions.map(a => a[0]), ['double'], 'real touch double-tap must suppress single taps');
  actions.length = 0;
  await page.touchscreen.tap(200, 300); await settle();
  assert.deepEqual(actions[0], ['tap', 0.5, 0.375, 1, 1]);
  actions.length = 0;
  await page.locator('#control').tap(); await page.locator('summary').tap(); await settle();
  assert.deepEqual(actions, [], 'native controls must keep clicks');
  assert.equal(await page.locator('details').evaluate(el => el.open), true);

  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const swipe = async (x0, y0, x1, y1) => {
    await touch('touchStart', x0, y0);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6);
      await page.waitForTimeout(20);
    }
    await touch('touchEnd'); await settle();
  };
  await swipe(260, 300, 100, 300); await swipe(100, 300, 260, 300);
  assert.deepEqual(actions.map(a => a[0]), ['left', 'right']);
  actions.length = 0;
  await swipe(200, 650, 200, 200);
  assert.deepEqual(actions, [], 'vertical scrolling must not grade');
  assert.ok(await page.evaluate(() => window.scrollY) > 0, 'native scrolling remains available');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(550);
  await page.touchscreen.tap(200, 300);
  await page.evaluate(buildStudyGestureScript(1, 2, true)); await settle();
  assert.deepEqual(actions, [], 'side updates cancel delayed taps');
  assert.deepEqual(errors, []);
  console.log('Study gesture browser checks passed: touch double/single, controls, horizontal swipe, native scrolling, stale side');
} finally {
  await browser.close();
}
