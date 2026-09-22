// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-DECK-META-001
// @名称 牌组元数据存储
//
// @作用
// 牌组级元数据持久化（单卡可定制信息：色标条 tone / 自定义别名 displayName / 背景图 backgroundImage）。
// 用 preferences（@kit.ArkData）存储元数据，key 形如 `deck_tone_<deckId>`，
// tone value 为 牌组色调键() 返回的小写字符串（'blue'/'purple'/'mint'/'amber'/'black'/'red'/'none'）。
// 背景图文件存到沙盒 filesDir/deck_backgrounds/<deckId>.jpg，preferences 仅存路径。
// 复用 ThemeStore 的 abilityContext 获取模式，store 名独立避免与全局设置互相覆盖。
//
// @输入
// 牌组ID / 牌组色调 / 自定义别名 / PixelMap 背景图
//
// @输出
// Promise<Map<牌组ID, 牌组色调>> 等异步结果 / 保存的背景图文件绝对路径
//
// @业务规则
// preferences key 前缀（deck_tone_ / deck_display_name_ / deck_background_）为持久化值，必须保留英文。
// store 名 'jidecards_deck_meta' 不可改，否则历史数据丢失。
// 背景图文件名带时间戳保证 LazyForEach keyItem 变化触发 ListItem 重建。
// 别名为空串时删除键（表示用户改回原名）。
//
// @副作用
// 读写 preferences（@kit.ArkData）；写沙盒 filesDir/deck_backgrounds/ 目录与 JPEG 文件。
//
// @注意
// 本文件只写本地 preferences，不调后端 rename_deck，因此后端真实 deck name 保持不变，
// 导出 apkg/同步到其他设备时仍显示后端原名。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { fileIo as fs } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { 牌组色调, 牌组色调键, 解析牌组色调 } from './主页模型';

const 存储名: string = 'jidecards_deck_meta';
const 色调键前缀: string = 'deck_tone_';
const 别名键前缀: string = 'deck_display_name_';
const 背景图键前缀: string = 'deck_background_';
const 背景图目录名: string = 'deck_backgrounds';
const 上下文存储键: string = 'abilityContext';

function 获取能力上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文存储键);
  return 上下文 === undefined ? null : 上下文;
}

function 色调键(牌组ID: string): string {
  return `${色调键前缀}${牌组ID}`;
}

function 别名键(牌组ID: string): string {
  return `${别名键前缀}${牌组ID}`;
}

function 背景图键(牌组ID: string): string {
  return `${背景图键前缀}${牌组ID}`;
}

/** 沙盒内单张牌组背景图绝对路径：filesDir/deck_backgrounds/<deckId>_<timestamp>.jpg。
 *  时间戳保证每次保存路径不同 → LazyForEach keyItem 变化 → ListItem 重建 → PixelMap 重载。 */
function 背景图文件路径(上下文: common.UIAbilityContext, 牌组ID: string): string {
  return `${上下文.filesDir}/${背景图目录名}/${牌组ID}_${Date.now()}.jpg`;
}

/** 确保 deck_backgrounds 目录存在；已存在不重复创建。 */
/** @throws {Error} 背景图文件或偏好写入失败，调用方保留原图并报告独立失败。 */
async function 确保背景图目录存在(上下文: common.UIAbilityContext): Promise<void> {
  const 目录路径: string = `${上下文.filesDir}/${背景图目录名}`;
  try {
    const 已存在: boolean = await fs.access(目录路径);
    if (!已存在) {
      await fs.mkdir(目录路径, true);
    }
  } catch (错误) {
    // access 失败说明目录不存在，直接创建
    await fs.mkdir(目录路径, true);
  }
}

/**
 * 按给定的 牌组ID 列表逐个查询已持久化的 tone。
 * 返回 牌组ID → 牌组色调 的 Map；未持久化或读取失败的不出现在 Map 中，调用方继续走自动轮转默认值。
 * 之所以传入 牌组ID列表 而非用 store.getAll()，是因为 ArkTS 严格模式下 getAll 的 Object 返回类型
 * 无法直接转 Record<string, ValueType>，逐键查询更安全。
 */
export async function 加载牌组色调映射(牌组ID列表: string[]): Promise<Map<string, 牌组色调>> {
  const 输出: Map<string, 牌组色调> = new Map<string, 牌组色调>();
  if (牌组ID列表.length === 0) {
    return 输出;
  }
  const 上下文: common.UIAbilityContext | null = 获取能力上下文();
  if (上下文 === null) {
    return 输出;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    for (let i: number = 0; i < 牌组ID列表.length; i++) {
      const 牌组ID: string = 牌组ID列表[i];
      const 是否存在: boolean = await 存储.has(色调键(牌组ID));
      if (!是否存在) {
        continue;
      }
      const 值: preferences.ValueType = await 存储.get(色调键(牌组ID), '');
      if (typeof 值 !== 'string') {
        continue;
      }
      const 色调: 牌组色调 | null = 解析牌组色调(值);
      if (色调 !== null) {
        输出.set(牌组ID, 色调);
      }
    }
    return 输出;
  } catch (错误) {
    return 输出;
  }
}

/** 持久化单张牌组的 tone 选择；tone===None 也持久化（表示用户主动取消色条）。 */
export async function 保存牌组色调(牌组ID: string, 色调: 牌组色调): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 获取能力上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(色调键(牌组ID), 牌组色调键(色调));
    await 存储.flush();
  } catch (错误) {
    // 偏好不可用时仅丢失持久化，不阻塞 UI。
  }
}

/**
 * 按给定的 牌组ID 列表逐个查询已持久化的别名（用户自定义别名）。
 * 返回 牌组ID → 别名 的 Map；未持久化或读取失败的不出现在 Map 中，调用方继续走后端真实 name。
 * 空串视为未设置（保存牌组别名 落盘空串时会删除键）。
 */
export async function 加载牌组别名映射(牌组ID列表: string[]): Promise<Map<string, string>> {
  const 输出: Map<string, string> = new Map<string, string>();
  if (牌组ID列表.length === 0) {
    return 输出;
  }
  const 上下文: common.UIAbilityContext | null = 获取能力上下文();
  if (上下文 === null) {
    return 输出;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    for (let i: number = 0; i < 牌组ID列表.length; i++) {
      const 牌组ID: string = 牌组ID列表[i];
      const 是否存在: boolean = await 存储.has(别名键(牌组ID));
      if (!是否存在) {
        continue;
      }
      const 值: preferences.ValueType = await 存储.get(别名键(牌组ID), '');
      if (typeof 值 !== 'string' || 值 === '') {
        continue;
      }
      输出.set(牌组ID, 值);
    }
    return 输出;
  } catch (错误) {
    return 输出;
  }
}

/**
 * 持久化单张牌组的别名（用户自定义别名）。
 * 名称为空串时删除键（表示用户改回原名，不再覆盖）。
 * 注意：本函数只写本地 preferences，不调后端 rename_deck，因此后端真实 deck name 保持不变，
 * 导出 apkg/同步到其他设备时仍显示后端原名。
 */
export async function 保存牌组别名(牌组ID: string, 名称: string): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 获取能力上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 去除首尾空格: string = 名称.trim();
    if (去除首尾空格 === '') {
      await 存储.delete(别名键(牌组ID));
    } else {
      await 存储.put(别名键(牌组ID), 去除首尾空格);
    }
    await 存储.flush();
  } catch (错误) {
    // 偏好不可用时仅丢失持久化，不阻塞 UI。
  }
}

/**
 * 按给定的 牌组ID 列表逐个查询已持久化的背景图路径。
 * 返回 牌组ID → 文件绝对路径 的 Map；未持久化或文件不存在的不出现在 Map 中。
 * 校验文件确实存在（防止用户清缓存后 preferences 残留指向已删文件）。
 */
export async function 加载牌组背景图映射(牌组ID列表: string[]): Promise<Map<string, string>> {
  const 输出: Map<string, string> = new Map<string, string>();
  if (牌组ID列表.length === 0) {
    return 输出;
  }
  const 上下文: common.UIAbilityContext | null = 获取能力上下文();
  if (上下文 === null) {
    return 输出;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    for (let i: number = 0; i < 牌组ID列表.length; i++) {
      const 牌组ID: string = 牌组ID列表[i];
      const 是否存在: boolean = await 存储.has(背景图键(牌组ID));
      if (!是否存在) {
        continue;
      }
      const 值: preferences.ValueType = await 存储.get(背景图键(牌组ID), '');
      if (typeof 值 !== 'string' || 值 === '') {
        continue;
      }
      // 校验文件确实存在；不存在则清理 preferences 残留
      let 文件存在: boolean = false;
      try {
        文件存在 = await fs.access(值);
      } catch (e) {
        文件存在 = false;
      }
      if (文件存在) {
        输出.set(牌组ID, 值);
      } else {
        await 存储.delete(背景图键(牌组ID));
        await 存储.flush();
      }
    }
    return 输出;
  } catch (错误) {
    return 输出;
  }
}

/**
 * 把裁剪后的 PixelMap 编码为 JPEG 写入沙盒 filesDir/deck_backgrounds/<deckId>_<timestamp>.jpg，
 * 并把绝对路径写入 preferences。
 * 文件名带时间戳：让每次保存的路径不同，LazyForEach keyItem（含 backgroundImage）随之变化，
 * 触发 ListItem 重建与 PixelMap 重载，避免"保存新图后列表仍显示旧图"。
 * 同时删除该 牌组ID 的旧文件，避免沙盒堆积。
 * 失败时抛出错误（调用方 UI 显示），不静默吞掉——因为图片保存失败是用户能感知的明显问题。
 */
/** @throws {Error} 背景图文件或偏好写入失败，调用方保留原图并报告独立失败。 */
export async function 保存牌组背景图(牌组ID: string, 像素图: PixelMap): Promise<string> {
  const 上下文: common.UIAbilityContext | null = 获取能力上下文();
  if (上下文 === null) {
    throw new Error('abilityContext is null');
  }
  await 确保背景图目录存在(上下文);
  // 先查 preferences 拿旧文件路径，保存成功后删除（避免堆积）
  const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
  let 旧路径: string = '';
  try {
    const 是否存在: boolean = await 存储.has(背景图键(牌组ID));
    if (是否存在) {
      const 值: preferences.ValueType = await 存储.get(背景图键(牌组ID), '');
      if (typeof 值 === 'string') {
        旧路径 = 值;
      }
    }
  } catch (e) {
    // 读旧路径失败不阻塞保存
  }

  // 新文件路径带时间戳，确保与旧路径不同 → LazyForEach keyItem 变化 → ListItem 重建
  const 文件路径: string = 背景图文件路径(上下文, 牌组ID);
  // 先写临时文件再 rename，避免覆盖旧文件时编码失败导致数据损坏
  const 临时路径: string = `${文件路径}.tmp`;
  const 文件: fs.File = fs.openSync(临时路径, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
  try {
    const 图像打包器: image.ImagePacker = image.createImagePacker();
    try {
      const 打包数据: ArrayBuffer = await 图像打包器.packToData(像素图, {
        format: 'image/jpeg',
        quality: 85
      });
      await fs.write(文件.fd, 打包数据);
    } finally {
      图像打包器.release();
    }
  } finally {
    await fs.close(文件);
  }
  await fs.rename(临时路径, 文件路径);
  // 路径写入 preferences
  await 存储.put(背景图键(牌组ID), 文件路径);
  await 存储.flush();
  // 删除旧文件（路径与新文件不同时才删，避免误删刚保存的文件）
  if (旧路径 !== '' && 旧路径 !== 文件路径) {
    try {
      await fs.unlink(旧路径);
    } catch (e) {
      // 旧文件不存在忽略
    }
  }
  return 文件路径;
}

/**
 * 删除单张牌组的背景图：删除沙盒文件 + 删除 preferences 键。
 * 失败时静默——背景图丢失不会阻塞 UI，DeckListItem 会回退到 surface_card。
 */
export async function 清除牌组背景图(牌组ID: string): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 获取能力上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 是否存在: boolean = await 存储.has(背景图键(牌组ID));
    if (是否存在) {
      const 值: preferences.ValueType = await 存储.get(背景图键(牌组ID), '');
      if (typeof 值 === 'string' && 值 !== '') {
        try {
          await fs.unlink(值);
        } catch (e) {
          // 文件不存在忽略
        }
      }
      await 存储.delete(背景图键(牌组ID));
      await 存储.flush();
    }
  } catch (错误) {
    // 偏好不可用时仅丢失持久化，不阻塞 UI。
  }
}
