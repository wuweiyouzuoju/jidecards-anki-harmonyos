// SPDX-License-Identifier: AGPL-3.0-or-later
import { motion } from '@kit.MultimodalAwarenessKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { StudyGripSource } from '../model/StudyGripSession';
import { STUDY_GRIP_AVAILABILITY_KEY, StudyGripAvailability } from '../model/StudyLayout';

/** 保存 callback 身份，取消失败时保留以便重试；能力状态仅由真实订阅结果发布。 */
export class StudyGripSensor implements StudyGripSource {
  private callback: ((status: motion.HoldingHandStatus) => void) | null = null;
  private listener: ((status: number) => void) | null = null;
  private availabilityKey: string;

  constructor(availabilityKey: string = STUDY_GRIP_AVAILABILITY_KEY) { this.availabilityKey = availabilityKey; }

  start(listener: (status: number) => void): StudyGripAvailability {
    if (this.callback !== null) return this.publish('failed');
    if (canIUse('SystemCapability.MultimodalAwareness.Motion')) {
      this.listener = listener;
      const callback: (status: motion.HoldingHandStatus) => void = (status: motion.HoldingHandStatus): void => {
        this.listener?.(status);
      };
      try {
        motion.on('holdingHandChanged', callback);
        this.callback = callback;
        return this.publish('available');
      } catch (error) {
        this.listener = null;
        const code: number = (error as BusinessError).code;
        return this.publish(code === 801 ? 'unsupported' : code === 201 ? 'permission_denied' : 'failed');
      }
    }
    return this.publish('unsupported');
  }

  stop(): boolean {
    this.listener = null;
    if (this.callback === null) return true;
    if (canIUse('SystemCapability.MultimodalAwareness.Motion')) {
      try {
        motion.off('holdingHandChanged', this.callback);
        this.callback = null;
        return true;
      } catch (error) {
        this.publish('failed');
        return false;
      }
    }
    this.publish('failed');
    return false;
  }

  private publish(availability: StudyGripAvailability): StudyGripAvailability {
    AppStorage.setOrCreate<StudyGripAvailability>(this.availabilityKey, availability);
    return availability;
  }
}
