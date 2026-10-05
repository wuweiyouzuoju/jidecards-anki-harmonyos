// SPDX-License-Identifier: AGPL-3.0-or-later

// 数据迁移服务：Anki 包（.apkg）与集合包（.colpkg）导入导出的高层边界。
// 职责：
//   - 导出：把后端生成的沙箱文件经 DocumentViewPicker 落地到用户选择的位置
//   - 导入：把用户选择的文件复制到沙箱、调用后端、清理临时文件
//   - 安全副本与回滚编排；文件 IO 委托 DataTransferFiles 的异步适配
// 不持有 UI 状态；UI 通过 completion 回调或返回值感知进度与结果。
// 错误键（如 transfer_confirmation_required）由 UI 层本地化，不在本边界翻译。

import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { ImportOperation } from '../model/ImportOperation';
import { withImportProgress } from './ImportProgressService';
import { checkReplacementSpace, prepareReplacementRecovery, markReplacementCommitted,
  recoverInterruptedReplacement, cleanupReplacementRecovery } from './TransferRecovery';
import { 确保目录存在, 复制URI到沙箱, 按描述符复制文件, 静默删除 } from './DataTransferFiles';
import { 后端会话 } from './后端会话';
import { 导入导出方法, 服务号 } from './服务索引';
import type { TextExportOptions } from '../proto/messages/TextExportMessages';
import { encodeTextExportRequest } from '../proto/messages/TextExportMessages';
import type { ExportSubset } from '../proto/messages/ExportLimitMessages';
import type { ImportSummary, ImportAnkiPackageOptions } from '../proto/messages/ImportExportMessages';
import {
  decodeImportResponse,
  encodeExportAnkiPackageRequest,
  encodeExportCollectionPackageRequest,
  encodeImportAnkiPackageRequest,
  encodeImportCollectionPackageRequest
} from '../proto/messages/ImportExportMessages';

export interface 牌组导出选项 {
  withScheduling: boolean;
  withDeckConfigs: boolean;
  withMedia: boolean;
  legacy: boolean;
}

export interface 集合导出选项 {
  includeMedia: boolean;
  legacy: boolean;
}

const 集合文件名: string = 'collection.anki2';
const 媒体库文件名: string = 'collection.mdb';
const 媒体目录名: string = 'collection.media';
let 迁移输出ID: number = 0;


export type 数据迁移校验键 = 'transfer_confirmation_required';

/** Stable presentation key for transfer preconditions; UI code owns localization. */
export class 数据迁移校验错误 extends Error {
  readonly messageKey: 数据迁移校验键;

  constructor(messageKey: 数据迁移校验键) {
    super(messageKey);
    this.messageKey = messageKey;
  }
}

// ========================================================
// @块ID BACKEND-SVC-DATATRANSFER-001
// @名称 数据迁移·导出
//
// @作用
// 把后端生成的沙箱导出文件落地到用户选择的位置：
//   - 导出牌组：单个牌组（含子牌组）→ .apkg
//   - 导出集合：全部个人数据 → .colpkg
//   - 完成导出：经 DocumentViewPicker 把沙箱文件保存到用户目录
// 后端 export_collection_package 会消费 collection 不放回，导出后必须重开。
//
// @输入
// 文件目录 / 牌组ID / 选项（牌组导出选项|集合导出选项）
// 完成导出还需：上下文 / 沙箱路径 / 文件名 / 扩展名
//
// @输出
// 导出牌组、导出集合：Promise<string>（沙箱文件路径）
// 完成导出：Promise<string | null>（用户选择的目标 URI；用户取消返回 null）
//
// @业务规则
// 导出牌组失败时静默删除已生成的沙箱文件，让原始错误正常传播。
// 导出集合后必须调 标记集合已消费 + 确保已打开（重开），否则下一次后端调用报 CollectionNotOpen。
// legacy=true 时 V11 schema 降级同样依赖此重开路径。
// 重开失败不得掩盖导出结果：成功路径让 return 正常返回，失败路径让原始导出错误正常传播。
// 完成导出后无论用户是否选择目标，沙箱文件都应清理。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，修改 Anki collection 状态。
// 写入沙箱 exports 目录；通过 DocumentViewPicker 写入用户选择的目标位置。
// ========================================================

/** Exports a selected deck and its children into an Anki .apkg sandbox file. */
/** @throws {Error} 导出文件创建或后端导出失败，交由导出入口显示错误。 */
export async function 导出牌组(
  文件目录: string,
  牌组ID: number,
  选项: 牌组导出选项
): Promise<string> {
  const 输出路径 = await 生成输出路径(文件目录, 'deck', 'apkg');
  try {
    await 后端会话.获取实例().调用(
      服务号.后端导入导出,
      导入导出方法.导出Anki包,
      encodeExportAnkiPackageRequest(输出路径, 牌组ID, 选项)
    );
    return 输出路径;
  } catch (error) {
    await 静默删除(输出路径);
    throw error;
  }
}

/** @throws {Error} 文本导出失败保留原始错误并清理临时文件。 */
export async function exportText(filesDir: string, deckId: number, options: TextExportOptions): Promise<string> {
  const path = await 生成输出路径(filesDir, 'text', 'txt');
  try {
    await 后端会话.获取实例().调用(服务号.后端导入导出,
      options.kind === 'notes' ? 导入导出方法.exportNoteCsv : 导入导出方法.exportCardCsv,
      encodeTextExportRequest(path, deckId, options));
    return path;
  } catch (error) {
    await 静默删除(path);
    throw error;
  }
}

/** JIDE 的确认子集使用 Core 原生范围，临时文件仍归现有导出生命周期。
 * @throws {Error} 路径或 Core 导出失败交给确认执行器；临时文件仍清理。 */
export async function exportSubset(filesDir: string, subset: ExportSubset, format: string,
  withMedia: boolean, withScheduling: boolean): Promise<string> {
  if (format !== 'apkg' && format !== 'text') throw new Error('invalid_export_format');
  const path = await 生成输出路径(filesDir, 'subset', format === 'apkg' ? 'apkg' : 'txt');
  try {
    const bytes: Uint8Array = format === 'apkg' ? encodeExportAnkiPackageRequest(path, 0,
      { withScheduling: withScheduling, withMedia: withMedia, withDeckConfigs: withScheduling, legacy: false }, subset) :
      encodeTextExportRequest(path, 0, { kind: subset.mode === 'notes' ? 'notes' : 'cards',
        withHtml: true, withTags: true, withDeck: true, withNotetype: true, withGuid: true }, subset);
    await 后端会话.获取实例().调用(服务号.后端导入导出, format === 'apkg' ? 导入导出方法.导出Anki包 :
      subset.mode === 'notes' ? 导入导出方法.exportNoteCsv : 导入导出方法.exportCardCsv, bytes);
    return path;
  } catch (error) { await 静默删除(path); throw error; }
}

/** Exports all personal Anki data into a sandbox .colpkg file. */
/** @throws {Error} 导出文件创建或后端导出失败，交由导出入口显示错误。 */
export async function 导出集合(
  文件目录: string,
  选项: 集合导出选项
): Promise<string> {
  const 输出路径 = await 生成输出路径(文件目录, 'collection', 'colpkg');
  const 会话 = 后端会话.获取实例();
  try {
    await 会话.调用(
      服务号.后端导入导出,
      导入导出方法.导出集合包,
      encodeExportCollectionPackageRequest(输出路径, 选项)
    );
    return 输出路径;
  } catch (error) {
    await 静默删除(输出路径);
    throw error;
  } finally {
    // 后端 export_collection_package 通过 guard.take() 消费 collection 不放回，
    // 必须修正本地状态并重开，否则下一次后端调用报 CollectionNotOpen。
    // legacy=true 时 V11 schema 降级同样依赖此重开路径。
    // 重开失败不得掩盖导出结果：成功路径让 return outPath 正常返回（文件已生成），
    // 失败路径让 catch 中已抛出的原始导出错误正常传播，UI 才能看到真实失败原因。
    await 会话.标记集合已消费();
    try {
      await 会话.确保已打开(文件目录);
    } catch (reopenError) {
      // 重开失败留待下次 ensureOpen 重试；不得掩盖导出结果或原始导出错误。
    }
  }
}

/**
 * Completes a previously exported sandbox file through Harmony's document saver.
 * Task 6 owns invoking this UI-context boundary after receiving an export intent.
 */
/** @throws {Error} 保存目标不可写，交由导出入口显示错误。 */
export async function 完成导出(
  上下文: common.UIAbilityContext,
  沙箱路径: string,
  文件名: string,
  扩展名: string
): Promise<string | null> {
  return 保存沙箱导出(上下文, 沙箱路径, 文件名, 扩展名);
}

/** @throws {Error} 文件读写或迁移失败，调用方必须停止操作并显示失败。 */
async function 保存沙箱导出(
  上下文: common.UIAbilityContext,
  沙箱路径: string,
  文件名: string,
  扩展名: string
): Promise<string | null> {
  try {
    const 选项: picker.DocumentSaveOptions = new picker.DocumentSaveOptions();
    选项.newFileNames = [文件名];
    选项.fileSuffixChoices = [扩展名];
    const documentPicker: picker.DocumentViewPicker = new picker.DocumentViewPicker(上下文);
    const URI列表: Array<string> = await documentPicker.save(选项);
    if (URI列表.length === 0) return null;
    await 按描述符复制文件(沙箱路径, URI列表[0]);
    return URI列表[0];
  } finally {
    await 静默删除(沙箱路径);
  }
}

/** @throws {Error} 文件读写或迁移失败，调用方必须停止操作并显示失败。 */
async function 生成输出路径(文件目录: string, 词干: string, 扩展名: string): Promise<string> {
  const 导出目录 = `${文件目录}/exports`;
  await 确保目录存在(导出目录);
  return `${导出目录}/${词干}-${Date.now()}-${下一迁移输出ID()}.${扩展名}`;
}

function 下一迁移输出ID(): number {
  迁移输出ID += 1;
  return 迁移输出ID;
}

// ========================================================
// @块ID BACKEND-SVC-DATATRANSFER-002
// @名称 数据迁移·导入
//
// @作用
// 把用户选择的 .apkg / .colpkg 复制到沙箱、调用后端导入、清理临时文件：
//   - 暂存导入文件：把用户 URI 指向的 .apkg 复制到沙箱 imports 目录
//   - 执行牌组导入：在已打开 collection 上调用后端导入 .apkg
//   - 替换集合：关闭 collection → 后端导入 .colpkg → 重开（含安全副本回滚）
//
// @输入
// 文件目录 / 源URI / 暂存路径 / 是否已确认 / 阶段回调
//
// @输出
// 暂存导入文件：Promise<string>（沙箱暂存路径）
// 执行牌组导入：Promise<ImportSummary>
// 替换集合：Promise<void>
//
// @业务规则
// 替换集合要求二次确认（是否已确认=true）；未确认抛 数据迁移校验错误。
// 替换集合前先建安全副本（collection.anki2 / collection.mdb / collection.media）；
// 导入失败时回滚安全副本并重开 collection；成功后删除安全副本。
// 静默删除目录失败不得回滚已成功的导入（残留副本安全）。
// 阶段回调 0..3 对应：准备文件 / 关闭数据库 / 导入数据 / 恢复数据库。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，重写 Anki collection 与媒体库。
// 在沙箱 imports 与 transfer-safety-* 目录写临时文件，结束后清理。
// ========================================================

/** Copies the selected .apkg into the sandbox for backend import. Returns the staged path. */
/** @throws {Error} 文件读写或迁移失败，调用方必须停止操作并显示失败。 */
export async function 暂存导入文件(文件目录: string, 源URI: string, operation: ImportOperation | null = null): Promise<string> {
  return await 复制URI到沙箱(文件目录, 源URI, 'apkg', operation);
}

/** Runs the backend import on a previously staged file, then cleans up. */
export async function 执行牌组导入(暂存路径: string, options?: ImportAnkiPackageOptions,
  operation: ImportOperation | null = null): Promise<ImportSummary> {
  try {
    const 响应 = await withImportProgress(operation, async (): Promise<Uint8Array> => await 后端会话.获取实例().调用(
      服务号.后端导入导出,
      导入导出方法.导入Anki包,
      encodeImportAnkiPackageRequest(暂存路径, options)
    ));
    return decodeImportResponse(响应);
  } finally {
    await 静默删除(暂存路径);
  }
}

/** Replaces personal data only after the presentation layer obtains its second confirmation. */
/** @throws {Error} 文件读写或迁移失败，调用方必须停止操作并显示失败。 */
export async function 替换集合(
  文件目录: string,
  源URI: string,
  是否已确认: boolean,
  阶段回调?: (阶段: number) => void,
  operation: ImportOperation | null = null
): Promise<void> {
  if (!是否已确认) {
    throw new 数据迁移校验错误('transfer_confirmation_required');
  }

  阶段回调?.(0); // 准备文件中
  const 暂存路径 = await 复制URI到沙箱(文件目录, 源URI, 'colpkg', operation);
  const 会话 = 后端会话.获取实例();
  let closed: boolean = false;
  let prepared: boolean = false;
  let committed: boolean = false;
  try {
    await checkReplacementSpace(文件目录, 暂存路径);
    operation?.check();
    阶段回调?.(1); // 关闭数据库中
    await 会话.关闭集合();
    closed = true;
    operation?.progress('', 0, 0, false);
    await prepareReplacementRecovery(文件目录, operation);
    prepared = true;
    operation?.check();
    阶段回调?.(2); // 导入数据中
    await withImportProgress(operation, async (): Promise<Uint8Array> => await 会话.在集合关闭下调用(
      服务号.后端导入导出,
      导入导出方法.导入集合包,
      encodeImportCollectionPackageRequest({
        colPath: `${文件目录}/${集合文件名}`,
        backupPath: 暂存路径,
        mediaFolder: `${文件目录}/${媒体目录名}`,
        mediaDb: `${文件目录}/${媒体库文件名}`
      })
    ));
    阶段回调?.(3); // 恢复数据库中
    operation?.progress('', 0, 0, false);
    await 会话.确保已打开(文件目录, true);
    closed = false;
    await markReplacementCommitted(文件目录);
    committed = true;
  } catch (error) {
    operation?.progress('', 0, 0, false);
    if (prepared && !committed) {
      if (!closed) await 会话.关闭集合();
      await recoverInterruptedReplacement(文件目录);
    }
    if (closed || prepared) await 会话.确保已打开(文件目录);
    throw error;
  } finally {
    await 静默删除(暂存路径);
  }
  await cleanupReplacementRecovery(文件目录);
}
