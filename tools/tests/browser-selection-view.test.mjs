// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBrowserRange } from '../../entry/src/main/ets/model/BrowserSelection.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';

const MouseButton={Left:1,Right:2,Middle:4},MouseAction={Press:1,Release:2,Move:3};
const mouseContextPoint=loadPlatformModule('utils/MouseContextInput.ets','mouseContextPoint',{MouseButton,MouseAction});
const Table = loadComponentLogic('components/browser/卡片表格.ets', '卡片表格', {mouseContextPoint});

test('browser row gestures emit selection intents without retaining a second selection', () => {
  const table = new Table(), events = [];
  table.onRowClick = id => events.push(['open', id]);
  table.onMultiSelectChange = value => events.push(['mode', value]);
  table.onSelectionChange = ids => events.push(['selection', ids]);
  table.处理行点击(1);
  table.处理长按(2);
  assert.deepEqual(events, [['open', 1], ['mode', true], ['selection', [2]]]);
  assert.equal(table.多选模式, false); assert.deepEqual(table.选中IDs, []);

  table.多选模式 = true; table.选中IDs = [2, 3];
  table.处理行点击(2);
  assert.deepEqual(events.at(-1), ['selection', [3]]);
  assert.deepEqual(table.选中IDs, [2, 3]);
  table.选中IDs = [3];
  table.设置选中(4, true);
  assert.deepEqual(events.at(-1), ['selection', [3, 4]]);
  table.多选模式 = false; table.选中IDs = [];
  table.处理行点击(4);
  assert.deepEqual(events.at(-1), ['open', 4]);
});


test('right click selects a row and then extends the original anchor range across unloaded results',()=>{
 const table=new Table(),results=[1,2,3,4,5,6],events=[];let anchor=0;
 table.onAnchor=id=>{anchor=id;};table.onMultiSelectChange=value=>{table.多选模式=value;};
 table.onSelectionChange=ids=>{table.选中IDs=ids;events.push(ids);};
 table.onRange=id=>table.onSelectionChange(selectBrowserRange(results,table.选中IDs,anchor,id));
 table.onRowClick=()=>assert.fail('right click must not edit a row');
 let stopped=0;const event={button:2,action:1,windowX:180,windowY:300,stopPropagation:()=>stopped++};
 table.handleRowMouse(2,event);assert.deepEqual(table.选中IDs,[2]);assert.equal(table.多选模式,true);assert.equal(anchor,2);
 table.handleRowMouse(6,event);assert.deepEqual(table.选中IDs,[2,3,4,5,6]);assert.equal(anchor,2);
 const count=events.length;table.handleRowMouse(1,{...event,action:2});table.handleRowMouse(1,{...event,button:1});
 table.busy=true;table.handleRowMouse(1,event);assert.equal(events.length,count);assert.equal(stopped,4);
});
