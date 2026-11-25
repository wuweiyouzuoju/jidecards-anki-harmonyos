import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareMedalAward, validateMedalDefinition, medalSvg, levelMedalSvg,
  medalColorLabel, medalNumeral, resolveWornMedalId } from '../src/core/Medals.ts';

const examples = JSON.parse(readFileSync(new URL('../assets/medals/review-definitions.json', import.meta.url), 'utf8'));
const request = (extra = {}) => ({ accountId: 'u', productId: 'spatial', eventId: 'event-1',
  issuerId: 'series-host', eligibilityId: 'review-1', awardedAt: 100, reason: '已核验的贡献', ...extra });

test('佩戴沿用旧成长徽章默认，用户可选择任意已拥有类别或明确取消，选择不修改颁发事实', () => {
  const owned = [
    { ...request(), medalId: 'level-1', definitionVersion: '1', category: 'level' },
    { ...request(), medalId: 'contribution', definitionVersion: '1', category: 'contribution' },
    { ...request(), medalId: 'level-2', definitionVersion: '1', category: 'level' }
  ];
  const before = structuredClone(owned);
  assert.equal(resolveWornMedalId('u', []), '');
  assert.equal(resolveWornMedalId('u', owned), 'level-2');
  assert.equal(resolveWornMedalId('u', owned, 'contribution'), 'contribution');
  assert.equal(resolveWornMedalId('u', owned, 'level-1'), 'level-1');
  assert.equal(resolveWornMedalId('u', owned, ''), '');
  assert.deepEqual(owned, before);
});

test('未获得、跨账户、重复拥有和错误类型的佩戴选择均拒绝', () => {
  const owned = [{ ...request(), medalId: 'level-1', definitionVersion: '1', category: 'level' }];
  assert.throws(() => resolveWornMedalId('u', owned, 'level-2'), /unowned/);
  assert.throws(() => resolveWornMedalId('other', owned, 'level-1'), /ownership/);
  assert.throws(() => resolveWornMedalId('u', [...owned, ...owned]), /ownership/);
  assert.throws(() => resolveWornMedalId('u', owned, null), /unowned/);
});

test('纪念和贡献独立于等级，类别可扩展，色阶不由类别强制决定', () => {
  for (const draft of examples) {
    validateMedalDefinition(draft);
    const definition = { ...draft, status: 'approved' };
    const result = prepareMedalAward(definition, request(), []);
    assert.equal(result.changed, true);
    assert.equal(result.award.category, draft.category);
    assert.equal(result.award.eligibilityId, 'review-1');
  }
  const custom = { ...examples[0], id: 'founder.v1', category: 'founder', status: 'approved',
    artwork: { motif: 'commemorative', colorStep: 1 } };
  assert.equal(prepareMedalAward(custom, request(), []).award.category, 'founder');
  assert.match(medalSvg(custom.artwork), /#647080/);
});

test('同账户同徽章跨应用只保留首次颁发，重试冲突可见，记录不被隐式修改', () => {
  const definition = { ...examples[1], status: 'approved' };
  const first = prepareMedalAward(definition, request(), []);
  const stored = [structuredClone(first.award)];
  assert.equal(prepareMedalAward(definition, request(), stored).changed, false);
  const anotherApp = prepareMedalAward({ ...definition, version: '2' },
    request({ productId: 'cards', eventId: 'event-2', awardedAt: 200 }), stored);
  assert.equal(anotherApp.changed, false);
  assert.deepEqual(anotherApp.award, first.award);
  anotherApp.award.reason = '不能污染保存记录';
  assert.deepEqual(stored[0], first.award);
  assert.throws(() => prepareMedalAward(definition, request({ eligibilityId: 'other-review' }), stored), /Conflicting/);
  assert.equal(prepareMedalAward(definition, request({ accountId: 'other' }), stored).changed, true);
  assert.throws(() => prepareMedalAward(definition, request(), [stored[0], stored[0]]), /Duplicate/);
});

test('草案不能颁发，缺少来源、资格或坏时间不能伪造完整记录', () => {
  const draft = examples[1];
  assert.throws(() => prepareMedalAward(draft, request(), []), /awaiting review/);
  const definition = { ...draft, status: 'approved' };
  for (const invalid of [{ eventId: '' }, { issuerId: '' }, { eligibilityId: ' ' },
    { productId: '' }, { awardedAt: NaN }, { awardedAt: -1 }]) {
    assert.throws(() => prepareMedalAward(definition, request(invalid), []));
  }
});

test('超出预览枚数保留幻彩，不重置色阶；非法图案数据失败', () => {
  assert.equal(medalColorLabel(1), '素灰');
  assert.equal(medalColorLabel(8), '幻彩');
  assert.equal(medalColorLabel(40), '幻彩');
  assert.match(levelMedalSvg(40, true), /linearGradient/);
  assert.match(levelMedalSvg(40, true), />肆拾<\/text>/);
  assert.throws(() => medalSvg({ motif: 'number', colorStep: 0, ordinal: 1 }));
  assert.throws(() => medalSvg({ motif: 'number', colorStep: 1 }));
  assert.throws(() => medalSvg({ motif: 'unsupported', colorStep: 1 }));
});

test('徽章枚序使用汉字大写，十位和较大枚序不混用阿拉伯数字', () => {
  assert.deepEqual([1, 2, 9, 10, 11, 20, 40, 52, 101].map(medalNumeral),
    ['壹', '贰', '玖', '壹拾', '壹拾壹', '贰拾', '肆拾', '伍拾贰', '壹佰零壹']);
  assert.throws(() => medalNumeral(0));
  assert.equal(medalNumeral(10001), '壹万零壹');
  assert.equal(medalNumeral(100000001), '壹亿零壹');
  assert.doesNotMatch(levelMedalSvg(52, false, false), /<text/,
    'Harmony 资源省略不受支持的 SVG text，使用相同格式化函数的原生文字层');
});
