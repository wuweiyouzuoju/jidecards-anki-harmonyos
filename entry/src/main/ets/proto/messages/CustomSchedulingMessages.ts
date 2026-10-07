// SPDX-License-Identifier: AGPL-3.0-or-later
import { 协议写入器 } from '../core/ProtoWriter';
import { encodeSchedulingStates } from './SchedulerMessages';
import type { StudyCard } from './SchedulerMessages';

/** App-owned service 1004; state oneofs are decoded and patched only in Rust. */
export const CUSTOM_SCHEDULING_SERVICE = 1004;
export function encodeCustomScheduling(card: StudyCard, resultJson: string = ''): Uint8Array {
  const writer = new 协议写入器();
  writer.写入字节(1, encodeSchedulingStates(card.states));
  writer.写入字节(2, card.schedulingContext ?? new Uint8Array(0));
  writer.写入字符串(3, card.customData ?? '');
  if (resultJson !== '') writer.写入字符串(4, resultJson);
  return writer.转为字节();
}
