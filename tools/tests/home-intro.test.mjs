// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { HomeStartupSequence } from '../../entry/src/main/ets/model/HomeStartupSequence.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/utils/HomeIntroStore.ets', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../../entry/src/main/ets/components/HomeIntroPanel.ets', import.meta.url), 'utf8');
const homePage = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
const studyGuide = readFileSync(new URL('../../entry/src/main/ets/components/StudyGuideDialog.ets', import.meta.url), 'utf8');
function storeHarness(initial = [['welcome_shown', '2.7.0']]) {
  const values = new Map(initial);
  const state = { fail: false };
  const store = {
    getSync: (key, fallback) => values.get(key) ?? fallback,
    putSync: (key, value) => values.set(key, value),
    flush: async () => { if (state.fail) throw new Error('disk full'); }
  };
  const body = source.slice(source.indexOf('const INTRO_KEY')).replaceAll('export ', '');
  const api = new Function('AppStorage', 'preferences', stripTypeScriptTypes(body, { mode: 'transform' }) +
    ';return { isHomeIntroCompleted, completeHomeIntro };')({ get: () => ({}) }, { getPreferencesSync: () => store });
  return { api, state, values };
}

test('new installs and existing welcome versions receive the introduction once after confirmation', async () => {
  for (const initial of [[], [['welcome_shown', '2.7.0']]]) {
    const { api, values } = storeHarness(initial);
    assert.equal(await api.isHomeIntroCompleted(), false);
    assert.equal(values.get('welcome_shown'), initial[0]?.[1]);
    await api.completeHomeIntro();
    assert.equal(await api.isHomeIntroCompleted(), true);
  }
});

test('real startup sequence presents unread introduction and skips it only after persisted confirmation', async () => {
  const { api, values } = storeHarness([]);
  let shown = 0;
  const host = {
    canPresent: () => true, checkAnnouncement: async () => false, activateAnnouncementChecks() {},
    cloudCompleted: async () => true, introCompleted: api.isHomeIntroCompleted,
    showCloud: () => assert.fail('cloud already completed'), showIntro: () => { shown++; }
  };
  await new HomeStartupSequence().start(host);
  assert.equal(shown, 1);
  assert.equal(values.has('home_intro_completed_v1'), false, 'rendering must not mark the introduction read');
  await new HomeStartupSequence().start(host);
  assert.equal(shown, 2, 'a restart before confirmation must exercise the same rendering');
  await api.completeHomeIntro();
  await new HomeStartupSequence().start(host);
  assert.equal(shown, 2, 'an existing read marker skips the crash-sensitive first-start path');
});

test('failed persistence rolls back the in-memory marker so the introduction is retried', async () => {
  const { api, state } = storeHarness();
  state.fail = true;
  await assert.rejects(api.completeHomeIntro());
  assert.equal(await api.isHomeIntroCompleted(), false);
  state.fail = false;
  await api.completeHomeIntro();
  assert.equal(await api.isHomeIntroCompleted(), true);
});

test('reassurance appears only at the end and the overview remains in the first-start flow', async () => {
  const { HOME_INTRO_PAGES } = await import('../../entry/src/main/ets/model/HomeIntro.ts');
  const reassurancePages = HOME_INTRO_PAGES.filter(page =>
    page.blocks.some(block => block.titleKey === 'home_intro_simple_start_title'));
  assert.deepEqual(reassurancePages.map(page => page.id), ['daily']);
  assert.equal(reassurancePages[0].blocks.at(-1).bodyKey, 'home_intro_finish_body');
  assert.match(homePage, /introCompleted:\s*\(\): Promise<boolean> => isHomeIntroCompleted\(\)/);
  assert.match(homePage, /showIntro:\s*\(\): void => \{ this\.显示欢迎弹窗 = true; \}/);
});

test('the rating walkthrough stays in the first-study guide instead of the introduction', async () => {
  const { HOME_INTRO_PAGES } = await import('../../entry/src/main/ets/model/HomeIntro.ts');
  assert.deepEqual(HOME_INTRO_PAGES.map(page => page.id),
    ['start', 'science', 'app', 'sources', 'import', 'create', 'daily']);
  assert.equal(HOME_INTRO_PAGES.some(page => page.titleKey === 'study_guide_title'), false);
  for (const key of ['study_guide_title', 'study_guide_flow', 'rating_again', 'study_guide_undo'])
    assert.ok(studyGuide.includes(key), `${key} remains in the first-study guide`);
});

test('introduction paragraphs stay in a Builder method compiled into native Text operations', () => {
  assert.match(panel, /@Builder\s+private paragraph\(body: ResourceStr\)\s*\{\s*Text\(body\)\.fontSize/);
  assert.match(panel, /HomeIntroSection\(\{ title, content: \(\) => \{ this\.paragraph\(body\); \} \}\)/);
});


test('pagination exposes the actual page and actions to JIDE and finish and later have distinct UI callbacks', async () => {
  const { HOME_INTRO_PAGES, HOME_INTRO_ACTIONS, homeIntroPageIndex, homeIntroActionVisible } = await import('../../entry/src/main/ets/model/HomeIntro.ts');
  const methods = ['currentPage', 'onPageChanged', 'selectAction', 'publishInterface'].map(name => {
    const start = panel.indexOf(`  private ${name}(`);
    return panel.slice(start, panel.indexOf('\n  }', start) + 4);
  });
  // currentPage has a compact body; extract it separately.
  methods[0] = panel.match(/  private currentPage\(\): HomeIntroPage \{[^\n]+/)[0];
  const observed = [], scrolls = []; let completed = 0, dismissed = 0;
  const js = stripTypeScriptTypes(`class Panel { ${methods.join('\n')} }`, { mode: 'transform' });
  const Panel = new Function('HOME_INTRO_PAGES','HOME_INTRO_ACTIONS','homeIntroPageIndex','homeIntroActionVisible','appInterface',
    js + '; return Panel;')(HOME_INTRO_PAGES, HOME_INTRO_ACTIONS, homeIntroPageIndex, homeIntroActionVisible,
      {observe:value=>observed.push(value)});
  const instance = new Panel();
  Object.assign(instance, {pageIndex:0,isActive:true,text:key=>key,onClose:()=>completed++,onDismiss:()=>dismissed++,
    bodyScroller:{scrollTo:value=>scrolls.push(value)},copyGroup(){},openDecksWebsite(){}});
  instance.selectAction('previous'); assert.equal(instance.pageIndex,0);
  instance.selectAction('finish'); assert.equal(completed,0);
  for (let i=0;i<HOME_INTRO_PAGES.length;i++) {
    instance.onPageChanged();
    const view=observed.at(-1);
    assert.equal(view.sectionId,HOME_INTRO_PAGES[i].id);
    assert.equal(view.values.find(item=>item.id==='page').value,String(i+1));
    assert.deepEqual(view.items.map(item=>item.id), HOME_INTRO_ACTIONS.filter(item=>homeIntroActionVisible(item.id,i)).map(item=>item.id));
    assert.equal(scrolls.at(-1).yOffset,0);
    if(i<HOME_INTRO_PAGES.length-1)instance.selectAction('next');
  }
  instance.selectAction('next'); assert.equal(instance.pageIndex,HOME_INTRO_PAGES.length-1);
  instance.selectAction('previous'); assert.equal(instance.pageIndex,HOME_INTRO_PAGES.length-2);
  instance.selectAction('later'); assert.equal(dismissed,1); assert.equal(completed,0);
  instance.selectAction('next'); instance.selectAction('finish'); assert.equal(completed,1);
  instance.isActive=false; instance.selectAction('finish'); assert.equal(completed,1);
  assert.equal(homeIntroPageIndex(NaN),0); assert.equal(homeIntroPageIndex(999),HOME_INTRO_PAGES.length-1);
  assert.match(homePage,/if \(this\.显示欢迎弹窗\) \{ this\.closeHomeIntro\(\);/);
});

test('home remembers both finish and read-later choices, while pagination never writes', async () => {
  const start=homePage.indexOf('  private closeHomeIntro(): void {');
  const method=homePage.slice(start,homePage.indexOf('\n  }',start)+4);
  const {api}=storeHarness([]);
  const Home=new Function('completeHomeIntro',stripTypeScriptTypes(`class Home { ${method} }`,{mode:'transform'})+';return Home;')(api.completeHomeIntro);
  const home=new Home(); home.显示欢迎弹窗=true; home.homeActivityChanged=()=>{};
  home.显示提示=()=>assert.fail('persistence should succeed');
  home.closeHomeIntro(); await new Promise(setImmediate);
  assert.equal(home.显示欢迎弹窗,false);
  assert.equal(await api.isHomeIntroCompleted(),true);
  assert.match(homePage,/onDismiss: \(\): void => \{ this\.closeHomeIntro\(\); \}/);
});
