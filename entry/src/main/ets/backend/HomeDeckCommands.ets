// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 牌组服务 } from './牌组服务';
import { 保存上次牌组ID } from '../model/上次牌组存储';
import { 保存牌组别名, 清除牌组背景图, 保存牌组背景图 } from '../model/牌组元数据存储';
import type { 牌组定制结果 } from '../model/DeckCustomization';

export class HomeDeckCommands {
  private readonly decks: 牌组服务 = new 牌组服务();
  async create(filesDir: string, name: string): Promise<number> {
    await 后端会话.获取实例().确保已打开(filesDir);
    const id: number = await this.decks.创建牌组(name);
    await 保存上次牌组ID(String(id));
    return id;
  }

  /** 别名先落盘，背景替换失败只报告该步骤，保留可重试的定制面板。 */
  async customize(id: string, originalName: string, displayName: string, result: 牌组定制结果): Promise<boolean> {
    const backgroundAction = result.背景动作;
    const pixels = result.背景像素图;
    const alias: string = result.新名.trim() === originalName ? '' : result.新名.trim();
    if (alias !== displayName) await 保存牌组别名(id, alias);
    if (backgroundAction === 'remove') await 清除牌组背景图(id);
    else if (backgroundAction === 'replace' && pixels !== null) {
      try { await 保存牌组背景图(id, pixels); }
      catch (error) { return false; }
    }
    return true;
  }
}
