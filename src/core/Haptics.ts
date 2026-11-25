// SPDX-License-Identifier: AGPL-3.0-or-later
export interface HapticPulse {
  effectId: string;
  fallbackMs: number;
  delayAfterMs: number;
}

export interface HapticBackend {
  isSupported(effectId: string): Promise<boolean>;
  playPreset(effectId: string): Promise<void>;
  playTimed(durationMs: number): Promise<void>;
  wait(durationMs: number): Promise<void>;
}

/** 沿用当前舒尔特事件语义；等级、奖励和判题由产品决定何时触发。 */
export function hapticPattern(event: string): HapticPulse[] {
  if (event === 'correct') {
    return [{ effectId: 'haptic.effect.soft', fallbackMs: 25, delayAfterMs: 0 }];
  }
  if (event === 'error') {
    return [{ effectId: 'haptic.effect.hard', fallbackMs: 50, delayAfterMs: 0 }];
  }
  if (event === 'complete') {
    return [{ effectId: 'haptic.effect.sharp', fallbackMs: 60, delayAfterMs: 180 },
      { effectId: 'haptic.effect.soft', fallbackMs: 25, delayAfterMs: 0 }];
  }
  throw new Error('Invalid haptic event');
}

/** 最终设备播放失败会上抛；调用方决定提示或记录，不伪装播放成功。 */
export async function playHaptic(event: string, backend: HapticBackend, enabled: boolean): Promise<void> {
  const pulses: HapticPulse[] = hapticPattern(event);
  if (!enabled) { return; }
  for (let index: number = 0; index < pulses.length; index++) {
    const pulse: HapticPulse = pulses[index];
    let supported: boolean = false;
    try { supported = await backend.isSupported(pulse.effectId); } catch { supported = false; }
    let played: boolean = false;
    if (supported) {
      try { await backend.playPreset(pulse.effectId); played = true; } catch { played = false; }
    }
    if (!played) { await backend.playTimed(pulse.fallbackMs); }
    if (index < pulses.length - 1 && pulse.delayAfterMs > 0) { await backend.wait(pulse.delayAfterMs); }
  }
}
