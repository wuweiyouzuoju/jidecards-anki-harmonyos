// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { noteImageExtension, prepareNoteImageFields } from '../../entry/src/main/ets/model/NoteImageDraft.ts';

const attachment = (fieldIndex, uri, id = fieldIndex) => ({ id, fieldIndex, uri, filename: '' });

test('image-only front and back use independent persistent media names', async () => {
  const images = [attachment(0, 'photo://front'), attachment(1, 'photo://back')];
  const imports = [];
  const fields = await prepareNoteImageFields(['', ''], images, async uri => {
    imports.push(uri);
    return imports.length === 1 ? 'front.png' : 'back-renamed.png';
  });
  assert.deepEqual(imports, ['photo://front', 'photo://back']);
  assert.deepEqual(fields, ['<img src="front.png">', '<img src="back-renamed.png">']);
  assert.ok(fields.every(field => !field.includes('photo://')));
});

test('multiple images preserve text, field order and escape backend filenames', async () => {
  const text = ['{{c1::question}}', 'answer', 'extra'];
  const images = [attachment(1, 'a'), attachment(1, 'b', 2)];
  const fields = await prepareNoteImageFields(text, images, async uri => uri === 'a' ? 'a&"<>.png' : 'b.gif');
  assert.deepEqual(fields, [text[0], 'answer<br><img src="a&amp;&quot;&lt;&gt;.png"><br><img src="b.gif">', 'extra']);
  assert.deepEqual(text, ['{{c1::question}}', 'answer', 'extra']);
});

test('partial failure keeps successful uploads for retry and never duplicates field markup', async () => {
  const images = [attachment(0, 'a'), attachment(1, 'b')];
  await assert.rejects(prepareNoteImageFields(['', ''], images, async uri => {
    if (uri === 'b') throw new Error('disk full');
    return 'a.png';
  }), /disk full/);
  assert.equal(images[0].filename, 'a.png');
  assert.equal(images[1].filename, '');
  const imported = [];
  const fields = await prepareNoteImageFields(['', ''], images, async uri => { imported.push(uri); return 'b.png'; });
  assert.deepEqual(imported, ['b']);
  assert.deepEqual(fields, ['<img src="a.png">', '<img src="b.png">']);
  assert.deepEqual(await prepareNoteImageFields(['', ''], images, async () => assert.fail()), fields);
});

test('empty results and stale field indices fail before creating a note', async () => {
  const item = attachment(0, 'a');
  await assert.rejects(prepareNoteImageFields([''], [item], async () => ''), /no filename/);
  assert.equal(item.filename, '');
  await assert.rejects(prepareNoteImageFields([''], [item, attachment(2, 'b')], async () => assert.fail()), /Invalid image field/);
});

test('accepted image save snapshots fields and attachment membership across async work', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const fields = ['question', 'answer'];
  const images = [attachment(1, 'b')];
  const save = prepareNoteImageFields(fields, images, async () => { await waiting; return 'back.png'; });
  fields[1] = 'changed';
  images.length = 0;
  release();
  assert.deepEqual(await save, ['question', 'answer<br><img src="back.png">']);
});

test('common web image headers preserve their format and HEIC needs conversion', () => {
  assert.equal(noteImageExtension(Uint8Array.from([255, 216, 255])), 'jpg');
  assert.equal(noteImageExtension(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), 'png');
  assert.equal(noteImageExtension(new TextEncoder().encode('GIF89a')), 'gif');
  assert.equal(noteImageExtension(new TextEncoder().encode('RIFF0000WEBP')), 'webp');
  assert.equal(noteImageExtension(new TextEncoder().encode('0000ftypheic')), '');
  assert.equal(noteImageExtension(new Uint8Array()), '');
});

function importHarness(bytes, { failRead = false, failPack = false, failWrite = false } = {}) {
  const source = readFileSync(new URL('../../entry/src/main/ets/backend/NoteImageImport.ets', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
  const events = [];
  let cursor = 0;
  const fs = {
    OpenMode: { READ_ONLY: 0 }, open: async () => ({ fd: 1 }), stat: async () => ({ size: bytes.length }),
    read: async (_fd, buffer) => {
      if (failRead) return 0;
      const length = Math.min(3, bytes.length - cursor, buffer.byteLength);
      new Uint8Array(buffer).set(bytes.subarray(cursor, cursor + length));
      cursor += length;
      return length;
    },
    close: async () => events.push('close')
  };
  const image = {
    createImageSource: () => ({ release: async () => events.push('source-release') }),
    createImagePacker: () => ({
      packToData: async (_source, options) => {
        assert.equal(options.format, 'image/png');
        if (failPack) throw new Error('decode failed');
        return Uint8Array.from([1, 2, 3]).buffer;
      },
      release: async () => events.push('packer-release')
    })
  };
  class Media {
    async 添加媒体文件(name, data) {
      if (failWrite) throw new Error('disk full');
      events.push({ name, data: [...data] });
      return 'actual.png';
    }
  }
  const run = new Function('fs', 'image', '媒体服务', 'noteImageExtension',
    stripTypeScriptTypes(source, { mode: 'transform' }) + '; return importNoteImage;')(fs, image, Media, noteImageExtension);
  return { run, events };
}

test('platform import handles short reads and uses backend returned name', async () => {
  const bytes = new TextEncoder().encode('GIF89a-picture');
  const h = importHarness(bytes);
  assert.equal(await h.run('photo://test'), 'actual.png');
  assert.deepEqual(h.events, [{ name: 'note-image.gif', data: [...bytes] }, 'close']);
});

test('platform conversion and all failure paths release owned resources', async () => {
  const bytes = new TextEncoder().encode('0000ftypheic');
  const success = importHarness(bytes);
  await success.run('photo://test');
  assert.deepEqual(success.events, [{ name: 'note-image.png', data: [1, 2, 3] }, 'packer-release', 'source-release', 'close']);
  for (const options of [{ failPack: true }, { failWrite: true }]) {
    const h = importHarness(bytes, options);
    await assert.rejects(h.run('photo://test'));
    assert.deepEqual(h.events, ['packer-release', 'source-release', 'close']);
  }
  const failedRead = importHarness(bytes, { failRead: true });
  await assert.rejects(failedRead.run('photo://test'), /Incomplete/);
  assert.deepEqual(failedRead.events, ['close']);
});

function pageHarness(picker, importer = async () => 'image.png') {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/添加笔记页.ets', import.meta.url), 'utf8');
  const methods = ['pickFieldImage', '提交', 'imagesForField'].map(name => {
    const start = source.search(new RegExp(`^  private (?:async )?${name}\\(`, 'm'));
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  const events = [];
  const Page = new Function('从图库选取图片', 'prepareNoteImageFields', 'importNoteImage', 'AppStorage', '$r',
    '笔记字段校验错误', stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`, { mode: 'transform' }) + '; return Page;')(
    picker, prepareNoteImageFields, importer, { setOrCreate: () => events.push('tick') }, key => key, class extends Error {});
  const page = Object.assign(new Page(), {
    pageActive: true, imageRequest: 0, nextImageId: 0, fieldImages: [], pickingFieldImage: false,
    处理中: false, 牌组ID: 7, 已选笔记类型ID: 8, 是否图片遮盖模式: false,
    字段值列表: ['', ''], 错误信息: '',
    getUIContext: () => ({ getHostContext: () => ({}) }),
    提交前校验填空: () => true, 解析标签: () => ['test'], 取本地化文案: key => key,
    pathStack: { pop: () => events.push('pop') },
    笔记服务实例: {
      新建笔记: async notetypeId => ({ notetypeId }),
      添加笔记: async (note, deckId) => { events.push({ note, deckId }); }
    }
  });
  return { page, events };
}

test('picker cancellation and stale responses leave the current draft untouched', async () => {
  const cancelled = pageHarness(async () => null).page;
  await cancelled.pickFieldImage(0);
  assert.deepEqual(cancelled.fieldImages, []);
  assert.equal(cancelled.pickingFieldImage, false);
  for (const leave of [false, true]) {
    let resolve;
    const h = pageHarness(() => new Promise(r => { resolve = r; }));
    const picking = h.page.pickFieldImage(0);
    await h.page.提交();
    assert.deepEqual(h.events, [], 'cannot save while the picker owns input');
    if (leave) h.page.pageActive = false;
    else h.page.imageRequest++;
    resolve('photo://old-field');
    await picking;
    assert.deepEqual(h.page.fieldImages, []);
  }
});

test('page saves both image fields in the selected deck, then refreshes and returns', async () => {
  let count = 0;
  const h = pageHarness(async () => `photo://${++count}`, async uri => uri.endsWith('1') ? 'front.png' : 'back.png');
  await h.page.pickFieldImage(0);
  await h.page.pickFieldImage(1);
  assert.equal(h.page.imagesForField(0).length, 1);
  await h.page.提交();
  assert.deepEqual(h.events, [{ note: { notetypeId: 8,
    fields: ['<img src="front.png">', '<img src="back.png">'], tags: ['test'] }, deckId: 7 }, 'tick', 'pop']);
});

test('page keeps failed image drafts and completes accepted saves after leaving without popping another page', async () => {
  const failed = pageHarness(async () => 'photo://front', async () => { throw new Error('failed'); });
  await failed.page.pickFieldImage(0);
  await failed.page.提交();
  assert.equal(failed.page.fieldImages.length, 1);
  assert.match(failed.page.错误信息, /add_note_image_import_failed/);
  assert.deepEqual(failed.events, []);
  assert.equal(failed.page.处理中, false);

  let resolve;
  const h = pageHarness(async () => 'photo://front', () => new Promise(r => { resolve = r; }));
  await h.page.pickFieldImage(0);
  const saving = h.page.提交();
  await h.page.提交();
  h.page.pageActive = false;
  resolve('front.png');
  await saving;
  assert.equal(h.events.length, 2);
  assert.equal(h.events[1], 'tick');
  assert.ok(!h.events.includes('pop'));
});
