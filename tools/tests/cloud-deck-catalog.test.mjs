import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { 解析云端牌组目录 } from '../../entry/src/main/ets/model/云端牌组模型.ts';

const 目录路径 = new URL('../../hosting/cloud-decks.json', import.meta.url);

test('应用版本为 2.7.9', async () => {
  const 应用配置 = await readFile(new URL('../../AppScope/app.json5', import.meta.url), 'utf8');
  assert.match(应用配置, /versionCode:\s*2790/);
  assert.match(应用配置, /versionName:\s*'2\.7\.9'/);
});

test('托管目录提供六个带准确卡片数量的公开牌组', async () => {
  const 目录文本 = await readFile(目录路径, 'utf8');
  const 目录 = 解析云端牌组目录(目录文本);

  assert.equal(目录.schemaVersion, 1);
  assert.deepEqual(
    目录.decks.map(({ id, name, version, size, cardCount, accessType, downloadUrl }) => ({
      id,
      name,
      version,
      size,
      cardCount,
      accessType,
      fileName: decodeURIComponent(new URL(downloadUrl).pathname.split('/').at(-1)),
    })),
    [
      { id: 'cet-46-vocabulary', name: 'CET四六级词汇', version: '1.1.0', size: 166299572, cardCount: 14311, accessType: 'public', fileName: 'CET四六级词汇（分发版）.apkg' },
      { id: 'high-school-english-vocabulary', name: '高考英语词汇', version: '1.1.0', size: 89366080, cardCount: 8453, accessType: 'public', fileName: '高考英语词汇（分发版）.apkg' },
      { id: 'middle-school-english-vocabulary', name: '中考英语词汇', version: '1.1.0', size: 44358781, cardCount: 3305, accessType: 'public', fileName: '中考英语词汇（分发版）.apkg' },
      { id: 'ai-machine-learning', name: 'AI机器学习', version: '1.1.0', size: 5513671, cardCount: 1450, accessType: 'public', fileName: 'AI机器学习（分发版）.apkg' },
      { id: 'it-computer', name: 'IT计算机', version: '1.0.0', size: 35284024, cardCount: 3400, accessType: 'public', fileName: 'IT计算机（分发版）.apkg' },
      { id: 'china-law-professional', name: '中国法律专业版', version: '1.0.0', size: 1351898, cardCount: 2500, accessType: 'public', fileName: '中国法律专业版.apkg' },
    ],
  );

  for (const 牌组 of 目录.decks) {
    const 下载地址 = new URL(牌组.downloadUrl);
    assert.equal(下载地址.protocol, 'https:');
    assert.equal(下载地址.hostname, '4001784660.cdn.123clouddisk.com');
    assert.match(decodeURIComponent(下载地址.pathname), /\.apkg$/);
  }
});
