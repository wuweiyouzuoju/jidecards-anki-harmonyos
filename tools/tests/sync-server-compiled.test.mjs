// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSyncServerCompiled } from '../check-sync-server-compiled.mjs';

// Compiler-shaped counterexamples check the validator; fresh HAP output is executed separately.
const fields = ['serverInput', 'serverError', '当前状态', '登录中', 'settingsSaving'];
function badBinding(field, value) {
  return `
export class 同步分组 extends ViewPU {
  constructor(parent, params) {
    super(parent);
    ${fields.map(name => `this.__${name} = new ObservedPropertySimplePU('', this, '${name}');`).join('\n')}
  }
  openServerDialog() {
    this.serverDialogController = new CustomDialogController({ builder: () => {
      ViewPU.create(new 自定义服务器弹窗(this, {
        ${fields.map(name => `${name}: ${name === field ? value : `this.__${name}`}`).join(',\n')}
      }));
    }});
    this.serverDialogController.open();
  }
}
class 自定义服务器弹窗 extends ViewPU {
  constructor(parent, params) {
    super(parent);
    ${fields.map(name => `this.__${name} = new SynchedPropertySimpleTwoWayPU(params.${name}, this, '${name}');`).join('\n')}
  }
}`;
}
test('compiled server checker rejects each primitive Link argument before dialog rendering', async () => {
  for (const field of fields) {
    await assert.rejects(checkSyncServerCompiled(badBinding(field,
      field === '登录中' || field === 'settingsSaving' ? 'false' : "''")), /source.addSubscriber is not a function/);
  }
});
test('compiled server checker refuses source and missing dialog output', async () => {
  await assert.rejects(checkSyncServerCompiled('@Component export struct 同步分组 {}'), /fresh CompileArkTS/);
  await assert.rejects(checkSyncServerCompiled('export class 同步分组 extends ViewPU {}'), /dialog is missing/);
});
