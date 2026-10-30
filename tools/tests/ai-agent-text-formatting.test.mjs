// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAgentBoldRuns } from '../../entry/src/main/ets/model/agent/AgentTextFormatting.ts';

test('AI emphasis becomes bold without changing surrounding Chinese text or line breaks', () => {
  assert.deepEqual(parseAgentBoldRuns('建议：**每天复习**。\n**先理解**再记忆。'), [
    {text:'建议：',bold:false},{text:'每天复习',bold:true},{text:'。\n',bold:false},
    {text:'先理解',bold:true},{text:'再记忆。',bold:false}
  ]);
});

test('streaming partial emphasis remains visible until its closing delimiter arrives', () => {
  assert.deepEqual(parseAgentBoldRuns('**尚未结束'),[{text:'**尚未结束',bold:false}]);
  assert.deepEqual(parseAgentBoldRuns('**尚未结束**'),[{text:'尚未结束',bold:true}]);
  assert.deepEqual(parseAgentBoldRuns('** 内容 **'),[{text:'** 内容 **',bold:false}]);
});

test('escaped stars, code examples and plain HTML are not interpreted as bold or executable content', () => {
  assert.deepEqual(parseAgentBoldRuns('\\*\\*原样\\*\\*'),[{text:'**原样**',bold:false}]);
  for (const text of ['`**code**`', '```\n**code**\n```', '<script>alert(1)</script>', '***']) {
    assert.deepEqual(parseAgentBoldRuns(text),[{text,bold:false}]);
  }
});
