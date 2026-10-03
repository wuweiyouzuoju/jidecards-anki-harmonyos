import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import worker from '../site-worker.mjs';

test('legacy and www domains permanently redirect matching paths and query strings', async () => {
  const env = { ASSETS: { fetch() { assert.fail('redirects must run before assets'); } } };
  for (const host of ['jideyanggeqi.cn', 'www.jideyanggeqi.cn', 'www.jidecards.com']) {
    for (const protocol of ['http:', 'https:']) {
      for (const pathname of ['/', '/works/jidecards/', '/assets/app-preview-01.png', '/announcement.json', '/missing/']) {
        const response = await worker.fetch(new Request(`${protocol}//${host}${pathname}?source=old&tag=%E9%B8%BF%E8%92%99`), env);
        assert.equal(response.status, 301);
        assert.equal(response.headers.get('Location'), `https://jidecards.com${pathname}?source=old&tag=%E9%B8%BF%E8%92%99`);
      }
    }
  }
});

test('canonical HTTPS requests pass through assets including 404 and JSON responses', async () => {
  for (const [pathname, status] of [['/', 200], ['/cloud-decks.json', 200], ['/missing/', 404]]) {
    const request = new Request(`https://jidecards.com${pathname}`, { method: 'HEAD' });
    const assetResponse = new Response(null, { status });
    const env = { ASSETS: { fetch(actualRequest) { assert.equal(actualRequest, request); return assetResponse; } } };
    assert.equal(await worker.fetch(request, env), assetResponse);
  }
});

test('canonical HTTP upgrades directly and local preview hosts remain usable', async () => {
  const upgraded = await worker.fetch(new Request('http://jidecards.com/works/jidecards/?from=old'), {});
  assert.equal(upgraded.status, 301);
  assert.equal(upgraded.headers.get('Location'), 'https://jidecards.com/works/jidecards/?from=old');
  const preview = new Request('http://localhost:8787/');
  const result = new Response('preview');
  assert.equal(await worker.fetch(preview, { ASSETS: { fetch: () => result } }), result);
});

test('deployed asset routing runs domain redirects before any static file', async () => {
  const config = JSON.parse(await readFile(new URL('../../hosting/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.main, '../tools/site-worker.mjs');
  assert.deepEqual(config.routes.map(route => route.pattern).sort(), ['jidecards.com', 'jideyanggeqi.cn', 'www.jidecards.com', 'www.jideyanggeqi.cn']);
  assert.ok(config.routes.every(route => route.custom_domain === true));
});
