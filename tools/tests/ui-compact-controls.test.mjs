// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { NOTETYPE_MANAGEMENT_ACTIONS } from '../../entry/src/main/ets/model/AppInterface.ts';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const dependencies = { $r: key => key };

test('compact selects reject disabled and invalid callbacks while retaining full names and option IDs', () => {
  const Component = loadComponentLogic('components/common/FormSelectRow.ets', 'FormSelectRow', dependencies);
  const row = new Component();
  const longName = '很长的牌组与笔记类型名称'.repeat(30);
  const choices = [{ value: longName, id: 17 }, { value: '短', id: 19 }];
  row.options = choices; row.value = longName; row.selectedIndex = 0;
  const selected = []; row.onSelect = index => selected.push(choices[index].id);
  for (const invalid of [-1, 2, 0.5, NaN, Infinity]) row.select(invalid);
  assert.deepEqual(selected, []);
  row.isInteractive = false; row.select(1); assert.deepEqual(selected, []);
  row.isInteractive = true; row.select(1); row.select(0);
  assert.deepEqual(selected, [19, 17]);
  assert.equal(row.value, longName); assert.equal(row.selectedIndex, 0);
  assert.equal(row.options, choices); assert.equal(row.options[0].value, longName);
  row.useCustomControl = true; row.select(1);
  assert.deepEqual(selected, [19, 17], 'custom directory controls own their selection callback');
});

test('auxiliary action rows prevent late disabled clicks and leave label, tint and callbacks owned by the caller', () => {
  const Component = loadComponentLogic('components/common/LabeledActionRow.ets', 'LabeledActionRow', dependencies);
  const row = new Component(); let actions = 0;
  assert.equal(row.tint, 'app.color.text_primary');
  row.label = '说明'.repeat(100); row.actionLabel = '动作'.repeat(100);
  row.onAction = () => actions++;
  row.isInteractive = false; row.activate(); assert.equal(actions, 0);
  for (const tint of ['#7C3AED', '#16A34A', '#2F5FD0']) {
    row.tint = tint; row.isInteractive = true; row.activate();
    assert.equal(row.tint, tint); assert.equal(row.actionLabel, '动作'.repeat(100));
  }
  assert.equal(actions, 3);
});

// These contracts protect layout ownership, not native pixel measurements.
test('labels receive remaining row width and controls remain bounded with a gap and single line overflow', () => {
  for (const path of ['components/common/FormSelectRow.ets', 'components/common/LabeledActionRow.ets']) {
    const source = read(path);
    assert.match(source, /Row\(\{ space: FormRowLayout\.gap \}\)/);
    assert.match(source, /Text\(this\.label\)[\s\S]*?\.layoutWeight\(1\)\.constraintSize\(\{ minWidth: 0 \}\)/);
    const constraint = path.endsWith('FormSelectRow.ets') ? 'SelectStyle.fieldConstraint' : 'FormRowLayout.trailingConstraint';
    assert.ok(source.includes(`.constraintSize(${constraint}).flexShrink(0)`));
  }
  assert.match(read('components/common/FormSelectRow.ets'), /textModifier\(SelectStyle\.labelText\(\)\)/);
  assert.match(read('components/common/LabeledActionRow.ets'), /singleLine: true/);
});

test('note type list rows have content height and the list uses the shared bounded dialog body', () => {
  const source = read('components/settings/笔记类型管理面板.ets');
  const row = source.slice(source.indexOf('private 类型行('), source.indexOf('private openCreate('));
  const outer = row.slice(row.lastIndexOf("\n    .width('100%')"));
  assert.doesNotMatch(outer, /layoutWeight|\.height\(/, 'horizontal button weights cannot stretch the card vertically');
  const Button=loadComponentLogic('components/common/按下态按钮.ets','按下态按钮',
    {$r:key=>key,应用尺寸:{字号_按钮:14},GLASS_HIGHLIGHT_COLORS:[]});
  const bindings=[...row.matchAll(/按下态按钮\((\{[\s\S]*?\})\)/g)]
    .map(match=>new Function('$r','NOTETYPE_MANAGEMENT_ACTIONS','类型',
      stripTypeScriptTypes('const options = '+match[1]+';',{mode:'transform'})+'return options;'));
  assert.equal(bindings.length,2);
  const actions=[], type={id:17,name:'Long type name'};
  const host={主色按钮背景:'#733BCD',加载中:false,处理中:false,
    openCreate:(...args)=>actions.push(['copy',...args]),onEdit:(...args)=>actions.push(['edit',...args])};
  for(const busy of [true,false]) {
    host.处理中=busy;
    const buttons=bindings.map(binding=>Object.assign(new Button(),binding.call(host,key=>key,NOTETYPE_MANAGEMENT_ACTIONS,type)));
    for(const button of buttons) { assert.equal(button.fillWidth,true);assert.equal(button.singleLine,true);button.activate(); }
    assert.equal(actions.length,busy?0:2);
  }
  assert.deepEqual(actions,[['copy',17,type.name],['edit',17,type.name]]);
  assert.match(source, /DialogFrame\(\{ header:.*this\.mainHeader\(\).*content:.*this\.listContent\(\)/);
  assert.doesNotMatch(source, /\.height\('80%'\)/);
});

test('today details are controlled by the statistics title action and retain the data refresh sentinel', () => {
  const page = read('pages/统计页.ets');
  const today = read('components/stats/今日计数卡.ets');
  assert.match(page, /actionTitleKey:[\s\S]*?answerCount > 0[\s\S]*?'stats_today_details'/);
  assert.match(page, /showDetails: this\.todayDetailsOpen/);
  assert.match(today, /@Prop @Watch\('数据已变'\) showDetails/);
  assert.match(today, /if \(this\.showDetails && this\.今日数据 !== null && this\.今日数据\.answerCount > 0\)/);
  assert.doesNotMatch(today, /Button\(/);
});
