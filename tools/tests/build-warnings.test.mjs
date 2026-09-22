// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseWarnings, aggregateWarnings, compareWarnings, inspectBuildLog, baselineCategory,
  NAPI_NOTICE, SOURCE_MAP_NOTICE, verifyWarningEnvironment, verifyMergedResources } from '../verify-build-warnings.mjs';

const root = 'D:/Projects/jidecards';
const file = 'entry/src/main/ets/backend/后端客户端.ts';
const diagnostic = (path = file, message = NAPI_NOTICE, line = 37) =>
  `> hvigor WARN: WARN: ArkTS:WARN File: ${root}/${path}:${line}:57\n ${message}\n\n`;
const baseline = { warnings: [{ file, message: NAPI_NOTICE, count: 1, reason: 'sdk-napi' }] };
const success = '> hvigor BUILD SUCCESSFUL in 1 min';
const clean = '> hvigor Finished :entry:clean... after 1 s\n';

test('warning parser normalizes ANSI and Windows paths without losing location or counts', () => {
  const text = diagnostic().replaceAll('/', '\\').replace('WARN:', '\x1b[33mWARN:\x1b[39m');
  const warnings = parseWarnings(text + diagnostic(file, NAPI_NOTICE, 90), root);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].file, file);
  assert.equal(warnings[0].line, 37);
  assert.deepEqual(aggregateWarnings(warnings), [{ file, message: NAPI_NOTICE, count: 2 }]);
  assert.equal(compareWarnings(warnings, baseline).unexpected.length, 1, 'increased occurrences must fail');
});

test('known diagnostics pass but new project, dependency and generic warnings fail', () => {
  assert.equal(compareWarnings(parseWarnings(diagnostic(), root), baseline).unexpected.length, 0);
  assert.equal(compareWarnings(parseWarnings(diagnostic().replace(NAPI_NOTICE, NAPI_NOTICE + '\nAdditional diagnostic detail'), root), baseline).unexpected.length, 1);
  for (const text of [diagnostic(file, 'Function may throw exceptions. Special handling is required.'),
    diagnostic('entry/src/main/ets/pages/首页.ets'), '> hvigor WARN: new diagnostic',
    'WARN: ArkTS:WARN Property unknown', 'Warning: unrecognized resource output']) {
    assert.equal(compareWarnings(parseWarnings(text, root), baseline).unexpected.length, 1, text);
  }
  assert.throws(() => compareWarnings([], { warnings: [{ file, message: 'new project warning', count: 1, reason: 'sdk-napi' }] }), /unapproved/);
  assert.throws(() => compareWarnings([], { warnings: [...baseline.warnings, ...baseline.warnings] }), /baseline/);
});

test('resource conflict retains both paths despite interleaved build progress', () => {
  const path = 'oh_modules/.ohpm/@ibestservices+ibest-ui@2.2.7/oh_modules/@ibestservices/ibest-ui/src/main/resources/base/element/string.json';
  const duplicate = 'entry/build/default/intermediates/res/default/resource_str/base/element/string.json';
  const warnings = parseWarnings(`> hvigor WARN: Warning: 'ibest_text_slidingUp' conflict, first declared.\nat ${root}/${path}\n` +
    `> hvigor Finished :entry:default@CompileResource... after 1 s\nbut declared again.\nat ${root}/${duplicate}\n`, root);
  assert.deepEqual(warnings, [{ file: path, message: `Warning: 'ibest_text_slidingUp' conflict, first declared. Duplicate: ${duplicate}` }]);
  assert.equal(baselineCategory(warnings[0]), 'ibest-resource-merge');
  assert.throws(() => parseWarnings("Warning: 'ibest_day' conflict, first declared.\nat missing", root), /Incomplete/);
  assert.throws(() => parseWarnings(diagnostic().split('\n')[0], root), /Incomplete/);
});

test('metadata is an exact diagnostic and compiler help footer is not counted twice', () => {
  const text = diagnostic() + 'WARN: ArkTS:WARN: For details about ArkTS syntax errors, see FAQs\n' +
    'WARN:  ' + SOURCE_MAP_NOTICE;
  const warnings = parseWarnings(text, root);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[1].message, SOURCE_MAP_NOTICE);
  assert.equal(baselineCategory(warnings[1]), 'ibest-metadata');
  assert.equal(baselineCategory({ ...warnings[1], message: SOURCE_MAP_NOTICE + ' changed' }), null);
});

test('complete verification rejects incomplete, appended, failed and incremental logs', () => {
  assert.throws(() => inspectBuildLog('', root, baseline), /Missing/);
  assert.throws(() => inspectBuildLog(success + '\n> hvigor BUILD FAILED', root, baseline), /Missing/);
  assert.throws(() => inspectBuildLog(success + '\n' + success, root, baseline), /one build/);
  assert.throws(() => inspectBuildLog(diagnostic() + success, root, baseline, true), /clean/);
  const result = inspectBuildLog(clean + diagnostic() + success.replace('BUILD', '\x1b[32mBUILD'), root, baseline, true);
  assert.equal(result.accepted, 1);
  assert.deepEqual(result.unexpected, []);
  assert.equal(inspectBuildLog(clean + success, root, baseline, true).reduced.length, 1);
});

test('baselined resource merge must contain identical values, not a genuine override', t => {
  const root = mkdtempSync(join(tmpdir(), 'jidecards-warning-resources-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.includes('jidecards-warning-resources-'));
    rmSync(root, { recursive: true, force: true });
  });
  const file = 'oh_modules/.ohpm/@ibestservices+ibest-ui@2.2.7/oh_modules/@ibestservices/ibest-ui/src/main/resources/base/element/string.json';
  const duplicate = 'entry/build/default/intermediates/res/default/resource_str/base/element/string.json';
  const warning = { file, message: "Warning: 'ibest_day' conflict, first declared. Duplicate: " + duplicate };
  for (const path of [file, duplicate]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify({ string: [{ name: 'ibest_day', value: 'Day' }] }));
  }
  verifyMergedResources(root, [warning]);
  writeFileSync(join(root, duplicate), JSON.stringify({ string: [{ name: 'ibest_day', value: 'Different' }] }));
  assert.throws(() => verifyMergedResources(root, [warning]), /not an identical dependency copy/);
  writeFileSync(join(root, duplicate), JSON.stringify({ string: [] }));
  assert.throws(() => verifyMergedResources(root, [warning]), /not an identical dependency copy/);
});

test('checked-in baseline only allows documented dependency or SDK diagnostics', () => {
  const actual = JSON.parse(readFileSync(new URL('../build-warning-baseline.json', import.meta.url), 'utf8'));
  compareWarnings([], actual);
  assert.equal(actual.schemaVersion, 1);
  for (const warning of actual.warnings) assert.ok(actual.reasons[warning.reason]);
  assert.equal(actual.warnings.filter(w => w.reason === 'sdk-napi').length, 1);
  assert.match(readFileSync(new URL('../verify.mjs', import.meta.url), 'utf8'), /build-app\.ps1', '-Clean'/);
});

test('dependency resolution, installed version, integrity and target SDK are all checked', t => {
  const root = mkdtempSync(join(tmpdir(), 'jidecards-warning-env-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.includes('jidecards-warning-env-'));
    rmSync(root, { recursive: true, force: true });
  });
  const installedPath = join(root, 'entry/oh_modules/@ibestservices/ibest-ui/oh-package.json5');
  mkdirSync(dirname(installedPath), { recursive: true });
  const baseline = { schemaVersion: 1, dependency: { version: '2.2.7', integrity: 'test-integrity' }, targetSdkVersion: '6.1.0(23)' };
  const lock = { packages: { '@ibestservices/ibest-ui@2.2.7': { version: '2.2.7', integrity: 'test-integrity' } },
    specifiers: { '@ibestservices/ibest-ui@^2.2.7': '@ibestservices/ibest-ui@2.2.7' } };
  const write = () => {
    writeFileSync(join(root, 'entry/oh-package-lock.json5'), JSON.stringify(lock));
    writeFileSync(join(root, 'entry/oh-package.json5'), JSON.stringify({ dependencies: { '@ibestservices/ibest-ui': '^2.2.7' } }));
    writeFileSync(installedPath, JSON.stringify({ version: '2.2.7' }));
    writeFileSync(join(root, 'build-profile.json5'), JSON.stringify({ app: { products: [{ targetSdkVersion: '6.1.0(23)' }] } }));
  };
  write(); verifyWarningEnvironment(root, baseline);
  writeFileSync(installedPath, JSON.stringify({ version: '2.3.0' }));
  assert.throws(() => verifyWarningEnvironment(root, baseline), /version\/integrity/);
  write(); lock.specifiers['@ibestservices/ibest-ui@^2.2.7'] = '@ibestservices/ibest-ui@2.3.0'; write();
  assert.throws(() => verifyWarningEnvironment(root, baseline), /version\/integrity/);
  lock.specifiers['@ibestservices/ibest-ui@^2.2.7'] = '@ibestservices/ibest-ui@2.2.7';
  lock.packages['@ibestservices/ibest-ui@2.2.7'].integrity = 'changed'; write();
  assert.throws(() => verifyWarningEnvironment(root, baseline), /version\/integrity/);
  lock.packages['@ibestservices/ibest-ui@2.2.7'].integrity = 'test-integrity'; write();
  assert.throws(() => verifyWarningEnvironment(root, { ...baseline, targetSdkVersion: '6.2.0(24)' }), /Target SDK/);
});
