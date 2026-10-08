// SPDX-License-Identifier: AGPL-3.0-or-later
import { deviceInfo } from '@kit.BasicServicesKit';

export interface StudyPenKitAvailability {
  available: boolean;
  reason: string;
}

/** 真机按官方 SysCap 决定接入，不能要求系统 HSP 在加载前已映射到文件沙箱。 */
export function studyPenKitAvailability(): StudyPenKitAvailability {
  if (!canIUse('SystemCapability.Stylus.Handwrite')) {
    return { available: false, reason: 'capability_missing' };
  }
  // 官方不支持仿真环境；已知型号直接回退，不能以内部 HSP 路径推断支持。
  if (deviceInfo.productModel.toLowerCase() === 'emulator') {
    return { available: false, reason: 'emulator_unsupported' };
  }
  return { available: true, reason: '' };
}

export function isStudyPenKitAvailable(): boolean {
  return studyPenKitAvailability().available;
}
