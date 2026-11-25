import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedLevelAccount, UniformLevelScale, createLevelState, summarizeLevel,
  validateLevelState, DoublingLevelMilestones } from '../src/core/Levels.ts';
import { levelMedalSvg } from '../src/core/Medals.ts';
import { DemoLevelDatabase, DemoSharedLevelStore } from '../examples/LevelDemoStore.ts';

const rules = () => ({ version: 'test-1', scale: new UniformLevelScale(100), graceMs: 1000,
  milestones: [{ id: 'first', level: 2 }, { id: 'steady', level: 3 }] });
function fixture(policy = rules()) {
  const database = new DemoLevelDatabase();
  const store = new DemoSharedLevelStore(database);
  return { database, store, policy, account: new SharedLevelAccount(store, policy) };
}
const activity = (id, points, at = 0, productId = 'cards') => ({ id, productId, points, at });

test('系列翻倍勋章按公式覆盖全部门槛，跨级补齐、重试不重复、回退保留', async () => {
  const source = new DoublingLevelMilestones();
  assert.deepEqual(source.earnedThrough(1), []);
  assert.deepEqual(source.earnedThrough(33).map(item => item.level), [2, 4, 8, 16, 32]);
  assert.equal(source.earnedThrough(2 ** 40).length, 40, '没有三枚、八枚等业务上限');
  assert.equal(source.earnedThrough(Number.MAX_SAFE_INTEGER).length, 52);
  assert.throws(() => source.earnedThrough(Infinity));
  const f = fixture({ ...rules(), milestones: [], milestoneSource: source });
  const earned = await f.account.contribute('u', activity('jump', 800));
  assert.equal(earned.state.highestLevel, 9);
  assert.deepEqual(earned.state.achievementIds, source.earnedThrough(9).map(item => item.id));
  assert.equal((await f.account.contribute('u', activity('jump', 800))).replayed, true);
  const risk = await f.account.proposeRisk('u', { id: 'cycle', productId: 'series', pointsToLose: 800,
    reason: 'test maintenance', at: 1 });
  await f.account.markWarningSeen('u', { id: risk.state.warning.id, at: 2 });
  const demoted = await assess(f.account, { id: risk.state.warning.id, at: 1002 }, true);
  assert.equal(summarizeLevel(demoted.state, f.policy).level, 1);
  assert.deepEqual(demoted.state.achievementIds, earned.state.achievementIds);
  const imported = createLevelState('import', f.policy, 0, 1500);
  assert.equal(imported.highestLevel, 16);
  assert.equal(imported.achievementIds.length, 4);
  assert.match(levelMedalSvg(40), />肆拾<\/text>/);
  assert.throws(() => levelMedalSvg(0));
});
async function assess(account, action, isStillAtRisk) {
  const current = await account.read('u');
  return account.settleRisk('u', { ...action, expectedRevision: current.revision, isStillAtRisk });
}

test('等级边界、跨多级和大等级不依赖有限阈值表', async () => {
  const f = fixture();
  assert.equal(summarizeLevel(createLevelState('u', f.policy, 0), f.policy).level, 1);
  const near = await f.account.contribute('u', activity('near', 99));
  assert.equal(summarizeLevel(near.state, f.policy).progress, 0.99);
  const exact = await f.account.contribute('u', activity('exact', 1));
  assert.deepEqual(summarizeLevel(exact.state, f.policy),
    { level: 2, highestLevel: 2, progress: 0, current: 0, required: 100 });
  const jumped = await f.account.contribute('u', activity('jump', 250));
  assert.deepEqual(jumped.state.achievementIds, ['first', 'steady']);
  assert.equal(jumped.state.notices.at(-1).fromLevel, 2);
  assert.equal(jumped.state.notices.at(-1).toLevel, 4);
  assert.equal(jumped.state.notices.length, 2, '一次跨多级产生一次反馈');
  assert.equal(new UniformLevelScale(100).resolve(10_000_000_000).level, 100_000_001);
});

test('可替换增长标尺，产品共用规则而非在UI里计算等级', async () => {
  class GrowingScale {
    resolve(points) {
      let level = 1, start = 0, next = 10;
      while (points >= next) { level++; start = next; next *= 2; }
      return { level, start, next };
    }
  }
  const policy = { ...rules(), scale: new GrowingScale() };
  const f = fixture(policy);
  const committed = await f.account.contribute('u', activity('one', 25));
  assert.deepEqual(summarizeLevel(committed.state, policy),
    { level: 3, highestLevel: 3, progress: 0.25, current: 5, required: 20 });
});

test('两个产品贡献同一个账户，同名活动跨产品隔离；不同用户隔离', async () => {
  const f = fixture();
  const spatial = new SharedLevelAccount(new DemoSharedLevelStore(f.database), f.policy);
  await f.account.contribute('u', activity('same', 80, 1));
  await spatial.contribute('u', activity('same', 50, 2, 'spatial'));
  await spatial.contribute('v', activity('same', 1, 3, 'spatial'));
  assert.equal((await f.account.read('u')).points, 130);
  assert.equal((await spatial.read('u')).points, 130);
  assert.equal((await f.account.read('v')).points, 1);
  const replay = await f.account.contribute('u', activity('same', 80, 0));
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.points, 130, '旧请求重试返回最新共享状态');
  await assert.rejects(f.account.contribute('u', activity('same', 81, 4)), /Conflicting/);
});

test('并发写入不会丢贡献；请求和返回值均无可变引用泄漏', async () => {
  const f = fixture();
  const pending = Array.from({ length: 30 }, (_, i) =>
    new SharedLevelAccount(new DemoSharedLevelStore(f.database), f.policy).contribute('u', activity(String(i), 1)));
  await Promise.all(pending);
  const input = activity('mutable', 100);
  const submitted = f.account.contribute('u', input);
  input.points = 9000;
  const committed = await submitted;
  assert.equal(committed.state.points, 130);
  committed.state.points = 0;
  committed.state.achievementIds.length = 0;
  assert.equal((await f.account.read('u')).points, 130);
  assert.deepEqual((await f.account.read('u')).achievementIds, ['first']);
});

test('保存失败不发布成功；已保存但响应丢失时可幂等重试', async () => {
  const f = fixture();
  let failBefore = true, failAfter = false;
  const unreliable = {
    read: id => f.store.read(id),
    async transact(...args) {
      if (failBefore) { failBefore = false; throw new Error('write failed'); }
      const result = await f.store.transact(...args);
      if (failAfter) { failAfter = false; throw new Error('response lost'); }
      return result;
    }
  };
  const account = new SharedLevelAccount(unreliable, f.policy);
  await assert.rejects(account.contribute('u', activity('one', 100)), /write failed/);
  assert.equal(await account.read('u'), undefined);
  failAfter = true;
  await assert.rejects(account.contribute('u', activity('one', 100)), /response lost/);
  const retry = await account.contribute('u', activity('one', 100, 2));
  assert.equal(retry.replayed, true);
  assert.equal(retry.state.points, 100);
  assert.equal(retry.state.notices.length, 1);
});

async function warnedFixture() {
  const f = fixture();
  await f.account.contribute('u', activity('start', 250, 10));
  const risk = { id: 'risk-cycle-1', productId: 'series', pointsToLose: 180, reason: '维护条件未满足', at: 20 };
  const warned = await f.account.proposeRisk('u', risk);
  return { ...f, risk, warningId: warned.state.warning.id };
}

test('用户看到预警后才计缓冲，边界前不降级，边界时只结算一次', async () => {
  const f = await warnedFixture();
  const unseen = await assess(f.account, { id: f.warningId, at: 5000 }, true);
  assert.equal(unseen.changed, false);
  assert.equal(unseen.state.points, 250);
  await f.account.markWarningSeen('u', { id: f.warningId, at: 6000 });
  assert.equal((await assess(f.account, { id: f.warningId, at: 6999 }, true)).changed, false);
  const exact = await assess(f.account, { id: f.warningId, at: 7000 }, true);
  assert.equal(exact.state.points, 70);
  assert.equal(summarizeLevel(exact.state, f.policy).level, 1);
  assert.equal(exact.state.highestLevel, 3);
  assert.equal(exact.state.lifetimePoints, 250);
  assert.deepEqual(exact.state.achievementIds, ['first', 'steady']);
  assert.equal(exact.state.warning, undefined);
  assert.equal(exact.state.notices.at(-1).kind, 'demoted');
  const duplicate = await assess(f.account, { id: f.warningId, at: 8000 }, true);
  assert.equal(duplicate.replayed, true);
  assert.equal(duplicate.state.points, 70);
  const duplicateRisk = await f.account.proposeRisk('u', { ...f.risk, at: 8001 });
  assert.equal(duplicateRisk.replayed, true);
  assert.equal(duplicateRisk.state.warning, undefined, '同一风险周期不会复活');
});

test('缓冲中贡献保留；条件恢复可取消风险，不将累积量回写旧目标值', async () => {
  const f = await warnedFixture();
  await f.account.markWarningSeen('u', { id: f.warningId, at: 30 });
  await f.account.contribute('u', activity('during-grace', 100, 40, 'spatial'));
  const settled = await assess(f.account, { id: f.warningId, at: 1030 }, true);
  assert.equal(settled.state.points, 170, '350 - 180，保留缓冲期间新贡献');
  assert.equal(settled.state.highestLevel, 4);
  const g = await warnedFixture();
  const recovered = await assess(g.account, { id: g.warningId, at: 30 }, false);
  assert.equal(recovered.state.warning, undefined);
  assert.equal(recovered.state.points, 250);
  assert.equal(recovered.state.notices.at(-1).kind, 'recovered');
  assert.equal((await assess(g.account, { id: g.warningId, at: 5000 }, true)).changed, false);
});

test('重启保留缓冲期、事务回执和待展示反馈；跳过反馈不撤销等级', async () => {
  const f = await warnedFixture();
  await f.account.markWarningSeen('u', { id: f.warningId, at: 30 });
  const database = DemoLevelDatabase.restore(f.database.snapshot());
  const restarted = new SharedLevelAccount(new DemoSharedLevelStore(database), f.policy);
  const state = await restarted.read('u');
  assert.equal(state.warning.seenAt, 30);
  assert.equal(state.notices.length, 2);
  const noticeId = state.notices[0].id;
  const skipped = await restarted.acknowledgeNotice('u', { id: noticeId, at: 40 });
  assert.equal(skipped.state.points, 250);
  assert.equal(skipped.state.notices.some(n => n.id === noticeId), false);
  const again = new SharedLevelAccount(new DemoSharedLevelStore(DemoLevelDatabase.restore(database.snapshot())), f.policy);
  const retry = await again.contribute('u', activity('start', 250, 50));
  assert.equal(retry.replayed, true);
  assert.equal(retry.state.notices.some(n => n.id === noticeId), false);
  assert.equal((await assess(again, { id: f.warningId, at: 1030 }, true)).state.points, 70);
});

test('风险不会堆叠，旧时钟不覆盖新状态，降幅超过余额时最低为 Lv.1', async () => {
  const f = await warnedFixture();
  await assert.rejects(f.account.proposeRisk('u', { ...f.risk, id: 'another', at: 21 }), /active shared warning/);
  await assert.rejects(f.account.contribute('u', activity('old', 1, 19)), /Stale/);
  const g = fixture();
  await g.account.contribute('u', activity('one', 50));
  const risk = await g.account.proposeRisk('u', { ...f.risk, pointsToLose: 999, at: 1 });
  await g.account.markWarningSeen('u', { id: risk.state.warning.id, at: 2 });
  const bottom = await assess(g.account, { id: risk.state.warning.id, at: 1002 }, true);
  assert.equal(bottom.state.points, 0);
  assert.equal(summarizeLevel(bottom.state, g.policy).level, 1);
  assert.equal(bottom.state.notices.at(-1).kind, 'reduced');
});

test('坏输入、坏快照和旧规则要求显式处理，不清空或猜测旧数据', async () => {
  const f = fixture();
  for (const points of [0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => f.account.contribute('u', activity('bad', points)));
  }
  for (const step of [0, -1, 1.5, NaN]) assert.throws(() => new UniformLevelScale(step));
  assert.throws(() => new SharedLevelAccount(f.store, { ...f.policy, graceMs: 0 }));
  assert.throws(() => new SharedLevelAccount(f.store, { ...f.policy,
    milestones: [{ id: 'same', level: 1 }, { id: 'same', level: 2 }] }));
  const imported = createLevelState('legacy', f.policy, 0, 120, 4);
  assert.equal(imported.highestLevel, 4);
  assert.deepEqual(imported.achievementIds, ['first', 'steady']);
  for (const bad of [
    { ...imported, schemaVersion: 0 }, { ...imported, ruleVersion: 'older' },
    { ...imported, points: -1 }, { ...imported, lifetimePoints: 0 },
    { ...imported, highestLevel: 1 }, { ...imported, achievementIds: ['same', 'same'] }
  ]) assert.throws(() => validateLevelState(bad, f.policy));
  f.database.accounts.set('legacy', { ...imported, schemaVersion: 0 });
  await assert.rejects(f.account.read('legacy'), /migration/);
  await assert.rejects(f.account.contribute('legacy', activity('one', 100)), /migration/);
  assert.equal(f.database.accounts.get('legacy').schemaVersion, 0);
  const wrong = new SharedLevelAccount({ read: async () => imported, transact: () => {} }, f.policy);
  await assert.rejects(wrong.read('someone-else'), /Wrong/);
  assert.throws(() => new UniformLevelScale(100).resolve(Number.MAX_SAFE_INTEGER), /Invalid/);
});

test('旧快照维护判断不能扣减新贡献，重读评定后可恢复维护条件', async () => {
  const f = await warnedFixture();
  const seen = await f.account.markWarningSeen('u', { id: f.warningId, at: 30 });
  const oldRevision = seen.state.revision;
  await f.account.contribute('u', activity('new-evidence', 200, 40, 'spatial'));
  await assert.rejects(f.account.settleRisk('u', { id: f.warningId, at: 1030,
    expectedRevision: oldRevision, isStillAtRisk: true }), /Stale risk assessment/);
  assert.equal((await f.account.read('u')).points, 450);
  const recovered = await assess(f.account, { id: f.warningId, at: 1031 }, false);
  assert.equal(recovered.state.points, 450);
  assert.equal(recovered.state.warning, undefined);
});

test('重复查看预警不会延长缓冲，预警保存时不扣分', async () => {
  const f = await warnedFixture();
  assert.equal((await f.account.read('u')).points, 250);
  await f.account.markWarningSeen('u', { id: f.warningId, at: 30 });
  const repeated = await f.account.markWarningSeen('u', { id: f.warningId, at: 1029 });
  assert.equal(repeated.replayed, true);
  assert.equal(repeated.state.warning.seenAt, 30);
  const exact = await assess(f.account, { id: f.warningId, at: 1030 }, true);
  assert.equal(exact.state.points, 70);
});

test('自定义标尺的非法阈值和反向等级变动拒绝提交，规则版本冲突不重复计分', async () => {
  class BadScale {
    resolve(points) {
      if (points === 0) return { level: 1, start: 0, next: 100 };
      if (points === 100) return { level: 3, start: 100, next: 200 };
      if (points === 200) return { level: 2, start: 200, next: 300 };
      return { level: 2, start: points + 1, next: points + 2 };
    }
  }
  const f = fixture({ ...rules(), scale: new BadScale() });
  await f.account.contribute('u', activity('first', 100));
  await assert.rejects(f.account.contribute('u', activity('backwards', 100)), /monotonic/);
  await assert.rejects(f.account.contribute('u', activity('threshold', 1)), /Invalid level scale/);
  assert.equal((await f.account.read('u')).points, 100);
  const conflicting = new SharedLevelAccount(f.store, { ...f.policy, version: 'new-rule' });
  await assert.rejects(conflicting.contribute('u', activity('first', 100)), /Conflicting/);
  await assert.rejects(conflicting.contribute('u', activity('new', 100)), /migration/);
  assert.equal((await f.account.read('u')).points, 100);
});
