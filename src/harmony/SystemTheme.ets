// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceManager } from '@kit.LocalizationKit';

/** API 20+。失败上抛；宿主保留已知系统状态并负责生命周期订阅。 */
export function readSystemDarkMode(): boolean {
  try {
    const configuration: resourceManager.Configuration = resourceManager.getSysResourceManager().getConfigurationSync();
    if (configuration.colorMode === resourceManager.ColorMode.DARK) { return true; }
    if (configuration.colorMode === resourceManager.ColorMode.LIGHT) { return false; }
  } catch {
    throw new Error('System theme read failed');
  }
  throw new Error('System theme unavailable');
}
