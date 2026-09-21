// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { 构建卡片HTML } from '../../entry/src/main/ets/model/学习卡片HTML构建器.ts';

test('Anki style-field scripts remain intact without exposing application CSS on either side', () => {
  const css = '.card { color: #123456; }</style><script>window.templateLoaded = true;</script>';
  const card = { css, questionNodes: [{ text: '<div>正面</div>', replacement: null }],
    answerNodes: [{ text: '<div>答案</div>', replacement: null }], latexSvg: false, isEmpty: false };
  for (const dark of [false, true]) for (const side of ['question', 'answer']) {
    const html = 构建卡片HTML(card, side, dark);
    assert.ok(html.includes(css), 'preserve complete template, including its script');
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, '').trim();
    assert.equal(visible, side === 'question' ? '正面' : '答案', 'no fallback CSS becomes card text');
    assert.ok(html.indexOf('jquery.min.js') < html.indexOf(css), 'jQuery available to style-field scripts');
  }
});

test('bundled jQuery matches the Anki-pinned full distribution and retains its MIT license', () => {
  const base = new URL('../../entry/src/main/resources/rawfile/jquery/', import.meta.url);
  const bytes = readFileSync(new URL('jquery-3.7.1.min.js', base));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    'fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a');
  assert.match(readFileSync(new URL('LICENSE.txt', base), 'utf8'), /Permission is hereby granted/);
});
