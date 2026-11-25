// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
test('the experiment executes all geometry/quality variants and exports reviewable evidence',()=>{
 const dir=mkdtempSync(join(tmpdir(),'glass-fusion-experiment-'));
 try {
  const r=spawnSync(process.execPath,['tools/glass-fusion-experiment.mjs','--out',dir],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const report=JSON.parse(readFileSync(join(dir,'report.json')));
  assert.equal(report.results.length,12);assert.match(report.sourceSha256,/^[0-9a-f]{64}$/);
  assert.ok(report.results.every(row=>row.folds===0&&row.endpointEdgeMaxErrorVp<.16));
  assert.match(readFileSync(join(dir,'preview.html'),'utf8'),/requestAnimationFrame/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('offline device collection retains incomplete/slow runs and never approves visual quality',()=>{
 const dir=mkdtempSync(join(tmpdir(),'glass-fusion-device-'));
 try {
  const log=join(dir,'input.log');writeFileSync(log,[
   '10-31 15:00:00.000 10 10 I GlassFusion: Complete finished frames=16 cpuMean=2.00ms cpuPeak=3ms framePeak=16.67ms late25=0',
   '10-31 15:00:01.000 10 10 I GlassFusion: Complete frame_budget frames=3 cpuMean=20.00ms cpuPeak=22ms framePeak=33.33ms late25=1',
   '10-31 15:00:02.000 10 10 I GlassFusion: Complete inactive frames=4 cpuMean=2.00ms cpuPeak=3ms framePeak=16.67ms late25=0'
  ].join('\n'));
  const r=spawnSync(process.execPath,['tools/glass-fusion-device-report.mjs','--log',log,'--out',join(dir,'out')],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const report=JSON.parse(readFileSync(join(dir,'out/device-report.json')));
  assert.equal(report.animationRuns,3);assert.equal(report.completeRuns,1);
  assert.equal(report.completionReasons.frame_budget,1);assert.equal(report.completionReasons.inactive,1);
  assert.equal(report.callbackLate25,1);assert.equal(report.overallAcceptance,'pending');assert.equal(report.visualAcceptance,'pending');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
