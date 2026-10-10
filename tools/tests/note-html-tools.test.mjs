// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoteRichText, serializeNoteRichText, sliceNoteRichText, noteLinkUrl } from '../../entry/src/main/ets/model/NoteRichText.ts';
import { noteEditorHeight, richNoteList, sourceNoteList, sourceNoteClearFormat, richNoteLink, sourceNoteLink } from '../../entry/src/main/ets/model/NoteHtmlTools.ts';
import * as htmlTools from '../../entry/src/main/ets/model/NoteHtmlTools.ts';

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
test('font size reads caret inheritance, uniform selections and mixed or unsupported CSS without false selection',()=>{
 const read=htmlTools.sourceNoteFontSize;
 assert.equal(read('plain',2,2),'medium');
 const html='<span style="color:red; font-size:large"><b>甲😀</b><span style="font-size:small">乙</span>丙</span>后';
 const first=html.indexOf('甲'),small=html.indexOf('乙'),last=html.indexOf('丙');
 assert.equal(read(html,first,first+3),'large');assert.equal(read(html,small,small),'small');
 assert.equal(read(html,last,last+1),'large');assert.equal(read(html,first,last+1),'');
 assert.equal(read('<span style="font-size:24px">x</span>',28,29),'');
 const empty='<span style="font-size:x-large"></span>';
 assert.equal(read(empty,empty.indexOf('</span>'),empty.indexOf('</span>')),'x-large');
 assert.equal(read(html,2,2),'');assert.equal(read('😀',1,1),'');
 const data='<span data-style="font-size:large">x</span>';
 assert.equal(read(data,data.indexOf('x</'),data.indexOf('x</')+1),'medium');
 const heading='<h2>x</h2>';assert.equal(read(heading,4,5),'');
 const css='<font size="7" style="font-size:small">x</font>';
 assert.equal(read(css,css.indexOf('x</'),css.indexOf('x</')+1),'small');
});

test('changing existing font size preserves other CSS, links and media while the new size takes effect',()=>{
 const source='<span style="color:red;font-size:large"><a href="https://example.com">甲</a></span><img src="x.png">';
 const end=source.indexOf('<img');
 const changed=htmlTools.sourceNoteSetFontSize(source,0,end,'small');
 assert.equal(changed.text,'<span style="font-size:small"><span style="color:red"><a href="https://example.com">甲</a></span></span><img src="x.png">');
 assert.equal(htmlTools.sourceNoteFontSize(changed.text,changed.text.indexOf('甲'),changed.text.indexOf('甲')+1),'small');
 assert.equal(htmlTools.sourceNoteFontSize(changed.text,changed.start,changed.end),'small');
 assert.equal(htmlTools.sourceNoteSetFontSize(source,2,2,'small'),null);
 assert.equal(htmlTools.sourceNoteSetFontSize(source,0,end,'invalid'),null);
 const data='<span data-style="font-size:large">x</span>';
 assert.ok(htmlTools.sourceNoteSetFontSize(data,0,data.length,'small').text.includes(data));
});

test('sized visual text keeps its size when adding links, lists and source scripts',()=>{
 const runs=parseNoteRichText('前<span style="font-size:small"><b>甲😀<br>乙</b></span>后');
 assert.deepEqual(sliceNoteRichText(runs,2,4),[{text:'😀',format:1,fontSize:'small'}]);
 const link=richNoteLink(runs,1,4,'#x','ignored');
 assert.ok(link.includes('<span style="font-size:small"><a href="#x"><b>甲😀</b></a></span>'));
 assert.equal(richNoteList(runs,1,6,false).text,
  '前<ul><li><span style="font-size:small"><b>甲😀</b></span></li><li><span style="font-size:small"><b>乙</b></span></li></ul>后');
 const script=htmlTools.richNoteScript(runs,1,4,true);
 assert.ok(script.text.includes('<sup><span style="font-size:small"><b>甲😀</b></span></sup>'));
 const sized='<span style="font-size:large"><b>甲</b></span>';
 assert.equal(sourceNoteClearFormat(sized,0,sized.length).text,'甲');
});

test('source heading changes preserve attributes and media, highlight uniform titles and reject broken selections',()=>{
 const html='<h2 data-x="keep"><a href="#x">甲😀</a><img src="x"></h2>后';
 const start=html.indexOf('甲');assert.equal(htmlTools.sourceNoteHeading(html,start,start+3),'h2');
 assert.equal(htmlTools.sourceNoteHeading(html,0,html.length-1),'h2');
 const changed=htmlTools.sourceNoteSetHeading(html,start,start+3,'h4');
 assert.equal(changed.text,html.replaceAll('h2','h4'));assert.equal(changed.start,start);
 assert.equal(htmlTools.sourceNoteHeading('<h1>甲</h1><h2>乙</h2>',0,20),'');
 assert.equal(htmlTools.sourceNoteSetHeading(html,2,3,'h1'),null);
 assert.equal(htmlTools.sourceNoteSetHeading('😀',1,1,'h1'),null);
 assert.equal(htmlTools.sourceNoteSetHeading('a',0,1,'h9'),null);
 assert.equal(sourceNoteClearFormat('<h2>标题</h2>',0,11).text,'标题');
 const linked=richNoteLink(parseNoteRichText('<h3>标题</h3>'),0,2,'#x','');
 assert.equal(linked,'<h3><a href="#x">标题</a></h3>');
});
