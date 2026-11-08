// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

test('native confirmations use adaptive button arrays instead of fixed paired labels', () => {
  const root='entry/src/main/ets'; let calls=0;
  for(const file of readdirSync(root,{recursive:true}).filter(file=>file.endsWith('.ets'))){
    const source=readFileSync(join(root,file),'utf8');
    const count=[...source.matchAll(/\.showAlertDialog\(/g)].length;
    if(count===0)continue; calls+=count;
    assert.doesNotMatch(source,/\b(?:primaryButton|secondaryButton)\s*:/,file+' fixed paired actions');
    const singleAction = [...source.matchAll(/\.showAlertDialog\(\{(?:(?!\.showAlertDialog)[\s\S])*?confirm: \{ value: \$r\('app.string.close'\)/g)].length;
    const adaptive = count - singleAction;
    assert.equal([...source.matchAll(/buttonDirection:\s*DialogButtonDirection\.AUTO/g)].length,adaptive,file+' missing automatic vertical fallback');
    assert.ok([...source.matchAll(/buttons:\s*\[/g)].length>=adaptive,file+' missing full action array');
  }
  assert.ok(calls>0,'native confirmation audit must inspect actual calls');
});

test('long action dialogs keep complete text in content-sized vertical controls', () => {
  const source=readFileSync('entry/src/main/ets/components/common/TextActionDialog.ets','utf8');
  assert.match(source,/@CustomDialog/);
  assert.match(source,/DialogFrame\(\{ nativeHost: true, actionsAtBottom: true/);
  assert.match(source,/PrimaryActionButton\(\{ label: this\.confirmLabel, onAction: this\.onConfirm \}\)/);
  assert.match(source,/按下态按钮\(\{ 文案: this\.cancelLabel, fillWidth: true, 点击回调: this\.onCancel \}\)/);
  assert.doesNotMatch(source,/maxLines\(|textOverflow\(|minFontSize\(|\.height\(/);
});
