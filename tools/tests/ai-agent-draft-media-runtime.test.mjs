// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

// 仅替换平台 IO；确认、基线检查、草稿执行及失败重试使用真实模块。
const stub = `
export const common = {};
export const fixture = { failure: '', trashFails: false, added: [], trashed: [], saved: [] };
export class 卡片服务 {}
export class 搜索服务 {}
export class 牌组服务 { async 获取牌组树() { return {deckId:1,children:[]}; } }
export class 笔记类型服务 { async 获取笔记类型能力() { return {notetypeId:2,fieldNames:['Front','Back']}; } }
export class 笔记服务 {
 async 新建笔记() { return {id:0,notetypeId:2,fields:['',''],tags:[]}; }
 async 获取笔记(id) { return {id,notetypeId:2,fields:['Front','Back'],tags:[]}; }
 async 添加笔记(note) { return this.save(note); }
 async 更新笔记(notes) { this.save(notes[0]); }
 save(note) {
  if (fixture.failure==='note') throw Error('note_save_failed');
  fixture.saved.push(structuredClone(note)); return 100+fixture.saved.length;
 }
}
export class 媒体服务 {
 async 添加媒体文件(_name,bytes) {
  if (fixture.failure==='media' && bytes[0]===2) throw Error('media_write_failed');
  const name='returned-'+(fixture.added.length+1)+'.png'; fixture.added.push(name); return name;
 }
 async 媒体文件进回收站(names) {
  fixture.trashed.push(names.slice()); if (fixture.trashFails) throw Error('trash_failed');
 }
}
export class WikimediaImageService {
 async download(_context,candidate) {
  if (fixture.failure==='download' && candidate.candidateId==='2') throw Error('download_failed');
  return new Uint8Array([Number(candidate.candidateId)]);
 }
 static extensionForBytes(bytes) { return fixture.failure==='format' && bytes[0]===2 ? '' : 'png'; }
}
`;
const stubUrl = 'data:text/javascript;base64,' + Buffer.from(stub).toString('base64');
const names = ['搜索服务', '卡片服务', '牌组服务', '笔记类型服务', '笔记服务', '媒体服务', 'WikimediaImageService'];
register('data:text/javascript;base64,' + Buffer.from(`export function resolve(s,c,next) {
 if (s==='@kit.AbilityKit' || ${JSON.stringify(names)}.some(n=>s.endsWith('/'+n)))
  return {url:${JSON.stringify(stubUrl)},shortCircuit:true};
 return next(s,c);
}`).toString('base64'), import.meta.url);
const { fixture } = await import(stubUrl);
const { AgentDraftExecutor } = await import('../../entry/src/main/ets/backend/agent/AgentDraftExecutor.ets');
const { buildFailedOperationsRetryDraft } = await import('../../entry/src/main/ets/model/agent/AgentDraftRetry.ts');
globalThis.AppStorage = { get: () => ({}) };

function reset(failure = '', trashFails = false) {
  Object.assign(fixture, { failure, trashFails, added: [], trashed: [], saved: [] });
}

function draftFor(mode) {
  const noteId = mode === 'create' ? -1 : 42;
  return {
    id: 'media-test', risk: 'write', summary: '', baselineHash: '', confirmationLevel: 1,
    status: 'pending', affectedNoteIds: mode === 'create' ? [] : [noteId],
    affectedCardIds: [], affectedDeckIds: [1], affectedNotetypeIds: [2],
    operations: [{ kind: mode === 'create' ? 'create_note' : 'update_field', noteId,
      cardId: 0, deckId: 1, fieldOrd: 0, before: mode === 'create' ? '' : 'Front', after: 'Updated' }],
    imageAttachments: [1, 2].map(id => ({ noteId, fieldOrd: 1, before: 'Back', altText: '<caption>',
      candidateId: String(id), candidate: { candidateId: String(id) } })),
  };
}

async function execute(draft) {
  const executor = new AgentDraftExecutor();
  const prepared = await executor.prepare(draft);
  return executor.executeOrdinary(prepared, prepared.firstToken);
}

for (const mode of ['create', 'update']) {
  for (const [failure, errorCode] of [['download', 'download_failed'], ['format', 'invalid_image'],
    ['media', 'media_write_failed'], ['note', 'note_save_failed']]) {
    test(`${mode}: ${failure} failure compensates every image already written for the note`, async () => {
      reset(failure);
      const result = await execute(draftFor(mode));
      assert.equal(result.status, 'failed');
      assert.equal(result.succeeded, 0);
      assert.equal(result.failed, 1);
      assert.equal(result.items[0].errorCode, errorCode);
      assert.equal(fixture.saved.length, 0);
      assert.deepEqual(fixture.added, failure === 'note' ? ['returned-1.png', 'returned-2.png'] : ['returned-1.png']);
      assert.deepEqual(fixture.trashed, [fixture.added]);
    });
  }

  test(`${mode}: successful save references returned filenames and keeps its media`, async () => {
    reset();
    const result = await execute(draftFor(mode));
    assert.equal(result.status, 'completed');
    assert.equal(result.succeeded, 1);
    assert.deepEqual(fixture.trashed, []);
    assert.match(fixture.saved[0].fields[1], /src="returned-1.png"/);
    assert.match(fixture.saved[0].fields[1], /src="returned-2.png"/);
    assert.match(fixture.saved[0].fields[1], /alt="&lt;caption&gt;"/);
  });

  test(`${mode}: compensation failure preserves both errors and the affected filename`, async () => {
    reset('download', true);
    const result = await execute(draftFor(mode));
    assert.equal(result.status, 'failed');
    assert.equal(result.items[0].errorCode, 'download_failed;media_compensation_failed:returned-1.png');
    assert.deepEqual(fixture.trashed, [['returned-1.png']]);
  });

  test(`${mode}: partial success keeps saved media and retries only the failed note`, async () => {
    reset('download');
    const draft = draftFor(mode);
    const nextId = mode === 'create' ? -2 : 43;
    draft.operations.push({ ...draft.operations[0], noteId: nextId });
    if (mode === 'update') draft.affectedNoteIds.push(nextId);
    draft.imageAttachments.push({ ...draft.imageAttachments[0], noteId: nextId });
    const result = await execute(draft);
    assert.equal(result.status, 'partial');
    assert.deepEqual(fixture.trashed, [['returned-1.png']]);
    assert.equal(fixture.saved.length, 1);
    assert.match(fixture.saved[0].fields[1], /returned-2.png/);
    const retry = buildFailedOperationsRetryDraft(draft, result, 'media-retry');
    assert.equal(retry.operations.length, 1);
    assert.equal(retry.operations[0].noteId, mode === 'create' ? -1 : 42);
    fixture.failure = '';
    const retried = await execute(retry);
    assert.equal(retried.status, 'completed');
    assert.equal(fixture.saved.length, 2);
    assert.deepEqual(fixture.trashed, [['returned-1.png']]);
  });
}
