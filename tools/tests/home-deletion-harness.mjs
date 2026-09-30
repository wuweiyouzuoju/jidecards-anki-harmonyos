// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { compileWithUiFeedback } from './ui-feedback-harness.mjs';

/** Real feature class; only platform/service edges are replaced. */
export function createDeletion(host, backend, cleanup) {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/home/HomeDeckDeletion.ets', import.meta.url), 'utf8')
    .replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
  const Feature = compileWithUiFeedback('牌组服务', '媒体服务', 'DeckMediaCleanup', 'syncActivity',
    '牌组显示名', '$r', 'DialogAlignment', stripTypeScriptTypes(source, { mode: 'transform' }) + '; return HomeDeckDeletion;')(
    class { constructor() { return backend; } }, class {}, class { constructor() { return cleanup; } }, {},
    deck => deck.displayName || deck.name || deck.id, id => ({ id }), { Center: 'center' });
  return new Feature(host);
}
