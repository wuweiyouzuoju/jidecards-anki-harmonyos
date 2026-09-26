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
