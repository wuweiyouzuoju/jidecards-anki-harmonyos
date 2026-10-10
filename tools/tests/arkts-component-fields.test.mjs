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

// 提前拦截已实测会原样留在编译产物中的内联组件链；不代替 HAP/设备验收。
function inlineBuilderComponents(source, builderNames) {
  const component = '(?:Text|Column|Row|Stack|Button|Image|Scroll|List|ForEach)';
  return builderNames.filter(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![$\\u200c\\u200d\\p{ID_Continue}])${escaped}\\s*:\\s*\\([^)]*\\)(?:\\s*:\\s*void)?\\s*=>\\s*\\{\\s*${component}\\s*\\(`, 'u').test(source);
  });
}
function builderParamNames(source) {
  return [...source.matchAll(/@BuilderParam\s+(?:(?:private|public)\s+)?([$\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*)\s*:/gu)]
    .map(match => match[1]);
}

test('BuilderParam callbacks delegate to compiled builders instead of inline declarative component chains', () => {
  assert.deepEqual(inlineBuilderComponents('content: () => { Text(body).fontSize(16) }', ['content']), ['content']);
  assert.deepEqual(inlineBuilderComponents('content: (): void => { Column() { Text(body) } }', ['content']), ['content']);
  assert.deepEqual(inlineBuilderComponents('content: () => { this.paragraph(body); }', ['content']), []);
  assert.deepEqual(inlineBuilderComponents('内容: () => { Text(body).fontSize(16) }', ['内容']), ['内容']);
  assert.deepEqual(inlineBuilderComponents('$content: () => { Column() { Text(body) } }', ['$content']), ['$content']);
  assert.deepEqual(inlineBuilderComponents('父内容: () => { Text(body) }', ['内容']), []);
  assert.deepEqual(builderParamNames('@BuilderParam 内容: () => void; @BuilderParam private $content: () => void;'), ['内容', '$content']);
  const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
  const files = sources(root).map(path => ({ path, source: readFileSync(path, 'utf8') }));
  const builderNames = [...new Set(files.flatMap(({ source }) => builderParamNames(source)))];
  for (const file of files) {
    assert.deepEqual(inlineBuilderComponents(file.source, builderNames), [], file.path);
  }
});
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

function dialogLinkFields(source) {
  return [...source.matchAll(/@CustomDialog\s+(?:export\s+)?struct\s+([$\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*)\s*\{([\s\S]*?)^\}/gmu)]
    .map(match => [match[1], [...match[2].matchAll(/@Link\s+([$\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*)\s*:/gu)].map(field => field[1])]);
}
function unsafeDialogLinks(source, fieldsByDialog) {
  const problems = [];
  for (const match of source.matchAll(/new CustomDialogController\(\{[\s\S]*?builder:\s*([$\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*)\s*\(\s*\{/gu)) {
    const fields = fieldsByDialog.get(match[1]) ?? [];
    if (fields.length === 0) continue;
    // The SDK rewrites custom-component references in field initializers and UI builders,
    // but not inside ordinary methods. Both this.field and $field fail in those methods.
    const methods = source.matchAll(/^  (?:(?:private|public)\s+)?(?:async\s+)?([$\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*)\([^\n]*\)\s*(?::[^\n{]+)?\s*\{/gmu);
    for (const method of methods) {
      const end = source.indexOf('\n  }', method.index);
      const isBuilder = /@(?:LocalBuilder|Builder)\s*$/.test(source.slice(0, method.index));
      if (method.index < match.index && end >= match.index && method[1] !== 'build' && !isBuilder) {
        problems.push(`${match[1]}: @Link builder inside ordinary method ${method[1]}`);
      }
    }
    // Find the end of the params object, including braces in callback bodies.
    let index = match.index + match[0].length, depth = 1, quote = '';
    const start = index;
    while (index < source.length && depth > 0) {
      const char = source[index++];
      if (quote) { if (char === '\\') index++; else if (char === quote) quote = ''; continue; }
      if (char === "'" || char === '"' || char === '`') quote = char;
      else if (char === '{') depth++;
      else if (char === '}') depth--;
    }
    const params = source.slice(start, index - 1);
    for (const field of fields) {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const value = params.match(new RegExp(`(?:^|[,\\n])\\s*${escaped}\\s*:\\s*([^,\\n}]+)`, 'u'))?.[1].trim();
      if (!value || !/^(?:this\.\$?|\$)[$\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(value)) {
        problems.push(`${match[1]}.${field}: ${value ?? 'missing'}`);
      }
    }
  }
  return problems;
}

test('native dialog @Link builders stay in field initializers or UI compiler contexts', () => {
  const fields = new Map([['ServerDialog', ['input', 'busy', '状态']]]);
  const builder = values => `new CustomDialogController({ builder: ServerDialog({ ${values} }) })`;
  const params = 'input: this.input, busy: this.busy, 状态: this.状态';
  assert.deepEqual(unsafeDialogLinks(`struct Host {\n  private createDialog(): void {\n    ${builder(params)}\n  }\n}`, fields),
    ['ServerDialog: @Link builder inside ordinary method createDialog']);
  assert.deepEqual(unsafeDialogLinks(`struct Host {\n  private createDialog(): void {\n    ${builder('input: $input, busy: $busy, 状态: $状态')}\n  }\n}`, fields),
    ['ServerDialog: @Link builder inside ordinary method createDialog']);
  assert.deepEqual(unsafeDialogLinks(builder("input: '', busy: false"), fields),
    ["ServerDialog.input: ''", 'ServerDialog.busy: false', 'ServerDialog.状态: missing']);
  assert.deepEqual(unsafeDialogLinks(`struct Host {\n  private readonly createDialog: () => void = (): void => {\n    ${builder(params)}\n  };\n}`, fields), []);
  assert.deepEqual(unsafeDialogLinks(`struct Host {\n  @Builder\n  private content() {\n    ${builder(params)}\n  }\n}`, fields), []);
  assert.deepEqual(dialogLinkFields('@CustomDialog\nstruct ServerDialog {\n @Link 状态: string;\n @Link input: string;\n}\n'),
    [['ServerDialog', ['状态', 'input']]]);
  const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
  const files = sources(root).map(path => ({ path, source: readFileSync(path, 'utf8') }));
  const allFields = new Map(files.flatMap(file => dialogLinkFields(file.source)));
  for (const file of files) assert.deepEqual(unsafeDialogLinks(file.source, allFields), [], file.path);
});
