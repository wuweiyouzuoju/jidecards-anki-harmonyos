// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSON5 from 'json5';

export const NAPI_NOTICE = "Currently module for 'libjidecards.so' is not verified. If you're importing napi, its verification will be enabled in later SDK version. Please make sure the corresponding .d.ts file is provided and the napis are correctly declared.";
export const SOURCE_MAP_NOTICE = "ArkTS:WARN Property 'sourceMapsPath' not found in '@ibestservices/ibest-ui'.";
const dependencyRoot = 'oh_modules/.ohpm/@ibestservices+ibest-ui@2.2.7/oh_modules/@ibestservices/ibest-ui/';
const key = warning => JSON.stringify([warning.file, warning.message]);

export function parseWarnings(text, root) {
  const prefix = root.replaceAll('\\', '/').replace(/\/$/, '') + '/';
  const normalize = text => text.replaceAll('\\', '/').split(prefix).join('');
  // stdout task progress can interleave with a multi-line stderr diagnostic.
  const rawLines = text.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)
    .map(line => line.trim()).filter(line => !/^> hvigor (?:Finished |UP-TO-DATE |TYPE CHECK |BUILD SUCCESSFUL)/.test(line));
  const lines = rawLines.map(line => line.replace(/^> hvigor\s+/, '').replace(/^(?:WARN:\s*)+/, ''));
  const warnings = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const location = /^ArkTS:WARN File: (.+):(\d+):(\d+)$/.exec(line);
    if (location) {
      let message = lines[++index];
      if (!message || /^(?:ArkTS:WARN|Warning:|BUILD )/.test(message)) throw Error('Incomplete ArkTS warning');
      while (lines[index + 1] && !/\bWARN(?:ING)?\b|^Warning:|^> hvigor/i.test(rawLines[index + 1])) {
        message += ' ' + lines[++index];
      }
      warnings.push({ file: normalize(location[1]), message, line: Number(location[2]), column: Number(location[3]) });
    } else if (/^Warning: '.+' conflict, first declared\.$/.test(line)) {
      if (!lines[index + 1]?.startsWith('at ') || lines[index + 2] !== 'but declared again.' || !lines[index + 3]?.startsWith('at ')) {
        throw Error('Incomplete resource conflict warning');
      }
      warnings.push({ file: normalize(lines[index + 1].slice(3)),
        message: line + ' Duplicate: ' + normalize(lines[index + 3].slice(3)) });
      index += 3;
    } else if (line === 'ArkTS:WARN: For details about ArkTS syntax errors, see FAQs' && warnings.length > 0) {
      // Compiler help footer describes the preceding diagnostics, not an additional warning.
      continue;
    } else if (/\bWARN(?:ING)?\b|^Warning:/i.test(rawLines[index])) {
      // Unknown formats stay visible and fail the gate, rather than silently disappearing.
      warnings.push({ file: '', message: normalize(line) });
    }
  }
  return warnings;
}

export function aggregateWarnings(warnings) {
  const counts = new Map();
  for (const warning of warnings) {
    const id = key(warning), previous = counts.get(id);
    if (previous) previous.count++;
    else counts.set(id, { file: warning.file, message: warning.message, count: 1 });
  }
  return [...counts.values()].sort((a, b) => key(a).localeCompare(key(b), 'en'));
}

export function baselineCategory(warning) {
  if (warning.file === 'entry/src/main/ets/backend/后端客户端.ts' && warning.message === NAPI_NOTICE) return 'sdk-napi';
  if (warning.file === '' && warning.message === SOURCE_MAP_NOTICE) return 'ibest-metadata';
  if (!warning.file.startsWith(dependencyRoot)) return null;
  if (/^(?:src\/main\/ets\/.+|Index)\.d\.(?:ets|ts)$/.test(warning.file.slice(dependencyRoot.length))) return 'ibest-declarations';
  if (/^src\/main\/resources\/(?:base|en)\/element\/string\.json$/.test(warning.file.slice(dependencyRoot.length)) &&
    /^Warning: 'ibest_[A-Za-z0-9_]+' conflict, first declared\. Duplicate: entry\/build\/default\/intermediates\/res\/default\/resource_str\/(?:base|en)\/element\/string\.json$/.test(warning.message)) return 'ibest-resource-merge';
  return null;
}

export function compareWarnings(warnings, baseline) {
  const allowed = new Map();
  for (const item of baseline.warnings) {
    const id = key(item);
    if (!Number.isInteger(item.count) || item.count < 1 || allowed.has(id) || !baselineCategory(item) ||
      item.reason !== baselineCategory(item)) throw Error('Invalid or unapproved warning baseline entry: ' + id);
    allowed.set(id, item.count);
  }
  const actual = aggregateWarnings(warnings);
  const unexpected = actual.filter(item => item.count > (allowed.get(key(item)) ?? 0));
  const reduced = baseline.warnings.filter(item => (actual.find(actual => key(actual) === key(item))?.count ?? 0) < item.count);
  return { unexpected, reduced, accepted: warnings.length - unexpected.reduce((sum, item) => sum + item.count, 0) };
}

export function verifyWarningEnvironment(root, baseline) {
  if (baseline.schemaVersion !== 1) throw Error('Unsupported warning baseline schema');
  const lock = JSON5.parse(readFileSync(resolve(root, 'entry/oh-package-lock.json5'), 'utf8'));
  const manifest = JSON5.parse(readFileSync(resolve(root, 'entry/oh-package.json5'), 'utf8'));
  const installed = JSON5.parse(readFileSync(resolve(root, 'entry/oh_modules/@ibestservices/ibest-ui/oh-package.json5'), 'utf8'));
  const locked = lock.packages['@ibestservices/ibest-ui@' + baseline.dependency.version];
  const selected = lock.specifiers['@ibestservices/ibest-ui@' + manifest.dependencies['@ibestservices/ibest-ui']];
  if (!locked || selected !== '@ibestservices/ibest-ui@' + baseline.dependency.version ||
    installed.version !== baseline.dependency.version || locked.integrity !== baseline.dependency.integrity) {
    throw Error('ibest-ui version/integrity changed; review a clean build before updating the warning baseline');
  }
  const profile = JSON5.parse(readFileSync(resolve(root, 'build-profile.json5'), 'utf8'));
  if (profile.app.products[0].targetSdkVersion !== baseline.targetSdkVersion) throw Error('Target SDK changed; review the warning baseline');
}

export function verifyMergedResources(root, warnings) {
  const files = new Map();
  const strings = path => {
    if (!files.has(path)) files.set(path, new Map(JSON.parse(readFileSync(resolve(root, path), 'utf8')).string
      .map(item => [item.name, item.value])));
    return files.get(path);
  };
  for (const warning of warnings) {
    if (baselineCategory(warning) !== 'ibest-resource-merge') continue;
    const [, name, duplicate] = /^Warning: '([^']+)' conflict, first declared\. Duplicate: (.+)$/.exec(warning.message);
    const source = strings(warning.file), merged = strings(duplicate);
    if (!source.has(name) || !merged.has(name) || JSON.stringify(source.get(name)) !== JSON.stringify(merged.get(name))) {
      throw Error(`Resource conflict is not an identical dependency copy: ${name} (${duplicate})`);
    }
  }
}

export function inspectBuildLog(text, root, baseline, requireClean = false) {
  text = text.replace(/\x1b\[[0-9;]*m/g, '');
  if (!/> hvigor BUILD SUCCESSFUL\b/.test(text) || /> hvigor BUILD FAILED\b/.test(text)) throw Error('Missing successful current build log');
  if ((text.match(/> hvigor BUILD SUCCESSFUL\b/g) ?? []).length !== 1) throw Error('Expected one build, not an appended history');
  if (requireClean && !/> hvigor Finished :entry:clean\b/.test(text)) throw Error('A clean HAP build is required for complete warning validation');
  return compareWarnings(parseWarnings(text, root), baseline);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const reportPath = resolve(root, '.hvigor/build-warning-report.json');
  try {
    const [log, flag] = process.argv.slice(2);
    if (!log || process.argv.length > 4 || (flag && flag !== '--require-clean')) throw Error('Usage: node tools/verify-build-warnings.mjs <current-build.log> [--require-clean]');
    const baseline = JSON.parse(readFileSync(resolve(root, 'tools/build-warning-baseline.json'), 'utf8'));
    verifyWarningEnvironment(root, baseline);
    const text = readFileSync(resolve(log), 'utf8');
    const report = inspectBuildLog(text, root, baseline, flag === '--require-clean');
    verifyMergedResources(root, parseWarnings(text, root));
    writeFileSync(reportPath, JSON.stringify({ status: report.unexpected.length ? 'failed' : 'passed', ...report }, null, 2) + '\n');
    if (report.unexpected.length) {
      for (const warning of report.unexpected) console.error(`[build-warning] ${warning.file || '(build)'}: ${warning.message} (count=${warning.count})`);
      throw Error(`${report.unexpected.length} unexpected warning signatures; do not blanket-baseline project diagnostics`);
    }
    console.log(`[build-warning] accepted=${report.accepted}, unexpected=0${flag ? ', clean build' : ', incremental build (use -Clean for complete coverage)'}`);
    if (flag && report.reduced.length) console.log(`[build-warning] ${report.reduced.length} baseline entries decreased or disappeared; review for removal.`);
  } catch (error) {
    try { writeFileSync(reportPath, JSON.stringify({ status: 'failed', error: error.message }, null, 2) + '\n'); }
    catch { /* A missing/unwritable report directory still fails the command. */ }
    console.error(`[build-warning] ${error.message}`);
    process.exitCode = 1;
  }
}
