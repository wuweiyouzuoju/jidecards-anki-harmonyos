// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loadComponentLogic} from './platform-module-harness.mjs';
test('浏览多选保留真实计数和完整读屏名称，筛选仍转发原回调',()=>{
 const C=loadComponentLogic('components/browser/BrowserSelectionAccessory.ets','BrowserSelectionAccessory',{颜色键:{},$r:x=>x});const c=new C();
 for(const [n,text] of [[0,'0'],[12,'12'],[99,'99'],[100,'99+']]){c.count=n;assert.equal(c.badgeText(),text);}
 let calls=0;c.onFilter=()=>calls++;c.onFilter();assert.equal(calls,1);
 const source=readFileSync(new URL('../../entry/src/main/ets/components/browser/BrowserSelectionAccessory.ets',import.meta.url),'utf8');
 assert.match(source,/if \(this.selecting\)/);assert.match(source,/accessibilityText\(this.selectionLabel\)/);
 assert.match(source,/isInteractive:this.filterEnabled,onAction:this.onFilter/);assert.doesNotMatch(source,/setTimeout|animateTo|jide_foundation/);
});
