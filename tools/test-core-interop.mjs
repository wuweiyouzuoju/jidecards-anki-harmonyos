// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process';
import { promises as fs, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkNodeRuntime } from './node-runtime.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const referenceFiles = [
  'gradle/libs.versions.toml',
  'libanki/src/main/java/com/ichi2/anki/libanki/BackendImportExport.kt',
  'AnkiDroid/src/main/java/com/ichi2/anki/BackendImporting.kt',
  'AnkiDroid/src/main/java/com/ichi2/anki/BackendExporting.kt',
];
const coreFiles = [
  'rslib/src/import_export/package/apkg/export.rs',
  'rslib/src/import_export/package/apkg/import/mod.rs',
  'rslib/src/import_export/package/apkg/import/notes.rs',
  'rslib/src/import_export/package/apkg/import/cards.rs',
  'rslib/src/import_export/package/apkg/import/media.rs',
  'rslib/src/import_export/package/colpkg/import.rs',
  'rslib/src/import_export/package/colpkg/export.rs',
  'rslib/src/scheduler/answering/mod.rs',
];
export const pendingScopes = [
  {scope:'AnkiDroid Android runtime and return packages',status:'not-run',reason:'Device is operated by the user; source parity and shared Core execution do not certify Android behavior.'},
  {scope:'jidecards NAPI/ArkWeb rendering and device interruption',status:'not-run',reason:'Host Rust ABI and file adapters are exercised; no device installation, restart or user collection access.'},
  {scope:'AnkiWeb/custom-server online incremental/full/media sync',status:'not-run',reason:'No isolated test account provided. No real account or stored credentials are accessed.'},
];

export function argumentsFor(argv) {
  if (argv.length === 1 && argv[0] === '--help') return {help:true};
  if (argv.length === 0) return {ankidroid:path.resolve(repository,'../AnkiDroid')};
  if (argv.length === 2 && argv[0] === '--ankidroid-source') return {ankidroid:path.resolve(argv[1])};
  throw Error('Usage: npm run test:interop -- [--ankidroid-source <read-only-source-directory>]');
}

export async function provenance(sourceRoot) {
  const sources=[];
  for (const file of referenceFiles) {
    const data=await fs.readFile(path.join(sourceRoot,file));
    sources.push({file,sha256:createHash('sha256').update(data).digest('hex')});
  }
  const versions=await fs.readFile(path.join(sourceRoot,referenceFiles[0]),'utf8');
  const backend=/ankiBackend\s*=\s*['"]([^'"]+)['"]/.exec(versions)?.[1];
  if (!backend?.endsWith('-anki26.05')) throw Error(`AnkiDroid source backend differs from the locked Core: ${backend ?? 'missing'}`);
  return {sourceRoot,backend,sources,verification:'source-reference-only'};
}

export function nativeCommand() {
  // Focused regression uses the host Rust toolchain; full native lint/build gates are separate.
  return {command:'cargo',args:['test','-p','jidecards_core','--features','anki-core','--test','core_interop','--locked']};
}

async function stage(report, name, command, args, runDir, environment) {
  console.log(`[interop:${name}] starting`);
  const entry={name,status:'running',command,args}; report.stages.push(entry);
  const log=path.join(runDir,`${name}.log`); entry.log=log;
  const handle=await fs.open(log,'wx');
  const start=Date.now();
  try {
    const child=spawn(command,args,{cwd:repository,env:environment,stdio:['ignore',handle.fd,handle.fd],windowsHide:true});
    entry.exitCode=await new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',resolve); });
    entry.durationMs=Date.now()-start;
    entry.status=entry.exitCode===0?'passed':'failed';
    if (entry.status==='failed') {
      const tail=(await fs.readFile(log,'utf8')).split(/\r?\n/).slice(-20).join('\n');
      throw Error(`${name} failed (${entry.exitCode}). ${log}\n${tail}`);
    }
    console.log(`[interop:${name}] passed (${Math.round(entry.durationMs/1000)}s)`);
  } catch (error) {entry.status='failed';entry.error=error.message;throw error;}
  finally {await handle.close();}
}

export async function runInterop(argv=process.argv.slice(2)) {
  const options=argumentsFor(argv);
  if (options.help) {console.log('npm run test:interop -- [--ankidroid-source <source-directory>]\nCreates fresh synthetic collections, APKG/COLPKG samples and a JSON report under tmp/core-interop. Does not operate devices or accounts.');return;}
  const problem=checkNodeRuntime(); if(problem) throw Error(problem);
  const parent=path.join(repository,'tmp','core-interop'); await fs.mkdir(parent,{recursive:true});
  const runDir=await fs.mkdtemp(path.join(parent,'run-'));
  await fs.writeFile(path.join(runDir,'.interop-owned'),'synthetic-only\n',{flag:'wx'});
  const report={schemaVersion:1,status:'running',startedAt:new Date().toISOString(),runDir,
    isolation:'Fresh runner-owned synthetic collections only. No profile, credential or account discovery.',
    upstream:readFileSync(path.join(repository,'UPSTREAM.lock'),'utf8').trim(),stages:[],artifacts:[],pending:pendingScopes};
  console.log(`[interop] isolated artifacts: ${runDir}`);
  const environment={...process.env,JIDECARDS_INTEROP_ARTIFACTS:runDir};
  try {
    report.ankidroid=await provenance(options.ankidroid);
    await stage(report,'locked-protocol',process.execPath,['tools/verify-rpc-index.mjs'],runDir,environment);
    // Archive checkouts have no Git metadata: record the actual tested implementations too.
    report.coreImplementation=await Promise.all(coreFiles.map(async file => ({file,sha256:createHash('sha256').update(await fs.readFile(path.join(repository,'third_party','anki',file))).digest('hex')})));
    const native=nativeCommand(); await stage(report,'native-core',native.command,native.args,runDir,environment);
    await stage(report,'transfer-behavior',process.execPath,['--experimental-transform-types','--import','./tools/tests/register-ts-hook.mjs','--test',
      'tools/tests/core-interop-recovery.test.mjs','tools/tests/data-transfer-files.test.mjs',
      'tools/tests/import-options-runtime.test.mjs','tools/tests/backend-session-lifecycle.test.mjs'],runDir,environment);
    await stage(report,'recovered-core-integrity','cargo',['run','-p','jidecards_core','--features','anki-core','--example','core_interop_check','--locked','--',runDir],runDir,environment);
    for (const file of ['sample-latest.apkg','sample-legacy.apkg','sample-content-only.apkg','sample-latest.colpkg','sample-legacy.colpkg','expected.json']) {
      const data=await fs.readFile(path.join(runDir,file));
      report.artifacts.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
    }
    report.status='passed';
  } catch (error) {report.status='failed';report.error=error.message;throw error;}
  finally {
    report.finishedAt=new Date().toISOString();
    await fs.writeFile(path.join(runDir,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(`[interop] ${report.status}; report: ${path.join(runDir,'report.json')}`);
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  runInterop().catch(error => {console.error(error.message);process.exitCode=1;});
}
