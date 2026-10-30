// SPDX-License-Identifier: AGPL-3.0-or-later
// Uses the current signed app's actual home UI. Does not edit notes.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_LOCALES } from '../entry/src/main/ets/model/AppLocales.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const [key,language='all',font='all',scene='home',...extra]=process.argv.slice(2);
if(!key||!/^[A-Za-z0-9._:-]+$/.test(key)||extra.length) throw Error('Usage: node tools/test-locales-device.mjs <connect-key> [all|locale] [all|1|2] [home|layout_suggestion|double_columns]');
if(!['home','layout_suggestion','double_columns'].includes(scene))throw Error('Unknown UI scene: '+scene);
const fontScales=[1,2].filter(value=>font==='all'||String(value)===font);
if(fontScales.length===0)throw Error('Unknown font scale: '+font);
const locales=APP_LOCALES.filter(item=>language==='all'||item.locale===language);
if(locales.length===0) throw Error('Unknown locale: '+language);
const hdc=path.join(process.env.DEVECO_HOME??'C:/Program Files/Huawei/DevEco Studio','sdk/default/openharmony/toolchains/hdc.exe');
const output=path.join(root,'.local/locale-acceptance/device',key.replaceAll(':','_'));
mkdirSync(output,{recursive:true});
function device(...args){
  const result=spawnSync(hdc,['-t',key,...args],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  if(result.error||result.status!==0||/\[Fail\]|Error Code:|error:/i.test(result.stdout))throw Error(result.error?.message||result.stderr?.trim()||result.stdout?.trim()||'hdc failed');
  return result.stdout;
}
const installed=device('shell','bm','dump','-n','com.jide.kapian');
if(!installed.includes('com.jide.kapian')||installed.includes('[Fail]'))throw Error('Install the current signed main HAP with install -r first.');
const uid=Number(installed.match(/"uid"\s*:\s*(\d+)/)?.[1]);
if(!Number.isInteger(uid))throw Error('Cannot resolve installed application user id.');
const userId=Math.floor(uid/200000);
const install=device('install','-r',path.join(root,'entry/build/default/outputs/ohosTest/entry-ohosTest-signed.hap'));
if(!/install bundle successfully/i.test(install))throw Error('Test HAP installation not confirmed: '+install);
const cases=[];
for(const locale of locales){
  const entries=JSON.parse(readFileSync(path.join(root,'entry/src/main/resources',locale.resourceDirectory,'element/string.json'),'utf8')).string;
  const strings=new Map(entries.map(item=>[item.name,item.value]));
  const probes=['settings_title','appearance_color_theme','note_editor_clear_format','default_deck_name','reminder_edit_content_placeholder']
    .map(name=>({key:name,value:strings.get(name)}));
  for(const scale of fontScales){
    const id=`${locale.locale}-font${scale}-${scene}`;
    // 每次启动独立测试进程，避免 TestKit 复用上一轮 parameters。
    device('shell','aa','force-stop','com.jide.kapian');
    const text=device('shell','aa','test','-b','com.jide.kapian','-m','entry_test','-s','unittest',
      '/ets/testrunner/LocaleLayoutTestRunner','-s','timeout','45000','-s','locale',locale.locale,
      '-s','scale',String(scale),'-s','scene',scene,
      '-s','probes',Buffer.from(JSON.stringify(probes)).toString('base64'));
    writeFileSync(path.join(output,id+'.log'),text);
    if(!text.includes(`LOCALE_LAYOUT_PASS:${id}:`)||/LOCALE_LAYOUT_FAIL|\[Fail\]|Error Code:|error:/.test(text))throw Error(id+' failed; see '+output);
    const sandboxPath=text.match(new RegExp(`LOCALE_LAYOUT_PASS:${id}:([^\\r\\n]+)`))?.[1];
    if(!sandboxPath?.startsWith('/data/storage/el2/base/'))throw Error('Unexpected screenshot sandbox path.');
    const screenshot=path.join(output,id+'.png');
    device('file','recv',sandboxPath.replace('/data/storage/el2/base/',`/data/app/el2/${userId}/base/com.jide.kapian/`),screenshot);
    if(!existsSync(screenshot)||statSync(screenshot).size<100)throw Error('Screenshot transfer failed: '+id);
    cases.push({locale:locale.locale,scale,scene,resourceProbes:'pass',screenshot:id+'.png'});
    writeFileSync(path.join(output,`matrix-${scene}.json`),JSON.stringify(cases,null,2)+'\n');
    console.log('PASS '+id);
  }
}
console.log(`${cases.length} actual resource/UI cases passed. Screenshots require visual review: ${output}`);
