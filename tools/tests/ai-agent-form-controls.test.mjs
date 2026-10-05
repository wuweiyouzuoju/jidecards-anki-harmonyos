// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { canAnswerClarification } from '../../entry/src/main/ets/model/agent/AgentClarification.ts';

const read = file => readFileSync(new URL('../../entry/src/main/ets/' + file, import.meta.url), 'utf8');
const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
const file = 'components/agent/AgentClarificationCard.ets';

test('clarification controls preserve host-owned answers and guard stale callbacks', () => {
  const Card = loadComponentLogic(file, 'AgentClarificationCard', { canAnswerClarification });
  const card = new Card();
  card.clarification = {
    request: { id: 'scope', question: 'Scope?', options: [
      { id: 'basic', label: 'Basic', description: 'Basics' },
      { id: 'advanced', label: 'Advanced', description: '' }
    ], recommendedOptionId: 'basic', allowFreeText: true },
    selectedOptionId: '', supplementalText: '', state: 'pending'
  };
  const selected = [], supplements = [];
  let continued = 0;
  card.onOptionSelected = id => selected.push(id);
  card.onSupplementChanged = value => supplements.push(value);
  card.onContinue = () => continued++;
  card.continueAnswer();
  assert.equal(continued, 0, 'recommendation is not an implicit selection');
  card.selectOption('basic'); card.changeSupplement('chapter 1');
  assert.deepEqual(selected, ['basic']); assert.deepEqual(supplements, ['chapter 1']);
  assert.equal(card.clarification.selectedOptionId, '', 'host owns state');
  card.clarification.selectedOptionId = 'basic';
  card.selectOption('basic'); card.continueAnswer();
  assert.deepEqual(selected, ['basic']); assert.equal(continued, 1);
  for (const state of ['submitting', 'resolved', 'cancelled']) {
    card.clarification.state = state;
    card.selectOption('advanced'); card.changeSupplement('late'); card.continueAnswer();
  }
  assert.deepEqual(selected, ['basic']); assert.deepEqual(supplements, ['chapter 1']);
  assert.equal(continued, 1);
  card.clarification.state = 'submit_failed';
  card.clarification.selectedOptionId = '';
  card.clarification.supplementalText = 'free answer';
  card.continueAnswer();
  assert.equal(continued, 2, 'free-text-only answer can retry');
});

test('multiline inputs match form colors and padding without owning height or editing', () => {
  for (const theme of ['light', 'dark']) {
    const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
      应用尺寸: dimensions, $r: key => `${theme}:${key}`
    });
    const Style = loadPlatformModule('utils/FormTextAreaStyle.ets', 'FormTextAreaStyle', {
      应用尺寸: dimensions, $r: key => `${theme}:${key}`, SurfaceBorder
    });
    const attributes = { height: 72, text: 'draft', enabled: false, onChange: 'host' };
    const node = {};
    for (const name of ['width', 'fontSize', 'fontColor', 'placeholderColor', 'backgroundColor', 'border', 'borderRadius', 'padding']) {
      node[name] = value => { attributes[name] = value; return node; };
    }
    new Style().applyNormalAttribute(node);
    assert.equal(attributes.width, '100%');
    assert.equal(attributes.fontSize, dimensions.字号_正文);
    assert.equal(attributes.fontColor, `${theme}:app.color.text_primary`);
    assert.equal(attributes.placeholderColor, `${theme}:app.color.text_tertiary`);
    assert.equal(attributes.backgroundColor, `${theme}:app.color.surface_card`);
    assert.deepEqual(attributes.border, { width: dimensions.卡片边框, color: `${theme}:app.color.surface_border` });
    assert.equal(attributes.borderRadius, dimensions.圆角_面板);
    assert.equal(attributes.padding, dimensions.间距_10);
    assert.deepEqual([attributes.height, attributes.text, attributes.enabled, attributes.onChange], [72, 'draft', false, 'host']);
  }
});

test('all Agent text areas share appearance; options have explicit selection and stable geometry', () => {
  let count = 0;
  for (const path of [file, 'components/agent/AgentEditableCard.ets', 'pages/AI制卡页.ets']) {
    const source = read(path);
    const areas = [...source.matchAll(/TextArea\([\s\S]*?\.onChange\(/g)];
    for (const [area] of areas) assert.match(area, /\.attributeModifier\(new FormTextAreaStyle\(\)\)/, path);
    count += areas.length;
  }
  assert.equal(count, 2);
  const draft = read('components/agent/AgentEditableCard.ets');
  assert.match(draft, /NoteFieldEditor\(\{[\s\S]*value: this.card.fields/);
  assert.match(draft, /disabled: this.busy \|\| this.card.状态 === 'saved'/);
  const page = read('pages/AI制卡页.ets');
  assert.match(page, /NoteFieldEditor\(\{ value: operation.after/);
  assert.match(page, /disabled: ctx.message.变更草稿列表\[ctx.itemIndex\].status !== 'pending'/);
  const card = read(file);
  assert.match(card, /Radio\(\{ value: option.id, group: this.clarification.request.id \}\)/);
  assert.match(card, /\.checked\(option.id === this.clarification.selectedOptionId\)/);
  assert.match(card, /\.width\(20\).height\(20\).margin\(0\).flexShrink\(0\)/);
  assert.match(card, /\.border\(SurfaceBorder\.options\(2, option.id === this.clarification.selectedOptionId/);
  assert.match(card, /\.onClick\(\(\): void => \{ this.selectOption\(option.id\); \}\)/);
  assert.match(card, /PrimaryActionButton\(\{/);
  assert.doesNotMatch(card, /Button\(option.label\)|\.maxLines\(/);
});
