// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crc32, inflateSync } from 'node:zlib';
import { emptyNoteDrawing, validateNoteDrawing, drawingMetadata, embedDrawingMetadata,
  validDrawingFileName, DRAWING_COLORS, DRAWING_COLOR_KEYS, DRAWING_TEXT_HANDLES, drawingTextResizeScale,
  scaledDrawingTextSize, noteDrawingImageActionKey } from '../../entry/src/main/ets/model/NoteDrawing.ts';
import { StudyWhiteboard } from '../../entry/src/main/ets/model/StudyWhiteboard.ts';
import { NoteMediaSession } from '../../entry/src/main/ets/model/NoteMediaSession.ts';
import { noteDrawingInterfaceObservation } from '../../entry/src/main/ets/model/AppInterface.ts';
import { mediaDialogHarness } from './note-media-dialog-harness.mjs';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { stripTypeScriptTypes } from 'node:module';
import { DRAWING_MAX_BYTES } from '../../entry/src/main/ets/model/NoteDrawing.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTKkAAAAASUVORK5CYII=', 'base64');
const bytes = text => new TextEncoder().encode(text);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function pngParts(data) {
  const buffer = Buffer.from(data), chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const size = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + size),
      crc: buffer.readUInt32BE(offset + 8 + size), hashed: buffer.subarray(offset + 4, offset + 8 + size) });
    offset += size + 12;
  }
  return chunks;
}

test('editable PNG round trip preserves original raster, Unicode text and one valid source chunk', () => {
  const doc = emptyNoteDrawing(); doc.texts = [{ id: 1, text: '汉字\nHello', x: .2, y: .3, size: 36, color: '#202632' }];
  const encoded = embedDrawingMetadata(png, bytes(JSON.stringify(doc)));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(drawingMetadata(encoded))), doc);
  assert.deepEqual(inflateSync(pngParts(encoded).find(p => p.type === 'IDAT').data),
    inflateSync(pngParts(png).find(p => p.type === 'IDAT').data));
  const source = pngParts(encoded).find(p => p.type === 'jiDe'); assert.equal(source.crc, crc32(source.hashed));
  const twice = embedDrawingMetadata(encoded, bytes('second')); assert.equal(pngParts(twice).filter(p => p.type === 'jiDe').length, 1);
  assert.equal(new TextDecoder().decode(drawingMetadata(twice)), 'second');
  assert.equal(drawingMetadata(png), null); assert.equal(drawingMetadata(new Uint8Array([255, 216, 255])), null);
});

test('corrupt or truncated embedded source fails instead of silently flattening the drawing', () => {
  const data = embedDrawingMetadata(png, bytes('source'));
  const corrupt = data.slice(); const offset = Buffer.from(data).indexOf('jiDe'); corrupt[offset + 4] ^= 1;
  assert.throws(() => drawingMetadata(corrupt), /Corrupt/);
  assert.throws(() => drawingMetadata(data.slice(0, 25)), /Invalid|Incomplete/);
});

test('drawing source rejects traversal, invalid geometry and oversized text while preserving opaque SDK files', () => {
  const doc = emptyNoteDrawing(); doc.engine = 'huawei_pen_kit'; doc.ink = [{name:'ink/page/data',data:'AA=='}];
  validateNoteDrawing(doc);
  for (const name of ['../ink', 'ink/../../x', 'ink//x', 'ink/C:/x', 'ink/..\\x', 'ink/\u0000x']) {
    assert.equal(validDrawingFileName(name), false, name);
    assert.throws(() => validateNoteDrawing({...doc,ink:[{name,data:'AA=='}]}), /Invalid/);
  }
  for (const change of [{width:Infinity}, {height:1}, {engine:'custom'}, {texts:[{id:1,text:'x',x:-1,y:0,size:24,color:'#202632'}]}]) {
    assert.throws(() => validateNoteDrawing({...doc,...change}), /Invalid/);
  }
});

test('restored local strokes retain independent eraser, new undo history and defensive copies', () => {
  const board = new StudyWhiteboard(); const strokes = [{points:[{x:.2,y:.3}],color:'#202632',width:4,eraser:false}];
  board.restoreStrokes(strokes); board.setViewport(200,100); strokes[0].points[0].x=1;
  let restored; board.visitStrokes(stroke=>{restored=stroke;}); assert.equal(restored.points[0].x,.2); assert.equal(board.canUndo(),false);
  board.begin(1,40,30,'#202632',30,true); board.finish(1); assert.equal(board.canUndo(),true); assert.equal(board.undo(),true);
  const after=[];board.visitStrokes(stroke=>after.push(stroke));assert.equal(after.length,1);assert.equal(board.redo(),true);
});

test('media drawing edits use one session, preserve HTML attributes and isolate cancellation from original drafts', () => {
  const h = mediaDialogHarness(async()=>[], {initialValue:'before<img class="diagram" src="old.png">after'});
  h.dialog.editDrawing(1); const version=h.dialog.drawingVersion;
  assert.equal(h.dialog.drawingActive,true);assert.equal(h.dialog.drawingSource,'file:///files/collection.media/old.png');
  let cancelled=0;h.dialog.dismissDrawing=()=>cancelled++;h.dialog.close(false);assert.equal(cancelled,1);
  assert.equal(h.events.includes('close'),false);h.dialog.finishDrawing('file:///cache/note-drawing-image-1.png',version);
  assert.match(h.dialog.value,/class="diagram"/);assert.match(h.dialog.value,/before<img/);assert.match(h.dialog.value,/>after$/);
  assert.equal(h.dialog.images.length,1);h.dialog.close(false);
  assert.equal(h.events.some(e=>e[0]==='apply'),false);
  assert.deepEqual(h.events.find(e=>e[0]==='image-cleanup')[1],['file:///cache/note-drawing-image-1.png']);
});

test('new canvas adds an image, videos cannot open drawing, and stale editor completion is ignored', () => {
  const h=mediaDialogHarness();h.dialog.editDrawing();const old=h.dialog.drawingVersion;
  h.dialog.finishDrawing('new.png',old);assert.equal(h.dialog.images[0].kind,undefined);
  h.dialog.editDrawing();h.dialog.finishDrawing('stale.png',old);assert.equal(h.dialog.images.length,1);
  const s=new NoteMediaSession('[sound:movie.mp4]',0,[],[],'t');h.dialog.session=s;h.dialog.sync();h.dialog.drawingActive=false;
  h.dialog.editDrawing(0);assert.equal(h.dialog.drawingActive,false);
  const original={id:1,fieldIndex:0,uri:'file:///cache/original.png',filename:''};
  const session=new NoteMediaSession('',0,[original],[],'t');session.addImage('fresh.png',-1,1);
  assert.deepEqual(session.imageCleanup(false).map(i=>i.uri),['fresh.png']);
  assert.deepEqual(session.imageCleanup(true).map(i=>i.uri),[original.uri]);
});

const textRendering=loadPlatformModule('utils/NoteDrawingRendering.ets','({measureNoteDrawingText,paintNoteDrawingText})',{});
// 仅替换字体引擎；选框合并、绘制和所有变换仍执行真实实现。
class DrawingCanvas {
  drawn=[];
  clearRect(){this.drawn=[];}
  fillText(...args){this.drawn.push([this.font,...args]);}
  measureText(text){
    const size=parseFloat(this.font);
    const width=[...text].reduce((sum,char)=>sum+(/[\u4e00-\u9fff]/.test(char)?1:.6),0)*size;
    return {width,actualBoundingBoxLeft:0,actualBoundingBoxRight:width,
      actualBoundingBoxAscent:-size*.15,actualBoundingBoxDescent:size*.9};
  }
}

function drawingEditor(overrides={}) {
  const events=[], doc=emptyNoteDrawing();
  const Editor=loadComponentLogic('components/editor/NoteDrawingEditor.ets','NoteDrawingEditor',{
    emptyNoteDrawing,DRAWING_COLORS,DRAWING_COLOR_KEYS,DRAWING_TEXT_HANDLES,drawingTextResizeScale,
    scaledDrawingTextSize,noteDrawingImageActionKey,StudyWhiteboard,CanvasRenderingContext2D:DrawingCanvas,
    OffscreenCanvasRenderingContext2D:DrawingCanvas,RenderingContextSettings:class{},LengthMetricsUnit:{PX:'px'},...textRendering,
    appInterface:{observe:observation=>{events.push(['observe',observation]);return 1;},leave:()=>{}},
    noteDrawingInterfaceObservation,resourceText:(_ctx,key)=>key,$r:key=>key,
    TouchType:{Down:0,Up:1,Move:2,Cancel:3},SourceTool:{Unknown:0,Finger:1,Pen:2},
    renderNoteDrawing:document=>{events.push(['render',structuredClone(document)]);return {release(){events.push('release-output');}};},
    saveNoteDrawing:async()=> 'file:///cache/note-drawing-image-123.png',
    disposeDrawingWorkspace:async()=>{},discardNoteDrawingImages:async images=>events.push(['cleanup',images.map(i=>i.uri)]),
    ...overrides
  });
  const editor=new Editor();editor.document=doc;editor.working=false;editor.ready=true;
  editor.getUIContext=()=>({getHostContext:()=>({cacheDir:'/cache'})});
  editor.onApply=uri=>events.push(['apply',uri]);
  editor.onCancel=()=>events.push('cancel');return {editor,events,doc};
}

test('drawing tool scrolling preserves canvas space when the keyboard reduces the body height', () => {
  const {editor}=drawingEditor();
  for(const height of [0,8,80,181.6,400,800]) {
    editor.bodyViewportHeight=height;
    const tools=editor.toolScrollHeight(), available=Math.max(0,height-8);
    assert.ok(tools>=0&&tools<=available);
    assert.ok(available-tools>=available*0.4-1e-6,'canvas keeps at least forty percent after the single gap');
  }
});

test('text placement, selection, editing, continuous dragging and cancellation preserve document coordinates', () => {
  const {editor,events}=drawingEditor();editor.textMode=true;editor.canvasWidth=400;editor.canvasHeight=300;
  editor.textChanged('hello');editor.placeText(80,90);assert.equal(editor.texts[0].x,.2);assert.equal(editor.texts[0].y,.3);
  editor.selectedText=-1;editor.textValue='';editor.selectText(editor.texts[0]);
  assert.equal(editor.selectedText,editor.texts[0].id);assert.equal(editor.textValue,'hello');
  editor.color='#D83B46';editor.textSize=48;editor.textChanged('汉字');
  const entry=editor.texts[0];assert.equal(entry.color,'#D83B46');assert.equal(entry.size,48);
  editor.startTextMove(entry);editor.moveText(entry,40,30);assert.equal(entry.x,.2,'do not rebuild Text during gesture');
  editor.finishTextMove(entry,true);assert.ok(Math.abs(entry.x-.3)<1e-10);assert.ok(Math.abs(entry.y-.4)<1e-10);
  const position={x:entry.x,y:entry.y};editor.startTextMove(entry);
  editor.moveText(entry,40,30);assert.ok(Math.abs(editor.textDragX-40)<1e-10);assert.ok(Math.abs(editor.textDragY-30)<1e-10);
  editor.finishTextMove(entry,false);assert.deepEqual({x:entry.x,y:entry.y},position);
  assert.equal(editor.textDragX,0);assert.equal(editor.textDragY,0);assert.equal(editor.textDragging,false);
  assert.equal(editor.selectedText,entry.id);
  editor.startTextMove(entry);editor.moveText(entry,9999,-9999);editor.finishTextMove(entry,true);
  assert.equal(editor.textBoxX(entry)+editor.textBoxWidth(entry),editor.canvasWidth);assert.equal(entry.y,0);
  editor.working=true;editor.cancel();assert.equal(events.includes('cancel'),false);
  editor.working=false;editor.cancel();assert.equal(events.includes('cancel'),true);
});

test('color selector edits the selected text, rejects invalid or busy choices and replaces the font-size control',()=>{
  const {editor,events}=drawingEditor();editor.textMode=true;editor.textChanged('colored');editor.placeText(20,20);
  const entry=editor.texts[0];editor.selectColor(2);assert.equal(entry.color,DRAWING_COLORS[2]);
  for(const index of [-1,99,.5,NaN])editor.selectColor(index);
  assert.equal(entry.color,DRAWING_COLORS[2]);
  editor.startTextResize(entry,false);editor.selectColor(1);editor.textChanged('blocked');
  assert.equal(entry.text,'colored');assert.equal(entry.color,DRAWING_COLORS[2]);editor.finishTextResize(entry,false);
  editor.tapTextCanvas({fingerList:[undefined,{id:7,localX:200,localY:200}]});assert.equal(editor.selectedText,-1);assert.equal(editor.texts.length,1);
  editor.selectColor(1);assert.equal(entry.color,DRAWING_COLORS[2]);
  editor.official=true;editor.textMode=false;editor.selectColor(3);assert.equal(editor.color,DRAWING_COLORS[1]);
  const view=events.filter(e=>e[0]==='observe').at(-1)[1];assert.equal(view.items.some(i=>i.id==='text_size'),false);
  assert.equal(view.items.some(i=>i.id==='color'),true);assert.deepEqual(view.optionIds,DRAWING_COLORS);
  const source=readFileSync(new URL('../../entry/src/main/ets/components/editor/NoteDrawingEditor.ets',import.meta.url),'utf8');
  assert.match(source,/FormSelectRow\(\{ label: \$r\('app.string.note_drawing_color'\)/);
  assert.doesNotMatch(source,/DRAWING_SIZES|note_drawing_text_size/);
});

test('measured selection fits multiline text and moves the complete box inside the canvas',()=>{
  const {editor}=drawingEditor();editor.textMode=true;editor.canvasWidth=600;editor.canvasHeight=450;
  editor.textSize=120;editor.textChanged('汉字\nAB');editor.placeText(590,440);const entry=editor.texts[0];
  assert.deepEqual(editor.textBounds(entry),{x:-2,y:7,width:124,height:121});
  assert.equal(entry.x,1-122/600);assert.equal(entry.y,1-128/450);
  editor.startTextMove(entry);editor.moveText(entry,NaN,10);assert.equal(editor.textDragY,0);
  editor.moveText(entry,-9999,9999);editor.finishTextMove(entry,true);
  assert.ok(Math.abs(editor.textBoxX(entry))<1e-10);assert.equal(entry.y,1-128/450);
  const original={x:entry.x,y:entry.y};editor.startTextMove(entry);editor.moveText(entry,100,-100);
  editor.frameWidth=300;editor.frameHeight=225;editor.fitCanvas();editor.finishTextMove(entry,true);
  assert.deepEqual({x:entry.x,y:entry.y},original);assert.equal(editor.textDragging,false);assert.equal(editor.textDragX,0);
});

test('selection unions glyph ink on each line, including bearings and blank-line offsets',()=>{
  const measured=[];
  const context={measureText(line){
    measured.push(line);
    return line==='汉字' ? {actualBoundingBoxLeft:-3,actualBoundingBoxRight:79,
      actualBoundingBoxAscent:-8,actualBoundingBoxDescent:39} :
      {actualBoundingBoxLeft:2,actualBoundingBoxRight:27,actualBoundingBoxAscent:-5,actualBoundingBoxDescent:42};
  }};
  const entry={id:1,text:'\n汉字\n\nAg\n',size:40,color:'#202632',x:.1,y:.1};
  assert.deepEqual(textRendering.measureNoteDrawingText(context,entry),{x:-2,y:56,width:81,height:130});
  assert.deepEqual(measured,['汉字','Ag']);assert.equal(context.font,'40px sans-serif');
  assert.equal(context.textBaseline,'top');assert.equal(context.textAlign,'left');
  const {editor}=drawingEditor();editor.textMode=true;editor.textChanged('汉');editor.placeText(100,100);
  const box=editor.textBounds(editor.texts[0]);assert.equal(box.width,16);assert.equal(box.height,13);
  assert.ok(box.width<44&&box.height<44,'touch size must not enlarge the visible frame');
});

test('all eight handles resize in their direction and preserve the opposite edge or corner',()=>{
  assert.equal(DRAWING_TEXT_HANDLES.length,8);
  for(const handle of DRAWING_TEXT_HANDLES){
    const {editor}=drawingEditor();editor.textMode=true;editor.canvasWidth=1200;editor.canvasHeight=900;
    editor.textSize=60;editor.textChanged('汉字Long');editor.placeText(400,300);
    const entry=editor.texts[0],original=structuredClone(entry);
    const anchorX=editor.textBoxX(entry)+editor.textBoxWidth(entry)*(1-handle.x);
    const anchorY=editor.textBoxY(entry)+editor.textBoxHeight(entry)*(1-handle.y);
    editor.startTextResize(entry,false,handle);
    editor.resizeText(entry,(handle.x-.5)*2*editor.resizeWidth,(handle.y-.5)*2*editor.resizeHeight);
    assert.equal(editor.textScale,2,handle.id);assert.deepEqual(entry,original,'preview does not mutate source');
    assert.ok(Math.abs(editor.textBoxX(entry)+editor.textBoxWidth(entry)*(1-handle.x)-anchorX)<1e-8,handle.id);
    assert.ok(Math.abs(editor.textBoxY(entry)+editor.textBoxHeight(entry)*(1-handle.y)-anchorY)<1e-8,handle.id);
    editor.finishTextResize(entry,true);assert.equal(entry.size,120,handle.id);
    const saved=structuredClone(entry);editor.startTextResize(entry,false,handle);
    editor.resizeText(entry,-(handle.x-.5)*editor.resizeWidth,-(handle.y-.5)*editor.resizeHeight);
    assert.equal(editor.textScale,.5,handle.id);editor.finishTextResize(entry,false);assert.deepEqual(entry,saved);
  }
});

test('vertical corner drags respond fully on wide text and side handles ignore the other axis',()=>{
  const rightBottom=DRAWING_TEXT_HANDLES.find(h=>h.id==='bottom_right');
  assert.equal(drawingTextResizeScale(1000,20,rightBottom,0,20),2);
  assert.equal(drawingTextResizeScale(20,1000,rightBottom,20,0),2);
  const top=DRAWING_TEXT_HANDLES.find(h=>h.id==='top'),left=DRAWING_TEXT_HANDLES.find(h=>h.id==='left');
  assert.equal(drawingTextResizeScale(1000,20,top,9999,-20),2);
  assert.equal(drawingTextResizeScale(20,1000,left,-20,9999),2);
  assert.equal(drawingTextResizeScale(1000,20,top,9999,0),1);
  const {editor}=drawingEditor();editor.textMode=true;editor.textSize=60;editor.textChanged('Wide text '.repeat(4));
  editor.placeText(20,60);const entry=editor.texts[0];editor.startTextResize(entry,false,rightBottom);
  editor.resizeText(entry,0,editor.resizeHeight);assert.equal(editor.textScale,2);
  editor.finishTextResize(entry,true);assert.equal(entry.size,120);
});

test('eight resize touch regions stay distinct and inside wide or narrow canvases, including their edges',()=>{
  for(const [width,height] of [[400,300],[240,120],[800,600]]){
    for(const size of [8,36,120]){
      for(const [x,y] of [[0,0],[width,height],[width/2,height/2],[0,height],[width,0]]){
        const {editor}=drawingEditor();editor.textMode=true;editor.canvasWidth=width;editor.canvasHeight=height;
        editor.textSize=size;editor.textChanged('汉');editor.placeText(x,y);const entry=editor.texts[0];
        const positions=DRAWING_TEXT_HANDLES.map(handle=>({x:editor.textHandleX(entry,handle),y:editor.textHandleY(entry,handle)}));
        for(let i=0;i<positions.length;i++){
          const current=positions[i];assert.ok(current.x>=0&&current.x+24<=width+1e-8);
          assert.ok(current.y>=0&&current.y+24<=height+1e-8);
          for(const other of positions.slice(i+1)){
            assert.ok(Math.abs(current.x-other.x)>=24-1e-8||Math.abs(current.y-other.y)>=24-1e-8,
              `overlapping handles at ${width}x${height}, font ${size}, origin ${x},${y}`);
          }
        }
      }
    }
  }
});

test('text preview shares PNG painting and redraws move, resize, cancellation and viewport changes',()=>{
  const {editor}=drawingEditor();editor.textMode=true;editor.textCanvasMounted=true;
  editor.textChanged('汉字\nAg');editor.placeText(80,90);const entry=editor.texts[0];
  assert.deepEqual(editor.textCanvas.drawn,[['12vp sans-serif','汉字',80,90],['12vp sans-serif','Ag',80,104.4]]);
  editor.startTextMove(entry);editor.moveText(entry,30,40);
  assert.deepEqual(editor.textCanvas.drawn[0],['12vp sans-serif','汉字',110,130]);
  editor.finishTextMove(entry,false);assert.deepEqual(editor.textCanvas.drawn[0],['12vp sans-serif','汉字',80,90]);
  editor.startTextResize(entry,true);editor.scaleText(entry,2);
  assert.equal(editor.textCanvas.drawn[0][0],'24vp sans-serif');editor.finishTextResize(entry,false);
  assert.equal(editor.textCanvas.drawn[0][0],'12vp sans-serif');
  editor.frameWidth=600;editor.frameHeight=450;editor.fitCanvas();
  assert.deepEqual(editor.textCanvas.drawn[0],['18vp sans-serif','汉字',120,135]);
});

test('blank-canvas taps use valid local finger coordinates and ignore empty or multiple pointers',()=>{
  const {editor}=drawingEditor();editor.textMode=true;editor.textChanged('tap');
  for(const event of [{fingerList:[]},{fingerList:[undefined]},
    {fingerList:[{id:1,localX:10,localY:20},{id:7,localX:30,localY:40}]},
    {fingerList:[{id:7,localX:NaN,localY:30}]}])editor.tapTextCanvas(event);
  assert.equal(editor.texts.length,0);
  editor.tapTextCanvas({fingerInfos:[{id:7,localX:80,localY:90}],fingerList:[undefined]});
  assert.equal(editor.texts.length,1);assert.equal(editor.texts[0].x,.2);assert.equal(editor.texts[0].y,.3);
});

test('corner resizing previews proportional text size and commits only on completion; cancel and busy retain source',()=>{
  const {editor}=drawingEditor();editor.textMode=true;editor.textChanged('Hello\n汉字');editor.placeText(40,30);
  const entry=editor.texts[0];editor.startTextResize(entry,false);
  editor.resizeText(entry,editor.resizeWidth,editor.resizeHeight);assert.equal(editor.textScale,2);
  assert.equal(entry.size,36);assert.equal(editor.textFontSize(entry),24);
  editor.finishTextResize(entry,true);assert.equal(entry.size,72);assert.equal(editor.textSize,72);assert.equal(editor.textScale,1);
  const saved=structuredClone(entry);editor.startTextResize(entry,false);editor.resizeText(entry,100,100);
  editor.finishTextResize(entry,false);assert.deepEqual(entry,saved);assert.equal(editor.selectedText,entry.id);
  editor.startTextResize(entry,false);editor.resizeText(entry,NaN,100);assert.equal(editor.textScale,1);
  editor.resizeText(entry,100,100);editor.working=true;editor.finishTextResize(entry,true);assert.deepEqual(entry,saved);
  assert.equal(editor.textDragging,false);assert.equal(editor.textScale,1);
});

test('pinch takes over a finger drag without a late pan callback committing or clearing the resize',()=>{
  const {editor}=drawingEditor();editor.textMode=true;editor.textChanged('pinch');editor.placeText(40,30);
  const entry=editor.texts[0],position={x:entry.x,y:entry.y};editor.startTextMove(entry);editor.moveText(entry,40,30);
  editor.startTextResize(entry,true);editor.scaleText(entry,3);editor.finishTextMove(entry,false);
  assert.equal(editor.textScale,3);assert.equal(editor.textDragging,true);assert.deepEqual({x:entry.x,y:entry.y},position);
  editor.scaleText(entry,NaN);assert.equal(editor.textScale,3,'invalid gesture data must not change the preview');
  editor.finishTextResize(entry,true);editor.moveText(entry,80,60);editor.finishTextMove(entry,true);
  assert.equal(entry.size,108);assert.deepEqual({x:entry.x,y:entry.y},position);assert.equal(editor.textDragging,false);
  editor.startTextResize(entry,true);editor.scaleText(entry,1e10);editor.finishTextResize(entry,true);assert.equal(entry.size,256);
  editor.startTextResize(entry,true);editor.scaleText(entry,1e-10);editor.finishTextResize(entry,true);assert.equal(entry.size,8);
  assert.equal(scaledDrawingTextSize(36,0),36);assert.equal(scaledDrawingTextSize(36,Infinity),36);
});

test('resized text saves and reopens with editable source; selection and gesture previews never enter the image',async()=>{
  const h=drawingEditor();h.editor.textMode=true;h.editor.textChanged('再编辑\nSaved');h.editor.placeText(40,30);
  const entry=h.editor.texts[0];h.editor.startTextResize(entry,true);h.editor.scaleText(entry,2.5);
  await h.editor.save();assert.equal(h.events.some(e=>e[0]==='render'),false,'save must wait for the gesture to finish');
  h.editor.finishTextResize(entry,true);await h.editor.save();const doc=h.events.find(e=>e[0]==='render')[1];
  validateNoteDrawing(doc);assert.equal(doc.texts[0].size,90);
  const restored=JSON.parse(new TextDecoder().decode(drawingMetadata(embedDrawingMetadata(png,bytes(JSON.stringify(doc))))));
  const reopened=drawingEditor({loadNoteDrawing:async()=>restored,drawingBaseImage:async()=>null,
    studyPenKitAvailability:()=>({available:false}),createDrawingWorkspace:async()=>'/cache/note-drawing-work-reopen',
    restoreDrawingInk:async()=>{}});
  await reopened.editor.initialize();reopened.editor.textMode=true;reopened.editor.selectText(reopened.editor.texts[0]);
  assert.equal(reopened.editor.textSize,90);assert.equal(reopened.editor.selectedText,entry.id);
  const drawn=[];
  const render=loadPlatformModule('utils/NoteDrawingRendering.ets','renderNoteDrawing',{
    OffscreenCanvasRenderingContext2D:class{fillRect(){}getPixelMap(){return {};}fillText(...args){drawn.push([this.font,...args]);}},
    RenderingContextSettings:class{},LengthMetricsUnit:{PX:'px'}});
  render(restored,null,null);assert.deepEqual(drawn,[['90px sans-serif','再编辑',120,90],['90px sans-serif','Saved',120,198]]);
  assert.doesNotMatch(JSON.stringify(restored),/selectedText|textScale|textDrag|resize|selection/);
  reopened.editor.aboutToDisappear();
});

test('local save composes text and strokes, retains draft on failure and cleans a late saved image', async()=>{
  const h=drawingEditor();h.editor.textMode=true;h.editor.textChanged('note');h.editor.placeText(40,30);await h.editor.save();
  assert.equal(h.events.find(e=>e[0]==='render')[1].texts[0].text,'note');assert.equal(h.doc.engine,'local_canvas');assert.equal(h.editor.working,false);
  const failed=drawingEditor({saveNoteDrawing:async()=>{throw Error('disk full');}});await failed.editor.save();
  assert.equal(failed.events.some(e=>e[0]==='apply'),false);assert.equal(failed.editor.failed,false);assert.equal(failed.editor.working,false);
  const gate=deferred(),late=drawingEditor({saveNoteDrawing:()=>gate.promise});const saving=late.editor.save();
  late.editor.disposed=true;gate.resolve('late.png');await saving;assert.equal(late.events.some(e=>e[0]==='apply'),false);
  assert.deepEqual(late.events.find(e=>e[0]==='cleanup')[1],['late.png']);
});

test('JIDE observes drawing controls and state without text, source paths, image or ink contents', () => {
  const status=noteDrawingInterfaceObservation({working:false,ready:true,official:true,textMode:true,textCount:2,
    selectedText:true,hasError:false,canUndo:false,canRedo:false,color:'#202632',size:48,canAddText:true});
  assert.equal(status.controlsComplete,false);assert.equal(status.items.some(i=>i.id==='eraser'),false);
  assert.equal(status.items.find(i=>i.id==='add_text').enabled,true);assert.equal(status.values.find(v=>v.id==='text_count').value,'2');
  assert.equal(status.items.some(i=>i.id==='text_size'),false);assert.equal(status.items.some(i=>i.id==='resize_text'),true);
  assert.equal(status.values.find(v=>v.id==='text_transform').value,'move_resize');
  assert.equal(status.values.find(v=>v.id==='text_resize_handles').value,DRAWING_TEXT_HANDLES.map(h=>h.id).join(','));
  assert.equal(status.values.find(v=>v.id==='text_selection_bounds').value,'glyph');
  const dragging=noteDrawingInterfaceObservation({working:false,ready:true,official:false,textMode:true,textCount:1,
    selectedText:true,hasError:false,canUndo:false,canRedo:false,textTransforming:true});
  assert.equal(dragging.items.filter(i=>i.id!=='close').every(i=>!i.enabled),true);
  assert.equal(dragging.values.find(v=>v.id==='text_transforming').value,'true');
  assert.equal(status.items.find(i=>i.id==='import').titleKey,noteDrawingImageActionKey(false));
  const {editor,events}=drawingEditor();editor.document.base='private-image-bytes';editor.publish();
  const withImage=events.at(-1)[1];assert.equal(withImage.items.find(i=>i.id==='import').titleKey,noteDrawingImageActionKey(true));
  assert.doesNotMatch(JSON.stringify(withImage),/private-image-bytes/);
  assert.doesNotMatch(JSON.stringify(status),/note-drawing-image|base64|hello|汉字/);
  const busy=noteDrawingInterfaceObservation({working:true,ready:true,official:false,textMode:false,textCount:0,
    selectedText:false,hasError:false,canUndo:true,canRedo:true});assert.equal(busy.items.every(i=>!i.enabled),true);
});

test('PNG importer preserves embedded editing source in the normal Anki image path', async()=>{
  const doc=emptyNoteDrawing(),encoded=embedDrawingMetadata(png,bytes(JSON.stringify(doc))), writes=[];
  const importImage=loadPlatformModule('backend/NoteImageImport.ets','importNoteImage',{
    fs:{OpenMode:{READ_ONLY:1},open:async()=>({fd:1}),stat:async()=>({size:encoded.length}),
      read:async(_fd,buffer)=>{new Uint8Array(buffer).set(encoded);return encoded.length;},close:async()=>{}},
    noteImageExtension:()=> 'png',媒体服务:class{async 添加媒体文件(name,data){writes.push([name,data]);return 'drawing.png';}}
  });
  assert.equal(await importImage('drawing'),'drawing.png');assert.deepEqual(writes[0][1],encoded);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(drawingMetadata(writes[0][1]))),doc);
});

test('new drawing stays below the existing add row and every image pen reuses the shared icon button',()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/components/editor/NoteMediaDialog.ets',import.meta.url),'utf8');
  assert.ok(source.indexOf("actionLabel: $r('app.string.note_visual_add')")<source.indexOf("actionLabel: $r('app.string.note_drawing_new')"));
  assert.match(source,/IconActionButton\(\{ source: \$r\('app.media.ic_study_edit'\)/);
});

function drawingStore() {
  const files=new Map(), folders=new Set(['/cache']), handles=new Map(), removed=[];let next=0,failWrite=false;
  const fs={OpenMode:{READ_ONLY:1,READ_WRITE:2,CREATE:4,TRUNC:8},
    async open(path,mode){if(mode===1&&!files.has(path))throw Error('missing');if(mode!==1)files.set(path,new Uint8Array());
      const fd=++next;handles.set(fd,{path,offset:0});return {fd};},
    async stat(path){if(typeof path==='number')path=handles.get(path).path;
      if(!files.has(path)&&!folders.has(path))throw Error('missing');return {size:files.get(path)?.length??0,isDirectory:()=>folders.has(path)};},
    async read(fd,buffer){const h=handles.get(fd),data=files.get(h.path),size=Math.min(7,buffer.byteLength,data.length-h.offset);
      new Uint8Array(buffer).set(data.subarray(h.offset,h.offset+size));h.offset+=size;return size;},
    async write(fd,buffer){if(failWrite)throw Error('disk full');const h=handles.get(fd),data=new Uint8Array(buffer),size=Math.min(11,data.length);
      files.set(h.path,Uint8Array.from([...files.get(h.path),...data.subarray(0,size)]));return size;},
    async close(file){handles.delete(file.fd);},async access(path){return folders.has(path)||files.has(path);},
    async mkdir(path){if(folders.has(path))throw Error('exists');const parts=path.split('/');
      for(let i=2;i<=parts.length;i++)folders.add(parts.slice(0,i).join('/'));},
    async listFile(path){return [...folders,...files.keys()].filter(name=>name.startsWith(path+'/')).map(name=>name.slice(path.length));},
    async unlink(path){removed.push(path);files.delete(path);},async rmdir(path){removed.push(path);folders.delete(path);}
  };
  const store=loadPlatformModule('backend/NoteDrawingStore.ets',
    '({loadNoteDrawing,saveNoteDrawing,restoreDrawingInk,snapshotDrawingInk,discardNoteDrawingImages,disposeDrawingWorkspace})',{
      fs,fileUri:{getUriFromPath:path=>'file://'+path,FileUri:class{constructor(uri){this.path=decodeURIComponent(uri.slice(7));}}},
      image:{createImagePacker:()=>({packToData:async()=>Uint8Array.from(png).buffer,release:async()=>{}})},
      util:{Base64Helper:class{encodeToStringSync(data){return Buffer.from(data).toString('base64');}
        decodeSync(data){return Uint8Array.from(Buffer.from(data,'base64'));}}},
      DRAWING_MAX_BYTES,emptyNoteDrawing,validateNoteDrawing,drawingMetadata,embedDrawingMetadata,validDrawingFileName,
      UTF8编码:bytes,UTF8解码:data=>new TextDecoder().decode(data)
    });
  return {store,files,folders,handles,removed,failWrite:()=>{failWrite=true;}};
}

test('platform store survives provider short IO, restores opaque files including empty files and cleans only owned caches',async()=>{
  const h=drawingStore(),doc=emptyNoteDrawing();doc.engine='huawei_pen_kit';
  doc.ink=[{name:'ink/page/data',data:'AAECAwQ='},{name:'ink/page/empty',data:''}];
  await h.store.restoreDrawingInk('/cache/note-drawing-work-a',doc.ink);
  assert.deepEqual(await h.store.snapshotDrawingInk('/cache/note-drawing-work-a'),doc.ink);
  const uri=await h.store.saveNoteDrawing('/cache',{},doc);
  assert.deepEqual(await h.store.loadNoteDrawing(uri.slice(7)),doc);assert.equal(h.handles.size,0);
  await h.store.discardNoteDrawingImages([uri,'file:///cache/other.png','file:///files/note-drawing-image-other.png',
    'file:///cache/note-drawing-image-a/../../other.png','photo://image'].map(uri=>({uri})),'/cache');
  await h.store.disposeDrawingWorkspace('/cache/note-drawing-work-a','/cache');
  assert.deepEqual(h.removed,[uri.slice(7),'/cache/note-drawing-work-a']);
  h.failWrite();await assert.rejects(h.store.saveNoteDrawing('/cache',{},doc),/disk full/);
  assert.equal(h.handles.size,0);assert.equal(h.removed.length,3,'partial export is removed');
});

test('official adapter saves native source, loads once, exports normalized full canvas and rejects disposal',async()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/components/StudyPenCanvas.ets',import.meta.url),'utf8')
    .replace(/^import[^;]+;\s*/gm,'').replace(/^export /gm,'')
    .replace(/@Builder\nfunction studyPenCanvas[^]*?^}\n/m,'').replace(/^const studyPenCanvasBuilder[^\n]+\n/m,'');
  let controller,disposed=0;const calls=[];
  const factory=new Function('HandwriteController','BuilderNode','studyPenCanvasBuilder',
    stripTypeScriptTypes(source,{mode:'transform'})+';return createStudyPenCanvas;')(
      class{constructor(){controller=this;}onLoad(cb){this.callback=cb;}load(path){calls.push(['load',path]);}
        async save(path){calls.push(['save',path]);}async getThumbnail(rect){calls.push(['thumbnail',rect]);return 'pixels';}},
      class{build(){}dispose(){disposed++;}getFrameNode(){return {};}},()=>{});
  const mount=factory({}, {generation:1,onReady(){},onLayout(){},onScale(){}},400,300);
  await mount.save('ink');const loading=mount.load('ink');await assert.rejects(mount.load('second'),/unavailable/);
  controller.callback({code:1,message:'load success'},'ink');await loading;
  assert.equal(await mount.thumbnail(.75),'pixels');
  assert.deepEqual(calls[2],['thumbnail',{left:0,top:0,right:1000,bottom:750}]);
  const closed=mount.load('again');mount.dispose();mount.dispose();await assert.rejects(closed,/closed/);
  assert.equal(disposed,1);await assert.rejects(mount.save('closed'),/closed/);
});

test('leaving during export defers releasing the background and workspace until pending IO finishes',async()=>{
  const gate=deferred(),cleanups=[];const h=drawingEditor({saveNoteDrawing:()=>gate.promise,
    disposeDrawingWorkspace:async root=>cleanups.push(root)});
  h.editor.workspace='/cache/note-drawing-work-a';h.editor.baseImage={release(){cleanups.push('pixels');}};
  const saving=h.editor.save();h.editor.aboutToDisappear();assert.deepEqual(cleanups,[]);
  gate.resolve('late.png');await saving;assert.deepEqual(cleanups,['pixels','/cache/note-drawing-work-a']);
  assert.equal(h.editor.pendingOperations,0);assert.equal(h.events.some(e=>e[0]==='apply'),false);
});

test('fallback writing follows the active pointer across sparse touch arrays and ignores palm cancellation',()=>{
  const {editor}=drawingEditor();editor.local.setViewport(400,300);
  const touch=(type,sourceTool,points)=>editor.touch({type,sourceTool,changedTouches:points});
  touch(0,2,[undefined,{id:7,x:10,y:20}]);touch(3,1,[{id:1,x:0,y:0}]);
  assert.equal(editor.local.currentPointer(),7);
  touch(2,2,[{id:1,x:0,y:0},{id:7,x:50,y:60}]);touch(1,2,[undefined,{id:7,x:60,y:70}]);
  let stroke;editor.local.visitStrokes(item=>{stroke=item;});assert.equal(stroke.points.length,3);
  assert.equal(stroke.points[2].x,.15);assert.equal(editor.local.currentPointer(),-1);
});

test('official editor waits for both SDK initialization and measured layout; existing native ink cannot silently fall back',async()=>{
  class Host{constructor(parameters,onFailure){this.parameters=parameters;this.failure=onFailure;}setViewport(){}dispose(){}async loadDocument(){}}
  const h=drawingEditor({StudyPenCanvasHost:Host});h.editor.official=true;h.editor.ready=false;h.editor.working=true;
  h.editor.startOfficial();await h.editor.officialReady(h.editor.generation);assert.equal(h.editor.ready,false);
  h.editor.host.parameters.onLayout(h.editor.generation,400,300);assert.equal(h.editor.ready,true);assert.equal(h.editor.working,false);
  assert.equal(h.editor.host.parameters.fixedCanvas,true);h.editor.aboutToDisappear();
  const blank=drawingEditor({StudyPenCanvasHost:Host});blank.editor.ready=false;blank.editor.official=true;blank.editor.startOfficial();
  blank.editor.officialFailed(blank.editor.generation);assert.equal(blank.editor.official,false);assert.equal(blank.editor.ready,true);blank.editor.aboutToDisappear();
  const saved=drawingEditor({StudyPenCanvasHost:Host});saved.doc.ink=[{name:'ink',data:'AA=='}];saved.editor.official=true;saved.editor.startOfficial();
  saved.editor.officialFailed(saved.editor.generation);assert.equal(saved.editor.failed,true);assert.match(saved.editor.errorMessage,/requires_penkit/);
  assert.equal(saved.events.some(e=>e[0]==='apply'),false);saved.editor.aboutToDisappear();
});
