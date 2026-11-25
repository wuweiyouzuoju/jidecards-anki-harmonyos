// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedLevelAccount, LevelRules, UniformLevelScale, LevelState, LevelCommit, LevelSummary,
  LevelViewData, LevelNotice, LevelAchievementView, summarizeLevel, createLevelState,
  SharedLevelBadge, SharedLevelCard, SharedLevelDetails, SharedLevelFeedback } from '../Levels';
import { SurfaceViewport } from '../src/core/SurfaceLayout';
import { themePalette } from '../src/core/Theme';
import { UiTokens } from '../src/core/UiTokens';
import { ActionButton } from '../src/harmony/ActionButton';
import { DemoSharedLevelStore } from './LevelDemoStore';

// 全部数值仅供演示；五秒缓冲便于检查，不能作为产品默认值。
const DEMO_RULES: LevelRules = { version: 'showcase-1', scale: new UniformLevelScale(100), graceMs: 5000,
  milestones: [{ id: 'first', level: 2 }, { id: 'steady', level: 3 }] };

function viewData(state: LevelState): LevelViewData {
  const summary: LevelSummary = summarizeLevel(state, DEMO_RULES);
  const view: LevelViewData = new LevelViewData();
  view.levelLabel = 'Lv.' + summary.level;
  view.title = summary.level >= 3 ? '持续探索' : '启程';
  view.progress = summary.progress;
  view.progressLabel = '距离下一级还需 ' + (summary.required - summary.current) + ' 点';
  view.highestLabel = '历史最高 Lv.' + summary.highestLevel;
  if (state.warning !== undefined) {
    view.warningLabel = state.warning.reason + (state.warning.seenAt === undefined ? '；查看预警后开始缓冲' : '；演示缓冲 5 秒');
  }
  view.achievementsLabel = '已获成就';
  view.achievements = state.achievementIds.map((id: string): LevelAchievementView => {
    return { id: id, label: id === 'first' ? '初次晋级' : '稳步成长' };
  });
  return view;
}

@Entry
@Component
struct LevelShowcase {
  private account: SharedLevelAccount = new SharedLevelAccount(new DemoSharedLevelStore(), DEMO_RULES);
  private sequence: number = 0;
  @State private state: LevelState = createLevelState('demo-series', DEMO_RULES, 0);
  @State private model: LevelViewData = viewData(this.state);
  @State private dark: boolean = false;
  @State private details: boolean = false;
  @State private feedback: boolean = false;
  @State private busy: boolean = false;
  @State private status: string = '';
  @State private viewport: SurfaceViewport = { width: 0, height: 0, safeTop: 0, safeBottom: 0,
    safeLeft: 0, safeRight: 0, keyboardTop: 0 };

  private nextId(): string { this.sequence++; return 'demo-' + this.sequence; }

  private async apply(operation: Promise<LevelCommit>): Promise<boolean> {
    this.busy = true;
    this.status = '';
    try {
      const result: LevelCommit = await operation;
      this.state = result.state;
      this.model = viewData(result.state);
      this.status = result.changed ? '已确认保存' : '无需变更；预警未读或缓冲未到时不会扣减';
      return true;
    } catch (error) {
      this.status = (error as Error).message;
      return false;
    } finally {
      this.busy = false;
    }
  }

  private contribute(productId: string, points: number): void {
    if (this.busy) { return; }
    this.apply(this.account.contribute('demo-series', { id: this.nextId(), productId: productId,
      points: points, at: Date.now() }));
  }

  private proposeRisk(): void {
    if (this.busy || this.state.warning !== undefined) { return; }
    this.apply(this.account.proposeRisk('demo-series', { id: this.nextId(), productId: 'series',
      pointsToLose: 150, reason: '演示维护条件未满足', at: Date.now() }));
  }

  private settle(isStillAtRisk: boolean): void {
    if (this.busy || this.state.warning === undefined) { return; }
    this.apply(this.account.settleRisk('demo-series', { id: this.state.warning.id, at: Date.now(),
      expectedRevision: this.state.revision, isStillAtRisk: isStillAtRisk }));
  }

  private currentNotice(): LevelNotice {
    return this.state.notices[0];
  }

  private noticeModel(): LevelViewData {
    const model: LevelViewData = viewData(this.state);
    const level: number = this.currentNotice().toLevel;
    model.levelLabel = 'Lv.' + level;
    model.title = level >= 3 ? '持续探索' : '启程';
    return model;
  }

  private feedbackTitle(): string {
    const kind: string = this.currentNotice().kind;
    if (kind === 'advanced') { return '晋级了'; }
    if (kind === 'warning') { return '等级维护提醒'; }
    if (kind === 'recovered') { return '已恢复维护条件'; }
    return '等级进度已更新';
  }

  private warningSeen(): void {
    if (this.currentNotice().kind === 'warning' && this.state.warning !== undefined &&
      this.state.warning.seenAt === undefined && !this.busy) {
      this.apply(this.account.markWarningSeen('demo-series', { id: this.state.warning.id, at: Date.now() }));
    }
  }

  private async dismiss(): Promise<void> {
    if (this.busy || this.state.notices.length === 0) { return; }
    const saved: boolean = await this.apply(this.account.acknowledgeNotice('demo-series',
      { id: this.currentNotice().id, at: Date.now() }));
    if (saved) { this.feedback = false; }
  }

  onBackPress(): boolean {
    if (this.feedback) { this.dismiss(); return true; }
    if (this.details) { this.details = false; return true; }
    return false;
  }

  build() {
    Stack() {
      Scroll() {
        Column({ space: UiTokens.sectionGap }) {
          Text('全系列等级 · 交互示例').fontSize(UiTokens.titleSize).fontWeight(FontWeight.Bold)
            .fontColor(themePalette(this.dark).text)
          Text('演示数据仅保存在内存。分值与五秒缓冲不代表产品规则。')
            .fontSize(UiTokens.bodySize).fontColor(themePalette(this.dark).secondaryText)
          SharedLevelBadge({ model: this.model, isDark: this.dark })
          SharedLevelCard({ model: this.model, isDark: this.dark, detailsLabel: '查看等级详情',
            onOpenDetails: (): void => { this.details = !this.details; } })
          if (this.details) { SharedLevelDetails({ model: this.model, isDark: this.dark }) }
          ActionButton({ label: '闪卡示例贡献 +60', busy: this.busy, isDark: this.dark,
            onAction: (): void => { this.contribute('cards', 60); } })
          ActionButton({ label: '空间训练示例贡献 +120', busy: this.busy, isDark: this.dark,
            onAction: (): void => { this.contribute('spatial', 120); } })
          ActionButton({ label: '产生维护预警', busy: this.busy, isDark: this.dark,
            isEnabled: this.state.warning === undefined && this.state.points > 0,
            onAction: (): void => { this.proposeRisk(); } })
          ActionButton({ label: '评定缓冲结果', busy: this.busy, isDark: this.dark,
            isEnabled: this.state.warning !== undefined, onAction: (): void => { this.settle(true); } })
          ActionButton({ label: '模拟恢复维护条件', busy: this.busy, isDark: this.dark,
            isEnabled: this.state.warning !== undefined, onAction: (): void => { this.settle(false); } })
          ActionButton({ label: '查看待展示反馈 ' + this.state.notices.length, busy: this.busy,
            isDark: this.dark, isEnabled: this.state.notices.length > 0,
            onAction: (): void => { this.feedback = true; } })
          ActionButton({ label: this.dark ? '切换浅色' : '切换深色', isDark: this.dark,
            onAction: (): void => { this.dark = !this.dark; } })
          Text(this.status).fontSize(UiTokens.bodySize).fontColor(themePalette(this.dark).secondaryText)
        }.padding(UiTokens.pageInset).width('100%')
      }.width('100%').height('100%')
      if (this.feedback && this.state.notices.length > 0) {
        SharedLevelFeedback({ model: this.noticeModel(), kind: this.currentNotice().kind,
          title: this.feedbackTitle(), description: this.currentNotice().reason.length > 0 ?
            this.currentNotice().reason : '每次有效使用都会积累进度', dismissLabel: '知道了',
          statusText: this.status, busy: this.busy, isDark: this.dark, viewport: this.viewport,
          onAcknowledge: (): void => { this.dismiss(); } })
          .onAppear((): void => { this.warningSeen(); })
      }
    }.width('100%').height('100%').backgroundColor(themePalette(this.dark).page)
    .onAreaChange((_old: Area, area: Area): void => {
      this.viewport = { width: Number(area.width), height: Number(area.height), safeTop: 0,
        safeBottom: 0, safeLeft: 0, safeRight: 0, keyboardTop: 0 };
    })
  }
}
