// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { normalizeSyncServer } from '../entry/src/main/ets/model/SyncSettings.ts';

/** Execute fresh compiler output. Platform substitutes enforce the @Link subscription contract;
 * this checks construction, rendering and form callbacks, not ArkUI scheduling/layout or bytecode.
 */
export async function checkSyncServerCompiled(source) {
  assert.match(source, /export class 同步分组 extends ViewPU/, 'Pass fresh CompileArkTS 同步分组.ts output.');
  assert.match(source, /class 自定义服务器弹窗 extends ViewPU/, 'Compiled server dialog is missing.');
  const seen = { dialogs: [], saves: [], texts: [], credentials: [], automatic: [] };
  let nextId = 0, failSave = false, pendingSave = null;
  class Property {
    constructor(value) { this.value = value; this.deleted = false; this.subscribers = new Set(); }
    get() { assert.equal(this.deleted, false, 'reading a deleted state'); return this.value; }
    set(value) { assert.equal(this.deleted, false, 'writing a deleted state'); this.value = value; }
    reset(value) { this.set(value); }
    addSubscriber(subscriber) { this.subscribers.add(subscriber); }
    removeSubscriber(subscriber) { this.subscribers.delete(subscriber); }
    purgeDependencyOnElmtId() {}
    aboutToBeDeleted() { assert.equal(this.subscribers.size, 0, 'dialog still subscribed to deleted parent'); this.deleted = true; }
  }
  class TwoWayProperty extends Property {
    constructor(source, owner, name) {
      super(undefined);
      // The original output passes a primitive here and fails when ArkUI subscribes to it.
      source.addSubscriber(this);
      this.source = source;
      this.name = name;
    }
    get() { return this.source.get(); }
    set(value) { this.source.set(value); }
    aboutToBeDeleted() { this.source.removeSubscriber(this); this.deleted = true; }
  }
  class ViewPU {
    createStorageProp(_key, value) { return new Property(value); }
    createStorageLink(_key, value) { return new Property(value); }
    observeComponentCreation2(callback) { callback(++nextId, true); }
    ifElseBranchUpdateFunction(_index, callback) { callback(); }
    finalizeConstruction() {}
    aboutToBeDeletedInternal() {}
    id__() { return ++nextId; }
    getUIContext() { return { showAlertDialog: options => { seen.alert = options; } }; }
    static create(component) {
      if (component.constructor.name === '自定义服务器弹窗') seen.dialog = component;
      component.initialRender();
    }
  }
  class CustomDialogController {
    constructor(options) { this.options = options; this.visible = false; seen.dialogs.push(this); }
    open() { this.visible = true; this.options.builder(); this.component = seen.dialog; }
    close() {
      if (this.component) { this.component.aboutToBeDeleted(); this.component = null; }
      this.visible = false;
    }
  }
  class DialogHeader {
    constructor(_parent, params) { this.params = params; }
    initialRender() { seen.header = this.params; }
  }
  class DialogFrame {
    constructor(_parent, params) { this.params = params; }
    initialRender() { seen.frame = this.params; this.params.header(); this.params.content(); }
  }
  const NativeDialogHost = new Function('SurfaceTransition', 'Color', 'DialogAlignment', stripTypeScriptTypes(
    readFileSync(new URL('../entry/src/main/ets/components/common/NativeDialogHost.ets', import.meta.url), 'utf8')
      .replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, ''), { mode: 'transform' }) + ';return NativeDialogHost;')(
        { dialogEnterAnimation: () => ({}), dialogExitAnimation: () => ({}) },
        { Transparent: 'transparent' }, { Center: 'center' });
  function nativeElement(name, attributes) {
    const element = () => undefined;
    for (const attribute of attributes) element[attribute] = () => {};
    element.create = value => {
      if (name === 'Text') seen.texts.push(value);
      if (name === 'TextInput') seen.input = { text: value.text };
    };
    if (name === 'TextInput') {
      element.enabled = value => { seen.input.enabled = value; };
      element.onChange = callback => { seen.input.change = callback; };
    }
    return element;
  }
  const commonAttributes = ['width', 'fontSize', 'fontColor', 'backgroundColor', 'borderRadius', 'border', 'pop'];
  const context = vm.createContext({
    ViewPU, CustomDialogController, DialogHeader, DialogFrame, NativeDialogHost,
    ObservedPropertySimplePU: Property, ObservedPropertyObjectPU: Property,
    SynchedPropertySimpleOneWayPU: Property, SynchedPropertyObjectOneWayPU: Property,
    SynchedPropertySimpleTwoWayPU: TwoWayProperty,
    SubscriberManager: { Get: () => ({ delete() {} }) },
    Column: nativeElement('Column', [...commonAttributes, 'alignItems', 'constraintSize', 'padding']),
    If: nativeElement('If', ['pop']), Text: nativeElement('Text', commonAttributes),
    TextInput: nativeElement('TextInput', [...commonAttributes, 'placeholderColor', 'height']),
    同步服务: class {}, OFFICIAL_ANKIWEB_SYNC_UI_ENABLED: true, THEME_TEXT_COLORS_KEY: 'accent',
    颜色键: { 主色按钮背景: 'primary' }, 应用尺寸: { 间距_12: 12, 间距_16: 16, 圆角_卡片: 16, 圆角_面板: 12, dialogMaxWidth: 480 },
    设置面板色板_取: () => ({ 次文字: '#888', 主文字: '#222', 弱化文字: '#aaa', 标签背景: '#eee', 错误色: '#f00' }),
    SurfaceBorder: { options: () => ({}) }, HorizontalAlign: { Center: 'center' },
    DialogAlignment: { Center: 'center' }, SurfaceTransition: { dialogEnterAnimation: () => ({}), dialogExitAnimation: () => ({}) },
    resourceText: () => 'localized-error', syncActivity: { isActive: () => false }, normalizeSyncServer,
    saveCustomSyncServer: async value => {
      seen.saves.push(value);
      if (pendingSave) await pendingSave;
      if (failSave) throw new Error('disk full');
      return normalizeSyncServer(value);
    },
    保存同步凭证: value => { seen.credentials.push(value); },
    saveAutoSyncEnabled: async value => {
      seen.automatic.push(value);
      if (pendingSave) await pendingSave;
      if (failSave) throw Error('disk full');
    }
  });
  const body = source.replace(/^import[^;]*;\s*/gm, '').replace('export class 同步分组', 'class 同步分组');
  vm.runInContext(stripTypeScriptTypes(body, { mode: 'transform' }) + '\nthis.Group = 同步分组;', context, { timeout: 1000 });
  const group = new context.Group(undefined, {});
  group.savedServer = 'https://saved.example/anki/';
  group.serverLoaded = true;
  group.openServerDialog();
  assert.equal(seen.input.text, group.savedServer);
  assert.equal(seen.input.enabled, true);
  assert.equal(seen.frame.nativeHost, true);
  assert.equal(seen.frame.maximumWidth, 480);
  assert.equal(seen.frame.canDismiss, true);
  for (const field of ['serverInput', 'serverError', '当前状态', '登录中', 'settingsSaving']) {
    assert.equal(seen.dialog['__' + field].source, group['__' + field], `${field}: state reference missing`);
  }
  seen.input.change('draft');
  assert.equal(group.serverInput, 'draft', 'TextInput must update the parent draft');
  seen.header.onAction();
  assert.equal(seen.saves.length, 0, 'invalid address cannot be persisted');
  assert.ok(seen.dialog.serverError);
  seen.dialog.initialRender();
  assert.ok(seen.texts.includes(group.serverError), 'validation error must reach the rendered dialog');
  seen.input.change(' https://new.example/anki ');
  failSave = true;
  await group.saveServer();
  assert.equal(group.savedServer, 'https://saved.example/anki/');
  assert.ok(seen.dialog.serverError);
  assert.equal(group.settingsSaving, false);
  failSave = false;
  let finish;
  pendingSave = new Promise(resolve => { finish = resolve; });
  const saving = group.saveServer();
  seen.dialog.initialRender();
  assert.equal(seen.header.actionEnabled, false);
  assert.equal(seen.header.closeEnabled, false);
  assert.equal(seen.input.enabled, false);
  assert.equal(seen.frame.canDismiss, false);
  const active = group.serverDialogController.current();
  group.closeServerDialog();
  seen.frame.onDismiss();
  active.options.onWillDismiss({ dismiss() { throw Error('save cannot be dismissed'); } });
  assert.equal(active.visible, true);
  finish();
  await saving;
  pendingSave = null;
  assert.equal(group.savedServer, 'https://new.example/anki/');
  assert.equal(group.settingsSaving, false);
  assert.equal(active.visible, false);
  group.openServerDialog();
  assert.equal(seen.input.text, group.savedServer, 'reopening must restore the normalized server');
  seen.input.change('https://discarded.example/');
  seen.header.onClose();
  assert.equal(group.serverInput, group.savedServer);
  group.openServerDialog();
  seen.input.change('https://backdrop-discarded.example/');
  seen.frame.onDismiss();
  assert.equal(group.serverInput, group.savedServer, 'common backdrop obeys the same draft cancellation');
  group.openServerDialog();
  seen.input.change('https://dismissed.example/');
  const dismissed = group.serverDialogController.current();
  dismissed.options.onWillDismiss({ dismiss: () => dismissed.close() });
  assert.equal(group.serverInput, group.savedServer);
  group.当前状态 = '已登录';
  group.openServerDialog();
  assert.equal(seen.input.enabled, false);
  assert.equal(seen.header.actionEnabled, false);
  const savedCount = seen.saves.length;
  await group.saveServer();
  assert.equal(seen.saves.length, savedCount, 'logged-in account must not switch servers');
  group.当前状态 = '未登录';
  group.closeServerDialog();
  group.openServerDialog();
  seen.input.change('https://late.example/');
  pendingSave = new Promise(resolve => { finish = resolve; });
  const lateSave = group.saveServer();
  const leaving = group.serverDialogController.current();
  group.aboutToDisappear();
  assert.equal(leaving.visible, false, 'leaving settings must close the linked dialog');
  assert.equal(group.serverDialogController.current(), null);
  group.aboutToBeDeleted();
  let lateDismissals = 0;
  leaving.options.onWillDismiss({ dismiss: () => { lateDismissals++; } });
  assert.equal(lateDismissals, 1, 'late dismissal must not read the destroyed settings state');
  finish();
  await lateSave;
  assert.equal(seen.saves.at(-1), 'https://late.example/', 'accepted persistence continues after leaving');
  // A failed write must also avoid touching state deleted with its settings host.
  failSave = true;
  pendingSave = new Promise(resolve => { finish = resolve; });
  const failedGroup = new context.Group(undefined, {});
  failedGroup.openServerDialog();
  seen.input.change('https://failure.example/');
  const failedLateSave = failedGroup.saveServer();
  failedGroup.aboutToDisappear();
  failedGroup.aboutToBeDeleted();
  finish();
  await failedLateSave;
  pendingSave = null;
  for (const failed of [false, true]) {
    const loginGroup = new context.Group(undefined, {});
    loginGroup.serverLoaded = true;
    loginGroup.用户名输入 = 'captured-user';
    loginGroup.密码输入 = 'transient-password';
    let finishLogin;
    const request = new Promise(resolve => { finishLogin = resolve; });
    loginGroup.同步服务实例.同步登录 = async (...args) => {
      assert.deepEqual(args, ['captured-user', 'transient-password', '']);
      await request;
      if (failed) throw Error('network failed');
      return { hkey: 'test-key', endpoint: '' };
    };
    const login = loginGroup.点击登录();
    loginGroup.aboutToDisappear();
    loginGroup.aboutToBeDeleted();
    finishLogin();
    await login;
  }
  assert.equal(seen.credentials.length, 1);
  assert.equal(seen.credentials[0].username, 'captured-user');
  assert.equal(seen.credentials[0].hkey, 'test-key');
  const confirmGroup = new context.Group(undefined, {});
  const optingIn = confirmGroup.changeAutoSync(true);
  confirmGroup.aboutToDisappear();
  confirmGroup.aboutToBeDeleted();
  seen.alert.secondaryButton.action();
  await optingIn;
  assert.equal(seen.automatic.length, 0, 'leaving before confirmation cannot enable automatic sync');
  for (const failed of [false, true]) {
    failSave = failed;
    pendingSave = new Promise(resolve => { finish = resolve; });
    const autoGroup = new context.Group(undefined, {});
    autoGroup.autoSyncEnabled = true;
    const disabling = autoGroup.changeAutoSync(false);
    autoGroup.aboutToDisappear();
    autoGroup.aboutToBeDeleted();
    finish();
    await disabling;
  }
  assert.deepEqual(seen.automatic, [false, false]);
  return { linkedFields: 5, dialogsOpened: seen.dialogs.length, saveAttempts: seen.saves.length,
    credentialsPersisted: seen.credentials.length, automaticSaveAttempts: seen.automatic.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw Error('Usage: node tools/check-sync-server-compiled.mjs <compiled-同步分组.ts>');
    const path = resolve(process.argv[2]), source = readFileSync(path, 'utf8');
    const result = await checkSyncServerCompiled(source);
    console.log(JSON.stringify({ path, sha256: createHash('sha256').update(source).digest('hex'), ...result }));
  } catch (error) {
    console.error(`[sync-server:compiled] ${error.message}`);
    process.exitCode = 1;
  }
}
