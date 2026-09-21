// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import type { 导出牌组意图, 导出个人数据意图 } from '../model/DataTransferIntent';
import { 导出牌组, 导出集合, 完成导出 } from './数据迁移服务';

/** 导出和文件保存共用一条流程；阶段回调只报告进度，页面负责自己的可见状态。 */
export async function exportPersonalData(context: common.UIAbilityContext,
  intent: 导出牌组意图 | 导出个人数据意图, stage: (value: number) => void): Promise<string | null> {
  const path: string = intent.kind === 'exportDeck'
    ? await 导出牌组(context.filesDir, intent.deckId, intent.options)
    : await 导出集合(context.filesDir, intent.options);
  stage(1);
  const extension: string = intent.kind === 'exportDeck' ? '.apkg' : '.colpkg';
  const fileName: string = intent.kind === 'exportDeck' ? 'jidecards-deck.apkg' : 'jidecards-data.colpkg';
  return 完成导出(context, path, fileName, extension);
}
