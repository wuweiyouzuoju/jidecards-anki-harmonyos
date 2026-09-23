// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
export function homeDataHarness() {
  const state = { days: 0, graph: { today: { answerCount: 9 } }, failGraphs: false, failSave: false,
    tree: { children: [{ id: 1, newCount: 2, learnCount: 3, reviewCount: 4 }] }, calls: [], hours: 2, separate: true };
  const dependencies = {
    hilog: { info() {}, error() {} }, 后端会话: { 获取实例: () => ({ 确保已打开: async () => state.calls.push('open') }) },
    牌组服务: class { async 获取牌组树() { state.calls.push('tree'); return state.tree; } },
    统计服务: class { async 获取图表统计(days) { state.calls.push(['graphs', days]); if (state.failGraphs) throw new Error('unavailable'); return state.graph; } },
    确保FSRS已开启一次: async () => state.calls.push('fsrs'),
    加载统计天数: async () => state.days, 加载小时分布窗口: async () => state.hours, 加载分离暂停偏好: async () => state.separate,
    平铺牌组树: () => [{ id: '1', name: 'Default', displayName: '', parentId: '' }],
    加载牌组色调映射: async () => new Map(), 加载牌组别名映射: async () => new Map(),
    加载全部牌组顺序: async () => new Map(), 加载牌组背景图映射: async () => new Map(), 加载已隐藏牌组ID列表: async () => ['hidden'],
    提取卡片数据: (graphs, pending, decks, hours, separate) => { state.calls.push(['widget', graphs, pending, decks, hours, separate]); return { 今日完成数: graphs.today.answerCount }; },
    保存卡片数据: async () => { state.calls.push('save'); if (state.failSave) throw new Error('disk'); },
    构建主页快照: (tree, graphs) => ({ decks: [{ id: '1', name: 'Default', displayName: '' }], graph: graphs })
  };
  const source = readFileSync(new URL('../../entry/src/main/ets/backend/HomeDataRepository.ets', import.meta.url), 'utf8')
    .replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
  const Repository = new Function(...Object.keys(dependencies), stripTypeScriptTypes(source, {mode: 'transform'}) + '; return HomeDataRepository;')(...Object.values(dependencies));
  return { repository: new Repository(), state };
}
