// SPDX-License-Identifier: AGPL-3.0-or-later
// Exercise the installed system resolver. Never select a candidate or open/import a file.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import JSON5 from 'json5';
import { EXTERNAL_DECK_OPEN_SUPPORT as support } from '../entry/src/main/ets/model/ExternalDeckOpen.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const [key, outputDirectory, ...extra] = process.argv.slice(2);
if (!key || !/^[A-Za-z0-9._:-]+$/.test(key) || extra.length) {
  throw Error('Usage: node tools/test-external-deck-open-device.mjs <connect-key> [report-directory]');
}
const hdc = path.join(process.env.DEVECO_HOME ?? 'C:/Program Files/Huawei/DevEco Studio',
  'sdk/default/openharmony/toolchains/hdc.exe');
function device(...args) {
  const result = spawnSync(hdc, ['-t', key, ...args], {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024
  });
  if (result.error || result.status !== 0) throw Error(result.error?.message ?? result.stderr ?? 'hdc failed');
  return result.stdout;
}
const app = JSON5.parse(readFileSync(path.join(root, 'AppScope/app.json5'), 'utf8')).app;
const installed = device('shell', 'bm', 'dump', '-n', app.bundleName);
if (!installed.includes(app.bundleName) || installed.includes('[Fail]')) throw Error('Install the signed main HAP first.');
const labels = ['base', 'en_US'].map(locale => JSON.parse(readFileSync(path.join(root,
  `AppScope/resources/${locale}/element/string.json`), 'utf8')).string.find(item => item.name === 'app_name').value);
function texts(node) {
  return [node.attributes?.text ?? '', ...(node.children ?? []).flatMap(texts)].filter(Boolean);
}
const results = [];
// A synthetic, non-existent URI is enough for matching. The chooser must remain unselected.
for (const type of [...support.packageTypes, ...support.fallbackTypes, '']) {
  const args = ['shell', 'aa', 'start', '-A', support.action, '-e', support.entities[0],
    '-U', 'file://com.example.jideprobe/data/storage/el2/base/files/system-candidate.apkg',
    '--pb', 'ohos.ability.params.showDefaultPicker', 'true'];
  if (type) args.push('-t', type);
  let started = false;
  try {
    const launch = device(...args);
    started = launch.includes('start ability successfully.');
    if (!started) {
      results.push({ type: type || '(inferred from .apkg)', passed: false, launch });
      console.log(`[external-deck-device] ${type || '(inferred from .apkg)'}: FAIL (no matching application)`);
      continue;
    }
    const remote = '/data/local/tmp/jide-external-deck-candidates.json';
    const dump = device('shell', 'uitest', 'dumpLayout', '-p', remote);
    if (!dump.includes('DumpLayout saved to:')) throw Error('System chooser UI could not be inspected.');
    const candidates = texts(JSON.parse(device('shell', 'cat', remote)));
    results.push({ type: type || '(inferred from .apkg)', passed: candidates.some(value => labels.includes(value)),
      candidates });
  } finally {
    if (started) device('shell', 'uitest', 'uiInput', 'keyEvent', 'Back');
  }
  console.log(`[external-deck-device] ${type || '(inferred from .apkg)'}: ${results.at(-1).passed ? 'PASS' : 'FAIL'}`);
}
const report = { device: key, system: device('shell', 'param', 'get', 'const.ohos.fullname').trim(),
  bundle: app.bundleName, expectedVersion: app.versionName,
  installedVersion: [...installed.matchAll(/"versionName":\s*"([^"]*)"/g)].at(-1)?.[1] ?? '', results,
  scope: 'Installed system candidate matching only; no QQ, file authorization, selection or import.' };
if (outputDirectory) {
  mkdirSync(path.resolve(root, outputDirectory), { recursive: true });
  writeFileSync(path.resolve(root, outputDirectory, 'system-candidates.json'), JSON.stringify(report, null, 2) + '\n');
}
if (results.some(result => !result.passed)) throw Error('Jidecards is missing from one or more system candidate lists.');
console.log(`[external-deck-device] PASS ${results.length} resolver cases; no file opened or imported`);
