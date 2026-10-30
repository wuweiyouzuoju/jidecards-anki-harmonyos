// SPDX-License-Identifier: AGPL-3.0-or-later

// 填空解析器 单元测试：移植自 Anki rslib/src/cloze.rs 的 #[cfg(test)] 模块。
// 覆盖 文本中的填空编号 / 揭示填空内容 / 提取拼写填空内容 的核心行为：
// - 基础 cloze 标记解析、多 ordinal、嵌套 cloze
// - 提取拼写填空内容 的塌缩逻辑（全相同 pop / 不同 join ', '）
// - 文本中的填空编号 去重排序、排除 0、multi-ordinal 解析
// 注：reveal_cloze_text（HTML 版）未移植，相关 Rust 测试改为测 提取拼写填空内容 / 揭示填空内容。
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  文本中的填空编号,
  提取拼写填空内容,
  揭示填空内容
} from '../../entry/src/main/ets/model/填空解析器.ts';

test('cloze_numbers_in_string', () => {
  // 移植自 Rust cloze() 测试的 文本中的填空编号 部分
  assert.deepEqual(文本中的填空编号('test'), []);
  assert.deepEqual(文本中的填空编号('{{c2::te}}{{c1::s}}t{{'), [1, 2]);
  // c0 不被收录
  assert.deepEqual(文本中的填空编号('{{c0::te}}s{{c2::t}}s'), [2]);
});

test('cloze_only', () => {
  // 移植自 Rust cloze_only() 测试：揭示填空内容 行为
  assert.equal(揭示填空内容('foo', 1, true), '');
  assert.equal(揭示填空内容('foo {{c1::bar}}', 1, true), '...');
  assert.equal(揭示填空内容('foo {{c1::bar::baz}}', 1, true), 'baz');
  assert.equal(揭示填空内容('foo {{c1::bar}}', 1, false), 'bar');
  assert.equal(揭示填空内容('foo {{c1::bar}}', 2, false), '');
  assert.equal(揭示填空内容('{{c1::foo}} {{c1::bar}}', 1, false), 'foo, bar');
});

test('clozes_for_typing', () => {
  // 移植自 Rust clozes_for_typing() 测试：提取拼写填空内容 行为
  assert.equal(提取拼写填空内容('{{c2::foo}}', 1), '');
  assert.equal(
    提取拼写填空内容('{{c1::foo}} {{c1::bar}} {{c1::foo}}', 1),
    'foo, bar, foo'
  );
  // 全相同内容塌缩为单条
  assert.equal(
    提取拼写填空内容('{{c1::foo}} {{c1::foo}} {{c1::foo}}', 1),
    'foo'
  );
});

test('extract_cloze_for_typing_basic', () => {
  // checklist 核心断言
  assert.equal(提取拼写填空内容('foo {{c1::bar}}', 1), 'bar');
  assert.equal(提取拼写填空内容('foo {{c1::bar}}', 2), '');
  // 含 hint：hint 不出现在 typing 答案中
  assert.equal(提取拼写填空内容('foo {{c1::bar::baz}}', 1), 'bar');
});

test('nested_cloze_for_typing', () => {
  // 移植自 Rust nested_cloze_plain_text() 测试，改用 提取拼写填空内容
  // 嵌套 cloze：c1 包含 c2，c1 的 typing 答案为 "bar baz"
  assert.equal(提取拼写填空内容('foo {{c1::bar {{c2::baz}}}}', 1), 'bar baz');
  assert.equal(提取拼写填空内容('foo {{c1::bar {{c2::baz}}}}', 2), 'baz');
});

test('multi_card_cloze_edge_cases', () => {
  // 移植自 Rust multi_card_cloze_edge_cases() 测试
  assert.deepEqual(文本中的填空编号('{{c1,1,2::test}}'), [1, 2]);
  assert.deepEqual(文本中的填空编号('{{c0,1,2::test}}'), [1, 2]);
  assert.deepEqual(文本中的填空编号('{{c1,,3::test}}'), [1, 3]);
});

test('multi_card_cloze_only_filter', () => {
  // 移植自 Rust multi_card_cloze_only_filter() 测试
  const text = '{{c1,2::shared}} and {{c1::first}} vs {{c2::second}}';
  assert.equal(揭示填空内容(text, 1, true), '..., ...');
  assert.equal(揭示填空内容(text, 2, true), '..., ...');
  assert.equal(揭示填空内容(text, 1, false), 'shared, first');
  assert.equal(揭示填空内容(text, 2, false), 'shared, second');
});

test('multi_card_nested_cloze', () => {
  // 移植自 Rust multi_card_nested_cloze() 的 文本中的填空编号 部分
  assert.deepEqual(文本中的填空编号('{{c1,2::outer {{c3::inner}}}}'), [1, 2, 3]);
});

test('nested_parent_child_card_same_cloze', () => {
  // 移植自 Rust nested_parent_child_card_same_cloze() 的 文本中的填空编号 部分
  assert.deepEqual(文本中的填空编号('{{c1::outer {{c1::inner}}}}'), [1]);
});

test('multi_card_cloze_with_hints_for_typing', () => {
  // 移植自 Rust multi_card_cloze_with_hints()，改用 提取拼写填空内容
  // hint 不出现在 typing 答案中
  assert.equal(提取拼写填空内容('{{c1,2::answer::hint}}', 1), 'answer');
  assert.equal(提取拼写填空内容('{{c1,2::answer::hint}}', 2), 'answer');
});

test('multi_ordinal_extract_for_typing', () => {
  // checklist：multi-ordinal cloze 的 typing 提取
  assert.deepEqual(文本中的填空编号('{{c1,2::shared}}'), [1, 2]);
  assert.equal(提取拼写填空内容('{{c1,2::shared}}', 1), 'shared');
  assert.equal(提取拼写填空内容('{{c1,2::shared}}', 2), 'shared');
});

test('non_latin_text', () => {
  // 移植自 Rust non_latin() 测试
  assert.deepEqual(文本中的填空编号('öaöaöööaö'), []);
});
