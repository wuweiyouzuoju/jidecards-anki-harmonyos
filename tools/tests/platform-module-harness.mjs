// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { uiFeedback } from './ui-feedback-harness.mjs';
import { CoreRpc } from '../../entry/src/main/ets/proto/generated/CoreRpc.ts';
import * as privateRpc from '../../entry/src/main/ets/proto/generated/PrivateRpc.ts';
import * as coreMessages from '../../entry/src/main/ets/proto/generated/CoreMessages.ts';
import { MenuHoldController } from '../../entry/src/main/ets/model/MenuHoldController.ts';
import { MenuSlideScope, menuSlideSession } from '../../entry/src/main/ets/model/MenuSlideSession.ts';
import { keyboardViewportHeight } from '../../entry/src/main/ets/model/WindowSafeLayout.ts';
import { KeyboardPressSession } from '../../entry/src/main/ets/model/KeyboardInput.ts';
import { AgentTaskPlan } from '../../entry/src/main/ets/model/agent/AgentTaskPlan.ts';

// 直接执行公共窗口管理器；只在调用方替换平台窗口。
export function nativeDialogHostClass(dependencies = {}) {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/common/NativeDialogHost.ets', import.meta.url), 'utf8')
    .replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
  return new Function('SurfaceTransition', 'Color', 'DialogAlignment',
    stripTypeScriptTypes(source, { mode: 'transform' }) + ';return NativeDialogHost;')(
    dependencies.SurfaceTransition, dependencies.Color ?? { Transparent: 'transparent' },
    dependencies.DialogAlignment ?? { Center: 'center' });
}
export const NativeDialogHost = nativeDialogHostClass();

/** 保留真实字段工厂和窗口拥有者，使方法级回归也执行公共生命周期。 */
export function nativeDialogMembers(source, excluded = []) {
  source = source.replaceAll('\r\n', '\n');
  const fields = [...source.matchAll(/^  private readonly (\w+): NativeDialogHost[^\n]+/gm)].map(match => match[0]);
  for (const match of source.matchAll(/^  private readonly (\w+):[^\n]+/gm)) {
    if (excluded.includes(match[1])) continue;
    const end = source.indexOf('\n  };', match.index);
    if (end < 0) continue;
    const field = source.slice(match.index, end + 6);
    if (field.includes('new CustomDialogController(') && !field.includes('\n  private ')) fields.push(field);
  }
  return fields.join('\n');
}

function localeDependencies(dependencies) {
  return {
    MenuHoldController, MenuSlideScope, menuSlideSession, keyboardViewportHeight, AgentTaskPlan, KeyboardPressSession, StudyKeyboardSession: KeyboardPressSession,
    NativeDialogHost: nativeDialogHostClass(dependencies),
    Scroller: class { currentOffset() { return {xOffset:0,yOffset:0}; } scrollBy() {} scrollToIndex() {} },
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
    Scroller: class { scrollEdge() {} }, Edge: { Bottom: 'bottom' }
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
