// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ThemeModeSession } from '../../entry/src/main/ets/model/settings/ThemeModeSession.ts';
import { ThemeColorSession } from '../../entry/src/main/ets/model/settings/ThemeColorSession.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

function fixture() {
  const state = { saved: 'system', active: 'system', dark: true, writes: [], applies: [], failSave: false, failRead: false, failApply: false };
  const host = {
    async readSavedMode() { if (state.failRead) throw Error('read failed'); return state.saved; },
    async saveMode(mode) { state.writes.push(mode); if (state.failSave) throw Error('save failed'); state.saved = mode; },
    async applyMode(mode) { state.applies.push(mode); if (state.failApply) throw Error('apply failed'); state.active = mode; },
    systemDark: () => state.dark
  };
  return { state, host, session: new ThemeModeSession(host) };
}

test('theme mode reads distinguish preference and effective system-following state', async () => {
  const f = fixture();
  assert.deepEqual(await f.session.read(), { mode: 'system', systemDark: true, effectiveDark: true });
  await f.session.setMode('light');
  assert.equal((await f.session.read()).effectiveDark, false);
  f.state.failRead = true;
  await assert.rejects(f.session.read(), /read failed/);
});

test('serialized page/assistant writes save and apply in order; only the latest change can undo', async () => {
  const f = fixture();
  const [first, second] = await Promise.all([f.session.setMode('dark'), f.session.setMode('light')]);
  assert.equal(first.status, 'completed');
  assert.equal(second.previousMode, 'dark');
  assert.deepEqual(f.state.writes, ['dark', 'light']);
  assert.deepEqual(f.state.applies, ['dark', 'light']);
  await assert.rejects(f.session.undo(first.undoId), /theme_undo_expired/);
  const undo = await f.session.undo(second.undoId);
  assert.equal(undo.mode, 'dark');
  assert.equal(undo.undoId, '');
  await assert.rejects(f.session.undo(second.undoId), /theme_undo_expired/);
});

test('undo cannot overwrite an externally changed preference, even with a previously valid token', async () => {
  const f = fixture();
  const change = await f.session.setMode('dark');
  f.state.saved = 'light';
  await assert.rejects(f.session.undo(change.undoId), /theme_undo_conflict/);
  assert.deepEqual(f.state.writes, ['dark']);
});

test('save failure and unverified readback never apply or claim saved; queue recovers', async () => {
  const f = fixture();
  f.state.failSave = true;
  const failed = await f.session.setMode('dark');
  assert.equal(failed.status, 'partial'); assert.equal(failed.saved, false); assert.equal(failed.applied, false);
  assert.equal(failed.errorCode, 'theme_save_unverified'); assert.equal(failed.undoId, '');
  assert.deepEqual(f.state.applies, []);
  f.state.failSave = false;
  const save = f.host.saveMode;
  f.host.saveMode = async mode => { await save(mode); f.state.failRead = true; };
  const unverified = await f.session.setMode('dark');
  assert.equal(unverified.saved, false); assert.deepEqual(f.state.applies, []);
  f.state.failRead = false; f.host.saveMode = save;
  assert.equal((await f.session.setMode('light')).status, 'completed');
});

test('apply failure reports saved separately and leaves a usable undo; invalid mode never writes', async () => {
  const f = fixture();
  await assert.rejects(f.session.setMode('auto'), /invalid_theme_mode/);
  assert.deepEqual(f.state.writes, []);
  f.state.failApply = true;
  const result = await f.session.setMode('dark');
  assert.equal(result.saved, true); assert.equal(result.applied, false); assert.equal(result.status, 'partial');
  f.state.failApply = false;
  assert.equal((await f.session.undo(result.undoId)).mode, 'system');
});

test('real preferences adapter keeps startup fallback but throws on strict reads and failed flush', async () => {
  let fail = false, value = 'dark';
  const context = {};
  const adapter = loadPlatformModule('model/主题存储.ets', '({加载主题模式, readSavedThemeMode, 保存主题模式})', {
    默认主题模式: 'system', 规范化主题模式: input => ['system','dark','light'].includes(input) ? input : 'system',
    AppStorage: { get: () => context },
    preferences: { async getPreferences() { return {
      async get() { if (fail) throw Error('read'); return value; },
      async put(_key, mode) { value = mode; }, async flush() { if (fail) throw Error('flush'); }
    }; } }
  });
  assert.equal(await adapter.readSavedThemeMode(), 'dark');
  fail = true;
  assert.equal(await adapter.加载主题模式(), 'system');
  await assert.rejects(adapter.readSavedThemeMode(), /read/);
  await assert.rejects(adapter.保存主题模式('light'), /flush/);
});

test('all existing pages observe shared theme mode; settings use the same service as the assistant', () => {
  const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
  for (const page of ['首页','统计页','添加笔记页','学习页','学习提醒页','浏览页','设置页','EditNotePage']) {
    assert.match(read('pages/' + page + '.ets'), /@StorageLink\('themeMode'\).*主题模式/, page);
  }
  const settings = read('pages/设置页.ets');
  assert.match(settings, /appThemeSession\.setMode\(mode\)/);
  assert.doesNotMatch(settings, /保存主题模式|应用激活主题/);
});

test('real shared platform service verifies persistence, updates resources and broadcasts, and isolates best-effort widget failures', async () => {
  let saved = 'system', resourceFailure = false;
  const storage = new Map([['themeMode','system'],['systemDarkMode',true],['colorTheme','aurora']]);
  const modes = [], palettes = [], widgetErrors = [];
  const context = { getApplicationContext: () => ({ setColorMode(mode) {
    if (resourceFailure) throw Error('resource unavailable'); modes.push(mode);
  } }) };
  storage.set('abilityContext',context);
  const resolveDark = (mode,dark) => mode === 'dark' || (mode === 'system' && dark);
  let systemDark = true;
  const controller = loadPlatformModule('utils/主题控制器.ets', '({应用主题, readSystemDarkMode})', {
    ConfigurationConstant: { ColorMode: { COLOR_MODE_DARK:0,COLOR_MODE_LIGHT:1,COLOR_MODE_NOT_SET:-1 } },
    window: { async getLastWindow() { throw Error('window not ready'); } }, 解析是否深色: resolveDark,
    resourceManager: { ColorMode:{DARK:0,LIGHT:1}, getSysResourceManager:()=>({getConfigurationSync:()=>({colorMode:systemDark?0:1})}) }
  });
  const service = loadPlatformModule('backend/AppThemeService.ets','appThemeSession', {
    ThemeModeSession, ThemeColorSession, readSavedThemeMode:async()=>saved, 保存主题模式:async mode=>{saved=mode;},
    AppStorage:{ get:key=>storage.get(key),setOrCreate:(key,value)=>storage.set(key,value) },
    默认颜色主题:'aurora',解析是否深色:resolveDark, 应用主题:controller.应用主题, readSystemDarkMode:controller.readSystemDarkMode,
    应用颜色主题:(color,dark)=>palettes.push([color,dark]),
    刷新桌面卡片数据:async()=>{throw Error('widget unavailable');},
    hilog:{warn(...args){widgetErrors.push(args);}}
  });
  const applied = await service.setMode('light');
  assert.equal(applied.status,'completed'); assert.equal(saved,'light');
  assert.equal(storage.get('themeMode'),'light'); assert.deepEqual(modes,[1]);
  assert.deepEqual(palettes,[['aurora',false]]); assert.equal(widgetErrors.length,1);
  resourceFailure = true;
  const failed = await service.setMode('dark');
  assert.equal(failed.saved,true); assert.equal(failed.applied,false);
  assert.equal(saved,'dark'); assert.equal(storage.get('themeMode'),'light');
  assert.equal(palettes.length,1);
  resourceFailure = false;
  assert.equal((await service.undo(failed.undoId)).status,'completed');
  assert.equal(storage.get('themeMode'),'light');
  // 旧缓存已被应用深色污染，切回系统必须重新读取设备浅色。
  await service.setMode('dark');
  storage.set('systemDarkMode',true); systemDark = false;
  assert.equal((await service.setMode('system')).status,'completed');
  assert.equal(storage.get('systemDarkMode'),false);
  assert.deepEqual(palettes.at(-1),['aurora',false]);
  assert.equal(modes.at(-1),-1);
});
