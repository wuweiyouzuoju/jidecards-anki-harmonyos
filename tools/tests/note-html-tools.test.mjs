// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoteRichText, serializeNoteRichText, sliceNoteRichText, noteLinkUrl } from '../../entry/src/main/ets/model/NoteRichText.ts';
import { noteEditorHeight, richNoteList, sourceNoteList, sourceNoteClearFormat, richNoteLink, sourceNoteLink } from '../../entry/src/main/ets/model/NoteHtmlTools.ts';

test('scripts and links preserve text, combined styles, entities and safe addresses across repeated round trips',()=>{
  const html='<b>x<sup>2</sup></b> H<sub>2</sub>O <a href="https://example.com/?q=1&amp;x=&quot;two&quot;"><i>中文😀</i></a>';
  const parsed=parseNoteRichText(html);
  assert.ok(parsed);assert.equal(parsed.at(-1).url,'https://example.com/?q=1&x="two"');
  assert.equal(parsed[1].format,17);assert.equal(parsed[3].format,32);
  const canonical=serializeNoteRichText(parsed);
  assert.equal(serializeNoteRichText(parseNoteRichText(canonical)),canonical);
  for(const unsupported of ['<sup><sub>x</sub></sup>','<a href="javascript:alert(1)">x</a>',
    '<a href="https://example.com" target="_blank">x</a>','<a href="https://a.com"><a href="https://b.com">x</a></a>']) {
    assert.equal(parseNoteRichText(unsupported),null);
  }
  for(const safe of ['https://example.com/?a="x"&b=2','http://localhost:8080','mailto:a@example.com','#part'])assert.equal(noteLinkUrl(safe),safe);
  for(const unsafe of ['javascript:alert(1)','data:text/html,x','https://a.com\nattack','file:///private'])assert.equal(noteLinkUrl(unsafe),'');
});

test('visual list conversion preserves selected mixed styles without tags spanning items or rewriting other content',()=>{
  const runs=parseNoteRichText('前<b>甲😀<br><i>乙</i></b>后');
  const result=richNoteList(runs,1,6,false);
  assert.equal(result.text,'前<ul><li><b>甲😀</b></li><li><b><i>乙</i></b></li></ul>后');
  assert.equal(result.start,result.text.length-1);assert.equal(result.start,result.end);
  assert.deepEqual(sliceNoteRichText(runs,2,4),[{text:'😀',format:1}]);
  const source='<b>甲<br>乙</b>';
  assert.equal(sourceNoteList(source,0,source.length,true).text,'<ol><li><b>甲</b></li><li><b>乙</b></li></ol>');
  assert.equal(sourceNoteList('<span data-x="keep">甲</span>',0,28,false),null);
  assert.equal(sourceNoteList('<b>甲</b>',2,5,false),null);
});

test('link creation escapes attributes and labels, preserves styles and surrounding links, and leaves incomplete source untouched',()=>{
  const runs=parseNoteRichText('<b>甲😀</b>乙<a href="https://old.com">旧</a>');
  const html=richNoteLink(runs,0,3,'https://new.com/?x="a"&y=2','ignored');
  assert.equal(html,'<a href="https://new.com/?x=&quot;a&quot;&amp;y=2"><b>甲😀</b></a>乙<a href="https://old.com">旧</a>');
  assert.ok(parseNoteRichText(html));
  assert.equal(richNoteLink(runs,3,3,'mailto:a@example.com','<&'),'<b>甲😀</b><a href="mailto:a@example.com">&lt;&amp;</a>乙<a href="https://old.com">旧</a>');
  assert.equal(sourceNoteLink('<i>x</i>',0,8,'#a','').text,'<a href="#a"><i>x</i></a>');
  assert.equal(sourceNoteLink('<i>x</i>',2,5,'#a',''),null);
  assert.equal(sourceNoteLink('x',0,1,'javascript:alert(1)',''),null);
  assert.equal(sourceNoteLink('<a href="#a">x</a>',0,18,'#b',''),null);
  assert.equal(sourceNoteLink('<a href="#a">xy</a>',12,13,'#b',''),null);
  assert.equal(sourceNoteLink('&amp;',2,3,'#b',''),null);
  assert.equal(sourceNoteLink('😀',1,1,'#b',''),null);
  assert.equal(sourceNoteLink('x<b',0,3,'#b',''),null);
});

test('source clear keeps text, escaped literals and line breaks, protects unknown HTML and only changes the chosen fragment',()=>{
  const selected='<b>甲<sup>2</sup>&lt;<br>乙</b>';
  const value='<span data-x="keep">前</span>'+selected+'<img src="shared.png">';
  const start=value.indexOf(selected);
  const result=sourceNoteClearFormat(value,start,start+selected.length);
  assert.equal(result.text,'<span data-x="keep">前</span>甲2&lt;<br>乙<img src="shared.png">');
  assert.equal(sourceNoteClearFormat(value,0,value.length),null);
  assert.equal(sourceNoteClearFormat('<b>x</b>',3,6),null);
  assert.equal(sourceNoteClearFormat('x',0,0),null);
  assert.equal(noteEditorHeight(false),112);assert.equal(noteEditorHeight(true),336);
});
