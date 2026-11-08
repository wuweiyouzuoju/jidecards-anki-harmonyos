// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentMethods } from './sync-panel-harness.mjs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { OFFICIAL_HELP_LINKS } from '../../entry/src/main/ets/model/OfficialCommunity.ts';

test('About owns its feedback window, delegates rating and falls back to copying shared links', async () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/settings/AboutSettings.ets', import.meta.url), 'utf8');
  const events = [];
  const context = { async startAbility(want) { events.push(['open', want.uri]); throw Error('no browser'); } };
  const openOfficialHelpLink = loadPlatformModule('utils/OfficialHelpActions.ets', 'openOfficialHelpLink', {
    pasteboard: { MIMETYPE_TEXT_PLAIN: 'text/plain', createData: (_type, value) => value,
      getSystemPasteboard: () => ({ async setData(value) { events.push(['copy', value]); } }) },
    showToastSafely() {}
  });
  const About = componentMethods(source, ['aboutToDisappear', '打开好评弹窗', 'openLink'], {
    打开应用内好评: (ctx, bundle) => { assert.equal(ctx, context); events.push(bundle); },
    HelpPage: { INDEX: 0 }, openOfficialHelpLink
  });
  const about = Object.assign(new About(), {
    getUIContext: () => ({ getHostContext: () => context }),
    本应用包名: 'com.jide.kapian',
    链接服务实例: { async 获取帮助页链接() { throw Error('offline'); } }
  });
  about.feedbackDialog.open(() => ({ open() {}, close: () => events.push('feedback closed') }));
  about.打开好评弹窗();
  const decks = OFFICIAL_HELP_LINKS.find(link => link.id === 'ankiweb');
  const docs = OFFICIAL_HELP_LINKS.find(link => link.id === 'anki_documentation');
  await about.openLink(decks);
  await about.openLink(docs);
  about.aboutToDisappear();
  assert.deepEqual(events, ['com.jide.kapian', ['open', decks.url], ['copy', decks.url],
    ['open', docs.url], ['copy', docs.url], 'feedback closed']);
});
