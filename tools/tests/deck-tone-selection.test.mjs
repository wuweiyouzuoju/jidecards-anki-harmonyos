import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { 牌组色调 } from '../../entry/src/main/ets/model/主页模型.ets';
import { 构建主页快照 } from '../../entry/src/main/ets/model/主页快照映射器.ets';
import { THEME_CATALOG } from '../../entry/src/main/ets/model/ThemeCatalog.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/components/牌组列表项.ets', import.meta.url), 'utf8');
const start = source.indexOf('  private 取色条颜色(');
const method = source.slice(start, source.indexOf('\n  }', start) + 4);
const Deck = compileWithUiFeedback('牌组色调', '$r', stripTypeScriptTypes(
  'class Deck { ' + method + ' }', { mode: 'transform' }) + '; return Deck;')(牌组色调, id => ({ id }));

test('None produces a transparent stripe with no theme gradient in every theme', () => {
  const stripe = source.match(/Column\(\)\s*\.width\(应用尺寸\.色条宽度\)[\s\S]*?\.borderRadius\(应用尺寸\.圆角_色条\)/)?.[0];
  assert.ok(stripe);
  const render = compileWithUiFeedback('Column', '应用尺寸', 'Color', '牌组色调', stripe);
  const deck = new Deck();
  for (const theme of THEME_CATALOG) {
    deck.visual = theme;
    for (const tone of [牌组色调.None, 牌组色调.Red]) {
      deck.deck = { id: '42', tone };
      const state = { background: null, gradient: null };
      const column = {
        width() { return this; }, height() { return this; }, borderRadius() { return this; },
        backgroundColor(color) { state.background = color; return this; },
        linearGradient(value) { state.gradient = value; return this; }
      };
      render.call(deck, () => column, {}, { Transparent: 'transparent' }, 牌组色调);
      assert.equal(state.gradient, null, theme.id);
      assert.deepEqual(state.background, tone === 牌组色调.None ? 'transparent' : { id: 'app.color.deck_red' }, theme.id);
    }
  }
});

test('home refresh retains an explicitly stored None tone', () => {
  const node = { deckId: 42, name: 'Deck', level: 0, collapsed: false, reviewCount: 0,
    learnCount: 0, newCount: 0, totalInDeck: 0, totalIncludingChildren: 0, filtered: false, children: [] };
  const snapshot = 构建主页快照({ ...node, deckId: 0, name: '', children: [node] }, null,
    new Date(), new Map([['42', 牌组色调.None]]));
  assert.equal(snapshot.decks[0].tone, 牌组色调.None);
});
