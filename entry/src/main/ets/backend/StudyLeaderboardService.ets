// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { http } from '@kit.NetworkKit';
import { OfficialAIService } from './agent/OfficialAIService';
import { 后端会话 } from './后端会话';
import { 卡片服务 } from './卡片服务';
import { 卡片渲染服务 } from './卡片渲染服务';
import { 牌组服务 } from './牌组服务';
import { 搜索服务 } from './搜索服务';
import { 统计服务 } from './统计服务';
import { 平铺牌组树 } from '../model/牌组层级';
import { syncActivity } from '../model/SyncSettings';
import { buildDeckStudyHistory } from '../model/DeckStudyHistory';
import type { GraphsView } from '../proto/messages/StatsMessages';
import {
  drawLeaderboardCard, leaderboardExcerpt, LeaderboardBoard, LeaderboardPreview, LeaderboardRequest, LeaderboardSample, LeaderboardTotals, LeaderboardWindows,
  LEADERBOARD_DAYS, LEADERBOARD_MONTH_DAYS, LEADERBOARD_MAX_DURATION_MS, LEADERBOARD_SAMPLE_LIMIT, LEADERBOARD_SCORE_LIMIT
} from '../model/StudyLeaderboard';

export class StudyLeaderboardService {
  private loadedToken: string = '';
  private readonly account: OfficialAIService = new OfficialAIService();

  /** @throws {Error} 用户取消授权或会话保存失败时交给界面处理。 */
  login(context: common.UIAbilityContext): Promise<void> { return this.account.login(context, false); }

  async view(filter: string, metric: string = 'answers', period: string = 'week'): Promise<LeaderboardBoard> {
    this.loadedToken = '';
    const token: string = await this.account.token();
    const body: LeaderboardRequest = this.boardRequest(filter, metric, period);
    try {
      const board: LeaderboardBoard = await this.request('view', body, token);
      if (board.signedIn) this.loadedToken = token;
      return board;
    } catch (error) {
      if ((error as Error).message !== 'login_required') throw error as Error;
      if (!token) throw new Error('leaderboard_unavailable');
    }
    try {
      return await this.request('view', body, '');
    } catch (error) {
      if ((error as Error).message === 'login_required') throw new Error('leaderboard_unavailable');
      throw error as Error;
    }
  }

  /** 预览名单旁的个人状态只使用正式华为会话。 */
  async viewPersonal(filter: string, metric: string, period: string): Promise<LeaderboardBoard | null> {
    if (!await this.account.token()) return null;
    const board: LeaderboardBoard = await this.view(filter, metric, period);
    return board.signedIn ? board : null;
  }

  /** @throws {Error} 本机榜单仅读取占位名单，不传应用会话。 */
  async viewLoopbackPreview(filter: string, metric: string = 'answers', period: string = 'week'): Promise<LeaderboardBoard> {
    const request: http.HttpRequest = http.createHttp();
    try {
      const payload: LeaderboardRequest = this.boardRequest(filter, metric, period);
      const response: http.HttpResponse = await request.request('http://127.0.0.1:18982/v1/official-ai/leaderboard/view', {
        method: http.RequestMethod.POST, header: { 'Content-Type': 'application/json' },
        extraData: JSON.stringify(payload), connectTimeout: 5000, readTimeout: 5000, expectDataType: http.HttpDataType.STRING
      });
      if (response.responseCode !== 200) throw new Error('leaderboard_unavailable');
      const board: LeaderboardBoard = this.parseBoard(response.result as string);
      return { entries: board.entries, mine: null, signedIn: false, metrics: board.metrics, periods: board.periods };
    } finally { request.destroy(); }
  }

  async preview(filesDir: string, current: () => boolean, supportsPeriods: boolean = false): Promise<LeaderboardPreview> {
    await syncActivity.waitForCollection();
    this.checkSampling(current);
    await 后端会话.获取实例().确保已打开(filesDir);
    this.checkSampling(current);
    const days: number = supportsPeriods ? LEADERBOARD_MONTH_DAYS : LEADERBOARD_DAYS;
    const stats: GraphsView = await new 统计服务().获取图表统计(days);
    const week: LeaderboardTotals = this.reviewTotals(stats, LEADERBOARD_DAYS);
    let windows: LeaderboardWindows | undefined = undefined;
    if (supportsPeriods) {
      windows = { today: this.reviewTotals(stats, 1), month: this.reviewTotals(stats, LEADERBOARD_MONTH_DAYS) };
    }
    if ((windows?.month.score ?? week.score) < 1) throw new Error('leaderboard_no_learning');
    this.checkSampling(current);
    const ids: number[] = await new 搜索服务().搜索卡片({ search: `rated:${days}`, order: { kind: 'none' } });
    this.checkSampling(current);
    if (ids.length === 0) throw new Error('leaderboard_no_samples');
    const deckNames = new Map<string, string>();
    for (const deck of 平铺牌组树(await new 牌组服务().获取牌组树())) deckNames.set(deck.id, deck.fullName);

    const cards: 卡片服务 = new 卡片服务();
    const renderer: 卡片渲染服务 = new 卡片渲染服务();
    const sampledNotes = new Set<number>();
    const samples: LeaderboardSample[] = [];
    for (let attempt = 0; ids.length > 0 && samples.length < LEADERBOARD_SAMPLE_LIMIT &&
      attempt < LEADERBOARD_SAMPLE_LIMIT * 3; attempt++) {
      this.checkSampling(current);
      const card = await cards.获取卡片(drawLeaderboardCard(ids, Math.random()));
      if (sampledNotes.has(card.noteId)) continue;
      sampledNotes.add(card.noteId);
      this.checkSampling(current);
      const rendered = await renderer.渲染既有卡片(card.id);
      const deck: string = leaderboardExcerpt(deckNames.get(String(card.originalDeckId || card.deckId)) ?? '', 96);
      const text: string = leaderboardExcerpt((rendered.questionHtml ?? '') + ' ' + (rendered.answerHtml ?? ''), 240);
      if (deck !== '' || text !== '') samples.push({ deck: deck, text: text });
    }
    if (samples.length === 0) throw new Error('leaderboard_no_samples');
    return { score: week.score, durationMs: week.durationMs, windows: windows, samples: samples };
  }

  private reviewTotals(stats: GraphsView, days: number): LeaderboardTotals {
    const history = buildDeckStudyHistory(stats, days);
    if (history.totalCount > LEADERBOARD_SCORE_LIMIT) throw new Error('leaderboard_score_limit');
    return { score: history.totalCount,
      durationMs: Math.min(LEADERBOARD_MAX_DURATION_MS / LEADERBOARD_DAYS * days, Math.trunc(history.totalMillis)) };
  }

  /** @throws {Error} 仅当前会话可提交已经预览的成绩。 */
  async publish(filter: string, preview: LeaderboardPreview, profileRevision?: number, metric: string = 'answers',
    supportsDuration: boolean = false, period: string = 'week'): Promise<LeaderboardBoard> {
    const body: LeaderboardRequest = this.boardRequest(filter, metric, period);
    body.score = preview.score;
    body.samples = preview.samples;
    if (preview.windows !== undefined) body.windows = preview.windows;
    if (supportsDuration && (preview.durationMs ?? 0) > 0) body.durationMs = preview.durationMs;
    if (profileRevision !== undefined) body.profileRevision = profileRevision;
    return this.request('publish', body, await this.requiredToken());
  }

  /** @throws {Error} 服务器确认撤下后才更新界面。 */
  async leave(filter: string, metric: string = 'answers', period: string = 'week'): Promise<LeaderboardBoard> {
    return this.request('leave', this.boardRequest(filter, metric, period), await this.requiredToken());
  }

  /** @throws {Error} 会话失效或服务器拒绝时保留原公开身份，由页面提示重试。 */
  async setAnonymous(filter: string, metric: string, period: string, anonymous: boolean,
    profileRevision?: number): Promise<LeaderboardBoard> {
    const body: LeaderboardRequest = this.boardRequest(filter, metric, period);
    body.anonymous = anonymous;
    if (!anonymous) body.profileRevision = profileRevision;
    return this.request('privacy', body, await this.requiredToken());
  }

  private boardRequest(filter: string, metric: string, period: string): LeaderboardRequest {
    const body: LeaderboardRequest = { filter: filter };
    if (metric !== 'answers') body.metric = metric;
    if (period !== 'week') body.period = period;
    return body;
  }

  private checkSampling(current: () => boolean): void {
    if (!current()) throw new Error('leaderboard_sampling_cancelled');
  }

  private async requiredToken(): Promise<string> {
    const token: string = await this.account.token();
    if (!token || token !== this.loadedToken) throw new Error('login_required');
    return token;
  }

  /** @throws {Error} 请求或响应无效时保留可重试的失败。 */
  private async request(mode: string, body: LeaderboardRequest, token: string): Promise<LeaderboardBoard> {
    const raw: string = await this.account.request('/leaderboard/' + mode, JSON.stringify(body), token);
    return this.parseBoard(raw);
  }

  private parseBoard(raw: string): LeaderboardBoard {
    let board: LeaderboardBoard;
    try {
      board = JSON.parse(raw) as LeaderboardBoard;
    } catch (error) {
      throw new Error('leaderboard_invalid_reply');
    }
    if (!Array.isArray(board.entries) || typeof board.signedIn !== 'boolean' ||
      (board.mine === undefined)) throw new Error('leaderboard_invalid_reply');
    return board;
  }
}
