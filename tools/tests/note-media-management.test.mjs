// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { NoteMediaSession } from '../../entry/src/main/ets/model/NoteMediaSession.ts';
import { noteMediaParts, replaceNoteMediaPart, noteImagePreviewSource, assertNoteMediaResolved } from '../../entry/src/main/ets/model/NoteMediaParts.ts';
import { prepareNoteImageFields } from '../../entry/src/main/ets/model/NoteImageDraft.ts';
import { prepareNoteAudioFields, noteAudioParts } from '../../entry/src/main/ets/model/NoteAudioDraft.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { mediaDialogHarness } from './note-media-dialog-harness.mjs';
import { editorPageHarness } from './editor-page-harness.mjs';
import { arkuiClickTargets } from '../arkui-click-targets.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const session = (value = '', images = [], audios = []) => new NoteMediaSession(value, 0, images, audios, 'test');
const audio = (id, uri) => ({ id, fieldIndex: 0, uri, filename: '', label: uri, temporary: true });

test('media tokenizer preserves HTML bytes and distinguishes src, comments, scripts and quoted angle brackets', () => {
  const value = `前<img alt="it's > fine src='hidden.png' [sound:hidden.mp3]" SRC = '中&amp;文.png' width="50">中[sound:a.mp3]后<img data-src="x" src=b.png>`;
  const parts = noteMediaParts(value);
  assert.equal(parts.map(p => p.text).join(''), value);
  assert.deepEqual(parts.filter(p => p.kind !== 'text').map(p => [p.kind, p.filename]),
    [['image', '中&文.png'], ['audio', 'a.mp3'], ['image', 'b.png']]);
  const hidden = `<!-- <img src="hidden.png"> [sound:hidden.mp3] --><script>let x='<img src="hidden.png">';</script><style>x{content:'[sound:hidden.mp3]'}</style><span data-img="<img src='hidden.png'>">text</span>`;
  assert.equal(noteMediaParts(hidden).length, 1);
  assert.equal(noteAudioParts(hidden).length, 1);
  assert.deepEqual(noteAudioParts(value).filter(p => p.filename).map(p => p.filename), ['a.mp3']);
  assert.equal(replaceNoteMediaPart(value, 100, ''), value);
  assert.equal(noteMediaParts('<img data-src="x">').length, 1);
});

test('image sources use a sandbox file URI with encoded filenames, and reject traversal after URL decoding', () => {
  assert.equal(noteImagePreviewSource('/files', '中%20文%23.png'), 'file:///files/collection.media/%E4%B8%AD%20%E6%96%87%23.png');
  assert.equal(noteImagePreviewSource('/files', 'https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(noteImagePreviewSource('/files', '100%.png'), 'file:///files/collection.media/100%25.png');
  for (const value of ['', '..', '%2e%2e', '%2fetc', '..%5Ctest', 'file:///outside', 'x%00.png', 'jidecards-draft:x'])
    assert.equal(noteImagePreviewSource('/files', value), '');
});

test('replacing one repeated image keeps its position and other attributes, and references the Core filename', async () => {
  const tag = `<img alt="a > b src='hint.png'" src='same.jpg' width="80">`;
  const draft = session('before' + tag + 'middle' + tag + 'after');
  draft.addImage('photo://new', 3);
  assert.equal(draft.images.length, 1);
  const saved = await prepareNoteImageFields([draft.value], draft.images, async () => 'new&".png');
  assert.equal(saved[0], 'before' + tag + 'middle<img alt="a > b src=\'hint.png\'" src="new&amp;&quot;.png" width="80">after');
  assert.equal(draft.value.includes('jidecards-draft:'), true);
  assertNoteMediaResolved(saved);
  draft.removeImage(1);
  assert.ok(!draft.value.includes('same.jpg'));
  assert.equal(draft.images.length, 1);
});

test('replacing and deleting staged media does not resurrect removed references or reorder pending attachments', async () => {
  const draft = session('<img src="old.png">');
  draft.addImage('photo://first', 1); draft.addImage('photo://second', 1);
  assert.deepEqual(draft.images.map(i => i.uri), ['photo://second']);
  draft.removeImage(1);
  assert.equal(draft.images.length, 0); assert.equal(draft.value, '');
  draft.addImage('a'); draft.addImage('b'); draft.addImage('c', -1, draft.images[0].id);
  assert.deepEqual(draft.images.map(i => i.uri), ['c', 'b']);
  const stale = { ...draft.images[0], reference: '<img src="jidecards-draft:gone">' };
  assert.deepEqual(await prepareNoteImageFields(['text'], [stale], async () => assert.fail()), ['text']);
  const staleAudio = { ...audio(1, 'x'), reference: '[sound:jidecards-draft:gone]' };
  assert.deepEqual(await prepareNoteAudioFields(['text'], [staleAudio], async () => assert.fail()), ['text']);
});

test('audio replacement preserves surrounding text and only the selected duplicate, with correct cache ownership', async () => {
  const old = audio(1, '/cache/note-audio-1-1.mp3');
  const draft = session('before[sound:same.mp3]middle[sound:same.mp3]after', [], [old]);
  draft.addAudio('/cache/note-audio-2-2.mp3', 'new', true, 3);
  const fields = await prepareNoteAudioFields([draft.value], draft.audios, async uri => uri.includes('2-2') ? 'new.mp3' : 'pending.mp3');
  assert.equal(fields[0], 'before[sound:same.mp3]middle[sound:new.mp3]after[sound:pending.mp3]');
  assert.deepEqual(draft.audioCleanup(false).map(a => a.uri), ['/cache/note-audio-2-2.mp3']);
  draft.removeAudio(old.id);
  assert.deepEqual(draft.audioCleanup(true).map(a => a.uri), [old.uri]);
  const reference = draft.audios[0].reference;
  draft.changeValue(draft.value.replace(reference, ''));
  assert.equal(draft.audios.length, 0);
  assert.deepEqual(draft.audioCleanup(true).map(a => a.uri), [old.uri, '/cache/note-audio-2-2.mp3']);
});

test('unresolved replacement markers fail closed before the real note writer', async () => {
  for (const field of ['<img src="jidecards-draft:missing">', '[sound:jidecards-draft:missing]']) {
    assert.throws(() => assertNoteMediaResolved([field]), /Unresolved/);
    const h = editorPageHarness(); await h.page.load();
    assert.equal(await h.page.save([field, 'answer'], [], []), false);
    assert.equal(h.writes.length, 0);
  }
});

test('management applies only on Done, cancel preserves originals and picker errors remain visible', async () => {
  const initial = { initialValue: '<img src="old.png">', initialImages: [], initialAudios: [audio(1, '/cache/old.mp3')] };
  const cancel = mediaDialogHarness(async () => ['photo://new'], initial);
  await cancel.dialog.pickImage(1);
  assert.equal(cancel.events.some(e => e[0] === 'apply'), false);
  cancel.dialog.close(false);
  assert.equal(cancel.events.some(e => e[0] === 'apply'), false);
  assert.deepEqual(initial.initialImages, []);
  assert.deepEqual(cancel.events.find(e => e[0] === 'cleanup')[1], []);
  const done = mediaDialogHarness(async () => ['photo://new'], initial);
  await done.dialog.pickImage(); done.dialog.close(true);
  assert.equal(done.events.find(e => e[0] === 'apply')[2][0].uri, 'photo://new');
  const failure = mediaDialogHarness(async () => { throw Error('provider denied'); });
  await failure.dialog.pickImage();
  assert.equal(failure.dialog.errorMessage, 'app.string.add_note_image_import_failed');
  assert.equal(failure.dialog.working, false);
});

test('picker cancellation, late replies and every dialog dismissal respect the busy owner', async () => {
  const cancel = mediaDialogHarness(); await cancel.dialog.pickImage(); assert.equal(cancel.dialog.images.length, 0);
  const gate = deferred(), h = mediaDialogHarness(() => gate.promise);
  const picking = h.dialog.pickImage();
  h.dialog.close(true); h.dialog.close(false);
  assert.equal(h.events.includes('close'), false);
  h.dialog.aboutToDisappear(); gate.resolve(['photo://late']); await picking;
  assert.equal(h.dialog.images.length, 0);
  assert.equal(h.events.some(e => e[0] === 'apply'), false);
});

test('disposed or disabled field cards reject late text, reverse and audio callbacks during continuation', () => {
  const Field=loadComponentLogic('components/common/NoteFieldCard.ets','NoteFieldCard',{NoteAudioPreview:class{}});
  const field=new Field(),changes=[],removed=[]; field.onChange=value=>changes.push(value); field.onRemoveAudio=id=>removed.push(id);
  field.changeValue('current'); field.removeAudio(1); field.disabled=true;
  field.changeValue('busy'); field.removeAudio(2); field.disabled=false; field.aboutToDisappear();
  field.changeValue('1'); field.removeAudio(3);
  assert.deepEqual(changes,['current']); assert.deepEqual(removed,[1]);
});

test('main field previews resolve existing and replacement images live and delete only the selected occurrence', () => {
  const Field = loadComponentLogic('components/common/NoteFieldCard.ets', 'NoteFieldCard', {
    NoteAudioPreview: class {}, noteMediaParts, replaceNoteMediaPart, noteImagePreviewSource
  });
  const field = new Field(); field.value = '<img src="one.png">X<img src="one.png">';
  field.getUIContext = () => ({ getHostContext: () => ({ filesDir: '/files' }) });
  field.onChange = value => { field.value = value; };
  const removed = []; field.onRemoveImage = id => removed.push(id);
  assert.equal(field.imageSource(1), 'file:///files/collection.media/one.png');
  field.removeImage(3);
  assert.equal(field.value, '<img src="one.png">X');
  const draft = session(field.value); draft.addImage('photo://replacement', 1);
  field.value = draft.value; field.images = draft.images;
  assert.equal(field.imageSource(1), 'photo://replacement');
  field.removeImage(1);
  assert.deepEqual(removed, [draft.images[0].id]);
  assert.equal(field.value, 'X');
  field.disabled = true; field.removeImage(-1, 88); assert.equal(removed.length, 1);
});

test('media UI keeps fixed Add labels and main previews expose deletion independent of the management dialog', () => {
  const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
  const card = read('components/common/NoteFieldCard.ets');
  assert.match(card, /Button\(\$r\('app.string.add_note_image_add'\)\)/);
  assert.match(card, /Button\(\$r\('app.string.note_audio_add'\)\)/);
  assert.match(card, /Stack\(\{ alignContent: Alignment.TopEnd \}\)/);
  assert.match(card, /Button\(\$r\('app.string.add_note_image_remove'\)\)/);
  assert.doesNotMatch(card, /note_(image|audio)_modify|removalsVisible: false/);
  const dialog = read('components/common/NoteMediaDialog.ets');
  assert.match(dialog, /DialogFrame\(/); assert.match(dialog, /replacementsVisible: true/);
  assert.match(dialog, /canDismiss: !this.working/);
  assert.equal(noteAudioParts('[sound:one.mp3]')[1].filename, 'one.mp3');
});

test('filled image actions consume the live theme button color', () => {
  for (const [name, expected] of [['NoteMediaDialog',1]]) {
    const source = readFileSync(new URL(`../../entry/src/main/ets/components/common/${name}.ets`, import.meta.url), 'utf8');
    assert.match(source, /@StorageProp\(颜色键.主色按钮背景\) private buttonColor/);
    const buttons = arkuiClickTargets(source).filter(target => target.kind === 'Button' &&
      !target.modifiers.includes('backgroundColor(Color.Transparent)'));
    assert.equal(buttons.length, expected);
    if (name === 'NoteMediaDialog') {
      assert.match(source, /LabeledActionRow\([\s\S]*actionLabel: \$r\('app.string.add_note_image_add'\),\s*tint: this\.buttonColor/);
      assert.match(source, /isInteractive: !this\.working,[\s\S]*onAction:.*this\.pickImage\(\)/);
    }
    const state = { buttonColor: '#7C3AED' };
    for (const button of buttons) {
      const expression = button.modifiers.match(/\.backgroundColor\(([^)]+)\)/)?.[1];
      assert.ok(expression, `${name}:${button.line} must not use the system blue`);
      const background = new Function(`return ${expression}`);
      for (const color of ['#7C3AED','#16A34A','#2F5FD0']) {
        state.buttonColor = color; assert.equal(background.call(state), color);
      }
      assert.match(button.modifiers, /fontColor\(Color.White\)/);
      assert.match(button.modifiers, /new PressFeedback\(\)/);
    }
  }
});

test('audio operation rows keep recording status and exit actions available while the host is disabled', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/common/NoteAudioField.ets', import.meta.url), 'utf8');
  const controls = [...source.matchAll(/SettingsActionRow\((\{[\s\S]*?\})\)/g)].map(match =>
    new Function('$r', 'localizedResourceText', stripTypeScriptTypes(`const props = ${match[1]};`, { mode: 'transform' }) + 'return props;'));
  const Row = loadComponentLogic('components/common/SettingsActionRow.ets', 'SettingsActionRow', { $r: key => key });
  const events = [], state = { disabled: false, working: false, paused: false, uiLanguage: 'zh-Hans', seconds: 14,
    getUIContext: () => ({}),
    pick: () => events.push('add'), record: () => events.push('record'),
    finishRecording: () => events.push('done'), togglePause: () => events.push('pause'), cancelRecording: () => events.push('cancel') };
  const props = create => create.call(state, key => key, (_context, _locale, key, seconds) => `${key}:${seconds}`);
  assert.equal(controls.length, 5);
  assert.deepEqual(controls.map(create => props(create).title), [
    'app.string.note_audio_record_done', 'app.string.note_audio_pause', 'app.string.note_audio_record_cancel',
    'app.string.note_audio_add', 'app.string.note_audio_record'
  ]);
  assert.equal(props(controls[0]).hint, 'app.string.note_audio_recording:14');
  state.seconds = 15;
  assert.equal(props(controls[0]).hint, 'app.string.note_audio_recording:15');
  assert.equal(props(controls[4]).trailingIcon, 'app.media.ic_audio_record_on');
  assert.equal(props(controls[0]).trailingIcon, 'app.media.ic_audio_recording');
  assert.equal(props(controls[1]).trailingIcon, 'app.media.ic_audio_pause');
  state.paused = true;
  assert.equal(props(controls[0]).trailingIcon, 'app.media.ic_audio_record_off');
  assert.equal(props(controls[0]).hint, 'app.string.note_audio_paused:15');
  assert.equal(props(controls[1]).title, 'app.string.note_audio_resume');
  assert.equal(props(controls[1]).trailingIcon, 'app.media.ic_audio_resume');
  state.disabled = true;
  for (const create of controls) Object.assign(new Row(), props(create)).activate();
  assert.deepEqual(events, ['done', 'pause', 'cancel'], 'host busy while recording must still allow finish, pause and cancel');
  state.working = true;
  for (const create of controls) Object.assign(new Row(), props(create)).activate();
  assert.deepEqual(events, ['done', 'pause', 'cancel']);
  state.working = state.disabled = false;
  state.paused = false;
  assert.equal(props(controls[0]).trailingIcon, 'app.media.ic_audio_recording');
  assert.equal(props(controls[1]).trailingIcon, 'app.media.ic_audio_pause');
  for (const create of controls) Object.assign(new Row(), props(create)).activate();
  assert.deepEqual(events, ['done', 'pause', 'cancel', 'done', 'pause', 'cancel', 'add', 'record']);
});

test('audio playback uses the common button with current filename, theme, and disabled guard', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/common/NoteAudioField.ets', import.meta.url), 'utf8');
  const match = source.match(/按下态按钮\((\{[\s\S]*?\})\)/);
  assert.ok(match);
  const create = new Function('key', 'label', 'filename', 'uri', 'partIndex', '$r',
    stripTypeScriptTypes(`const props = ${match[1]};`, { mode: 'transform' }) + 'return props;');
  const Button = loadComponentLogic('components/common/按下态按钮.ets', '按下态按钮', {
    $r: key => key, 应用尺寸: { 字号_按钮: 15 }, GLASS_HIGHLIGHT_COLORS: []
  });
  const events = [], state = { disabled: false, working: false, playingKey: '', buttonColor: '#7C3AED',
    partLabel: () => '当前音频', partFilename: () => 'current.mp3', partUri: () => '/cache/current.mp3',
    play: (...args) => events.push(args) };
  const props = () => create.call(state, 'existing-1', 'old label', 'old.mp3', '/cache/old.mp3', 1, key => key);
  for (const color of ['#7C3AED', '#16A34A', '#2F5FD0']) {
    state.buttonColor = color; assert.equal(props().字色, color);
  }
  const button = Object.assign(new Button(), props());
  assert.equal(button.文案, 'app.string.note_audio_play');
  state.partFilename = () => 'latest.mp3'; button.activate();
  assert.deepEqual(events, [['existing-1', 'latest.mp3', '/cache/current.mp3']]);
  state.playingKey = 'existing-1'; assert.equal(props().文案, 'app.string.note_audio_stop');
  state.disabled = true; Object.assign(new Button(), props()).activate(); assert.equal(events.length, 1);

  const deletion = source.match(/IconActionButton\((\{[\s\S]*?\})\)/);
  assert.ok(deletion);
  const Icon = loadComponentLogic('components/common/IconActionButton.ets', 'IconActionButton', {
    Color: { Transparent: 'transparent' }, 应用尺寸: { 按钮高度: 44 }
  });
  const createDelete = new Function('remove', '$r', stripTypeScriptTypes(`const props = ${deletion[1]};`, { mode: 'transform' }) + 'return props;');
  assert.equal(createDelete.call(state, () => {}, key => key).cornerAligned, true);
  state.recording = false;
  const remove = () => Object.assign(new Icon(), createDelete.call(state, () => events.push('remove'), key => key)).activate();
  remove(); assert.equal(events.length, 1);
  state.disabled = false; state.working = true; remove(); assert.equal(events.length, 1);
  state.working = false; state.recording = true; remove(); assert.equal(events.length, 1);
  state.recording = false; remove(); assert.equal(events.at(-1), 'remove');
});
