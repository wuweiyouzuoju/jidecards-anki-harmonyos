// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { 牌组色调 } from '../../entry/src/main/ets/model/主页模型.ets';
import { 构建主页快照 } from '../../entry/src/main/ets/model/主页快照映射器.ets';
import { THEME_CATALOG } from '../../entry/src/main/ets/model/ThemeCatalog.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/components/牌组列表项.ets', import.meta.url), 'utf8');
const methods = ['toneOptions', 'toneIndex', 'selectTone', '取色条颜色'].map(name => {
  const start = source.indexOf(`  private ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const options = source.match(/private readonly 色条选项列表: 色条选项\[\] = \[[\s\S]*?\n  \];/)[0];
const Deck = new Function('牌组色调', '$r', stripTypeScriptTypes(
  `class Deck { ${options} ${methods.join('\n')} }`, { mode: 'transform' }) + '; return Deck;')(牌组色调, id => ({ id }));

test('native tone selection reflects all seven persisted values and targets the current deck', () => {
  const deck = new Deck();
  deck.getUIContext = () => ({ getHostContext: () => ({ resourceManager: { getStringSync: id => id } }) });
  const tones = [牌组色调.Blue, 牌组色调.Purple, 牌组色调.Mint, 牌组色调.Amber, 牌组色调.Black, 牌组色调.Red, 牌组色调.None];
  assert.equal(deck.toneOptions().length, tones.length);
  const calls = [];
  deck.onToneChange = (id, tone) => calls.push([id, tone]);
  for (const [index, tone] of tones.entries()) {
    deck.deck = { id: '42', tone };
    deck.显示牌组菜单 = true;
    assert.equal(deck.toneIndex(), index);
    deck.selectTone(index);
    assert.equal(deck.显示牌组菜单, false);
    assert.deepEqual(calls.at(-1), ['42', tone]);
  }
  deck.selectTone(-1); deck.selectTone(tones.length);
  assert.equal(calls.length, tones.length);
  assert.match(source, /Select\(this\.toneOptions\(\)\)/);
  assert.doesNotMatch(source, /ThemeTextSpans\('✓'|菜单模式/);
});

test('None produces a transparent stripe with no theme gradient in every theme', () => {
  const start = source.indexOf('        Column()', source.indexOf('// 色条：tone===None'));
  const end = source.indexOf('\n        Column({', start);
  assert.ok(start >= 0 && end > start);
  const render = new Function('Column', '应用尺寸', 'Color', '牌组色调', source.slice(start, end));
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
