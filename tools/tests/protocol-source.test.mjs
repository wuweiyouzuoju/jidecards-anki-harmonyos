// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArguments, verifyOfficialCheckout } from '../core-protocol.mjs';

test('protocol commands reject ignored paths and incomplete diff inputs',()=>{
  assert.deepEqual(parseArguments([]),{mode:'--check',source:undefined,extra:undefined});
  for(const mode of ['--check','--generate'])assert.equal(parseArguments([mode]).mode,mode);
  assert.equal(parseArguments(['--refresh','official']).source,'official');
  assert.equal(parseArguments(['--diff','old','new']).extra,'new');
  for(const args of [['--check','cached'],['--generate','backend.rs'],['--refresh'],['--diff','old'],['--diff','old','new','ignored'],['unknown']])assert.throws(()=>parseArguments(args),/Usage/);
});

test('official refresh rejects source archives, foreign origin and unrelated local modifications',t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'jide-official-source-'));
  t.after(()=>{ const resolved=path.resolve(directory); assert.equal(path.dirname(resolved),path.resolve(tmpdir())); assert.ok(path.basename(resolved).startsWith('jide-official-source-')); rmSync(resolved,{recursive:true,force:true}); });
  const git=(...args)=>execFileSync('git',['-C',directory,...args],{encoding:'utf8'}).trim();
  const write=(file,value)=>{mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});writeFileSync(path.join(directory,file),value);};
  write('README.md','official\n');
  assert.throws(()=>verifyOfficialCheckout(directory,'1234567','https://github.com/ankitects/anki.git'),/independent locked/);
  git('init','--quiet');git('config','core.autocrlf','false');git('add','.');
  git('-c','user.name=Protocol fixture','-c','user.email=protocol@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','fixture');
  const revision=git('rev-parse','--short=7','HEAD');
  git('remote','add','origin','https://example.invalid/unofficial');
  assert.throws(()=>verifyOfficialCheckout(directory,revision,'https://github.com/ankitects/anki.git'),/official Anki origin/);
  git('remote','set-url','origin','https://github.com/ankitects/anki.git');
  assert.equal(verifyOfficialCheckout(directory,revision,'https://github.com/ankitects/anki.git'),'https://github.com/ankitects/anki.git');
  write('README.md','local edit\n');
  assert.throws(()=>verifyOfficialCheckout(directory,revision,'https://github.com/ankitects/anki.git'),/completely clean/);
  git('add','README.md');
  assert.throws(()=>verifyOfficialCheckout(directory,revision,'https://github.com/ankitects/anki.git'),/completely clean/);
  git('restore','--source=HEAD','--staged','--worktree','--','README.md');
  write('outside-generator.txt','untracked\n');
  assert.throws(()=>verifyOfficialCheckout(directory,revision,'https://github.com/ankitects/anki.git'),/completely clean/);
});
