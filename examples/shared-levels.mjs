// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedLevelAccount, UniformLevelScale, summarizeLevel } from '../src/core/Levels.ts';
import { DemoLevelDatabase, DemoSharedLevelStore } from './LevelDemoStore.ts';

// 演示参数，不代表任何产品获批的分值、缓冲时长或成就门槛。
const rules = { version: 'example-1', scale: new UniformLevelScale(100), graceMs: 60_000,
  milestones: [{ id: 'first-step', level: 2 }, { id: 'steady-growth', level: 3 }] };
const database = new DemoLevelDatabase();
const cards = new SharedLevelAccount(new DemoSharedLevelStore(database), rules);
const spatial = new SharedLevelAccount(new DemoSharedLevelStore(database), rules);
const account = 'demo-series-account';
await cards.contribute(account, { id: 'completion-1', productId: 'cards', points: 80, at: 1000 });
await spatial.contribute(account, { id: 'completion-1', productId: 'spatial', points: 150, at: 1001 });
const before = await cards.read(account);
const risk = await spatial.proposeRisk(account, { id: 'condition-1', productId: 'spatial', pointsToLose: 150,
  reason: '演示维护条件未满足', at: 2000 });
const warningId = risk.state.warning.id;
const seen = await cards.markWarningSeen(account, { id: warningId, at: 3000 });
const after = await spatial.settleRisk(account, { id: warningId, at: 63_000,
  expectedRevision: seen.state.revision, isStillAtRisk: true });
console.log(JSON.stringify({ sharedBefore: summarizeLevel(before, rules),
  sharedAfter: summarizeLevel(after.state, rules), preservedAchievements: after.state.achievementIds }, null, 2));
