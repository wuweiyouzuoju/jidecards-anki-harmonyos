// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
export function loadPlatformModule(path, exportName, dependencies) {
  const source = readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8')
    .replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(source, { mode: 'transform' }) + ';return ' + exportName + ';')(...Object.values(dependencies));
}

/** 执行组件的真实非渲染逻辑；不模拟 ArkUI 观察或布局，后者由 HAP/设备验证。 */
export function loadComponentLogic(path, exportName, dependencies) {
  let source = readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  source = source.replace(/^import[^;]+;\s*/gm, '').replace(/^export type[^;]+;\s*/gm, '');
  const build = source.indexOf('  build() {');
  if (build < 0) throw new Error('Component has no render boundary: ' + path);
  source = source.slice(0, build) + source.slice(source.indexOf('\n  }', build) + 4);
  source = source.replace(/@(Component|Prop|State|StorageProp|Watch)(?:\([^\n]*?\))?\s*/g, '')
    .replace('export struct ' + exportName, 'class ' + exportName).replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(source, {mode:'transform'}) + ';return ' + exportName + ';')(...Object.values(dependencies));
}
