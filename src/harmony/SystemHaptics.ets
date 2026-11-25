// SPDX-License-Identifier: AGPL-3.0-or-later
import { vibrator } from '@kit.SensorServiceKit';
import { HapticBackend } from '../core/Haptics';

/** 目标应用声明 VIBRATE 权限；失败交回调用方，无全局开关或静默假成功。 */
export class SystemHapticBackend implements HapticBackend {
  async isSupported(effectId: string): Promise<boolean> {
    try { return await vibrator.isSupportEffect(effectId); }
    catch { throw new Error('Haptic capability read failed'); }
  }
  async playPreset(effectId: string): Promise<void> {
    const effect: vibrator.VibratePreset = { type: 'preset', effectId: effectId, count: 1 };
    const attribute: vibrator.VibrateAttribute = { id: 0, usage: 'touch' };
    try { await vibrator.startVibration(effect, attribute); }
    catch { throw new Error('Haptic preset failed'); }
  }
  async playTimed(durationMs: number): Promise<void> {
    const effect: vibrator.VibrateTime = { type: 'time', duration: durationMs };
    const attribute: vibrator.VibrateAttribute = { id: 0, usage: 'touch' };
    try { await vibrator.startVibration(effect, attribute); }
    catch { throw new Error('Haptic timed playback failed'); }
  }
  wait(durationMs: number): Promise<void> {
    return new Promise<void>((resolve: () => void): void => { setTimeout(resolve, durationMs); });
  }
}
