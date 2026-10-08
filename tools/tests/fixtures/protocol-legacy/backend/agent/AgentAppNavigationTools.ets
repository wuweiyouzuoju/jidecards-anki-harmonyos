// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentAppNavigationSession } from '../../model/agent/AgentAppNavigation';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentNavigationToolHandler } from './AgentToolRegistry';
import { 牌组服务 } from '../牌组服务';
import { 笔记服务 } from '../笔记服务';
import { 卡片服务 } from '../卡片服务';
import type { AppNavigationArguments } from '../../model/navigation/AppNavigation';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';

function deckPath(node: DeckTreeNode, id: number, prefix: string = ''): string {
  const name: string = node.deckId > 0 ? (prefix === '' ? node.name : prefix + '::' + node.name) : '';
  if (node.deckId === id) return name;
  for (const child of node.children) {
    const found: string = deckPath(child, id, name);
    if (found !== '') return found;
  }
  return '';
}

/** 每次队列接受/执行都读取真实树，不缓存主页快照。 */
export async function readNavigationDeckName(id: number): Promise<string> {
  const name: string = deckPath(await new 牌组服务().获取牌组树(), id);
  if (name === '') throw new Error('navigation_deck_missing');
  return name;
}

/** 只检查当前真实对象；正文留在原编辑/预览页面，不送入导航工具结果。 */
export async function readNavigationTarget(args: AppNavigationArguments): Promise<string> {
  const deckName: string = args.deckId === undefined ? '' : await readNavigationDeckName(args.deckId);
  if (args.noteId !== undefined) {
    if ((await new 笔记服务().获取笔记(args.noteId)).id !== args.noteId) throw new Error('navigation_target_missing');
  }
  if (args.cardId !== undefined) {
    if ((await new 卡片服务().获取卡片(args.cardId)).id !== args.cardId) throw new Error('navigation_target_missing');
  }
  return deckName;
}

/** 执行可逆页面意图，不取得卡库写入执行器或任意 RPC 权限。 */
export class AgentAppNavigationTools implements AgentNavigationToolHandler {
  private readonly session: AgentAppNavigationSession;
  constructor(session: AgentAppNavigationSession) { this.session = session; }
  register(registry: AgentToolRegistry): void { registry.registerNavigation('navigate_app', this); }
  execute(argumentsJson: string): Promise<string> { return this.session.queue(argumentsJson); }
}
