// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { decodeAgentToolArguments } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { AgentScope } from '../../entry/src/main/ets/backend/agent/AgentScope.ets';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('image search is an explicit read tool in both create and edit catalogs', () => {
  for (const mode of ['create', 'edit']) {
    const tool = agentFunctionTools(mode).find((item) => item.name === 'search_images');
    assert.ok(tool, mode);
    const schema = JSON.parse(tool.parametersJson);
    assert.deepEqual(schema.required, ['query', 'limit']);
    assert.equal(schema.properties.limit.maximum, 10);
  }
  assert.equal(toolRiskOf('search_images'), 'read');
});

test('image arguments preserve candidate identity and target field', () => {
  const search = decodeAgentToolArguments('search_images',
    JSON.stringify({ query: '中国传统文化', limit: 5 }));
  assert.equal(search.query, '中国传统文化');
  assert.equal(search.limit, 5);

  const create = decodeAgentToolArguments('create_flashcards', JSON.stringify({
    cards: [{
      fields: ['正面', '背面'],
      images: [{ candidateId: 'commons-scope-0', fieldOrd: 1, placement: 'append', altText: '文化' }],
    }],
  }));
  assert.equal(create.createNotes[0].images[0].candidateId, 'commons-scope-0');
  assert.equal(create.createNotes[0].images[0].fieldOrd, 1);

  const update = decodeAgentToolArguments('propose_update_notes', JSON.stringify({
    noteIds: [42], fieldUpdatesJson: '[]',
    imagesJson: JSON.stringify([{ noteId: 42, candidateId: 'commons-scope-0', fieldOrd: 1 }]),
    draftId: 'draft-image-edit', reason: '添加图片',
  }));
  assert.equal(update.imageUpdates[0].noteId, 42);
  assert.equal(update.imageUpdates[0].candidateId, 'commons-scope-0');
});

test('image candidates are bound to the current AgentScope', () => {
  const scope = new AgentScope();
  scope.registerImageCandidate({
    candidateId: 'commons-scope-0',
    title: '测试图片',
    thumbnailUrl: 'https://upload.wikimedia.org/thumb.jpg',
    downloadUrl: 'https://upload.wikimedia.org/image.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
    mime: 'image/jpeg',
    license: 'CC BY-SA',
    credit: '测试来源',
  });
  assert.deepEqual(scope.getImageCandidate('commons-scope-0').sourceUrl,
    'https://commons.wikimedia.org/wiki/File:Test.jpg');
  assert.throws(() => scope.getImageCandidate('commons-other-0'), /image_candidate_out_of_scope/);
  scope.reset();
  assert.throws(() => scope.getImageCandidate('commons-scope-0'), /image_candidate_out_of_scope/);
});

test('CardAgentTools registers image search and drafts carry image attachments', () => {
  const source = read('entry/src/main/ets/backend/agent/CardAgentTools.ets');
  assert.match(source, /registerRead\('search_images'/);
  assert.match(source, /registerImageCandidate/);
  assert.match(source, /imageAttachments/);
  assert.match(source, /candidateId/);
});

test('Wikimedia image service has search, safe download and cleanup boundaries', () => {
  const relative = 'entry/src/main/ets/backend/agent/WikimediaImageService.ets';
  assert.equal(fs.existsSync(path.join(root, relative)), true);
  const source = read(relative);
  assert.match(source, /commons\.wikimedia\.org/);
  assert.match(source, /upload\.wikimedia\.org/);
  assert.match(source, /\.part/);
  assert.match(source, /finally/);
  assert.match(source, /image\/jpeg/);
  assert.match(source, /image\/png/);
  assert.match(source, /魔数|signature|magic/i);
});

test('draft executor writes with Anki returned filename and compensates media failures', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentDraftExecutor.ets');
  assert.match(source, /媒体服务/);
  assert.match(source, /添加媒体文件/);
  assert.match(source, /媒体文件进回收站/);
  assert.match(source, /imageAttachments/);
  assert.match(source, /<img src=/);
  assert.match(source, /最终文件名|actual|returned/i);
});

test('AI prompt names the content-only create tool and concrete edit proposal tools', () => {
  const source = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.doesNotMatch(source, /propose_ 工具/);
  assert.match(source, /create_flashcards/);
  assert.doesNotMatch(source, /propose_create_notes/);
  assert.match(source, /propose_update_notes/);
});
