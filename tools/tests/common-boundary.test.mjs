// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';

const root = new URL('../../entry/src/main/ets/components/common/', import.meta.url);
const sharedModels = new Set(['AppLayoutState', 'AppLifecycleState', 'ThemeCatalog', 'ThemeBackgroundMotion',
  '颜色主题', '主题设置', 'CardViewportLayout', 'WindowSafeLayout'].map(name => 'model/' + name));
const sharedUtils = new Set(['应用尺寸', 'UiFeedback', 'PressFeedback', 'SurfaceBorder', '转场时长',
  'FormInputStyle', 'FormRowLayout', 'FormTextAreaStyle', 'GlassSurface', 'SelectStyle', 'ImageSurfaceStyle']
  .map(name => 'utils/' + name));

// 现有跨入口业务 UI 的逐条迁移例外；新组件不能继承例外，迁出后删除对应项。
const legacyDependencies = new Map([
  ['CardMarkingBadge.ets', ['model/CardMarking']],
  ['FlagMenuChoices.ets', ['model/CardMarking']],
  ['NoteAudioField.ets', ['@kit.AbilityKit', '@kit.CoreFileKit', 'backend/NoteAudioImport',
    'model/NoteAudioDraft', 'utils/NoteAudioPreview', 'utils/NoteAudioRecorder']],
  ['NoteDraftPreview.ets', ['backend/AnkiNoteDraftPreview', 'components/settings/NotetypeTemplatePreview',
    'model/NoteDraftPreview']],
  ['NoteFieldCard.ets', ['@kit.AbilityKit', 'model/NoteAudioDraft', 'model/NoteImageDraft',
    'model/NoteMediaParts', 'utils/NoteAudioPreview', 'utils/NoteTypeText']],
  ['NoteFieldEditor.ets', ['components/字段帮助面板', 'model/NoteFieldEditing', 'model/NoteHtmlTools',
    'model/NoteRichText', 'utils/NoteEditingHints']],
  ['NoteLinkDialog.ets', ['model/NoteRichText']],
  ['NoteMediaDialog.ets', ['@kit.AbilityKit', '@kit.MediaLibraryKit', 'model/NoteAudioDraft',
    'model/NoteImageDraft', 'model/NoteMediaParts', 'model/NoteMediaSession',
    'utils/NoteAudioPreview', 'utils/NoteAudioRecorder']],
  ['NoteTagsField.ets', ['model/NoteFieldEditing', 'model/NoteTags']],
  ['TagPicker.ets', ['backend/AppInterfaceService', 'backend/标签服务', 'model/AppInterface',
    'model/NoteTags', 'proto/messages/TagsMessages']],
  ['TagTreeList.ets', ['model/NoteTags']],
]);

// 只检查字面量直接依赖；全仓解析、环和纯模型隔离由 architecture-boundaries 负责。
function dependencies(file, source) {
  return [...source.matchAll(/(?:^|[;\n])\s*(?:import|export)\s+(?:[^;'"`]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map(match => match[1] ?? match[2])
    .map(specifier => specifier.startsWith('.')
      ? posix.normalize(posix.join('components/common', posix.dirname(file), specifier)).replace(/\.(ts|ets)$/, '')
      : specifier);
}
function isShared(dependency) {
  return dependency.startsWith('components/common/') || dependency === '@kit.ArkUI' ||
    sharedModels.has(dependency) || sharedUtils.has(dependency);
}
function boundaryErrors(sources) {
  return [...sources].flatMap(([file, source]) => dependencies(file, source)
    .filter(dependency => !isShared(dependency) && !legacyDependencies.get(file)?.includes(dependency))
    .map(dependency => `${file} -> ${dependency}`));
}
function missingIndex(sources, readme) {
  const links = new Set([...readme.matchAll(/\]\(([^)]+\.ets)\)/g)].map(match =>
    posix.normalize(decodeURIComponent(match[1]))));
  return [...sources].filter(([file, source]) => !/@internal\b/.test(source) && !links.has(file))
    .map(([file]) => file);
}

test('common gate rejects feature imports, IO, re-exports and new edges on legacy components', () => {
  const errors = boundaryErrors(new Map([
    ['Widget.ets', "import { Backend } from '../../backend/Service'; export * from '../settings/Panel';"],
    ['nested/Widget.ets', "import { Value } from '../../../model/DeckListAppearance'; import '@kit.CoreFileKit';"],
    ['NoteAudioField.ets', "const later = import('../../backend/NewService');"],
  ]));
  assert.deepEqual(errors, ['Widget.ets -> backend/Service', 'Widget.ets -> components/settings/Panel',
    'nested/Widget.ets -> model/DeckListAppearance', 'nested/Widget.ets -> @kit.CoreFileKit',
    'NoteAudioField.ets -> backend/NewService']);
  assert.deepEqual(boundaryErrors(new Map([['Widget.ets',
    "import { State } from '../../model/AppLayoutState.ts'; import { Row } from './FormSelectRow';"]])), []);
  assert.deepEqual(boundaryErrors(new Map([['Widget.ets',
    "import { safeMenuGeometry } from '../../model/WindowSafeLayout';"]])), []);
});

test('index gate requires actual local links and supports explicitly internal files', () => {
  const sources = new Map([['Public.ets', ''], ['Internal.ets', '/** @internal */']]);
  assert.deepEqual(missingIndex(sources, 'Public.ets'), ['Public.ets']);
  assert.deepEqual(missingIndex(sources, '[Public](./Public.ets)'), []);
});

test('common has no new business dependencies and each public module has an index entry', () => {
  const sources = new Map(readdirSync(root, { recursive: true }).filter(file => file.endsWith('.ets'))
    .map(file => [file.replaceAll('\\', '/'), readFileSync(new URL(file.replaceAll('\\', '/'), root), 'utf8')]));
  assert.deepEqual(boundaryErrors(sources), []);
  assert.deepEqual(missingIndex(sources, readFileSync(new URL('README.md', root), 'utf8')), []);
  for (const [file, expected] of legacyDependencies) {
    const actual = [...new Set(dependencies(file, sources.get(file) ?? '').filter(dependency => !isShared(dependency)))];
    assert.deepEqual(actual.sort(), [...expected].sort(), `${file}: remove obsolete migration exceptions`);
  }
});
