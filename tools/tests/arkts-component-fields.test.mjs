// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 常见 CustomComponent 属性冲突的提前反馈；完整继承/类型检查仍交给 HAP 编译器。
const inherited = new Set(['enabled', 'width', 'height', 'visibility', 'opacity', 'padding', 'margin',
  'backgroundColor', 'borderRadius', 'onClick', 'onTouch', 'onAppear', 'onDisAppear']);
function collisions(source) {
  const fields = source.matchAll(/(?:@(?:State|Prop|Link|StorageProp|StorageLink|Provide|Consume|Watch)(?:\([^\n]*?\))?\s*)+(?:(?:private|public)\s+)?(\w+)\s*:/g);
  return [...fields].map(match => match[1]).filter(name => inherited.has(name));
}
function componentGetters(source) {
  const components = source.matchAll(/(?:^|\n)(?:export\s+)?struct\s+[^\s{]+\s*\{([\s\S]*?)^\}/gm);
  return [...components].flatMap(component =>
    [...component[1].matchAll(/^\s*(?:(?:private|public|protected)\s+)?get\s+([^\s(]+)\s*\(/gm)]
      .map(getter => getter[1]));
}
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : path.endsWith('.ets') ? [path] : [];
  });
}
test('state fields cannot shadow common ArkUI component attribute methods', () => {
  assert.deepEqual(collisions('@State private enabled: boolean = false;'), ['enabled']);
  assert.deepEqual(collisions('@State private isAdvanceEnabled: boolean = false;'), []);
  const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
  for (const path of sources(root)) {
    assert.deepEqual(collisions(readFileSync(path, 'utf8')), [], path);
  }
});

test('ArkUI component getters cannot silently disappear from compiled pages', () => {
  assert.deepEqual(componentGetters('@Component\nstruct Page {\n  private get enabledMode(): boolean { return true; }\n}\n'), ['enabledMode']);
  assert.deepEqual(componentGetters('@Component\nstruct Page {\n  private isEnabled(): boolean { return true; }\n}\nclass Model { get enabled(): boolean { return true; } }'), []);
  const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
  for (const path of sources(root)) {
    assert.deepEqual(componentGetters(readFileSync(path, 'utf8')), [], path);
  }
});

function dialogBuilders(source) {
  return [...source.matchAll(/new CustomDialogController\(\{[\s\S]*?builder:\s*([\p{L}_$][\p{L}\p{N}_$]*)\s*\(/gu)]
    .map(match=>match[1]);
}
test('CustomDialogController builders must provide the generated custom-dialog controller contract', () => {
  assert.deepEqual(dialogBuilders('new CustomDialogController({ builder: NoteLinkDialog({}) })'),['NoteLinkDialog']);
  const root=fileURLToPath(new URL('../../entry/src/main/ets/',import.meta.url));
  const files=sources(root).map(path=>({path,source:readFileSync(path,'utf8')}));
  const customDialogs=new Set(files.flatMap(({source})=>
    [...source.matchAll(/@CustomDialog\s+(?:export\s+)?struct\s+([\p{L}_$][\p{L}\p{N}_$]*)/gu)].map(match=>match[1])));
  for(const file of files)for(const builder of dialogBuilders(file.source)) {
    assert.ok(customDialogs.has(builder),`${file.path}: ${builder} needs @CustomDialog so setController is generated`);
  }
});
