import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { 解析云端牌组目录 } from '../../entry/src/main/ets/model/云端牌组模型.ts';

const 目录路径 = new URL('../../hosting/cloud-decks.json', import.meta.url);

test('托管目录保留既有七项并提供中文文件名的中高考语音包、托福和文言文', async () => {
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
      { id: 'china-law-professional', name: '中国法律专业版', version: '1.0.0', size: 1351898, cardCount: 2500, accessType: 'public', fileName: '中国法律专业版.apkg' },
      { id: 'primary-school-classical-poetry-75', name: '小学古诗词·课标75首', version: '1.0.0', size: 35975, cardCount: 399, accessType: 'public', fileName: '小学古诗词_课标75首_背诵填空优化版.apkg' },
      { id: 'gre-red-book-vocabulary', name: 'GRE研究生入学考试词汇（红宝书）', version: '1.1.0', size: 31007829, cardCount: 7512, accessType: 'public', fileName: 'GRE研究生入学考试词汇（红宝书·优化版）.apkg' },
      { id: 'ancient-chinese-culture', name: '中国古代文化常识汇总大全', version: '1.0.0', size: 654323, cardCount: 5978, accessType: 'public', fileName: '中国古代文化常识汇总大全.apkg' },
      { id: 'high-school-classical-poetry-40', name: '高中古诗词·课标40首', version: '1.0.0', size: 48277, cardCount: 788, accessType: 'public', fileName: '高中古诗词_课标40首_背诵填空优化版.apkg' },
      { id: 'middle-school-classical-poetry-40', name: '初中古诗词·课标40首', version: '1.0.0', size: 36937, cardCount: 511, accessType: 'public', fileName: '初中古诗词_课标40首_背诵填空优化版.apkg' },
      { id: 'ai-machine-learning', name: 'AI机器学习', version: '2.0.0', size: 5513671, cardCount: 1450, accessType: 'public', fileName: 'AI机器学习（分发版）.apkg' },
      { id: 'gaokao-english-curriculum-2025', name: '高考英语词汇·课标语音版', version: '1.1.1', size: 39256884, cardCount: 6308, accessType: 'public', fileName: '高考英语词汇（课标语音版1.1.1）.apkg' },
      { id: 'zhongkao-english-curriculum-2025', name: '中考英语词汇·课标语音版', version: '1.1.1', size: 21947528, cardCount: 3484, accessType: 'public', fileName: '中考英语词汇（课标语音版1.1.1）.apkg' },
      { id: 'toefl-green-book-vocabulary', name: 'TOEFL托福词汇（绿宝书）', version: '1.1.0', size: 78549928, cardCount: 8254, accessType: 'public', fileName: 'TOEFL托福词汇（绿宝书·优化版）.apkg' },
      { id: 'classical-chinese-content-function-words', name: '文言文实词与虚词', version: '1.1.0', size: 77960, cardCount: 481, accessType: 'public', fileName: '文言文实词与虚词（语境辨义优化版）.apkg' },
    ],
  );

  for (const 牌组 of 目录.decks) {
    const 下载地址 = new URL(牌组.downloadUrl);
    assert.equal(下载地址.protocol, 'https:');
    assert.equal(下载地址.hostname, '4001784660.cdn.123clouddisk.com');
    assert.equal(decodeURIComponent(下载地址.pathname).split('/')[2], 'CET四六级');
    assert.match(decodeURIComponent(下载地址.pathname), /\.apkg$/);
  }
});
