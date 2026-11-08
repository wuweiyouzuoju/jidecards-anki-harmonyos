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
  const state = { fail: false, installTime: 100, updateTime: 100 };
  const store = {
    getSync: (key, fallback) => values.get(key) ?? fallback,
    putSync: (key, value) => values.set(key, value),
    flush: async () => { if (state.fail) throw new Error('disk full'); }
  };
  const body = source.slice(source.indexOf('const INTRO_KEY')).replaceAll('export ', '');
  const api = new Function('AppStorage', 'preferences', 'bundleManager', stripTypeScriptTypes(body, { mode: 'transform' }) +
    ';return { isHomeIntroCompleted, completeHomeIntro };')({ get: () => ({}) }, { getPreferencesSync: () => store },
    { BundleFlag: {}, getBundleInfoForSelf: async () => state });
  return { api, state, values };
}

test('fresh installs receive the introduction once after confirmation', async () => {
  for (const initial of [[], [['home_intro_completed_v1', false]]]) {
    const { api, values } = storeHarness(initial);
    assert.equal(await api.isHomeIntroCompleted(), false);
    assert.equal(values.get('home_intro_completed_v1'), initial[0]?.[1]);
    await api.completeHomeIntro();
    assert.equal(await api.isHomeIntroCompleted(), true);
  }
});

test('upgrades skip the introduction even without a completion marker', async () => {
  const { api, state, values } = storeHarness([['welcome_shown', '2.7.0']]);
  state.updateTime = 200;
  assert.equal(await api.isHomeIntroCompleted(), true);
  assert.equal(values.has('home_intro_completed_v1'), false);
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


function method(name) {
  const start=panel.search(new RegExp('  private (?:async )?'+name+'\\('));
  assert.ok(start>=0,name);
  return panel.slice(start,panel.indexOf('\n  }',start)+4);
}
async function panelHarness() {
  const model=await import('../../entry/src/main/ets/model/HomeIntro.ts');
  const saved=[], materials=[], views=[], failures=[];
  const state={fail:false};
  const methods=['currentPage','movePage','readyToAdvance','choiceSelected','selectAction','chooseExperience','chooseMaterial','publishInterface'].map(method).join('\n');
  const names=['homeIntroPageIndex','homeIntroActionVisible','homeIntroTarget','HOME_INTRO_PAGES','HOME_INTRO_ACTIONS'];
  const Panel=new Function(...names,'保存简洁模式','completeGlassSuggestion','showToastSafely','$r','appInterface','INTRO_ABOUT_ITEMS',
    stripTypeScriptTypes(`class Panel { ${methods} }`,{mode:'transform'})+';return Panel;')(
      ...names.map(name=>model[name]),async value=>{saved.push(value);if(state.fail)throw Error('disk');},
      async value=>{materials.push(value);if(state.fail)throw Error('disk');},(_ctx,value)=>failures.push(value),key=>key,{observe:value=>views.push(value)},[]);
  const instance=new Panel();
  Object.assign(instance,{pageIndex:0,answeredExperience:false,isActive:true,savingMode:false,experienced:false,selectedStart:'',pendingAnswer:'',
    text:key=>key,getUIContext:()=>({}),onFinish(){this.finished=true;},onClose(){this.closed=true;},onDismiss(){this.dismissed=true;}});
  return {instance,saved,materials,views,failures,state,model};
}
test('both experience paths reach About without a start-choice page',async()=>{
  for(const used of [false,true]) {
    const {instance,saved,materials,views}=await panelHarness();
    instance.selectAction('next');assert.equal(instance.pageIndex,0);
    await instance.chooseMaterial(false);assert.equal(instance.pageIndex,1);
    await instance.chooseExperience(used);assert.deepEqual(saved,[!used]);
    assert.equal(instance.pageIndex,used?5:2);
    const expected=used?[]:[3,4,5];
    for(const page of expected){instance.selectAction('next');assert.equal(instance.pageIndex,page);}
    instance.publishInterface();

    assert.equal(views.at(-1).sectionId,'community');
    assert.ok(views.at(-1).items.some(item=>item.id==='copy_qq'));
    instance.selectAction('finish');assert.deepEqual(materials,[false]);assert.equal(instance.finished,true);
  }
});
test('save failures stay retryable and About goes back to the correct page',async()=>{
  const {instance,state}=await panelHarness();
  state.fail=true;await instance.chooseMaterial(true);assert.equal(instance.pageIndex,0);
  state.fail=false;await instance.chooseMaterial(true);assert.equal(instance.pageIndex,1);
  state.fail=true;await instance.chooseExperience(true);assert.equal(instance.pageIndex,1);
  instance.selectAction('next');assert.equal(instance.pageIndex,1);
  state.fail=false;await instance.chooseExperience(true);assert.equal(instance.pageIndex,5);
  instance.selectAction('previous');assert.equal(instance.pageIndex,1);
  instance.selectAction('previous');assert.equal(instance.pageIndex,0);
  assert.equal(instance.finished,undefined);
});
test('closing the integrated introduction suppresses a second glass recommendation without changing material',async()=>{
  const start=homePage.indexOf('  private closeHomeIntro(startAction:');
  const body=homePage.slice(start,homePage.indexOf('\n  }',start)+4);
  const calls=[];const {api}=storeHarness([]);
  const Home=new Function('completeHomeIntro','completeGlassSuggestion',stripTypeScriptTypes(`class Home { ${body} }`,{mode:'transform'})+';return Home;')(
    api.completeHomeIntro,async value=>calls.push(value));
  const instance=new Home();instance.homeActivityChanged=()=>{};instance.显示提示=()=>assert.fail('unexpected failure');
  instance.closeHomeIntro();await new Promise(setImmediate);
  assert.equal(instance.glassSuggestionShown,true);assert.deepEqual(calls,[false]);assert.equal(await api.isHomeIntroCompleted(),true);
});

test('closing holds the intro slot until persistence finishes and ignores duplicate closes',async()=>{
  const start=homePage.indexOf('  private closeHomeIntro(startAction:');
  const body=homePage.slice(start,homePage.indexOf('\n  }',start)+4);
  let resolveWrite;let writes=0;
  const pending=new Promise(resolve=>{resolveWrite=resolve;});
  const Home=new Function('completeHomeIntro','completeGlassSuggestion',stripTypeScriptTypes(`class Home { ${body} }`,{mode:'transform'})+';return Home;')(
    async()=>{writes++;await pending;},async()=>{});
  const instance=new Home();instance.显示欢迎弹窗=true;instance.homeActivityChanged=()=>{};instance.显示提示=()=>assert.fail('unexpected failure');
  instance.closeHomeIntro();instance.closeHomeIntro();await new Promise(setImmediate);
  assert.equal(instance.显示欢迎弹窗,true);assert.equal(writes,1);
  resolveWrite();await new Promise(setImmediate);assert.equal(instance.显示欢迎弹窗,false);assert.equal(instance.homeIntroClosing,false);
});

test('home launches the selected domain only after completion has persisted',async()=>{
  const start=homePage.indexOf('  private closeHomeIntro(startAction:');
  const body=homePage.slice(start,homePage.indexOf('\n  }',start)+4);
  for(const action of ['start_import','start_create','start_sync']) {
    let finish;const gate=new Promise(resolve=>finish=resolve);const launched=[];
    const Home=new Function('completeHomeIntro','completeGlassSuggestion',stripTypeScriptTypes(`class Home { ${body} }`,{mode:'transform'})+';return Home;')(
      ()=>gate,async()=>{});
    const instance=new Home();Object.assign(instance,{显示欢迎弹窗:true,homeActivityChanged(){},显示提示(){assert.fail('save failed');},
      从选择器导入牌组(){launched.push('start_import');},openCreateDeck(){launched.push('start_create');},startSyncFromMenu(){launched.push('start_sync');}});
    instance.closeHomeIntro(action);await new Promise(setImmediate);assert.deepEqual(launched,[]);assert.equal(instance.显示欢迎弹窗,true);
    finish();await new Promise(setImmediate);assert.deepEqual(launched,[action]);assert.equal(instance.显示欢迎弹窗,false);
  }
});

test('the six declared pages include About and omit the start-choice page',async()=>{
  const {HOME_INTRO_PAGES,homeIntroTarget}=await import('../../entry/src/main/ets/model/HomeIntro.ts');
  assert.deepEqual(HOME_INTRO_PAGES.map(page=>page.id),['appearance','experience','basics','prepare','review','community']);
  assert.equal(homeIntroTarget(5,false,true),1);
  assert.equal(homeIntroTarget(5,false,false),4);
});
