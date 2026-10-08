// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

/** Execute compiler output, replacing only dependencies outside HomeIntroPanel's rendering.
 * This checks initial rendering and BuilderParam dispatch, not ArkUI layout or device compatibility.
 */
export function checkHomeIntroCompiled(source) {
  const seen = { components: [], texts: [] };
  let nextId = 0;
  class ViewPU {
    constructor() { seen.components.push(this.constructor.name); }
    observeComponentCreation2(callback) { callback(++nextId, true); }
    finalizeConstruction() {}
    static create(component) { component.initialRender(); }
  }
  class Property {
    constructor(value) { this.value = value; }
    get() { return this.value; }
    set(value) { this.value = value; }
  }
  function nativeElement(name) {
    // ArkUI declarative calls return undefined: the original Text(body).fontSize must throw.
    const element = () => undefined;
    for (const attribute of ['fontSize', 'fontWeight', 'fontColor', 'textAlign', 'width', 'alignItems',
      'padding', 'backgroundColor', 'borderRadius', 'lineHeight', 'copyOption', 'onClick', 'pop']) {
      element[attribute] = () => {};
    }
    element.create = value => { if (name === 'Text') seen.texts.push(value); };
    return element;
  }
  class DialogFrame {
    constructor(_parent, params) { this.params = params; }
    initialRender() { this.params.header(); this.params.content(); }
  }
  class DialogHeader { initialRender() {} }
  class IridescentThemePreview { initialRender() {} }
  const context = vm.createContext({
    ViewPU, SynchedPropertyObjectOneWayPU: Property, DialogFrame, DialogHeader, IridescentThemePreview,
    Text: nativeElement('Text'), Column: nativeElement('Column'), Span: nativeElement('Span'),
    应用尺寸: { 间距_12: 12, 间距_8: 8, 字号_正文: 16, 字号_正文_小: 14, 字号_按钮: 16, 圆角_面板: 12 },
    OFFICIAL_QQ_GROUP: 'group', FontWeight: { Bold: 'bold', Medium: 'medium' },
    HorizontalAlign: { Start: 'start', Center: 'center' }, TextAlign: { Start: 'start', Center: 'center' },
    CopyOptions: { LocalDevice: 'local' }
  });
  assert.match(source, /export class HomeIntroPanel extends ViewPU/,
    'Pass the fresh CompileArkTS HomeIntroPanel.ts output, not the .ets source.');
  const body = source.replace(/^import[^;]*;\s*/gm, '').replace('export class HomeIntroPanel', 'class HomeIntroPanel');
  vm.runInContext(stripTypeScriptTypes(body, { mode: 'transform' }) +
    '\nViewPU.create(new HomeIntroPanel(undefined, {}));', context, { timeout: 1000 });
  const sections = seen.components.filter(name => name === 'HomeIntroSection').length;
  assert.equal(sections, 6, 'all six introduction sections must render');
  // Six headings, four paragraphs, four source blocks, a theme block and its preview caption.
  assert.equal(seen.texts.length, 16, 'all introduction Text nodes must render');
  return { sections, textNodes: seen.texts.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw Error('Usage: node tools/check-home-intro-compiled.mjs <compiled-HomeIntroPanel.ts>');
    const path = resolve(process.argv[2]);
    const source = readFileSync(path, 'utf8');
    const result = checkHomeIntroCompiled(source);
    console.log(JSON.stringify({ path, sha256: createHash('sha256').update(source).digest('hex'), ...result }));
  } catch (error) {
    console.error(`[home-intro:compiled] ${error.message}`);
    process.exitCode = 1;
  }
}
