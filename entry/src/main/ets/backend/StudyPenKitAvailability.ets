// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileIo } from '@kit.CoreFileKit';

// 系统 HSP 的沙箱映射；兼容打包 HSP 与解包 ABC 两种布局。
const PEN_KIT_MODULE_PATHS: string[] = [
  '/data/storage/el1/bundle/com.huawei.hmos.hwstylusfeature/Penkit/Penkit.hsp',
  '/data/storage/el1/bundle/com.huawei.hmos.hwstylusfeature/Penkit/ets/modules.abc',
  '/data/storage/el1/bundle/com.huawei.hmos.hwstylusfeature/Penkit/Penkit/ets/modules.abc'
];

/** 模拟器可能报告手写 SysCap 却没有系统 HSP，不能以 SysCap 单独决定导入。 */
export function isStudyPenKitAvailable(): boolean {
  if (!canIUse('SystemCapability.Stylus.Handwrite')) return false;
  for (const path of PEN_KIT_MODULE_PATHS) {
    try {
      if (fileIo.accessSync(path)) return true;
    } catch (error) {
      // 不可访问的模块也不能交给加载器；缺少 HSP 会导致原生 abort，无法由 import.catch 接住。
    }
  }
  return false;
}
