// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// 领域筛选用于开发反馈，不声称是变更影响分析；all 始终从磁盘发现全部测试。
export const SUITES = {
  release: /^(release-export|signing-config)/,
  tooling: /^(doctor|tooling|change-impact|build-(?:app|native)-wrapper|build-warnings|release-export|signing-config|documentation-contract|architecture-boundaries)/,
  home: /^(home-|page-(?:operation|domain|repositories)|external-deck|cloud-deck|official-announcement|deck-media|deck-options|deck-config|sync-automatic)/,
  study: /^(page-domain|page-repositories|study-|note-editor|jide-choice|choice-package|bury-congrats|audio-|card-audio|native-audio|undo-|proto-study|deck-config|review-|tap-zone)/,
  sync: /sync|home-transfer|study-session|page-(?:operation|domain|repositories)|native-bridge/,
  browser: /browser|page-(?:operation|domain|repositories)|preview|search|note|card-info/,
  media: /media|audio|render|math|latex|jquery|preview|card-template/,
  agent: /page-domain|page-repositories|agent|provider|draft|sse/,
  ui: /theme|color|spacing|layout|settings|ui-shell|ui-feedback|platform-warning|i18n|brand|stats|navigation/,
  repo: /documentation-contract|architecture-boundaries|i18n-contract|brand-contract/
};

export function selectTests(root, suite = 'all') {
  if (suite !== 'all' && !Object.hasOwn(SUITES, suite)) throw new Error(`Unknown suite '${suite}'. Use --list.`);
  const files = readdirSync(join(root, 'tools/tests')).filter(name => name.endsWith('.test.mjs')).sort();
  const selected = suite === 'all' ? files : files.filter(name => SUITES[suite].test(name));
  if (!selected.length) throw new Error(`No tests found for '${suite}'.`);
  return selected.map(name => join('tools', 'tests', name));
}
