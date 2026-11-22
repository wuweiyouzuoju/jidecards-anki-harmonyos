// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import * as leaderboard from '../../entry/src/main/ets/model/StudyLeaderboard.ts';
import * as accountProfile from '../../entry/src/main/ets/model/AccountProfile.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const strings = new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url))).string
  .map(item => [item.name, item.value]));
const localize = key => strings.get(key);
const context = { simple: false, agent: true, cloudDeck: false, themeHasTextures: false };
const settle = () => new Promise(resolve => setImmediate(resolve));
const pending = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const sample = { deck: '医学::具体牌组', text: 'PRIVATE CARD' };
const profile = { nickname: 'PRIVATE NICKNAME', avatar: 'fox', revision: 5 };

test('leaderboard uses the shared range and subject selectors below the common toolbar inset', () => {
  const page = readFileSync(new URL('../../entry/src/main/ets/pages/StudyLeaderboardPage.ets', import.meta.url), 'utf8');
  const filters = page.slice(page.indexOf('private filterBar()'), page.indexOf('private boardContent()'));
  assert.match(filters, /范围切换条\(\{/);
  assert.match(filters, /SurfaceSelect\(\{/);
  assert.doesNotMatch(filters, /按下态按钮|leaderboard_refresh/);
  assert.match(page, /top: 应用尺寸\.页面内容顶部间距\(this\.compact\)/);
});

test('sampling is without replacement and bounds excerpts without splitting emoji', () => {
  const candidates = [100, 200, 300, 400];
  assert.equal(leaderboard.drawLeaderboardCard(candidates, 0.25), 200);
  assert.equal(leaderboard.drawLeaderboardCard(candidates, 0.4), 400);
  assert.deepEqual(candidates, [100, 300]);
  assert.equal(leaderboard.leaderboardExcerpt('<script>secret()</script><p>人体 解剖</p>[sound:patient.mp3]<img src="file:///secret">', 240), '人体 解剖');
  assert.equal(leaderboard.leaderboardExcerpt('x<style>unclosed', 240), 'x');
  assert.equal(leaderboard.leaderboardExcerpt('ab🦉c', 3), 'ab');
});

test('browsing and cancelling never submit, and one explicit confirmation publishes anonymously by default', async () => {
  const calls = [];
  const appInterface = new AppInterfaceTracker();
  const Dialog = loadComponentLogic('pages/StudyLeaderboardPage.ets', 'StudyLeaderboardPage', {
    ...leaderboard, NavPathStack: class {}, Scroller: class {}, PageToolbarActionScope: class {}, ...accountProfile, appInterface, visibleInterfaceItems, namedResourceText: (_, key) => key,
    interfaceItemText: (_, surface, item) => visibleInterfaceItems(surface, context).find(x => x.id === item).titleKey,
    StudyLeaderboardService: class {
      async view() { return { entries: [], mine: null, signedIn: true, profile }; }
      async preview() { calls.push('local'); return { score: 77, samples: [sample] }; }
      async publish(filter, preview, revision) {
        calls.push({ filter, preview, revision });
        return { entries: [], mine: null, signedIn: true, profile };
      }
    }
  });
  const dialog = new Dialog();
  dialog.getUIContext = () => ({ getHostContext: () => ({ filesDir: '/test' }) });
  dialog.aboutToAppear();
  await settle();
  assert.equal(dialog.board.signedIn, true);
  assert.equal(dialog.disclosureOpen, true, 'entering the board opens the consent dialog');
  assert.deepEqual(calls, [], 'the disclosure does not sample before confirmation');

  const consentStructure = buildAgentAppStructure(context, 'study_leaderboard', '', localize, [], [], appInterface.snapshot());
  assert.equal(consentStructure.surfaces[0].items.find(item => item.id === 'publish').enabled, true);
  assert.equal(consentStructure.surfaces[0].items.find(item => item.id === 'share_profile').selected, false);
  assert.doesNotMatch(JSON.stringify(consentStructure), /PRIVATE|具体牌组/);
  dialog.closeDisclosure();
  dialog.confirmParticipation();
  assert.deepEqual(calls, []);

  dialog.sample();
  dialog.confirmParticipation();
  dialog.confirmParticipation();
  await settle();
  assert.deepEqual(calls, ['local', { filter: 'all', preview: { score: 77, samples: [sample] }, revision: undefined }]);

  dialog.sample();
  dialog.shareProfile = true;
  dialog.confirmParticipation();
  await settle();
  assert.equal(calls.at(-1).revision, profile.revision);
  dialog.sample();
  assert.equal(dialog.shareProfile, false);
  dialog.closeDisclosure();
  assert.equal(calls.length, 4);
  dialog.aboutToDisappear();
  assert.deepEqual(appInterface.snapshot(), []);
});

test('the consent action signs a guest in before publishing and cancellation never samples', async () => {
  const calls = [];
  let signedIn = false;
  let cancel = true;
  let reads = 0;
  const Page = loadComponentLogic('pages/StudyLeaderboardPage.ets', 'StudyLeaderboardPage', {
    ...leaderboard, NavPathStack: class {}, Scroller: class {}, PageToolbarActionScope: class {},
    appInterface: new AppInterfaceTracker(), visibleInterfaceItems,
    interfaceItemText: (_, _surface, id) => id, namedResourceText: (_, key) => key,
    StudyLeaderboardService: class {
      async view() {
        if (reads++ === 0) throw new Error('leaderboard_unavailable');
        return { signedIn, mine: null, entries: [] };
      }
      async login() {
        calls.push('login');
        if (cancel) throw new Error('cancelled');
        signedIn = true;
      }
      async preview() { calls.push('sample'); return { score: 77, samples: [sample] }; }
      async publish(_filter, _payload, revision) {
        calls.push(['publish', revision]);
        return { signedIn, mine: null, entries: [] };
      }
    }
  });
  const page = new Page();
  page.getUIContext = () => ({ getHostContext: () => ({ filesDir: '/test' }) });
  page.aboutToAppear();
  await settle();
  assert.equal(page.board, null);
  assert.equal(page.errorKey, 'leaderboard_unavailable');
  assert.equal(page.canPublish(), true);
  page.confirmParticipation();
  await settle();
  assert.equal(reads, 2);
  assert.deepEqual(calls, ['login']);
  assert.equal(page.disclosureOpen, true);
  cancel = false;
  page.confirmParticipation();
  await settle();
  assert.deepEqual(calls, ['login', 'login', 'sample', ['publish', undefined]]);
  assert.equal(page.disclosureOpen, false);
});

test('leaderboard settings save the current account’s privacy in place', async () => {
  const calls = [];
  const profile = { nickname: 'Private owner', avatar: 'fox', revision: 2 };
  const makeBoard = anonymous => ({ signedIn: true, anonymous, entries: [], mine: null, profile });
  const Page = loadComponentLogic('pages/StudyLeaderboardPage.ets', 'StudyLeaderboardPage', {
    ...leaderboard, NavPathStack: class {}, Scroller: class {}, PageToolbarActionScope: class {},
    appInterface: new AppInterfaceTracker(), visibleInterfaceItems,
    interfaceItemText: (_, _surface, item) => item, namedResourceText: (_, key) => key,
    resourceText: (_, _resource, number, label) => `${number}（${label}）`,
    StudyLeaderboardService: class {
      async view() { return makeBoard(true); }
      async setAnonymous(...args) {
        calls.push(args);
        return makeBoard(args[3]);
      }
    }
  });
  const page = new Page();
  page.getUIContext = () => ({});
  page.aboutToAppear();
  await settle();
  page.disclosureOpen = false;
  page.showSettings(true);
  page.setAnonymous(false);
  await settle();
  assert.equal(page.settingsOpen, true);
  assert.equal(page.rankText(null), '—');
  assert.equal(page.rankText(99), '99');
  assert.equal(page.rankText(100), '99+');
  const alias = '1234567890abcdef';
  const number = page.learnerName({ alias });
  assert.match(number, /^\d{10}$/);
  assert.equal(page.anonymousName(alias, '我'), number + '（我）');
  assert.equal(page.learnerName({ alias, nickname: '小火车', avatar: 'fox' }), '小火车');
  assert.equal(page.myName({ alias }), 'Private owner（leaderboard_self）');
  assert.equal(page.board.anonymous, false);
  assert.deepEqual(calls, [['all', 'answers', 'week', false, profile.revision]]);
  page.setAnonymous(true);
  await settle();
  assert.equal(page.board.anonymous, true);
  page.dismiss();
  assert.equal(page.settingsOpen, false);
});

test('the preview roster never supplies the current user’s identity or rank', async () => {
  const placeholder = { alias: 'placeholder', rank: 11, score: 193, subject: 'math', nickname: 'Jun' };
  const mine = { alias: 'actual-user', rank: 2, score: 15, subject: 'biology', active: true };
  const profile = { nickname: 'Actual user', avatar: 'fox', revision: 2 };
  let authenticated = false;
  const Page = loadComponentLogic('pages/StudyLeaderboardPage.ets', 'StudyLeaderboardPage', {
    ...leaderboard, NavPathStack: class {}, Scroller: class {}, PageToolbarActionScope: class {},
    appInterface: new AppInterfaceTracker(), visibleInterfaceItems,
    interfaceItemText: (_, _surface, item) => item, namedResourceText: (_, key) => key,
    resourceText: (_, _resource, name, self) => name + '（' + self + '）',
    StudyLeaderboardService: class {
      async viewLoopbackPreview() { return { entries: [placeholder], mine: null, signedIn: false }; }
      async viewPersonal() {
        return authenticated ? { entries: [], mine, signedIn: true, anonymous: false, profile } : null;
      }
    }
  });
  const page = new Page();
  page.getUIContext = () => ({});
  page.loopbackPreview = true;
  page.aboutToAppear();
  await settle();
  assert.equal(page.board.mine, null);
  assert.equal(page.canChangeAnonymous(), false);
  authenticated = true;
  page.refresh();
  await settle();
  assert.deepEqual(page.board.entries, [placeholder]);
  assert.deepEqual(page.board.mine, mine);
  assert.equal(page.myName(mine), 'Actual user（leaderboard_self）');
  assert.equal(page.myAvatar(mine), 'fox');
  assert.equal(page.canChangeAnonymous(), true);
  page.board = { ...page.board, mine: null };
  assert.equal(page.myName(null), 'Actual user（leaderboard_self）');
  assert.equal(page.myAvatar(null), 'fox');
  page.board = { ...page.board, anonymous: true, anonymousAlias: '1234567890abcdef' };
  assert.match(page.myName(null), /^\d{10}（leaderboard_self）$/);
  assert.equal(page.myAvatar(null), undefined);
});

test('populated leaderboard refreshes scores and requests the selected subject', async () => {
  const filters = [];
  const tracker = new AppInterfaceTracker();
  let score = 90;
  const Dialog = loadComponentLogic('pages/StudyLeaderboardPage.ets', 'StudyLeaderboardPage', {
    ...leaderboard, NavPathStack: class {}, Scroller: class {}, PageToolbarActionScope: class {}, appInterface: tracker, visibleInterfaceItems,
    namedResourceText: (_, key) => key, interfaceItemText: (_, _surface, item) => item,
    StudyLeaderboardService: class {
      async view(filter) {
        filters.push(filter);
        const math = { alias:'same-learner', rank:filter === 'math' ? 1 : 2, score, subject:'math' };
        return { signedIn:false, mine:null, entries:filter === 'math' ? [math] :
          [{ alias:'other', rank:1, score:120, subject:'physics' }, math] };
      }
    }
  });
  const dialog = new Dialog();
  dialog.getUIContext = () => ({});
  dialog.aboutToAppear();
  await settle();
  assert.equal(dialog.disclosureOpen, true);
  dialog.closeDisclosure();
  assert.deepEqual(dialog.board.entries.map(entry => entry.rank), [1, 2]);
  dialog.select(leaderboard.LEADERBOARD_FILTERS.indexOf('math'));
  await settle();
  assert.deepEqual(dialog.board.entries.map(entry => [entry.alias, entry.rank, entry.score]), [['same-learner',1,90]]);
  score = 110;
  dialog.refresh();
  await settle();
  assert.deepEqual(filters, ['all','math','math']);
  assert.equal(dialog.board.entries[0].score, 110);
  dialog.aboutToDisappear();
});

test('a dismissed dialog cannot attach a late sample to a later publication', async () => {
  const sampling = pending();
  let published = false;
  const tracker = new AppInterfaceTracker();
  const Dialog = loadComponentLogic('pages/StudyLeaderboardPage.ets', 'StudyLeaderboardPage', {
    ...leaderboard, NavPathStack: class {}, Scroller: class {}, PageToolbarActionScope: class {}, ...accountProfile, appInterface: tracker, visibleInterfaceItems,
    namedResourceText: (_, key) => key, interfaceItemText: (_, _surface, item) => item,
    StudyLeaderboardService: class {
      async view() { return { signedIn: true, mine: null, entries: [] }; }
      preview() { return sampling.promise; }
      async publish() { published = true; }
    }
  });
  const dialog = new Dialog();
  dialog.getUIContext = () => ({ getHostContext: () => ({ filesDir: '/test' }) });
  dialog.aboutToAppear();
  await settle();
  dialog.sample();
  dialog.confirmParticipation();
  await settle();
  dialog.aboutToDisappear();
  sampling.resolve({ score: 77, samples: [sample] });
  await settle();
  assert.equal(published, false);
  assert.deepEqual(tracker.snapshot(), []);
});

test('profile editing is gated by a loaded account and forwards the saved revision', async () => {
  const calls = [];
  const tracker = new AppInterfaceTracker();
  let autosave = null;
  const Panel = loadComponentLogic('components/settings/HuaweiAccountSettings.ets', 'HuaweiAccountSettings', {
    ...accountProfile, appInterface: tracker, visibleInterfaceItems, settingsItemText: (_, id) => id,
    chooseProfileAvatar: async () => 'data:image/jpeg;base64,ZmFrZQ==',
    setTimeout: callback => { autosave = callback; return 1; },
    clearTimeout: () => { autosave = null; },
    AccountProfileService: class {
      signedIn = false;
      async view() { return this.signedIn ? profile : null; }
      async login() { this.signedIn = true; }
      async save(draft) { calls.push(draft); return { ...draft, revision: draft.revision + 1 }; }
      async logout() { this.signedIn = false; }
    }
  });
  const panel = new Panel();
  panel.getUIContext = () => ({ getHostContext: () => ({}) });
  panel.aboutToAppear();
  await settle();
  assert.equal(panel.canShow('account_profile_nickname'), false);
  panel.flushSave();
  panel.login();
  await settle();
  assert.equal(panel.canShow('account_profile_nickname'), true);
  panel.editNickname(' New nickname ');
  panel.pickAvatar();
  await settle();
  await settle();
  assert.deepEqual(calls, [{ nickname: 'New nickname', avatar: 'data:image/jpeg;base64,ZmFrZQ==', revision: 5 }]);
  panel.editNickname('Another nickname');
  assert.equal(calls.length, 1);
  autosave();
  await settle();
  assert.deepEqual(calls[1], { nickname: 'Another nickname', avatar: 'data:image/jpeg;base64,ZmFrZQ==', revision: 6 });
  assert.equal(tracker.snapshot()[0].items.some(item => item.id === 'account_profile_save'), false);
  assert.doesNotMatch(JSON.stringify(tracker.snapshot()), /PRIVATE|New nickname/);
  const general = buildAgentAppStructure(context, 'settings', 'general', localize, [], [], tracker.snapshot());
  assert.equal(general.sections[0].title, '账号与常规');
  assert.ok(general.sections[0].cards.find(card => card.id === 'huawei_account').items
    .every(item => item.writeTool === ''));
  panel.logout();
  await settle();
  assert.equal(panel.canShow('account_profile_nickname'), false);
});

test('a profile save rejects a session changed by another account screen', async () => {
  let token = 'account-a';
  const requests = [];
  const Service = loadPlatformModule('backend/AccountProfileService.ets', 'AccountProfileService', {
    ...accountProfile,
    OfficialAIService: class {
      async token() { return token; }
      async request(path) { requests.push(path); return JSON.stringify(profile); }
    }
  });
  const service = new Service();
  assert.deepEqual(await service.view(), profile);
  token = 'account-b';
  await assert.rejects(service.save(profile), /login_required/);
  assert.deepEqual(requests, ['/profile/view']);
});

test('Huawei profile authorization imports only after the server verifies the same account', async () => {
  let verifiedAccount = 'original';
  let stored = profile;
  let downloads = 0;
  let granted = true;
  const requests = [];
  const Service = loadPlatformModule('backend/AccountProfileService.ets', 'AccountProfileService', {
    ...accountProfile,
    util: { generateRandomUUID: () => 'random-state' },
    authentication: {
      HuaweiIDProvider: class { createAuthorizationWithHuaweiIDRequest() { return {}; } },
      AuthenticationController: class {
        async executeRequest(request) {
          assert.deepEqual(request.scopes, ['profile']);
          assert.deepEqual(request.permissions, ['serviceauthcode']);
          assert.equal(request.forceAuthorization, true);
          return {state: request.state, data: {authorizationCode:'auth-code', authorizedScopes: granted ? ['profile'] : ['openid'],
            nickName:'Huawei user', avatarUri:'https://example.invalid/avatar.jpg'}};
        }
      }
    },
    downloadProfileAvatar: async () => { downloads++; return 'data:image/jpeg;base64,ZmFrZQ=='; },
    OfficialAIService: class {
      async token() { return 'local-session'; }
      async completeLogin(code, sandbox) { requests.push({code, sandbox}); }
      async request(path, body, token) {
        requests.push({path, body, token});
        if (path === '/profile/view') return JSON.stringify(stored);
        if (path === '/profile/save') {
          stored = {...JSON.parse(body), revision: stored.revision + 1};
          return JSON.stringify(stored);
        }
        return JSON.stringify({account: path === '/session' ? 'original' : verifiedAccount, environment:'NORMAL'});
      }
    }
  });
  const service = new Service();
  await service.view();
  assert.deepEqual(await service.importHuaweiProfile({}), {nickname:'Huawei user', avatar:'data:image/jpeg;base64,ZmFrZQ=='});
  assert.deepEqual(requests.at(-1), {path:'/login',body:'{"code":"auth-code","environment":"NORMAL"}',token:''});
  verifiedAccount = 'different';
  await assert.rejects(service.importHuaweiProfile({}), /account_profile_authorization_failed/);
  granted = false;
  await assert.rejects(service.importHuaweiProfile({}), /account_profile_authorization_failed/);
  assert.equal(downloads, 1);
  granted = true;
  await service.login({});
  assert.equal(stored, profile);
  assert.equal(downloads, 1);
  stored = {nickname:'', avatar:'owl', revision:0};
  await service.login({});
  assert.deepEqual(stored, {nickname:'Huawei user', avatar:'data:image/jpeg;base64,ZmFrZQ==', revision:1});
  assert.ok(requests.some(request => request.path === '/profile/save' && request.token === 'local-session'));
});

test('expired credentials fall back to public browsing and unavailable servers retain their error state', async () => {
  let available = true;
  const tokens = [];
  const Service = loadPlatformModule('backend/StudyLeaderboardService.ets', 'StudyLeaderboardService', {
    ...leaderboard,
    OfficialAIService: class {
      async token() { return 'expired'; }
      async request(_path, _body, token) {
        tokens.push(token);
        if (token || !available) throw new Error('login_required');
        return JSON.stringify({ signedIn: false, entries: [], mine: null });
      }
    }
  });
  const service = new Service();
  assert.equal((await service.view('all')).signedIn, false);
  assert.deepEqual(tokens, ['expired', '']);
  available = false;
  await assert.rejects(service.view('all'), /leaderboard_unavailable/);
});

test('all supported resources include the same leaderboard and account keys', () => {
  const root = new URL('../../entry/src/main/resources/', import.meta.url);
  const prefixes = /^(leaderboard_|account_profile_|account_session_)/;
  const expected = [...strings.keys()].filter(key => prefixes.test(key)).sort();
  for (const locale of readdirSync(root).filter(dir => dir.includes('_'))) {
    const translated = JSON.parse(readFileSync(new URL(locale + '/element/string.json', root))).string;
    assert.deepEqual(translated.filter(item => prefixes.test(item.name)).map(item => item.name).sort(), expected, locale);
  }
});
