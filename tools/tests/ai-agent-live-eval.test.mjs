// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function invoke(args,key) {
 const env={...process.env,DEEPSEEK_API_KEY:key};
 return spawnSync(process.execPath,['--experimental-transform-types','--import','./tools/tests/register-ts-hook.mjs',
  'tools/test-agent-live.mjs',...args],{cwd:new URL('../..',import.meta.url),env,encoding:'utf8',timeout:15000});
}

test('live evaluation refuses implicit billed execution even when credentials exist',()=>{
 const result=invoke([],'private-fixture-key');
 assert.equal(result.status,1);assert.match(result.stderr,/Opt-in/);
 assert.doesNotMatch(result.stderr+result.stdout,/private-fixture-key|provider_http/);
});

test('explicit live evaluation without credentials fails locally, not through a network request',()=>{
 const result=invoke(['--run'],'');
 assert.equal(result.status,1);assert.match(result.stderr,/Missing DEEPSEEK_API_KEY/);
 assert.doesNotMatch(result.stderr+result.stdout,/provider_http/);
});
