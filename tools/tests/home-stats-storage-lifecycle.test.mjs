// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { appInterfaceDependencies } from './app-interface-harness.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
const item=(id=1)=>({唯一ID:id,小时:6,分钟:30,标题:'',内容:'',开启:true});
function storageHarness() {
  const state={context:{filesDir:'/data',getApplicationContext:()=>({filesDir:'/shared'})},broadcasts:[],values:new Map(),readError:false,flushError:false};
  const AppStorage={get:()=>state.context,setOrCreate:(...args)=>state.broadcasts.push(args)};
  const store={getSync:(key,fallback)=>{if(state.readError)throw Error('read');return state.values.get(key)??fallback;},
    putSync:(key,value)=>state.values.set(key,value),flush:async()=>{if(state.flushError)throw Error('flush');}};
  const dependencies={AppStorage,preferences:{getPreferences:async()=>store}};
  Object.assign(dependencies,loadPlatformModule('utils/LocalPreferenceWrite.ets',
    '{readLocalPreference,saveLocalPreference}',dependencies));
  const reminders=loadPlatformModule('model/学习提醒存储.ets','{加载学习提醒设置,保存学习提醒设置,生成提醒项ID}',dependencies);
  return {state,store,dependencies,reminders};
}
test('missing reminders are empty; broken reads and JSON reject instead of pretending all reminders are disabled',async()=>{
  const h=storageHarness();
  assert.deepEqual(await h.reminders.加载学习提醒设置(),{提醒项列表:[]});
  for(const raw of ['broken','{}','[null]',JSON.stringify([item(),item()])]) {
    h.state.values.set('study_reminder_items',raw);
    await assert.rejects(h.reminders.加载学习提醒设置());
  }
  h.state.values.clear();h.state.readError=true;await assert.rejects(h.reminders.加载学习提醒设置(),/read/);
  h.state.readError=false;h.state.context=undefined;await assert.rejects(h.reminders.加载学习提醒设置(),/unavailable/);
});
test('legacy reminder migration preserves fields and does not reuse an existing ID',async()=>{
  const h=storageHarness(),legacy=item(8);delete legacy.开启;
  h.state.values.set('study_reminder_items',JSON.stringify([legacy]));
  assert.equal((await h.reminders.加载学习提醒设置()).提醒项列表[0].开启,true);
  assert.equal(h.reminders.生成提醒项ID(),9);
});
test('failed reminder persistence rejects, preserves cached settings and emits no successful enabled broadcast',async()=>{
  const h=storageHarness(),old=JSON.stringify([{...item(),开启:false}]);
  h.state.values.set('study_reminder_items',old);h.state.flushError=true;
  await assert.rejects(h.reminders.保存学习提醒设置([item()]),/flush/);
  assert.equal(h.state.values.get('study_reminder_items'),old);assert.deepEqual(h.state.broadcasts,[]);
  h.state.flushError=false;await h.reminders.保存学习提醒设置([item()]);
  assert.deepEqual(h.state.broadcasts.at(-1),['studyReminderEnabled',true]);
});
test('accepted reminder submissions freeze input before asynchronous acquisition',async()=>{
  const h=storageHarness(),gate=deferred(),items=[item()];
  h.dependencies.preferences.getPreferences=()=>gate.promise;
  const work=h.reminders.保存学习提醒设置(items);items[0].开启=false;items[0].小时=22;
  gate.resolve(h.store);await work;
  const saved=JSON.parse(h.state.values.get('study_reminder_items'));
  assert.equal(saved[0].小时,6);assert.equal(saved[0].开启,true);
});

function textHarness(locale='base') {
  const resources=new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/'+locale+'/element/string.json',import.meta.url),'utf8')).string.map(x=>[x.name,x.value]));
  return loadPlatformModule('utils/StudyReminderText.ets','{reminderText,reminderTitle,reminderContent}',{
    AppStorage:{get:()=>({resourceManager:{getStringByNameSync:(key,...args)=>{
      assert.ok(resources.has(key),key);let text=resources.get(key);for(const arg of args)text=text.replace('%s',String(arg));return text;
    }}})}
  });
}
function serviceHarness(items=[item()],locale='base') {
  const events=[],state={items,readError:false,treeError:false,permission:true,failPublish:0,tree:{children:[{newCount:2,learnCount:3,reviewCount:4}]}};
  const service=loadPlatformModule('model/学习提醒服务.ets','刷新学习提醒',{
    ...textHarness(locale),AppStorage:{get:()=>({filesDir:'/data'})},
    加载学习提醒设置:async()=>{events.push('read');if(state.readError)throw Error('read');return {提醒项列表:state.items};},
    保存提醒ID列表:async ids=>events.push(['ids',ids]),
    notificationManager:{isNotificationEnabled:async()=>state.permission,requestEnableNotification:async()=>{},SlotType:{SERVICE_INFORMATION:1}},
    reminderAgentManager:{ReminderType:{REMINDER_TYPE_ALARM:1},addNotificationSlot:async()=>{},
      cancelAllReminders:async()=>events.push('cancel'),
      publishReminder:async request=>{events.push(['publish',request]);if(state.failPublish-->0)throw Error('publish');return events.length;}},
    后端会话:{获取实例:()=>({确保已打开:async()=>{}})},
    牌组服务:class {async 获取牌组树(){if(state.treeError)throw Error('tree');return state.tree;}}
  });
  return {service,state,events};
}
test('read, permissions and tree failures leave existing system reminders untouched',async()=>{
  for(const fault of ['readError','treeError','permission']) {
    const h=serviceHarness();h.state[fault]=fault==='permission'?false:true;
    await assert.rejects(h.service());
    assert.equal(h.events.includes('cancel'),false,fault);
    assert.equal(h.events.some(x=>Array.isArray(x)&&x[0]==='publish'),false);
  }
  const h=serviceHarness([]);await h.service();assert.deepEqual(h.events,['read','cancel',['ids',[]]]);
});
test('partial reminder publication reports failure and a later refresh can recover',async()=>{
  const h=serviceHarness([item(1),item(2)]);h.state.failPublish=1;
  await assert.rejects(h.service(),/设置已保存/);
  assert.equal(h.events.filter(x=>Array.isArray(x)&&x[0]==='publish').length,2);
  assert.equal(h.events.find(x=>Array.isArray(x)&&x[0]==='ids')[1].length,1);
  await h.service();
});
test('preview and notification share actual Chinese/English defaults and replace every legacy token',async()=>{
  for(const locale of ['base','en_US']) {
    const text=textHarness(locale),h=serviceHarness([item()],locale);
    await h.service();
    const payload=h.events.find(x=>Array.isArray(x)&&x[0]==='publish')[1];
    assert.equal(payload.title,text.reminderTitle(''));
    assert.equal(payload.content,text.reminderContent('','5','4'));
    assert.equal(text.reminderContent('{{new}} {{待学}} {{review}} {{待复习}}','X','Y'),'X X Y Y');
    assert.equal(text.reminderTitle('custom title'),'custom title');
    if(locale==='en_US')assert.doesNotMatch(payload.title+payload.content,/\p{Script=Han}/u);
  }
});

test('statistics platform never publishes zero counters when the deck tree read fails',async()=>{
  const events=[];
  const Adapter=loadPlatformModule('backend/AnkiStatsSession.ets','AnkiStatsSession',{
    统计服务:class{},牌组服务:class{async 获取牌组树(){throw Error('tree');}},
    syncActivity:{waitForCollection:async()=>{}},createStatsWidget:()=>events.push('extract'),publishStatsWidget:()=>events.push('publish')
  });
  await assert.rejects(new Adapter('/').publishWidget({},0,false,()=>true),/tree/);
  assert.deepEqual(events,[]);
});
test('widget write and fsync failures close the descriptor without replacing the last complete snapshot',async()=>{
  for(const fault of ['write','fsync']) {
    const h=storageHarness(),events=[];
    const fileIo={OpenMode:{CREATE:1,READ_WRITE:2,TRUNC:4},openSync:path=>{events.push(['open',path]);return {fd:12};},
      writeSync:()=>{events.push('write');if(fault==='write')throw Error('write');},
      fsyncSync:()=>{events.push('fsync');throw Error('fsync');},closeSync:()=>events.push('close'),renameSync:()=>events.push('rename')};
    const save=loadPlatformModule('model/桌面卡片数据存储.ets','保存卡片数据',{
      ...h.dependencies,fileIo,hilog:{error(){}}
    });
    await assert.rejects(save({}),new RegExp(fault));
    assert.equal(events.filter(x=>x==='close').length,1);
    assert.equal(events.includes('rename'),false);
    assert.equal(events[0][1],'/shared/widget_stats.json.tmp');
  }
});
test('local statistics ranges and deck tone propagate flush failure instead of claiming success',async()=>{
  const h=storageHarness();h.state.flushError=true;
  const stats=loadPlatformModule('model/桌面卡片数据存储.ets','{保存小时分布窗口,保存统计天数,加载统计天数}',h.dependencies);
  const meta=loadPlatformModule('model/牌组元数据存储.ets','保存牌组色调',{
    ...h.dependencies,牌组色调键:value=>value
  });
  await assert.rejects(stats.保存小时分布窗口(0),/flush/);
  await assert.rejects(stats.保存统计天数(0),/flush/);
  await assert.rejects(meta('1','blue'),/flush/);
  assert.equal(await stats.加载统计天数(),365);assert.deepEqual(h.state.broadcasts,[]);
});
test('failed background removal leaves its path and file available for retry',async()=>{
  const h=storageHarness(),removed=[];h.state.values.set('deck_background_1','/old');h.state.flushError=true;
  const clear=loadPlatformModule('model/牌组元数据存储.ets','清除牌组背景图',{
    ...h.dependencies,fs:{unlink:async path=>removed.push(path)}
  });
  await assert.rejects(clear('1'),/flush/);assert.equal(h.state.values.get('deck_background_1'),'/old');assert.deepEqual(removed,[]);
  h.state.flushError=false;await clear('1');
  assert.equal(h.state.values.get('deck_background_1'),'');assert.deepEqual(removed,['/old']);
});

function pixel(name) {return {name,releases:0,async release(){this.releases++;}};}
function panelHarness() {
  const gate=deferred(),crop=deferred(),events=[];
  const deps={...appInterfaceDependencies(),牌组色调:{Blue:0},IBestImageCropperController:class{getResult(){return crop.promise;}},
    loadDeckBackground:()=>gate.promise,releaseDeckBackground:p=>{if(p)p.release();}};
  const Panel=loadComponentLogic('components/牌组定制面板.ets','牌组定制面板',deps);
  const panel=new Panel();panel.deck.backgroundImage='/old';panel.onClose=()=>events.push('close');
  return {panel,gate,crop,events};
}
test('background decode after component disposal releases its result without updating the preview',async()=>{
  const h=panelHarness(),p=pixel('late'),work=h.panel.加载原像素图();
  h.panel.aboutToDisappear();h.gate.resolve(p);await work;
  assert.equal(h.panel.原像素图,null);assert.equal(p.releases,1);
});
test('cancelled crop retains the previous draft and releases the late new result',async()=>{
  const h=panelHarness(),old=pixel('draft'),late=pixel('late');
  h.panel.已裁剪像素图=old;h.panel.背景动作='replace';h.panel.裁剪模式=true;h.panel.待裁剪Uri='/new';
  const work=h.panel.应用裁剪();h.panel.取消裁剪();h.crop.resolve(late);await work;
  assert.equal(h.panel.已裁剪像素图,old);assert.equal(h.panel.背景动作,'replace');
  assert.equal(late.releases,1);assert.equal(old.releases,0);
  h.panel.标记移除();assert.equal(old.releases,1);
});
test('replacement and disposal release owned pixels exactly once, deferring borrowed save pixels until completion',async()=>{
  const h=panelHarness(),old=pixel('old'),next=pixel('next'),save=deferred();
  h.panel.已裁剪像素图=old;h.panel.裁剪模式=true;
  const crop=h.panel.应用裁剪();h.crop.resolve(next);await crop;assert.equal(old.releases,1);
  h.panel.onSave=async result=>{assert.equal(result.背景像素图,next);await save.promise;assert.equal(next.releases,0);};
  const work=h.panel.提交带像素图();h.panel.aboutToDisappear();assert.equal(next.releases,0);
  save.resolve();await work;assert.equal(next.releases,1);
});
test('shared background decoder closes the file and releases both source and pixels if cleanup fails',async()=>{
  const events=[],p=pixel('decoded');
  const load=loadPlatformModule('backend/DeckBackgroundImage.ets','loadDeckBackground',{
    fileIo:{OpenMode:{READ_ONLY:1},openSync:()=>({fd:1}),close:async()=>events.push('close')},
    image:{createImageSource:()=>({createPixelMap:async()=>p,release:async()=>{events.push('source release');throw Error('source cleanup');}})}
  });
  await assert.rejects(load('/file'),/source cleanup/);await settle();
  assert.deepEqual(events,['source release','close']);assert.equal(p.releases,1);
});

function reminderPageHarness() {
  const state={settings:[],saveError:false,refreshError:false,saves:[],refreshes:0};
  const Page=loadComponentLogic('pages/学习提醒页.ets','学习提醒页',{
    ...appInterfaceDependencies(),加载学习提醒设置:async()=>({提醒项列表:state.settings}),
    保存学习提醒设置:async items=>{if(state.saveError)throw Error('save');state.settings=items;state.saves.push(items);},
    刷新学习提醒:async()=>{state.refreshes++;if(state.refreshError)throw Error('publish');},
    生成提醒项ID:()=>5,首次引导通知设置:async()=>{}
  });
  const page=new Page();page.interfaceMounted=true;page.已加载=true;return {page,state};
}
test('reminder toggle save failure retains the last committed state and displays an error',async()=>{
  const h=reminderPageHarness();h.page.提醒项列表=[item()];h.state.saveError=true;
  await h.page.切换单项开关(1,false);
  assert.equal(h.page.提醒项列表[0].开启,true);assert.match(h.page.错误信息,/save/);assert.equal(h.state.refreshes,0);
});
test('retrying a saved reminder after publication failure edits the same ID without duplicating it',async()=>{
  const h=reminderPageHarness();h.state.refreshError=true;
  await h.page.弹层确认(6,30,'title','body');
  assert.equal(h.page.提醒项列表.length,1);assert.equal(h.page.面板目标ID,5);assert.equal(h.page.面板是否新建,false);
  assert.match(h.page.面板错误,/publish/);
  h.state.refreshError=false;await h.page.弹层确认(7,30,'title','body');
  assert.equal(h.state.settings.length,1);assert.equal(h.state.settings[0].唯一ID,5);assert.equal(h.state.settings[0].小时,7);
});
