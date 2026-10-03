// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic files only; no provider requests or card-library writes.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import JSON5 from 'json5';

const root = fileURLToPath(new URL('../', import.meta.url));
const [key, ...extra] = process.argv.slice(2);
if (!key || !/^[A-Za-z0-9._:-]+$/.test(key) || extra.length) throw Error('Usage: node tools/test-agent-documents-device.mjs <connect-key>');
const hdc = path.join(process.env.DEVECO_HOME ?? 'C:/Program Files/Huawei/DevEco Studio', 'sdk/default/openharmony/toolchains/hdc.exe');
function device(...args) {
  const result = spawnSync(hdc, ['-t', key, ...args], { cwd: root, encoding: 'utf8', timeout: 150000, maxBuffer: 2*1024*1024 });
  if (result.error || result.status !== 0) throw Error(result.error?.message ?? result.stderr ?? 'hdc failed');
  return result.stdout;
}
const bundle = JSON5.parse(readFileSync(path.join(root, 'AppScope/app.json5'), 'utf8')).app.bundleName;
const installed = device('shell', 'bm', 'dump', '-n', bundle);
if (!installed.includes(bundle) || installed.includes('[Fail]')) throw Error('Install the current signed main HAP with install -r first.');
const install = device('install', '-r', path.join(root, 'entry/build/default/outputs/ohosTest/entry-ohosTest-signed.hap'));
if (!/install bundle successfully/i.test(install)) throw Error('Test HAP installation not confirmed: '+install);
const output = device('shell', 'aa', 'test', '-b', bundle, '-m', 'entry_test', '-s', 'unittest',
  '/ets/testrunner/DocumentTestRunner', '-s', 'timeout', '120000');
console.log(output);
if (!output.includes('DOCUMENT_TEST_PASS: pdf_text,pdf_image,image_ocr,pdf_ocr,persistent_notes,blank_page,source_annotation') ||
    /DOCUMENT_TEST_FAIL|\[Fail\]|Error Code:|error:/.test(output)) {
  throw Error('The complete PDF/OCR device test did not pass; hdc status alone is insufficient.');
}
