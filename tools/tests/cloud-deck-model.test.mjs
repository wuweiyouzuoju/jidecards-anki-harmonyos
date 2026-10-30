import test from 'node:test';
import assert from 'node:assert/strict';

import {
  解析云端牌组目录,
  格式化云端牌组大小,
} from '../../entry/src/main/ets/model/云端牌组模型.ts';

test('解析云端牌组目录 accepts public and reserved redeem-code entries', () => {
  const catalog = 解析云端牌组目录(JSON.stringify({
    schemaVersion: 1,
    decks: [
      {
        id: 'english-basic',
        name: 'English Basic',
        description: 'Starter deck',
        version: '1.0.0',
        accessType: 'public',
        downloadUrl: 'https://api.example.cn/download?id=english-basic&token=short',
        size: 1536,
        cardCount: 14311,
      },
      {
        id: 'premium-demo',
        name: 'Premium',
        description: 'Coming later',
        version: '2.0.0',
        accessType: 'redeem_code',
        downloadUrl: '',
        size: 0,
      },
    ],
  }));

  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.decks.length, 2);
  assert.equal(catalog.decks[0].accessType, 'public');
  assert.equal(catalog.decks[0].size, 1536);
  assert.equal(catalog.decks[0].cardCount, 14311);
  assert.equal(catalog.decks[1].accessType, 'redeem_code');
  assert.equal(catalog.decks[1].downloadUrl, '');
  assert.equal(catalog.decks[1].cardCount, undefined);
});

test('解析云端牌组目录 accepts extensionless HTTPS links from third-party APIs', () => {
  const catalog = 解析云端牌组目录(JSON.stringify({
    schemaVersion: 1,
    decks: [{
      id: 'api-link', name: 'API Link', description: '', version: '1', accessType: 'public',
      downloadUrl: 'https://files.example.cn/v1/download?id=42', size: 2048,
    }],
  }));
  assert.equal(catalog.decks[0].downloadUrl, 'https://files.example.cn/v1/download?id=42');
});

test('解析云端牌组目录 rejects malformed JSON and unsupported schemas', () => {
  assert.throws(() => 解析云端牌组目录('{'), /JSON|目录/);
  assert.throws(() => 解析云端牌组目录(JSON.stringify({ schemaVersion: 2, decks: [] })), /版本/);
});

test('解析云端牌组目录 drops duplicate and unsafe entries', () => {
  const catalog = 解析云端牌组目录(JSON.stringify({
    schemaVersion: 1,
    decks: [
      null,
      42,
      {
        id: 'safe', name: 'Safe', description: '', version: '1', accessType: 'public',
        downloadUrl: 'https://cdn.example.cn/safe.apkg', size: 10,
      },
      {
        id: 'safe', name: 'Duplicate', description: '', version: '1', accessType: 'public',
        downloadUrl: 'https://cdn.example.cn/duplicate.apkg', size: 10,
      },
      {
        id: '../escape', name: 'Escape', description: '', version: '1', accessType: 'public',
        downloadUrl: 'https://cdn.example.cn/escape.apkg', size: 10,
      },
      {
        id: 'http', name: 'HTTP', description: '', version: '1', accessType: 'public',
        downloadUrl: 'http://cdn.example.cn/http.apkg', size: 10,
      },
      {
        id: 'zip', name: 'ZIP', description: '', version: '1', accessType: 'public',
        downloadUrl: 'https://cdn.example.cn/not-a-deck.zip', size: 10,
      },
      {
        id: 'negative', name: 'Negative', description: '', version: '1', accessType: 'public',
        downloadUrl: 'https://cdn.example.cn/negative.apkg', size: -1,
      },
      {
        id: 'zero-cards', name: 'Zero Cards', description: '', version: '1', accessType: 'public',
        downloadUrl: 'https://cdn.example.cn/zero.apkg', size: 10, cardCount: 0,
      },
      {
        id: 'fractional-cards', name: 'Fractional Cards', description: '', version: '1', accessType: 'public',
        downloadUrl: 'https://cdn.example.cn/fractional.apkg', size: 10, cardCount: 1.5,
      },
    ],
  }));

  assert.deepEqual(catalog.decks.map((deck) => deck.id), ['safe', 'zip']);
});

test('格式化云端牌组大小 handles unknown, bytes, KiB and MiB', () => {
  assert.equal(格式化云端牌组大小(undefined), '');
  assert.equal(格式化云端牌组大小(0), '0 B');
  assert.equal(格式化云端牌组大小(512), '512 B');
  assert.equal(格式化云端牌组大小(1536), '1.5 KB');
  assert.equal(格式化云端牌组大小(5 * 1024 * 1024), '5 MB');
});
