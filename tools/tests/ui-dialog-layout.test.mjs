// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
// Execute production methods; ArkUI rendering and @Watch delivery require the SDK/device.
function instance(path, methods, state = {}) {
  const source = read(path);
  const code = methods.map(name => {
    const start = source.search(new RegExp(`^  (?:private )?${name}\\(`, 'm'));
    assert.notEqual(start, -1, `${path}: ${name}`);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  }).join('\n');
  const Host = new Function(stripTypeScriptTypes(`class Host {${code}}`, { mode: 'transform' }) + '; return Host;')();
  return Object.assign(new Host(), state);
}

test('browser Back dismisses help and forms before the retained preview', () => {
  let previews=0;
  const page=instance('pages/浏览页.ets',['onBackPress'],{显示说明浮层:true,显示查找替换:true,batchDialog:'none',显示预览:true,
    previewBackHandler:()=>{previews++;return false}});
  page.onBackPress();assert.equal(page.显示说明浮层,false);assert.equal(page.显示查找替换,true);
  page.onBackPress();assert.equal(page.显示查找替换,false);assert.equal(page.显示预览,true);assert.equal(previews,0);
  page.onBackPress();assert.equal(page.显示预览,false);assert.equal(previews,1);
});
test('browser mutation blocks Back for rename, replace and batch independently',()=>{
  for(const overlay of ['显示标签重命名','显示查找替换','batch']){
    const page=instance('pages/浏览页.ets',['onBackPress'],{mutationBusy:true,batchDialog:overlay==='batch'?'due':'none',
      batchBackRequest:0,[overlay]:true});
    assert.equal(page.onBackPress(),true);assert.equal(page[overlay],true);assert.equal(page.batchBackRequest,0);
  }
});
test('independent editor Back closes loading, blocks saving and delegates dirty confirmation',()=>{
  let closes=0;
  const page=instance('pages/EditNotePage.ets',['requestBack'],{backRequest:0,editor:{note:null,busy:true},pathStack:{pop(){closes++}}});
  page.requestBack();assert.equal(closes,1);page.editor.note={fields:['draft']};page.requestBack();assert.equal(closes,1);
  page.editor.busy=false;page.requestBack();assert.equal(page.backRequest,1);assert.equal(closes,1);
});

function navigationBack(path, state) {
  const source = read(path);
  const start = source.indexOf('.onBackPressed(') + '.onBackPressed('.length;
  const end = source.indexOf('\n    })', start) + '\n    }'.length;
  assert.ok(start > 15 && end > start, path);
  return new Function(stripTypeScriptTypes(`const callback = ${source.slice(start, end)};`) + '; return callback;').call(state);
}

test('settings keeps the category while closing licenses or forwarding Back to a child', () => {
  const state = { transfer: { phase: 'idle', visible: false }, 显示许可证: true,
    activeSection: 'about', settingsBackRequest: 0 };
  const back = navigationBack('pages/设置页.ets', state);
  assert.equal(back(), true);
  assert.equal(state.显示许可证, false);
  assert.equal(state.activeSection, 'about');
  assert.equal(state.settingsBackRequest, 0);
  assert.equal(back(), true);
  assert.equal(state.settingsBackRequest, 1);
  state.transfer.phase = 'writing';
  assert.equal(back(), true);
  assert.equal(state.settingsBackRequest, 1);
});

test('statistics help consumes one Back; reminder save blocks closing until finished', () => {
  const stats = { 显示分区帮助: true };
  const backStats = navigationBack('pages/统计页.ets', stats);
  assert.equal(backStats(), true); assert.equal(stats.显示分区帮助, false);
  assert.equal(backStats(), false);
  const reminder = { 显示编辑面板: true, 面板保存中: true };
  const backReminder = navigationBack('pages/学习提醒页.ets', reminder);
  assert.equal(backReminder(), true); assert.equal(reminder.显示编辑面板, true);
  reminder.面板保存中 = false;
  assert.equal(backReminder(), true); assert.equal(reminder.显示编辑面板, false);
  assert.equal(backReminder(), false);
});

const guardedPanels = [
  ['settings/备份管理面板', ['busy']],
  ['settings/媒体管理面板', ['检查中', '处理中']],
  ['settings/空卡列表面板', ['检查中', '处理中']],
  ['settings/查找重复对话框', ['加载中']],
  ['settings/笔记类型管理面板', ['加载中', '处理中']],
  ['settings/笔记类型编辑器', ['保存中']],
  ['home/自定义学习对话框', ['处理中']],
  ['home/创建过滤牌组面板', ['处理中']],
  ['browser/BrowserBatchConfirm', ['busy']],
  ['browser/BrowserDeckDialog', ['busy']],
  ['browser/BrowserDueDialog', ['busy']],
  ['browser/BrowserFlagDialog', ['busy']],
  ['browser/BrowserRepositionDialog', ['busy', 'loading']],
  ['browser/BrowserNotetypeFeature', ['busy', 'state.busy']]
];
for (const [path, guards] of guardedPanels) {
  test(`${path}: Back is consumed while busy and closes once available`, () => {
    let closes = 0;
    const component = instance(`components/${path}.ets`, ['handleBackRequest'], {
      state: { busy: false }, onClose() { closes++; }
    });
    for (const guard of guards) {
      const [owner, key] = guard.includes('.') ? [component.state, 'busy'] : [component, guard];
      owner[key] = true;
      component.handleBackRequest();
      assert.equal(closes, 0, guard);
      owner[key] = false;
    }
    component.handleBackRequest();
    assert.equal(closes, 1);
    assert.match(read(`components/${path}.ets`), /@Prop @Watch\('handleBackRequest'\) backRequest/);
  });
}

test('settings forwards Back to the top child before navigating out of its category', () => {
  const page = instance('components/设置面板.ets', ['handleBackRequest', 'navigateBack'], {
    显示笔记类型编辑器: true, 显示笔记类型管理: true, 显示说明浮层: true,
    notetypeEditorBackRequest: 0, notetypeManagerBackRequest: 0, activeSection: 'data',
    内容滚动器: { scrollToIndex() {} }
  });
  page.handleBackRequest();
  assert.equal(page.notetypeEditorBackRequest, 1);
  assert.equal(page.notetypeManagerBackRequest, 0);
  assert.equal(page.activeSection, 'data');
  page.显示笔记类型编辑器 = false;
  page.handleBackRequest();
  assert.equal(page.notetypeManagerBackRequest, 1);
  page.显示笔记类型管理 = false;
  page.handleBackRequest();
  assert.equal(page.显示说明浮层, false);
  assert.equal(page.activeSection, 'data');
  page.handleBackRequest();
  assert.equal(page.activeSection, '');
});

test('deck options preserve the form while Back leaves help, section and advanced panel', () => {
  let closes = 0;
  const panel = instance('components/高级牌组选项面板.ets', ['handleBackRequest', 'closeSection'], {
    showHelp: true, newExpanded: true, form: { learningSteps: '1 10' },
    hasActiveSection() { return this.newExpanded; }, onClose() { closes++; }
  });
  panel.handleBackRequest();
  assert.equal(panel.showHelp, false);
  assert.equal(panel.newExpanded, true);
  panel.handleBackRequest();
  assert.equal(panel.newExpanded, false);
  assert.equal(closes, 0);
  panel.handleBackRequest();
  assert.equal(closes, 1);
  assert.deepEqual(panel.form, { learningSteps: '1 10' });
  const parent = instance('components/牌组选项面板.ets', ['handleBackRequest'], {
    showAdvanced: true, advancedBackRequest: 0, onCancel() { closes++; }
  });
  parent.handleBackRequest();
  assert.equal(parent.advancedBackRequest, 1);
  assert.equal(closes, 1);
});

test('Back cancels cropping without closing or discarding the deck customization draft', () => {
  let closes = 0;
  const panel = instance('components/牌组定制面板.ets', ['handleBackRequest', '取消裁剪'], {
    裁剪模式: true, 待裁剪Uri: 'file://new', 描述草稿: 'kept', onClose() { closes++; }
  });
  panel.handleBackRequest();
  assert.equal(panel.裁剪模式, false);
  assert.equal(panel.待裁剪Uri, '');
  assert.equal(panel.描述草稿, 'kept');
  assert.equal(closes, 0);
  panel.busy = true; panel.handleBackRequest(); assert.equal(closes, 0);
  panel.busy = false; panel.handleBackRequest(); assert.equal(closes, 1);
});

test('native redemption dismissal retains in-flight input and clears it after the operation', () => {
  let dismisses = 0;
  const panel = instance('components/settings/RedemptionPanel.ets', ['closeRedemption', 'dismissRedemption'], {
    expanded: true, busy: true, code: 'draft'
  });
  const action = { dismiss() { dismisses++; } };
  panel.closeRedemption(); panel.dismissRedemption(action);
  assert.equal(panel.expanded, true); assert.equal(panel.code, 'draft'); assert.equal(dismisses, 0);
  panel.busy = false; panel.dismissRedemption(action);
  assert.equal(panel.expanded, false); assert.equal(panel.code, ''); assert.equal(dismisses, 1);
});

test('the shared frame dismisses only when the owner allows it', () => {
  let closes = 0;
  const frame = instance('components/common/DialogFrame.ets', ['dismiss'], {
    canDismiss: false, onDismiss() { closes++; }
  });
  frame.dismiss(); assert.equal(closes, 0);
  frame.canDismiss = true; frame.dismiss(); assert.equal(closes, 1);
});

test('shared chrome owns theme, scroll limits and safe areas; slots retain their owner', () => {
  const backdrop = read('components/common/DialogBackdrop.ets');
  assert.match(backdrop, /@StorageProp\('themeMode'\)/);
  assert.match(backdrop, /@StorageProp\('systemDarkMode'\)/);
  assert.match(backdrop, /backgroundBlurStyle\(BlurStyle.Thin/);
  assert.match(backdrop, /expandSafeArea/);
  const frame = read('components/common/DialogFrame.ets');
  assert.match(frame, /Scroll\(\)[\s\S]*maxHeight:[\s\S]*viewportHeight/);
  assert.match(frame, /this.header\(\)[\s\S]*flexShrink\(0\)/);
  for (const path of readdirSync(root, { recursive: true }).filter(p => p.endsWith('.ets'))) {
    const source = read(path.replaceAll('\\', '/'));
    if (source.includes('DialogFrame({')) {
      assert.match(source, /header: \(\) => \{ this\./, path);
      assert.match(source, /content: \(\) => \{ this\./, path);
      assert.doesNotMatch(source, /header: this\.|content: this\./, path);
    }
    if (source.includes('backgroundBlurStyle(BlurStyle.Thin')) {
      assert.equal(path.replaceAll('\\', '/'), 'components/common/DialogBackdrop.ets',
        `${path}: standard frosted modal scrims must reuse DialogBackdrop`);
    }
  }
});

test('loading deck options offers close/retry without a no-op primary action', () => {
  const source = read('components/home/DeckOptionsFeature.ets');
  assert.match(source, /private statusHeader\(\)[\s\S]*showAction: false/);
  assert.match(source, /DialogFrame\(/);
  let closes = 0;
  const panel = instance('components/home/DeckOptionsFeature.ets', ['handleBackRequest'], {
    form: null, options: null, onClose() { closes++; }
  });
  panel.handleBackRequest(); assert.equal(closes, 1);
  panel.form = {}; panel.options = {}; panel.handleBackRequest(); assert.equal(closes, 1);
});

test('type and mapping selections reject changes while loading or submitting', () => {
  const source = read('components/browser/BrowserNotetypeFeature.ets');
  const handlers = [...source.matchAll(/\.onSelect\((\([^\n]+=> \{[\s\S]*?)\n\s*\}\)/g)];
  assert.equal(handlers.length, 3);
  let changes = 0;
  const host = { busy: true, state: { busy: false, names: [{ id: 10 }] },
    session: { select() { changes++; }, setField() { changes++; }, setTemplate() { changes++; } } };
  for (const handler of handlers) {
    const code = stripTypeScriptTypes(`const 索引 = 0; const callback = ${handler[1]}\n};`);
    const callback = new Function(code + '; return callback;').call(host);
    host.busy = true; callback(0);
    host.busy = false; host.state.busy = true; callback(0);
    assert.equal(changes, 0);
    host.state.busy = false; callback(0);
    assert.equal(changes, 1);
    changes = 0;
  }
});
