// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentMethods, settle } from './sync-panel-harness.mjs';
const source=readFileSync(new URL('../../entry/src/main/ets/components/settings/AboutSettings.ets',import.meta.url),'utf8');
test('About owns its dialogs, delegates rating and retains external-link clipboard fallback',async()=>{
  const events=[],context={startAbility:async want=>{events.push(want.uri);throw Error('no browser');}};
  const About=componentMethods(source,['aboutToDisappear','打开好评弹窗','打开AnkiWeb网址','打开Anki官方文档'],{
    打开应用内好评:(ctx,bundle)=>{assert.equal(ctx,context);events.push(bundle);},HelpPage:{INDEX:0}
  });
  const about=Object.assign(new About(),{getUIContext:()=>({getHostContext:()=>context}),本应用包名:'com.jide.kapian',
    AnkiWeb网址:'https://ankiweb.net/shared/decks',Anki文档网址:'https://docs.ankiweb.net',
    链接服务实例:{获取帮助页链接:async()=>{throw Error('offline');}},
    复制AnkiWeb网址到剪贴板:()=>events.push('copy decks'),复制Anki文档网址到剪贴板:url=>events.push(['copy docs',url]),
    feedbackDialog:{close:()=>events.push('feedback closed')}});
  about.打开好评弹窗();about.打开AnkiWeb网址();await about.打开Anki官方文档();await settle();about.aboutToDisappear();
  assert.deepEqual(events,['com.jide.kapian','https://ankiweb.net/shared/decks','copy decks','https://docs.ankiweb.net',
    ['copy docs','https://docs.ankiweb.net'],'feedback closed']);
});
