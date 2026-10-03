// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteCreationSession } from '../../entry/src/main/ets/model/NoteCreationSession.ts';
import { noteDraftChanged } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { NoteTypeCatalog } from '../../entry/src/main/ets/model/NoteTypeCatalog.ts';
import { noteImagePreviewSource } from '../../entry/src/main/ets/model/NoteMediaParts.ts';
import { 生成Occlusions字符串 } from '../../entry/src/main/ets/model/图片遮罩模型.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

export const creationType = (id = 1, sticky = [false, true]) => ({ id, name: 'Renamed type ' + id,
  kind: 0, fields: sticky.map((value, ord) => ({ord, name: 'Field ' + ord, sticky: value})),
  fieldNames: sticky.map((_, ord) => 'Field ' + ord), clozeFieldOrds: [], imageOcclusionFields: [] });
export const deferredCreation = () => {
  let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;});
  return {promise, resolve, reject};
};
export function creationPageHarness(overrides = {}) {
  const writes = [], imports = [], pops = [], cleanups = [], toasts = [], states = [], loads = [], configs = [];
  const type = overrides.type ?? creationType();
  const backend = { initialize: async () => ({types: [{id: 1, name: type.name}, {id: 2, name: 'Other'}], defaultId: 1, warning: ''}),
    loadType: async id => {loads.push(id); return id === type.id ? type : creationType(id, [false, false]);},
    setFieldSticky: async (...args) => configs.push(args),
    importImage: async uri => {imports.push(['image', uri]); return 'saved.png';},
    importAudio: async uri => {imports.push(['audio', uri]); return 'saved.mp3';},
    saveNote: async input => writes.push(structuredClone(input)),
    saveOcclusion: async input => writes.push(structuredClone(input)),
    committed() {}, errorMessage: error => error.message, ...overrides.backend };
  const Page = loadComponentLogic('pages/添加笔记页.ets', '添加笔记页', {
    NoteCreationSession, AnkiNoteCreation: class {constructor() {return backend;}},
    NoteAudioPreview: class {async stop() {} async dispose() {}},
    ExpansionReveal: class {cancel() {}}, NavPathStack: class {},
    $r: key => key, NoteTypeCatalog, noteDraftChanged, noteImagePreviewSource,
    namedResourceText: (_ctx, key) => key,
    showToastSafely: (_ctx, options) => toasts.push(options),
    discardNoteRecordings: async audios => cleanups.push(audios.slice()),
    confirmNoteDiscard: overrides.confirm ?? (async () => false),
    生成Occlusions字符串,
    文本中的填空编号: value => value.includes('{{c1::') ? [1] : [],
    从图库选取图片: overrides.picker ?? (async () => null),
    CustomTransition: {getInstance: () => ({注销NavParam() {}})},
    appInterface: {hidePage() {}, leave() {}},
    ...overrides.dependencies
  });
  const page = new Page();
  page.pageActive = true; page.牌组ID = 123; page.牌组名 = 'Target'; page.牌组选项 = [{id:123,name:'Target'}];
  page.pathStack = {pop: () => pops.push('pop')}; page.getUIContext = () => ({});
  page.取能力上下文 = () => ({filesDir: '/files'}); page.取本地化文案 = key => key;
  page.publishInterface = () => {};
  const apply = page.applyCreationState.bind(page);
  page.applyCreationState = state => {states.push(state); apply(state);};
  // 通过真实会话读取类型，所有业务测试均执行生产编排和组件逻辑。
  const ready = page.creationSession.loadType(type.id);
  return {page, backend, ready, writes, imports, pops, cleanups, toasts, states, loads, configs};
}
