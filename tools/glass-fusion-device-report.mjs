// SPDX-License-Identifier: AGPL-3.0-or-later
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);function option(key){const i=args.indexOf(key);return i<0?undefined:args[i+1];}
const serial=option('--serial'),file=option('--log'),out=option('--out'),since=option('--after');
if(!out||(!serial&&!file))throw Error('Usage: node tools/glass-fusion-device-report.mjs --serial SERIAL | --log LOG --out DIRECTORY [--after "10-31 15:00:00"]');
function hdc(argv){const r=spawnSync('hdc',['-t',serial,'shell',...argv],{encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024});if(r.status!==0||r.error)throw r.error??Error(r.stderr||r.stdout);return r.stdout;}
const log=file?readFileSync(file,'utf8'):hdc(['hilog','-x','-T','GlassFusion']);
const lines=log.split('\n').filter(s=>!since||s.slice(0,18)>=since);
const completed=[];
for(const line of lines){
 const m=line.match(/Complete (\S+) frames=(\d+) cpuMean=([\d.]+)ms cpuPeak=(\d+)ms framePeak=([\d.]+)ms late25=(\d+)/);
 if(m)completed.push({timestamp:line.slice(0,18),reason:m[1],updates:+m[2],cpuMeanMs:+m[3],cpuPeakMs:+m[4],framePeakMs:+m[5],late25:+m[6]});
}
const counts={};for(const r of completed)counts[r.reason]=(counts[r.reason]??0)+1;
const experiments=lines.filter(s=>s.includes('Experiment='));
const root=fileURLToPath(new URL('../',import.meta.url));
const source=readFileSync(resolve(root,'src/core/GlassFusion.ts'));
const build=JSON.parse(readFileSync(resolve(root,'.local/packages/report.json'),'utf8'));
const report={schema:1, collectionSourceSha256:createHash('sha256').update(source).digest('hex'), harSha256:build.sha256,collectedAt:new Date().toISOString(),serial:serial??'offline',after:since??null,
 scope:'Read-only collection. Measures callback cadence and geometry/draw-command CPU, not GPU or visual quality.',
 animationRuns:completed.length,completionReasons:counts,completeRuns:completed.filter(r=>r.reason==='finished').length,
 callbackLate25:completed.reduce((sum,r)=>sum+r.late25,0),runs:completed,experimentLines:experiments,
 visualAcceptance:'pending',inputAcceptance:'pending',overallAcceptance:'pending',
 correlation:'Collected source/HAR hashes describe this workspace, not proof of the installed binary. Pair with install manifest and package identity before comparison.',
 note:'A performance report cannot approve appearance or input. Do not mark success from averages or silently exclude interrupted runs.'};
mkdirSync(resolve(out),{recursive:true});writeFileSync(resolve(out,'device-log.txt'),log);
writeFileSync(resolve(out,'device-report.json'),JSON.stringify(report,null,2));
if(serial)writeFileSync(resolve(out,'package.txt'),hdc(['bm','dump','-n','com.jide.kapian']));
console.log(JSON.stringify(report,null,2));
