// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { actionMenuRows, toggleActionMenuBranch } from '../../entry/src/main/ets/components/common/ActionMenuTree.ts';
import { APP_INTERFACE_SURFACES, AppInterfaceTracker, visibleInterfaceItems, studyInterfaceMenu, noteEditInterfaceControls } from '../../entry/src/main/ets/model/AppInterface.ts';
import { noteFieldDisplayKey } from '../../entry/src/main/ets/model/NoteTypePresentation.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { CARD_FLAGS, customFlagLabel } from '../../entry/src/main/ets/model/CardMarking.ts';
import { OFFICIAL_ANNOUNCEMENTS_ENABLED } from '../../entry/src/main/ets/model/官方公告配置.ts';

/** 较早的学习生命周期测试仍执行生产方法；补入实际界面观察依赖。标签替身只服务这些键值断言。 */
export function appInterfaceDependencies() {
  const flagMenuChoices = loadPlatformModule('components/common/FlagMenuChoices.ets', 'flagMenuChoices', {
    CARD_FLAGS, customFlagLabel, $r: key => key, namedResourceText: (_context, key) => 'app.string.' + key
  });
  return { appInterface: new AppInterfaceTracker(), OFFICIAL_ANNOUNCEMENTS_ENABLED, visibleInterfaceItems, studyInterfaceMenu, actionMenuRows, toggleActionMenuBranch,
    $r: key => key, CARD_FLAGS, customFlagLabel, flagMenuChoices,
    actionIcon: loadPlatformModule('utils/ActionIcons.ets', 'actionIcon', { $r: key => key }),
    namedResourceText: (_context, key) => 'app.string.' + key, BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND };
}

/** 编辑生命周期回归仍执行真实观察方法；只替换平台资源解析。 */
export function noteInterfaceDependencies() {
  const deps = appInterfaceDependencies();
  return { ...deps, noteEditInterfaceControls, noteFieldDisplayKey,
    interfaceItemText: loadPlatformModule('utils/AppInterfaceText.ets', 'interfaceItemText', { APP_INTERFACE_SURFACES, ...deps }),
    noteFieldText: loadPlatformModule('utils/NoteTypeText.ets', 'noteFieldText', { noteFieldDisplayKey, ...deps }) };
}

export function studyInterfaceMethods(source) {
  return ['更多菜单', 'flagMenuItems', 'toggleStudyMenuBranch', 'studyMenuEntry', 'studyMenuIcon', 'interfaceMenuItems', 'executeMenuAction', 'publishInterface', 'publishStudyMenu'].map(name => {
    const start = source.indexOf('  private ' + name + '(');
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  }).join('\n');
}
