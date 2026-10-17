// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHomeIntroCompiled } from '../check-home-intro-compiled.mjs';

// Minimal compiler-shaped fixture tests the checker itself; real output is passed separately after HAP build.
const compiled = `
import { DialogFrame } from 'platform';
class HomeIntroSection extends ViewPU {
  constructor(parent, params) { super(parent); this.content = params.content; }
  initialRender() { this.content(); }
}
export class HomeIntroPanel extends ViewPU {
  initialRender() {
    for (let index = 0; index < 5; index++) {
      ViewPU.create(new HomeIntroSection(this, { content: () => { this.paragraph('body'); } }));
    }
    for (let index = 0; index < 8; index++) Text.create('other text');
  }
  paragraph(body: Resource) {
    this.observeComponentCreation2(() => { Text.create(body); Text.fontSize(16); }, Text);
    Text.pop();
  }
}`;

test('compiled introduction checker executes callback dispatch and native Text creation', () => {
  assert.deepEqual(checkHomeIntroCompiled(compiled), { sections: 5, textNodes: 13 });
});

test('compiled introduction checker rejects the original untransformed inline Text chain', () => {
  const broken = compiled.replace('this.paragraph(\'body\');', "Text('body').fontSize(16);");
  assert.throws(() => checkHomeIntroCompiled(broken), /undefined.*fontSize|fontSize.*undefined/);
});

test('compiled introduction checker rejects skipped content and uncompiled source', () => {
  assert.throws(() => checkHomeIntroCompiled(compiled.replace("this.paragraph('body');", '')), /Text nodes must render/);
  assert.throws(() => checkHomeIntroCompiled(compiled.replace('index < 5', 'index < 4')), /five introduction sections/);
  assert.throws(() => checkHomeIntroCompiled('@Component export struct HomeIntroPanel {}'), /fresh CompileArkTS/);
});
