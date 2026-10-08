// SPDX-License-Identifier: AGPL-3.0-or-later
import { JideCustomSchedulingRequest } from '../generated/CoreMessages';
import { CustomSchedulingRpc } from '../generated/PrivateRpc';
import { encodeSchedulingStates } from './SchedulerMessages';
import type { StudyCard } from './SchedulerMessages';
/** App-owned service 1004; state oneofs are decoded and patched only in Rust. */
export const CUSTOM_SCHEDULING_SERVICE = CustomSchedulingRpc.SERVICE;
export function encodeCustomScheduling(card: StudyCard, resultJson: string = ''): Uint8Array {
    const writer = new JideCustomSchedulingRequest();
    writer.setStates(encodeSchedulingStates(card.states));
    writer.setContext(card.schedulingContext ?? new Uint8Array(0));
    writer.setCustomData(card.customData ?? '');
    if (resultJson !== '')
        writer.setResultJson(resultJson);
    return writer.转为字节();
}
