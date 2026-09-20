// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const base = 'https://jidecards-media.local/';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const source = read('entry/src/main/ets/utils/媒体响应助手.ets')
  .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
const load = new Function('fs', 'WebResourceResponse',
  stripTypeScriptTypes(source, { mode: 'transform' }) + '; return interceptMediaRequest;');

class Response {
  code = 0;
  headers = [];
  ready = true;
  transitions = [];
  done = new Promise(resolve => { this.finish = resolve; });
  setResponseCode(value) { this.code = value; }
  setReasonMessage(value) { this.reason = value; }
  setResponseMimeType(value) { this.mime = value; }
  setResponseEncoding(value) { this.encoding = value; }
  setResponseHeader(value) { this.headers = value; }
  setResponseData(value) { this.data = value; }
  setResponseIsReady(value) {
    this.ready = value; this.transitions.push(value);
    if (value) this.finish();
  }
  header(name) { return this.headers.find(h => h.headerKey.toLowerCase() === name.toLowerCase())?.headerValue; }
}

function harness(options = {}) {
  const bytes = options.bytes ?? Uint8Array.from({ length: 160000 }, (_, i) => (i * 31 + 7) % 251);
  const files = new Map(), opened = [], reads = [], closed = [], seeks = [];
  let nextFd = 10;
  const fs = {
    OpenMode: { READ_ONLY: 0 }, WhenceType: { SEEK_SET: 0 },
    async open(path) {
      if (options.missing) throw new Error('missing');
      const file = { fd: nextFd++ }; files.set(file.fd, { position: 0 }); opened.push(path); return file;
    },
    async stat(fd) {
      assert.ok(files.has(fd));
      if (options.statFailure) throw new Error('stat failed');
      return { size: options.size ?? bytes.length, isFile: () => !options.directory };
    },
    lseek(fd, offset, whence) {
      assert.equal(whence, 0); files.get(fd).position = offset; seeks.push([fd, offset]); return offset;
    },
    async read(fd, buffer, { length }) {
      const file = files.get(fd);
      reads.push({ fd, start: file.position, length, capacity: buffer.byteLength });
      if (options.readFailure) throw new Error('IO failed');
      if (options.eof) return 0;
      const count = Math.min(length, options.maxRead ?? length, bytes.length - file.position);
      new Uint8Array(buffer).set(bytes.subarray(file.position, file.position + count));
      file.position += count; return count;
    },
    async close(file) {
      assert.ok(files.delete(file.fd), 'an owned descriptor closes once'); closed.push(file.fd);
      if (options.closeFailure) throw new Error('close failed');
    }
  };
  const intercept = load(fs, Response);
  function request(range = '', extra = {}) {
    const headers = extra.headers ?? (range ? [{ headerKey: 'rAnGe', headerValue: range }] : []);
    return {
      getRequestUrl: () => extra.url ?? `${base}lesson.mp3`,
      getRequestMethod: () => extra.method ?? 'GET', getRequestHeader: () => headers
    };
  }
  async function run(range = '', extra = {}) {
    const response = intercept(request(range, extra), '/media', base);
    if (response && !response.ready) await response.done;
    return response;
  }
  return { intercept, request, run, bytes, opened, reads, closed, files, seeks };
}

for (const [range, start, end] of [
  ['bytes=10-19', 10, 19], ['bytes=159990-', 159990, 159999],
  ['bytes=-12', 159988, 159999], ['bytes=159999-999999', 159999, 159999],
  ['bytes=1-1', 1, 1], [' bytes=20-39 ', 20, 39], ['BYTES=12-20', 12, 20],
  ['bytes=1000-150000', 1000, 150000]
]) {
  test(`media response serves exactly ${range}`, async () => {
    const h = harness(), response = await h.run(range);
    assert.equal(response.code, 206); assert.equal(response.reason, 'Partial Content');
    assert.equal(response.mime, 'audio/mpeg');
    assert.equal(response.header('Content-Type'), 'audio/mpeg');
    assert.equal(response.header('Accept-Ranges'), 'bytes');
    assert.equal(response.header('Content-Range'), `bytes ${start}-${end}/${h.bytes.length}`);
    assert.equal(response.header('Content-Length'), String(end - start + 1));
    assert.deepEqual(new Uint8Array(response.data), h.bytes.slice(start, end + 1));
    assert.equal(h.reads.reduce((sum, r) => sum + r.length, 0), end - start + 1);
    assert.ok(h.reads.every(r => r.capacity <= 65536));
    assert.deepEqual(response.transitions, [false, true]); assert.deepEqual(h.closed, [10]);
  });
}

for (const range of ['', 'items=0-10', 'bytes=0-1,4-5', 'bytes=abc-def', 'bytes=-', 'bytes=9-2',
  'bytes=0-9007199254740992']) {
  test(`unsupported or absent range ${JSON.stringify(range)} serves a complete 200 via descriptor`, async () => {
    const h = harness(), response = await h.run(range);
    assert.equal(response.code, 200); assert.equal(response.data, 10);
    assert.equal(response.header('Content-Length'), String(h.bytes.length));
    assert.equal(response.header('Accept-Ranges'), 'bytes');
    assert.equal(response.header('Content-Range'), undefined);
    assert.equal(h.reads.length, 0); assert.equal(h.closed.length, 0, 'ArkWeb owns the descriptor');
  });
}

for (const range of ['bytes=0-', 'bytes=0-999999', 'bytes=-999999']) {
  test(`full-file range ${range} retains 206 metadata and hands the file to ArkWeb`, async () => {
    const h = harness(), response = await h.run(range);
    assert.equal(response.code, 206); assert.equal(response.data, 10);
    assert.equal(response.header('Content-Range'), 'bytes 0-159999/160000');
    assert.equal(h.reads.length, 0); assert.equal(h.closed.length, 0);
  });
}

test('200 MB initial bytes=0- request does not allocate or read a media-sized buffer in ArkTS', async () => {
  const h = harness({ size: 200 * 1024 * 1024 }), response = await h.run('bytes=0-');
  assert.equal(response.code, 206); assert.equal(response.data, 10);
  assert.equal(response.header('Content-Length'), String(200 * 1024 * 1024));
  assert.equal(h.reads.length, 0); assert.equal(h.seeks.length, 0);
});

for (const range of ['bytes=160000-', 'bytes=999999-1000000', 'bytes=-0']) {
  test(`unsatisfiable ${range} returns an empty 416 without reading`, async () => {
    const h = harness(), response = await h.run(range);
    assert.equal(response.code, 416); assert.equal(response.header('Content-Range'), 'bytes */160000');
    assert.equal(response.header('Content-Length'), '0'); assert.equal(response.data, '');
    assert.equal(h.reads.length, 0); assert.deepEqual(h.closed, [10]);
  });
}

test('empty files support a zero-length GET and reject a byte range', async () => {
  const h = harness({ size: 0 });
  const full = await h.run(), range = await h.run('bytes=0-');
  assert.equal(full.code, 200); assert.equal(full.data, '');
  assert.equal(range.code, 416); assert.equal(range.header('Content-Range'), 'bytes */0');
  assert.deepEqual(h.closed, [10, 11]); assert.equal(h.reads.length, 0);
});

test('HEAD ignores Range and returns complete metadata with no body or descriptor transfer', async () => {
  const h = harness(), response = await h.run('bytes=20-30', { method: 'HEAD' });
  assert.equal(response.code, 200); assert.equal(response.header('Content-Length'), '160000');
  assert.equal(response.header('Content-Range'), undefined); assert.equal(response.data, '');
  assert.equal(h.reads.length, 0); assert.deepEqual(h.closed, [10]);
});

test('If-Range without a matching validator falls back to a full response', async () => {
  const h = harness(), response = await h.run('', { headers: [
    { headerKey: 'Range', headerValue: 'bytes=1-5' }, { headerKey: 'If-Range', headerValue: '"old"' }
  ] });
  assert.equal(response.code, 200); assert.equal(response.data, 10);
});

test('short reads advance sequentially and concurrent seeks use independent file descriptors', async () => {
  const h = harness({ maxRead: 7 });
  const [first, second] = await Promise.all([h.run('bytes=12-99'), h.run('bytes=300-359')]);
  assert.deepEqual(new Uint8Array(first.data), h.bytes.slice(12, 100));
  assert.deepEqual(new Uint8Array(second.data), h.bytes.slice(300, 360));
  assert.equal(first.header('Content-Length'), '88'); assert.equal(second.header('Content-Length'), '60');
  assert.equal(h.files.size, 0); assert.equal(h.closed.length, 2);
});

for (const fault of ['readFailure', 'eof', 'statFailure']) {
  test(`${fault} terminates as 500, clears stale range headers and closes the descriptor`, async () => {
    const h = harness({ [fault]: true }), response = await h.run('bytes=10-20');
    assert.equal(response.code, 500); assert.equal(response.data, '');
    assert.equal(response.header('Content-Range'), undefined); assert.equal(response.header('Content-Length'), '0');
    assert.deepEqual(response.transitions, [false, true]); assert.deepEqual(h.closed, [10]);
  });
}

test('close failure still releases the asynchronous response', async () => {
  const h = harness({ closeFailure: true }), response = await h.run('bytes=10-20');
  assert.equal(response.code, 206); assert.deepEqual(new Uint8Array(response.data), h.bytes.slice(10, 21));
  assert.deepEqual(response.transitions, [false, true]);
});

test('foreign requests pass through; local missing files and directories return 404', async () => {
  const h = harness();
  assert.equal(await h.run('', { url: 'https://example.com/lesson.mp3' }), null);
  assert.equal(h.opened.length, 0);
  assert.equal((await harness({ missing: true }).run()).code, 404);
  const directory = harness({ directory: true });
  assert.equal((await directory.run()).code, 404); assert.deepEqual(directory.closed, [10]);
});

test('URL decoding preserves encoded filename punctuation and excludes query/fragment from disk paths', async () => {
  const h = harness();
  await h.run('', { url: `${base}${encodeURIComponent('中文 ?#%.mp3')}?v=2#t=30` });
  assert.equal(h.opened[0], '/media/中文 ?#%.mp3');
  await h.run('', { url: `${base}100%.mp3` });
  assert.equal(h.opened[1], '/media/100%.mp3');
  for (const name of ['../secret', '..\\secret', 'a/b', 'a\0b', '.', '..']) {
    assert.equal((await h.run('', { url: base + encodeURIComponent(name) })).code, 404);
  }
  assert.equal(h.opened.length, 2);
});

test('placeholder HTML and unsupported methods never open media files', async () => {
  const h = harness(), blank = await h.run('', { url: base });
  assert.equal(blank.code, 200); assert.equal(blank.mime, 'text/html');
  const post = await h.run('', { method: 'POST' });
  assert.equal(post.code, 405); assert.equal(post.header('Allow'), 'GET, HEAD');
  assert.equal(h.opened.length, 0);
});

test('images, fonts, scripts and builder-supported video formats keep their MIME types', async () => {
  for (const [name, mime] of [['image.png', 'image/png'], ['font.woff2', 'font/woff2'],
    ['script.js', 'text/javascript'], ['movie.MOV', 'video/quicktime'], ['movie.m4v', 'video/mp4'],
    ['movie.ogv', 'video/ogg'], ['movie.mp4', 'video/mp4'], ['unknown', 'application/octet-stream']]) {
    const response = await harness().run('', { url: base + name }); assert.equal(response.mime, mime);
  }
});

test('study and preview forward the original request to the same media response implementation', async () => {
  for (const path of ['entry/src/main/ets/pages/学习页.ets', 'entry/src/main/ets/components/browser/卡片预览页.ets']) {
    const page = read(path), start = page.indexOf('  private 拦截媒体(');
    const method = page.slice(start, page.indexOf('\n  }', start) + 4);
    const h = harness();
    const Page = new Function('interceptMediaRequest', '媒体基地址',
      stripTypeScriptTypes(`class Page { ${method} }`, { mode: 'transform' }) + '; return Page;')(h.intercept, base);
    const instance = new Page(); instance.媒体目录 = '/media';
    const response = instance.拦截媒体({ request: h.request('bytes=7-18') });
    await response.done;
    assert.equal(response.code, 206); assert.deepEqual(new Uint8Array(response.data), h.bytes.slice(7, 19));
  }
});
