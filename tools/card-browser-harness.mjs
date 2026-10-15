// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CardWebSession } from '../entry/src/main/ets/model/CardWebSession.ts';
import { MATH_ASSET_BASE } from '../entry/src/main/ets/model/MathRendering.ts';

export async function launchCardBrowser(options = {}) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
  return chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'msedge', ...options });
}

// Real navigation, production session/runtime and bundled assets. No template scripts are stripped.
export async function createCardBrowserHarness(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [], failures = [], backgrounds = [], appearanceUpdates = [];
  let document = '', shown = 0, navigations = 0;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: document });
    let file = '';
    if (url === 'https://jidecards-render.local/jquery/3.7.1/jquery.min.js') file = 'jquery/jquery-3.7.1.min.js';
    for (const name of ['card-math.js', 'tex-svg-full.js', 'input/mml.js', 'input/mml/entities.js']) {
      if (url === MATH_ASSET_BASE + name) file = 'mathjax/' + name;
    }
    if (file) return route.fulfill({ contentType: 'text/javascript',
      body: readFileSync(new URL('../entry/src/main/resources/rawfile/' + file, import.meta.url)) });
    return route.fulfill({ status: 404, body: '' });
  });
  page.on('pageerror', error => errors.push(error.message));
  const session = new CardWebSession({
    load: html => {
      document = html;
      navigations++;
      page.goto('https://jidecards-media.local/').catch(error => failures.push(error.message));
    },
    evaluate: script => page.evaluate(script),
    shown: (background, appearanceOnly) => { shown++; backgrounds.push(background); appearanceUpdates.push(appearanceOnly); },
    failed: error => failures.push(error)
  });
  await page.exposeFunction('nativeRendered', (...args) => session.rendered(...args));
  await page.addInitScript(() => {
    window.jideCardRuntime = { onRendered: (...args) => window.nativeRendered(...args) };
  });
  async function waitShown(expected) {
    const deadline = Date.now() + 20000;
    while (shown < expected && !failures.length && !errors.length && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.deepEqual(failures, [], 'runtime errors must fail the browser check');
    assert.deepEqual(errors, [], 'template errors must fail the browser check');
    assert.equal(shown, expected, 'production runtime must acknowledge the completed card');
  }
  return {
    page, session, backgrounds, failures, appearanceUpdates,
    get navigations() { return navigations; },
    async show(html, key, side) {
      const expected = shown + 1;
      session.show(html, key, side);
      await waitShown(expected);
    },
    async setTheme(dark) {
      const expected = shown + 1;
      session.setTheme(dark);
      await waitShown(expected);
    },
    close: () => context.close()
  };
}
