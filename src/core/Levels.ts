// SPDX-License-Identifier: AGPL-3.0-or-later
/** 全系列共享一个账户和标尺；产品只适配有效活动与贡献量。 */
export interface LevelBand {
  level: number;
  start: number;
  next: number;
}

export interface LevelScale {
  resolve(points: number): LevelBand;
}

/** 无等级表上限的等距标尺示例；正式产品可注入同接口的增长曲线。 */
export class UniformLevelScale implements LevelScale {
  private readonly step: number;

  constructor(pointsPerLevel: number) {
    natural(pointsPerLevel, 'pointsPerLevel', 1);
    this.step = pointsPerLevel;
  }

  resolve(points: number): LevelBand {
    natural(points, 'points');
    const level: number = Math.floor(points / this.step) + 1;
    const band: LevelBand = { level: level, start: (level - 1) * this.step, next: level * this.step };
    validateBand(band, points);
    return band;
  }
}

export interface LevelMilestone {
  id: string;
  level: number;
}

export interface LevelMilestoneSource {
  earnedThrough(highestLevel: number): LevelMilestone[];
}

/** 系列勋章：Lv.2、4、8、16……，按公式生成，未设置业务枚数上限。 */
export class DoublingLevelMilestones implements LevelMilestoneSource {
  earnedThrough(highestLevel: number): LevelMilestone[] {
    natural(highestLevel, 'highestLevel', 1);
    const earned: LevelMilestone[] = [];
    let level: number = 2;
    let ordinal: number = 1;
    while (level <= highestLevel) {
      earned.push({ id: 'jide.level-doubling.v1.' + ordinal, level: level });
      if (level > Number.MAX_SAFE_INTEGER / 2) { break; }
      level *= 2;
      ordinal++;
    }
    return earned;
  }
}

export interface LevelRules {
  version: string;
  scale: LevelScale;
  graceMs: number;
  milestones: LevelMilestone[];
  milestoneSource?: LevelMilestoneSource;
}

export interface LevelWarning {
  id: string;
  productId: string;
  reason: string;
  pointsToLose: number;
  createdAt: number;
  seenAt: number | undefined;
}

export interface LevelNotice {
  id: string;
  kind: string;
  fromLevel: number;
  toLevel: number;
  reason: string;
  at: number;
}

export interface LevelState {
  schemaVersion: number;
  accountId: string;
  ruleVersion: string;
  revision: number;
  points: number;
  lifetimePoints: number;
  highestLevel: number;
  updatedAt: number;
  achievementIds: string[];
  warning: LevelWarning | undefined;
  notices: LevelNotice[];
}

export interface LevelActivity {
  id: string;
  productId: string;
  points: number;
  at: number;
}

export interface LevelRisk {
  id: string;
  productId: string;
  pointsToLose: number;
  reason: string;
  at: number;
}

export interface LevelAction {
  id: string;
  at: number;
}

export interface LevelRiskAssessment extends LevelAction {
  expectedRevision: number;
  isStillAtRisk: boolean;
}

export interface LevelMutation {
  state: LevelState;
  changed: boolean;
}

export interface LevelCommit {
  state: LevelState;
  changed: boolean;
  replayed: boolean;
}

/**
 * 宿主必须原子提交状态与去重回执，跨进程/设备调用共享同一个账户入口。
 * 相同 operationId + fingerprint 返回当前最新状态；不同 fingerprint 明确拒绝。
 * changed=false 的延后评定不能写完成回执，否则会阻止缓冲期后的真正结算。
 */
export interface SharedLevelStore {
  read(accountId: string): Promise<LevelState | undefined>;
  transact(accountId: string, operationId: string, fingerprint: string,
    update: (current: LevelState | undefined) => LevelMutation): Promise<LevelCommit>;
}

export interface LevelSummary {
  level: number;
  highestLevel: number;
  progress: number;
  current: number;
  required: number;
}

function textValue(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) { throw new Error('Invalid ' + name); }
}

function natural(value: number, name: string, minimum: number = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) { throw new Error('Invalid ' + name); }
}

function validateBand(band: LevelBand, points: number): void {
  natural(band.level, 'level', 1);
  natural(band.start, 'level start');
  natural(band.next, 'next threshold', 1);
  if (band.start > points || band.next <= points || band.next <= band.start) {
    throw new Error('Invalid level scale');
  }
}

function bandFor(points: number, rules: LevelRules): LevelBand {
  natural(points, 'points');
  const band: LevelBand = rules.scale.resolve(points);
  validateBand(band, points);
  return band;
}

function validateRules(rules: LevelRules): void {
  textValue(rules.version, 'rule version');
  natural(rules.graceMs, 'graceMs', 1);
  if (!Array.isArray(rules.milestones)) { throw new Error('Invalid milestones'); }
  const ids: string[] = [];
  for (const milestone of rules.milestones) {
    textValue(milestone.id, 'milestone id');
    natural(milestone.level, 'milestone level', 1);
    if (ids.includes(milestone.id)) { throw new Error('Duplicate milestone id'); }
    ids.push(milestone.id);
  }
  if (bandFor(0, rules).level !== 1) { throw new Error('Level scale must start at level 1'); }
}

function earnedMilestones(highestLevel: number, rules: LevelRules): LevelMilestone[] {
  const earned: LevelMilestone[] = rules.milestones.filter((item: LevelMilestone): boolean => item.level <= highestLevel);
  if (rules.milestoneSource !== undefined) { earned.push(...rules.milestoneSource.earnedThrough(highestLevel)); }
  const ids: string[] = [];
  for (const milestone of earned) {
    textValue(milestone.id, 'milestone id');
    natural(milestone.level, 'milestone level', 1);
    if (milestone.level > highestLevel || ids.includes(milestone.id)) { throw new Error('Invalid earned milestone'); }
    ids.push(milestone.id);
  }
  return earned;
}

export function validateLevelState(state: LevelState, rules: LevelRules): void {
  if (state.schemaVersion !== 1 || state.ruleVersion !== rules.version) {
    throw new Error('Explicit level migration required');
  }
  textValue(state.accountId, 'account id');
  natural(state.revision, 'revision');
  natural(state.points, 'points');
  natural(state.lifetimePoints, 'lifetimePoints');
  natural(state.highestLevel, 'highestLevel', 1);
  natural(state.updatedAt, 'updatedAt');
  if (state.lifetimePoints < state.points || state.highestLevel < bandFor(state.points, rules).level) {
    throw new Error('Inconsistent level history');
  }
  if (!Array.isArray(state.achievementIds) || !Array.isArray(state.notices)) {
    throw new Error('Invalid level collections');
  }
  const ids: string[] = [];
  for (const id of state.achievementIds) {
    textValue(id, 'achievement id');
    if (ids.includes(id)) { throw new Error('Duplicate achievement'); }
    ids.push(id);
  }
  const noticeIds: string[] = [];
  for (const notice of state.notices) {
    textValue(notice.id, 'notice id');
    if (noticeIds.includes(notice.id) || !['advanced', 'warning', 'demoted', 'reduced', 'recovered'].includes(notice.kind)) {
      throw new Error('Invalid level notice');
    }
    noticeIds.push(notice.id);
    natural(notice.fromLevel, 'fromLevel', 1);
    natural(notice.toLevel, 'toLevel', 1);
    natural(notice.at, 'notice time');
    if (notice.at > state.updatedAt || typeof notice.reason !== 'string') { throw new Error('Invalid notice data'); }
  }
  if (state.warning !== undefined) {
    const warning: LevelWarning = state.warning;
    textValue(warning.id, 'risk id');
    textValue(warning.productId, 'product id');
    textValue(warning.reason, 'risk reason');
    natural(warning.pointsToLose, 'pointsToLose', 1);
    natural(warning.createdAt, 'risk time');
    if (warning.createdAt > state.updatedAt) { throw new Error('Invalid risk time'); }
    if (warning.seenAt !== undefined) {
      natural(warning.seenAt, 'seenAt');
      natural(warning.seenAt + rules.graceMs, 'risk deadline');
      if (warning.seenAt < warning.createdAt || warning.seenAt > state.updatedAt) {
        throw new Error('Invalid warning acknowledgement');
      }
    }
  }
}

export function cloneLevelState(state: LevelState): LevelState {
  const warning: LevelWarning | undefined = state.warning;
  return {
    schemaVersion: state.schemaVersion, accountId: state.accountId, ruleVersion: state.ruleVersion,
    revision: state.revision, points: state.points, lifetimePoints: state.lifetimePoints,
    highestLevel: state.highestLevel, updatedAt: state.updatedAt, achievementIds: state.achievementIds.slice(),
    warning: warning === undefined ? undefined : {
      id: warning.id, productId: warning.productId, reason: warning.reason,
      pointsToLose: warning.pointsToLose, createdAt: warning.createdAt, seenAt: warning.seenAt
    },
    notices: state.notices.map((notice: LevelNotice): LevelNotice => {
      return { id: notice.id, kind: notice.kind, fromLevel: notice.fromLevel,
        toLevel: notice.toLevel, reason: notice.reason, at: notice.at };
    })
  };
}

/** 初次创建或可靠旧数据导入；共享宿主需以固定导入身份原子落库，不能在每个产品重复导入。 */
export function createLevelState(accountId: string, rules: LevelRules, at: number,
  initialPoints: number = 0, historicalHighest: number = 1): LevelState {
  validateRules(rules);
  textValue(accountId, 'account id');
  natural(at, 'time');
  natural(historicalHighest, 'historicalHighest', 1);
  const highest: number = Math.max(historicalHighest, bandFor(initialPoints, rules).level);
  const state: LevelState = {
    schemaVersion: 1, accountId: accountId, ruleVersion: rules.version, revision: 0,
    points: initialPoints, lifetimePoints: initialPoints, highestLevel: highest, updatedAt: at,
    achievementIds: earnedMilestones(highest, rules)
      .map((item: LevelMilestone): string => item.id), warning: undefined, notices: []
  };
  validateLevelState(state, rules);
  return state;
}

export function summarizeLevel(state: LevelState, rules: LevelRules): LevelSummary {
  validateLevelState(state, rules);
  const band: LevelBand = bandFor(state.points, rules);
  const current: number = state.points - band.start;
  const required: number = band.next - band.start;
  return { level: band.level, highestLevel: state.highestLevel,
    progress: current / required, current: current, required: required };
}

/** 只在共享存储确认后返回；网络、登录、持久化及授权属于宿主。 */
export class SharedLevelAccount {
  private readonly store: SharedLevelStore;
  private readonly rules: LevelRules;

  constructor(store: SharedLevelStore, rules: LevelRules) {
    validateRules(rules);
    this.store = store;
    this.rules = { version: rules.version, scale: rules.scale, graceMs: rules.graceMs,
      milestoneSource: rules.milestoneSource,
      milestones: rules.milestones.map((item: LevelMilestone): LevelMilestone => {
        return { id: item.id, level: item.level };
      }) };
  }

  async read(accountId: string): Promise<LevelState | undefined> {
    textValue(accountId, 'account id');
    const state: LevelState | undefined = await this.store.read(accountId);
    if (state === undefined) { return undefined; }
    validateLevelState(state, this.rules);
    if (state.accountId !== accountId) { throw new Error('Wrong shared level account'); }
    return cloneLevelState(state);
  }

  contribute(accountId: string, activity: LevelActivity): Promise<LevelCommit> {
    activity = { id: activity.id, productId: activity.productId, points: activity.points, at: activity.at };
    textValue(activity.id, 'activity id');
    textValue(activity.productId, 'product id');
    natural(activity.points, 'contribution', 1);
    const operationId: string = JSON.stringify(['activity', activity.productId, activity.id]);
    // 到达时间不进入重试指纹；同一业务事实稍后重试仍是同一次贡献。
    const fingerprint: string = JSON.stringify([activity.productId, activity.id, activity.points]);
    return this.run(accountId, operationId, fingerprint, activity.at, (state: LevelState): boolean => {
      const previous: number = bandFor(state.points, this.rules).level;
      natural(state.points + activity.points, 'points overflow');
      natural(state.lifetimePoints + activity.points, 'lifetime overflow');
      state.points += activity.points;
      state.lifetimePoints += activity.points;
      const level: number = bandFor(state.points, this.rules).level;
      if (level < previous) { throw new Error('Level scale must be monotonic'); }
      state.highestLevel = Math.max(state.highestLevel, level);
      for (const milestone of earnedMilestones(state.highestLevel, this.rules)) {
        if (milestone.level <= state.highestLevel && !state.achievementIds.includes(milestone.id)) {
          state.achievementIds.push(milestone.id);
        }
      }
      if (level > previous) { this.notice(state, operationId, 'advanced', previous, level, '', activity.at); }
      return true;
    });
  }

  proposeRisk(accountId: string, risk: LevelRisk): Promise<LevelCommit> {
    risk = { id: risk.id, productId: risk.productId, pointsToLose: risk.pointsToLose, reason: risk.reason, at: risk.at };
    textValue(risk.id, 'risk id');
    textValue(risk.productId, 'product id');
    textValue(risk.reason, 'risk reason');
    natural(risk.pointsToLose, 'pointsToLose', 1);
    const operationId: string = JSON.stringify(['risk', risk.productId, risk.id]);
    const fingerprint: string = JSON.stringify([risk.productId, risk.id, risk.pointsToLose, risk.reason]);
    return this.run(accountId, operationId, fingerprint, risk.at, (state: LevelState): boolean => {
      if (state.warning !== undefined) { throw new Error('Resolve the active shared warning first'); }
      if (state.points === 0) { return false; }
      state.warning = { id: operationId, productId: risk.productId, pointsToLose: risk.pointsToLose,
        reason: risk.reason, createdAt: risk.at, seenAt: undefined };
      const level: number = bandFor(state.points, this.rules).level;
      this.notice(state, operationId, 'warning', level, level, risk.reason, risk.at);
      return true;
    });
  }

  markWarningSeen(accountId: string, action: LevelAction): Promise<LevelCommit> {
    action = { id: action.id, at: action.at };
    textValue(action.id, 'warning id');
    return this.run(accountId, JSON.stringify(['seen', action.id]), action.id, action.at,
      (state: LevelState): boolean => {
        if (state.warning === undefined || state.warning.id !== action.id || state.warning.seenAt !== undefined) {
          return false;
        }
        natural(action.at + this.rules.graceMs, 'risk deadline');
        state.warning.seenAt = action.at;
        return true;
      });
  }

  /** 宿主在结算时重新评定条件；缓冲未到或预警未展示时保持未结算，可稍后重试。 */
  settleRisk(accountId: string, assessment: LevelRiskAssessment): Promise<LevelCommit> {
    const action: LevelAction = { id: assessment.id, at: assessment.at };
    const isStillAtRisk: boolean = assessment.isStillAtRisk;
    const expectedRevision: number = assessment.expectedRevision;
    textValue(action.id, 'warning id');
    natural(expectedRevision, 'expected revision');
    if (typeof isStillAtRisk !== 'boolean') { throw new Error('Invalid risk assessment'); }
    const operationId: string = JSON.stringify([isStillAtRisk ? 'settle' : 'recover', action.id]);
    return this.run(accountId, operationId, action.id, action.at, (state: LevelState): boolean => {
      const warning: LevelWarning | undefined = state.warning;
      if (warning === undefined || warning.id !== action.id) { return false; }
      // 新贡献可能已满足维护条件；不能拿旧快照的判断扣减最新账户。
      if (state.revision !== expectedRevision) { throw new Error('Stale risk assessment; re-evaluate current account'); }
      if (isStillAtRisk && (warning.seenAt === undefined || action.at < warning.seenAt + this.rules.graceMs)) {
        return false;
      }
      const previous: number = bandFor(state.points, this.rules).level;
      if (isStillAtRisk) { state.points = Math.max(0, state.points - warning.pointsToLose); }
      const level: number = bandFor(state.points, this.rules).level;
      if (level > previous) { throw new Error('Level scale must be monotonic'); }
      state.warning = undefined;
      state.notices = state.notices.filter((item: LevelNotice): boolean => item.id !== warning.id);
      this.notice(state, operationId, isStillAtRisk ? (level < previous ? 'demoted' : 'reduced') : 'recovered',
        previous, level, warning.reason, action.at);
      return true;
    });
  }

  /** 跳过动画、关闭弹层只确认反馈，不撤销贡献或等级变化。 */
  acknowledgeNotice(accountId: string, action: LevelAction): Promise<LevelCommit> {
    action = { id: action.id, at: action.at };
    textValue(action.id, 'notice id');
    return this.run(accountId, JSON.stringify(['notice', action.id]), action.id, action.at,
      (state: LevelState): boolean => {
        const remaining: LevelNotice[] = state.notices.filter((item: LevelNotice): boolean => item.id !== action.id);
        if (remaining.length === state.notices.length) { return false; }
        state.notices = remaining;
        return true;
      });
  }

  private notice(state: LevelState, id: string, kind: string, from: number, to: number,
    reason: string, at: number): void {
    state.notices.push({ id: id, kind: kind, fromLevel: from, toLevel: to, reason: reason, at: at });
  }

  private async run(accountId: string, operationId: string, fingerprint: string, at: number,
    update: (state: LevelState) => boolean): Promise<LevelCommit> {
    textValue(accountId, 'account id');
    natural(at, 'authoritative time');
    const result: LevelCommit = await this.store.transact(accountId, operationId,
      JSON.stringify([this.rules.version, fingerprint]), (current: LevelState | undefined): LevelMutation => {
        const state: LevelState = current === undefined ? createLevelState(accountId, this.rules, at) : cloneLevelState(current);
        validateLevelState(state, this.rules);
        if (state.accountId !== accountId) { throw new Error('Wrong shared level account'); }
        if (at < state.updatedAt) { throw new Error('Stale level assessment; refresh authoritative time'); }
        const changed: boolean = update(state);
        if (changed) {
          natural(state.revision + 1, 'revision overflow');
          state.revision++;
          state.updatedAt = at;
        }
        validateLevelState(state, this.rules);
        return { state: state, changed: changed };
      });
    validateLevelState(result.state, this.rules);
    if (result.state.accountId !== accountId) { throw new Error('Wrong shared level account'); }
    return { state: cloneLevelState(result.state), changed: result.changed, replayed: result.replayed };
  }
}

/** UI 只消费已格式化的宿主文案；没有内置产品名、中文资源键或业务存储。 */
export interface LevelAchievementView {
  id: string;
  label: string;
}

export class LevelViewData {
  levelLabel: string = '';
  title: string = '';
  progressLabel: string = '';
  progress: number = 0;
  highestLabel: string = '';
  warningLabel: string = '';
  achievementsLabel: string = '';
  achievements: LevelAchievementView[] = [];
}
