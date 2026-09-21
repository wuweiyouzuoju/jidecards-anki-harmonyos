// SPDX-License-Identifier: AGPL-3.0-or-later
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 后端会话 } from '../backend/后端会话';
import { 牌组服务 } from '../backend/牌组服务';
import { 统计服务 } from '../backend/统计服务';
import { 构建主页快照 } from '../model/主页快照映射器';
import type { GraphsView } from '../proto/messages/StatsMessages';
import { 牌组汇总, 牌组色调, 主页快照 } from '../model/主页模型';
import { 加载牌组别名映射, 加载牌组色调映射, 加载牌组背景图映射 } from '../model/牌组元数据存储';
import { 加载全部牌组顺序 } from '../model/牌组顺序存储';
import { 加载已隐藏牌组ID列表 } from '../model/隐藏牌组存储';
import { 确保FSRS已开启一次 } from '../model/FSRS控制器';
import { 提取卡片数据, 保存卡片数据, 加载小时分布窗口, 加载统计天数, 加载分离暂停偏好, 桌面卡片数据 } from '../model/桌面卡片数据存储';
import { 平铺牌组树 } from '../model/牌组层级';
export interface HomeDataResult {
  snapshot: 主页快照;
  cardData: 桌面卡片数据 | null;
  graphs: GraphsView | null;
  days: number;
  hiddenIds: string[];
}

/** 读取并组装完整首页快照；页面不参与偏好/图表/桌面卡片存储协议。 */
export class HomeDataRepository {
  private readonly decks: 牌组服务 = new 牌组服务();
  private readonly stats: 统计服务 = new 统计服务();
  private days: number = 365;

  async load(filesDir: string, defaultDeckName: string): Promise<HomeDataResult> {
    let cardData: 桌面卡片数据 | null = null;
      await 后端会话.获取实例().确保已打开(filesDir);
      // 首次启动自动开启 FSRS（用户决策：默认开启可关闭）。确保FSRS已开启一次
      // 内部有 initialized 标记，只在首次跑一次；后续用户在设置页关掉就保持关闭。
      // 放在 确保已打开 之后、拉取 tree 之前，避免与 deckTree/graphs 并发冲突。
      await 确保FSRS已开启一次();
      const tree = await this.decks.获取牌组树();
      const graphs: GraphsView | null = await this.readGraphs();
      hilog.info(0x4342, 'jidecards', `首页: 静默加载图表结果 graphs=${graphs === null ? 'null' : '非null'}`);
      // 桌面卡片数据桥接：graphs 非空时提取 8 页数据存 filesDir，供 FormExtensionAbility 读取
      if (graphs !== null) {
        // 算待学数（牌组树 newCount+learnCount+reviewCount 聚合）和牌组数，供桌面卡片今日进度页
        let 总待学: number = 0;
        for (const 子节点 of tree.children) {
          总待学 += 子节点.newCount + 子节点.learnCount + 子节点.reviewCount;
        }
        const 牌组总数: number = 平铺牌组树(tree).length;
        const 卡片数据: 桌面卡片数据 = 提取卡片数据(graphs, 总待学, 牌组总数, await 加载小时分布窗口(), await 加载分离暂停偏好());
        cardData = 卡片数据;
        // 诊断日志：数值本身写进日志，用户报“数据旧”时抓 hilog 即可分辨
        // 是后端返回旧 graphs（RPC/缓存问题）还是前端没刷新（渲染问题）。
        hilog.info(0x4342, 'jidecards',
          `首页: 图表快照更新 今日完成=${卡片数据.今日完成数} 今日答题=${卡片数据.今日答题数} 待学=${卡片数据.待学数}`);
        // 必须 await：fire-and-forget 在用户立即按 Home 切桌面时会被系统冻结，
        // 桌面卡片延迟到下次 30 分钟系统刷新才更新。App 在前台时同步等数据写入
        // filesDir + formProvider.updateForm 推送完成，确保卡片立即反映最新统计。
        try {
          await 保存卡片数据(卡片数据);
        } catch (e) {
          hilog.error(0x4342, 'jidecards', `首页: 保存卡片数据失败 ${e}`);
        }
      }
      const allDecks: 牌组汇总[] = 平铺牌组树(tree);
      const deckIds: string[] = allDecks.map((deck: 牌组汇总): string => deck.id);
      const toneOverrides: Map<string, 牌组色调> = await 加载牌组色调映射(deckIds);
      const displayNameOverrides: Map<string, string> = await 加载牌组别名映射(deckIds);
      // 收集所有 parent id（含顶层 ''）：用于按 parent 加载子牌组顺序覆盖
      const parentIds: string[] = allDecks
        .map((deck: 牌组汇总): string => deck.parentId)
        .filter((pid: string, index: number, self: string[]): boolean => self.indexOf(pid) === index);
      // allDecks 不含 root，但顶层 parent='' 总要尝试加载（若用户拖过顶层）
      if (parentIds.indexOf('') < 0) {
        parentIds.push('');
      }
      const orderOverrides: Map<string, string[]> = await 加载全部牌组顺序(parentIds);
      const backgroundImageOverrides: Map<string, string> = await 加载牌组背景图映射(deckIds);
      // 加载用户隐藏的 deck id 集合，可见牌组行 会过滤掉这些 id
      const hiddenIds: string[] = await 加载已隐藏牌组ID列表();

      const snapshot: 主页快照 =
        构建主页快照(tree, graphs, new Date(), toneOverrides, displayNameOverrides,
          orderOverrides, backgroundImageOverrides);
      // 默认牌组（id=1）名跟随系统语言：数据库里存的是 "Default"，
      // 中文环境下显示"默认牌组"，英文环境显示"Default"。用户自定义别名优先。
      const 默认牌组本地化名: string = defaultDeckName;
      for (const deck of snapshot.decks) {
        if (deck.id === '1' && deck.displayName === '') {
          deck.name = 默认牌组本地化名;
        }
      }
      return { snapshot: snapshot, cardData: cardData, graphs: graphs, days: this.days, hiddenIds: hiddenIds };
  }

  private async readGraphs(): Promise<GraphsView | null> {
    try {
      // days 跟随统计页「近 1 年/全部」偏好：后端 hours 四档窗口都从 days 限定的 revlog 里统计，
      // 传错会导致首页摘要/桌面卡片与统计页数据不一致（曾误传 new Date().getDate()）
      const days: number = await 加载统计天数();
      const graphs: GraphsView = await this.stats.获取图表统计(days);
      this.days = days;
      return graphs;
    } catch (error) {
      return null;
    }
  }
}
