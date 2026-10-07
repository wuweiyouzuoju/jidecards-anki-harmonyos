// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { CUSTOM_SCHEDULING_SERVICE, encodeCustomScheduling } from '../proto/messages/CustomSchedulingMessages';
import { decodeSchedulingStates } from '../proto/messages/SchedulerMessages';
import type { StudyCard, SchedulingStatesRaw } from '../proto/messages/SchedulerMessages';
import { decodeStringResponse } from '../proto/messages/LinksMessages';
import { schedulingScriptSource } from '../model/CustomScheduling';
import type { SchedulingScriptRuntime } from '../model/CustomScheduling';

/** Owns the read-only prepare → sandbox → validated wire patch boundary. No collection writes. */
export class CustomSchedulingService {
  private runtime: SchedulingScriptRuntime;
  private session: 后端会话 = 后端会话.获取实例();
  constructor(runtime: SchedulingScriptRuntime) { this.runtime = runtime; }
  async apply(card: StudyCard, script: string): Promise<SchedulingStatesRaw> {
    const input: string = decodeStringResponse(await this.session.调用(CUSTOM_SCHEDULING_SERVICE, 0, encodeCustomScheduling(card)));
    const result: string = await this.runtime.execute(schedulingScriptSource(script), input);
    return decodeSchedulingStates(await this.session.调用(CUSTOM_SCHEDULING_SERVICE, 1, encodeCustomScheduling(card, result)));
  }
}
