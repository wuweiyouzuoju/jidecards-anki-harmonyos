// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseAgentMarkdown } from '../../entry/src/main/ets/model/agent/AgentMarkdown.ts';
import { hasAgentMath } from '../../entry/src/main/ets/model/agent/AgentMath.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const resource = key => key;

test('tables render between unchanged prose with headers and per-column alignments', () => {
  const blocks = parseAgentMarkdown('前文\n\n| 字段 | 用途 | 顺序 |\n| :--- | :---: | ---: |\n| **事件** | 题面 | 1 |\n| 时间 | 答案 | 2 |\n\n后文');
  assert.deepEqual(blocks.map(b => b.kind), ['text', 'table', 'text']);
  assert.equal(blocks[0].text, '前文\n'); assert.equal(blocks[2].text, '\n后文');
  assert.deepEqual(blocks[1].alignments, ['start','center','end']);
  assert.deepEqual(blocks[1].rows.map(r => r.cells), [
    ['字段','用途','顺序'], ['**事件**','题面','1'], ['时间','答案','2']]);
});

test('optional outer pipes, escaped pipes and code pipes preserve cell contents', () => {
  const table = parseAgentMarkdown('字段 | 表达式\n--- | ---\nA\\|B | `x|y`\nC | ``a|`b``')[0];
  assert.deepEqual(table.rows.map(r => r.cells), [['字段','表达式'],['A|B','`x|y`'],['C','``a|`b``']]);
  const one = parseAgentMarkdown('| 字段 |\n| --- |\n| 内容 |')[0];
  assert.equal(one.kind, 'table'); assert.deepEqual(one.rows[1].cells, ['内容']);
});

test('partial streamed separators remain prose, completed headers become tables and incomplete rows remain visible', () => {
  const prefix = '| 字段 | 值 |\n| --- | --';
  assert.equal(parseAgentMarkdown(prefix)[0].text, prefix);
  const complete = prefix + '- |\n| 事件 |';
  const blocks = parseAgentMarkdown(complete);
  assert.equal(blocks[0].kind,'table'); assert.deepEqual(blocks[0].rows[1].cells,['事件','']);
  assert.deepEqual(parseAgentMarkdown(complete + '历史 |')[0].rows[1].cells,['事件','历史']);
  assert.deepEqual(parseAgentMarkdown(complete + '历史 | 保留额外内容 |')[0].rows[1].cells,['事件','历史 | 保留额外内容']);
});

test('code fences, mismatched separators, plain pipes and HTML remain literal and multiple tables stay ordered', () => {
  for (const fence of ['```','~~~~']) {
    const code = `${fence}\n| 字段 | 值 |\n| --- | --- |\n| **星号** | <script> |\n${fence}`;
    assert.deepEqual(parseAgentMarkdown(code),[{kind:'text',text:code,rows:[],alignments:[]}]);
  }
  for (const plain of ['a | b','a | b\n--- | --- | ---','<table><tr><td>abc</td></tr></table>']) {
    assert.equal(parseAgentMarkdown(plain)[0].text,plain);
  }
  const blocks = parseAgentMarkdown('a|b\n---|---\n1|2\n\n接着\n\nx|y\n---|---\n3|4');
  assert.deepEqual(blocks.map(b=>b.kind),['table','text','table']);
});

test('markdown component reads current streamed cells through stable positions and computes wide/narrow table geometry', () => {
  const TextAlign = {Start:0,Center:1,End:2};
  const Component = loadComponentLogic('components/agent/AgentMarkdownText.ets','AgentMarkdownText', {
    parseAgentMarkdown,hasAgentMath,$r:resource,TextAlign,应用尺寸:{字号_正文:14}});
  const c = new Component(); c.text='a|b\n---|---\n旧|'; c.aboutToAppear();
  const pos = {blockIndex:0,rowIndex:1,columnIndex:1};
  assert.equal(c.positionText(pos),'');
  c.text += '新增'; c.contentChanged(); assert.equal(c.positionText(pos),'新增');
  c.contentWidth = 290; assert.equal(c.columnWidth(0),144);
  c.contentWidth = 700; assert.equal(c.columnWidth(0),349);
  c.text='a|b|c\n---|:---:|---:\n1|2|3'; c.contentChanged(); c.contentWidth=290;
  assert.equal(c.columnWidth(0)*c.blocks[0].alignments.length,432);
  assert.equal(c.positionAlignment({...pos,columnIndex:2}),TextAlign.End);
});

test('note type preview uses the same question/answer field semantics, including cloze placeholders', () => {
  const Component = loadComponentLogic('components/agent/AgentActionCard.ets','AgentActionCard', {
    $r:resource,颜色键:{主色按钮背景:'primary',动作主色:'action'},
    resourceText:(_context,key,name)=>`${key}:${name}`
  });
  const c = new Component(); c.getUIContext = ()=>({});
  c.action={kind:'create_notetype',status:'pending',payloadJson:JSON.stringify({kind:'normal',name:'历史',fields:['事件','时间'],frontFields:['事件'],backFields:['时间']})};
  assert.equal(c.layoutText(false),'‹事件›'); assert.equal(c.layoutText(true),'‹事件›\n\n时间\n‹时间›');
  c.action.payloadJson=JSON.stringify({kind:'cloze',frontFields:['文本'],backFields:['补充']});
  assert.equal(c.layoutText(false),'app.string.ai_agent_cloze_front_sample:文本');
  assert.equal(c.layoutText(true),'app.string.ai_agent_cloze_back_sample:文本\n\n补充\n‹补充›');
});

test('both action resolutions guard busy and non-pending states; host still owns the actual write', () => {
  const Component=loadComponentLogic('components/agent/AgentActionCard.ets','AgentActionCard',{
    $r:resource,颜色键:{主色按钮背景:'primary',动作主色:'action'}
  });
  const c=new Component(); const outcomes=[];
  c.onConfirm=()=>outcomes.push(true); c.onCancel=()=>outcomes.push(false);
  c.action={status:'pending'}; c.disabled=true; c.resolve(true); c.resolve(false);
  c.disabled=false;
  for (const status of ['executing','completed','cancelled','failed']) {c.action.status=status;c.resolve(true);c.resolve(false);}
  assert.deepEqual(outcomes,[]);
  c.action.status='pending';c.resolve(true);c.resolve(false);assert.deepEqual(outcomes,[true,false]);
});

test('shared secondary button keeps content width by default and ignores disabled callbacks', () => {
  const Component=loadComponentLogic('components/common/按下态按钮.ets','按下态按钮',{
    $r:resource,GLASS_HIGHLIGHT_COLORS:[],GLASS_COLORS_KEY:'glass',THEME_TEXT_COLORS_KEY:'text',应用尺寸:{字号_按钮:15}
  });
  const c=new Component();let count=0;c.点击回调=()=>count++;
  assert.equal(c.fillWidth,false);c.是否启用=false;c.activate();assert.equal(count,0);
  c.是否启用=true;c.activate();assert.equal(count,1);
});

test('all assistant prose paths share native markdown and confirmation card reuses public controls and style preview', () => {
  const page=read('pages/AI制卡页.ets'), card=read('components/agent/AgentActionCard.ets');
  assert.match(page,/AgentMarkdownText\(\{ text: agentContentParts\(ctx\.text\)\[index\]\.text/);
  assert.match(page,/AgentMarkdownText\(\{ text: ctx\.message\.正文/);
  assert.doesNotMatch(page,/parseAgentBoldRuns/);
  assert.match(card,/PrimaryActionButton\(/);assert.match(card,/按下态按钮\([\s\S]*?fillWidth: true/);
  assert.doesNotMatch(card,/\bButton\(/);
  assert.match(card,/ai_agent_design_fields/); assert.match(card,/note_type_cloze/); assert.match(card,/note_type_basic/);
  assert.equal((card.match(/AgentStylePreview\(\{/g)||[]).length,2);
  assert.match(card,/backgroundColor\(\$r\('app.color.surface_card'\)\)/);
  const renderer=read('components/agent/AgentMarkdownText.ets');
  assert.match(renderer,/ScrollDirection.Horizontal/);assert.match(renderer,/this\.positionText\(ctx\)/);
  assert.doesNotMatch(renderer,/Web\(|RichText\(|maxLines\(/);
});
