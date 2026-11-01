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


function method(name) {
  const start=panel.search(new RegExp('  private (?:async )?'+name+'\\('));
  assert.ok(start>=0,name);
  return panel.slice(start,panel.indexOf('\n  }',start)+4);
}
async function panelHarness() {
  const model=await import('../../entry/src/main/ets/model/HomeIntro.ts');
  const saved=[], materials=[], views=[], failures=[];
  const state={fail:false};
  const methods=['currentPage','movePage','selectAction','chooseExperience','chooseMaterial','publishInterface'].map(method).join('\n');
  const names=['homeIntroPageIndex','homeIntroActionVisible','homeIntroBlocks','homeIntroTarget','HOME_INTRO_PAGES','HOME_INTRO_ACTIONS'];
  const Panel=new Function(...names,'保存简洁模式','completeGlassSuggestion','showToastSafely','$r','appInterface',
    stripTypeScriptTypes(`class Panel { ${methods} }`,{mode:'transform'})+';return Panel;')(
      ...names.map(name=>model[name]),async value=>{saved.push(value);if(state.fail)throw Error('disk');},
      async value=>{materials.push(value);if(state.fail)throw Error('disk');},(_ctx,value)=>failures.push(value),key=>key,{observe:value=>views.push(value)});
  const instance=new Panel();
  Object.assign(instance,{pageIndex:0,isActive:true,savingMode:false,experienced:false,selectedStart:'',pendingAnswer:'',
    text:key=>key,getUIContext:()=>({}),onStart(action){this.started=action;},onClose(){this.closed=true;},onDismiss(){this.dismissed=true;}});
  return {instance,saved,materials,views,failures,state,model};
}
test('all choices finish before the selected real action starts',async()=>{
  for(const used of [false,true])for(const action of used?['start_sync','start_import','start_create']:['start_import','start_create']) {
    const {instance,saved,materials}=await panelHarness();
    await instance.chooseExperience(used);assert.deepEqual(saved,[!used]);
    instance.selectAction(action);assert.equal(instance.pageIndex,used?5:2);assert.equal(instance.started,undefined);
    if(!used){for(const expected of [3,4,5]){instance.selectAction('next');assert.equal(instance.pageIndex,expected);assert.equal(instance.started,undefined);}}
    assert.equal(instance.selectedStart,action);
    await instance.chooseMaterial(false);assert.deepEqual(materials,[false]);assert.equal(instance.started,action);
  }
});
test('save failure stays retryable, hidden sync is rejected, and returning preserves the selected route',async()=>{
  const {instance,state,views}=await panelHarness();
  state.fail=true;await instance.chooseExperience(true);assert.equal(instance.pageIndex,0);assert.equal(instance.savingMode,false);
  assert.equal(views[0].busy,true);assert.ok(views[0].items.every(x=>!x.enabled));
  state.fail=false;await instance.chooseExperience(false);
  instance.selectAction('start_sync');assert.equal(instance.pageIndex,1);
  instance.selectAction('start_create');assert.equal(instance.pageIndex,2);
  for(let i=0;i<3;i++)instance.selectAction('next');
  state.fail=true;await instance.chooseMaterial(true);assert.equal(instance.started,undefined);assert.equal(instance.pageIndex,5);
  state.fail=false;for(let i=0;i<4;i++)instance.selectAction('previous');assert.equal(instance.pageIndex,1);assert.equal(instance.selectedStart,'start_create');
  instance.selectAction('start_import');for(let i=0;i<3;i++)instance.selectAction('next');await instance.chooseMaterial(true);assert.equal(instance.started,'start_import');
  instance.isActive=false;instance.started='';await instance.chooseMaterial(false);assert.equal(instance.started,'');
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

test('novices reuse practical original copy while experienced users skip teaching in both directions',async()=>{
  const {homeIntroBlocks,homeIntroTarget,homeIntroActionVisible}=await import('../../entry/src/main/ets/model/HomeIntro.ts');
  assert.equal(homeIntroBlocks(2,'start_create')[0].bodyKey,'home_intro_flashcards_body');
  assert.equal(homeIntroBlocks(3,'start_create')[0].bodyKey,'home_intro_manual_body');
  assert.equal(homeIntroBlocks(3,'start_import')[0].bodyKey,'home_intro_apkg_body');
  assert.equal(homeIntroBlocks(4,'start_create')[0].bodyKey,'intro_novice_daily');
  assert.equal(homeIntroTarget(1,true,true),5);assert.equal(homeIntroTarget(5,false,true),1);
  assert.equal(homeIntroTarget(1,true,false),2);assert.equal(homeIntroTarget(5,false,false),4);
  assert.equal(homeIntroActionVisible('next',3,false),true);assert.equal(homeIntroActionVisible('next',3,true),false);
});
