// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { uiFeedback } from './ui-feedback-harness.mjs';
import { CoreRpc } from '../../entry/src/main/ets/proto/generated/CoreRpc.ts';
import * as privateRpc from '../../entry/src/main/ets/proto/generated/PrivateRpc.ts';
import * as coreMessages from '../../entry/src/main/ets/proto/generated/CoreMessages.ts';

function localeDependencies(dependencies) {
  return {
    CoreRpc, ...privateRpc, ...coreMessages,
    localizedResourceText: (context, _locale, resource, ...args) =>
      (dependencies.resourceText ?? uiFeedback.resourceText)(context, resource, ...args),
    localizedNamedResourceText: (context, _locale, name, ...args) =>
      (dependencies.namedResourceText ?? uiFeedback.namedResourceText)(context, name, ...args),
    ...dependencies
  };
}
export function loadPlatformModule(path, exportName, dependencies) {
  return loadPlatformSource(readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8'), exportName, dependencies);
}
export function loadPlatformSource(source, exportName, dependencies) {
  dependencies = localeDependencies(dependencies);
  source = source.replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(source, { mode: 'transform' }) + ';return ' + exportName + ';')(...Object.values(dependencies));
}

/** 仅替换原生 Scroller；展开请求和取消仍执行公共控制器。 */
export function expansionRevealDependencies() {
  return { ExpansionReveal: loadPlatformModule('utils/ExpansionReveal.ets', 'ExpansionReveal', {
  }) };
}

/** 执行组件的真实非渲染逻辑；不模拟 ArkUI 观察或布局，后者由 HAP/设备验证。 */
export function loadComponentLogic(path, exportName, dependencies) {
  dependencies = localeDependencies(dependencies);
  let source = readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  source = source.replace(/^import[^;]+;\s*/gm, '').replace(/^export type[^;]+;\s*/gm, '');
  source = source.replace(/^export\s*\{[^}]+\}\s*from[^;]+;\s*/gm, '');
  source = source.replace(/^@Builder\nexport function[\s\S]*?^}\n/gm, '');
  source = source.replace(/^  @Builder\n[^\n]+\{\}\n/gm, '');
  source = source.replace(/^  @Builder\n[\s\S]*?^  }\n/gm, '');
  const build = source.indexOf('  build() {');
  if (build < 0) throw new Error('Component has no render boundary: ' + path);
  source = source.slice(0, build) + source.slice(source.indexOf('\n  }', build) + 4);
  source = source.replace(/@(CustomDialog|Component|BuilderParam|ObjectLink|Prop|State|Provide|Consume|StorageProp|StorageLink|Watch)(?:\([^\n]*?\))?\s*/g, '')
    .replace(new RegExp('(?:export )?struct ' + exportName), 'class ' + exportName).replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(source, {mode:'transform'}) + ';return ' + exportName + ';')(...Object.values(dependencies));
}
