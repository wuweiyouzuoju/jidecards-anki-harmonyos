// SPDX-License-Identifier: AGPL-3.0-or-later
import { sensor } from '@kit.SensorServiceKit';
import { StudyShakeDetector } from '../model/StudyGestureConfig';

/** 只拥有自己的加速度订阅；关闭先切断监听，off 失败仍可安全重试。 */
export class StudyShakeSensor {
  private callback: ((value: sensor.AccelerometerResponse) => void) | null = null;
  private listener: (() => void) | null = null;
  private detector: StudyShakeDetector = new StudyShakeDetector();
  private unavailable: boolean = false;
  clearPending(): void { this.detector.clearPending(); }
  update(enabled: boolean, listener: () => void): string {
    this.listener = enabled ? listener : null;
    if (!enabled) {
      this.unavailable = false;
      this.detector.clearPending();
      if (this.callback !== null) {
        try { sensor.off(sensor.SensorId.ACCELEROMETER, this.callback); this.callback = null; }
        catch (error) { console.error(`Study shake unsubscribe: ${error}`); return 'failed'; }
      }
      return 'off';
    }
    if (this.callback !== null) return 'available';
    if (this.unavailable) return 'failed';
    const callback: (value: sensor.AccelerometerResponse) => void = (value: sensor.AccelerometerResponse): void => {
      if (this.listener !== null && this.detector.sample(value.x, value.y, value.z, Date.now())) this.listener();
    };
    try {
      sensor.getSingleSensorSync(sensor.SensorId.ACCELEROMETER);
      sensor.on(sensor.SensorId.ACCELEROMETER, callback, { interval: 50000000 });
      this.callback = callback;
      return 'available';
    } catch (error) {
      this.unavailable = true;
      this.listener = null;
      console.error(`Study shake subscribe: ${error}`);
      return 'failed';
    }
  }
}
