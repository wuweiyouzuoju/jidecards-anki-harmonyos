// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 服务号, 调度器方法, 牌组方法 } from './服务索引';
import { decodeJsonResponse } from '../proto/messages/ConfigMessages';
import { fsrsPresetIdSearch } from '../model/FsrsOptions';
import type { ComputeFsrsParamsInput, ComputeFsrsParamsOutput, SimulateFsrsInput,
  FsrsWorkloadOutput } from '../proto/messages/FsrsMessages';
import { encodeComputeFsrsParams, decodeComputeFsrsParams, encodeSimulateFsrs,
  decodeFsrsWorkload } from '../proto/messages/FsrsMessages';

export class FsrsService {
  async presetSearch(id: number): Promise<string> {
    const bytes = await 后端会话.获取实例().调用(服务号.后端牌组, 牌组方法.getAllDecksLegacy, new Uint8Array(0));
    return fsrsPresetIdSearch(id, decodeJsonResponse(bytes));
  }

  async optimize(input: ComputeFsrsParamsInput): Promise<ComputeFsrsParamsOutput> {
    return decodeComputeFsrsParams(await 后端会话.获取实例().调用(服务号.后端调度器,
      调度器方法.computeFsrsParams, encodeComputeFsrsParams(input)));
  }

  async workload(input: SimulateFsrsInput): Promise<FsrsWorkloadOutput> {
    return decodeFsrsWorkload(await 后端会话.获取实例().调用(服务号.后端调度器,
      调度器方法.simulateFsrsWorkload, encodeSimulateFsrs(input)));
  }
}
