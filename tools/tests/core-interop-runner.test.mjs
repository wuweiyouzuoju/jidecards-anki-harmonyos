// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argumentsFor, nativeCommand, pendingScopes, provenance } from '../test-core-interop.mjs';

test('runner does not accept collection, account, device or overwrite arguments', () => {
  for (const args of [['--collection','profile.anki2'],['--account','real'],['--output','existing'],['--device','target'],['--run']]) assert.throws(() => argumentsFor(args),/Usage/);
  assert.equal(argumentsFor(['--help']).help,true);
  assert.equal(argumentsFor(['--ankidroid-source','synthetic-reference']).ankidroid,path.resolve('synthetic-reference'));
  const run=nativeCommand();
  assert.equal(run.command,'cargo');assert.ok(run.args.includes('--locked'));assert.equal(run.args[run.args.indexOf('--test')+1],'core_interop');
  assert.ok(pendingScopes.every(scope => scope.status==='not-run'));
});

test('source reference verifies the locked backend and hashes actual source bytes',async t => {
  const root=await fs.mkdtemp(path.join(tmpdir(),'jidecards-interop-source-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const files=[['gradle/libs.versions.toml',"ankiBackend = '0.1.68-anki26.05'"],
    ['libanki/src/main/java/com/ichi2/anki/libanki/BackendImportExport.kt','synthetic export source'],
    ['AnkiDroid/src/main/java/com/ichi2/anki/BackendImporting.kt','synthetic import source'],
    ['AnkiDroid/src/main/java/com/ichi2/anki/BackendExporting.kt','synthetic collection export source']];
  for (const [file,data] of files) {await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),data);}
  const first=await provenance(root);assert.equal(first.backend,'0.1.68-anki26.05');assert.equal(first.verification,'source-reference-only');
  assert.equal(first.sources.length,4);
  await fs.appendFile(path.join(root,files[1][0]),'changed');
  assert.notEqual((await provenance(root)).sources[1].sha256,first.sources[1].sha256);
  await fs.writeFile(path.join(root,files[0][0]),"ankiBackend = 'anki26.06'");
  await assert.rejects(provenance(root),/differs from the locked Core/);
});
