// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { packageInputs } from '../tools/package-inputs.mjs';

test('真实消费者校验拒绝源码过期、旧安装包、损坏HAR及回流的资源副本', t => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'jide-delivery-test-'));
  t.after(() => {
    const target = path.resolve(temporary);
    assert.ok(path.dirname(target) === path.resolve(tmpdir()) && path.basename(target).startsWith('jide-delivery-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  const root = path.join(temporary, 'foundation');
  function save(relative, content) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  }
  save('Index.ets', "export { value } from './src/core/Value';\n");
  const source = save('src/core/Value.ts', 'export const value: number = 1;\n');
  for (const name of ['oh-package.json5', 'build-profile.json5', 'hvigorfile.ts', 'LICENSE', 'src/main/module.json5']) save(name, '{}');
  save('src/main/resources/base/media/jide_ic_common_history.svg', '<svg/>');
  // 未导出的在研模块不应污染已发布包的构建闭包。
  save('src/core/Unpublished.ts', 'not published');
  for (const name of ['consumers.mjs', 'package-inputs.mjs']) {
    const destination = path.join(root, 'tools', name);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(new URL('../tools/' + name, import.meta.url), destination);
  }
  save('consumers.json', JSON.stringify({ consumers: [{ project: 'product', packagePath: 'entry/oh_modules/jide_foundation',
    adapters: ['entry/Adapter.ets'], resourceNames: ['ic_common_history'] }] }));
  const artifact = save('.local/packages/jide_foundation.har', 'fixture HAR bytes');
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  const inputs = packageInputs(root);
  assert.ok(!inputs.includes('src/core/Unpublished.ts'));
  const sourceHashes = Object.fromEntries(inputs.map(file => [file, hash(path.join(root, file))]));
  save('.local/packages/report.json', JSON.stringify({ artifact, sha256: hash(artifact), sourceHashes }));
  for (const file of inputs.filter(file => /\.(ts|ets|svg)$/.test(file))) {
    save('../product/entry/oh_modules/jide_foundation/' + file, readFileSync(path.join(root, file)));
  }
  save('../product/entry/Adapter.ets', "import { value } from 'jide_foundation';");
  function run() {
    return spawnSync(process.execPath, [path.join(root, 'tools/consumers.mjs')], { encoding: 'utf8' });
  }
  assert.equal(run().status, 0);
  writeFileSync(source, 'export const value: number = 2;\n');
  let result = run();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Shared source changed/);
  writeFileSync(source, 'export const value: number = 1;\n');
  const installed = save('../product/entry/oh_modules/jide_foundation/src/core/Value.ts', 'stale implementation');
  result = run();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Installed HAR is stale/);
  writeFileSync(installed, readFileSync(source));
  writeFileSync(artifact, 'corrupted');
  result = run();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Shared HAR hash mismatch/);
  writeFileSync(artifact, 'fixture HAR bytes');
  save('../product/entry/src/main/resources/dark/media/ic_common_history.svg', '<svg/>');
  result = run();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Shared resource duplicated/);
});
