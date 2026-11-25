// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { DoublingLevelMilestones } from '../src/core/Levels.ts';
import { levelMedalSvg, medalSvg, medalColorLabel, validateMedalDefinition } from '../src/core/Medals.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'assets/medals/drafts');
const evidence = path.join(root, 'docs/evidence/medals');
mkdirSync(directory, { recursive: true });
mkdirSync(evidence, { recursive: true });
const samples = new DoublingLevelMilestones().earnedThrough(256).map((item, index) => {
  const ordinal = index + 1;
  const svg = `drafts/level-${item.level}.svg`;
  writeFileSync(path.join(root, 'assets/medals', svg), levelMedalSvg(ordinal));
  return { id: item.id, ordinal, level: item.level, color: medalColorLabel(ordinal), svg };
});
const specialExamples = JSON.parse(readFileSync(path.join(root, 'assets/medals/review-definitions.json'), 'utf8'))
  .map(definition => {
    validateMedalDefinition(definition);
    const svg = `drafts/${definition.category}.svg`;
    writeFileSync(path.join(root, 'assets/medals', svg), medalSvg(definition.artwork));
    return { ...definition, color: medalColorLabel(definition.artwork.colorStep), svg };
  });
const darkExamples = [1, 2, 8, 40].map(ordinal => {
  const svg = `drafts/ordinal-${ordinal}-dark.svg`;
  writeFileSync(path.join(root, 'assets/medals', svg), levelMedalSvg(ordinal, true));
  return { ordinal, svg };
});
const catalog = { schemaVersion: 3, scope: 'jide-series', license: 'AGPL-3.0-or-later',
  levelAwardRule: { status: 'confirmed-2026-10-15', firstLevel: 2, multiplier: 2,
    businessCountLimit: null, idPrefix: 'jide.level-doubling.v1.' },
  appearance: { status: 'approved-2026-10-15', style: 'progressive-color-round-medal-v5-bold-outline',
    numeral: 'Chinese-financial-uppercase',
    colorDirection: 'ordinary-to-special-confirmed-2026-10-15',
    colorSteps: Array.from({ length: 8 }, (_, index) => medalColorLabel(index + 1)),
    afterLastColor: 'retain-prismatic-continue-ordinal',
    name: '成长徽章', generator: '../../src/core/Medals.ts#medalSvg' },
  previewExamples: samples, specialExamples, darkExamples,
  note: 'Artwork accepted for application on 2026-10-15; examples are not a finite catalog. Level awards double. Commemorative/contribution event definitions remain draft until their specific eligibility is reviewed. Shared host must verify eligibility and atomically persist awards.' };
writeFileSync(path.join(root, 'assets/medals/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const bundled = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.MEDIA_PYTHON || (existsSync(bundled) ? bundled : 'python');
const result = spawnSync(python, [path.join(root, 'tools/render-medal-review.py')], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
