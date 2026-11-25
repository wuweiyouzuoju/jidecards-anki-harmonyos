// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = path.resolve(root, '..');
const ets = project => relative => `${project}/entry/src/main/ets/${relative}`;
const cards = ets('jidecards'), cube = ets('jidecube'), schulte = ets('jideschulte'), spatial = ets('jide-spatial');
const common = name => cards(`components/common/${name}.ets`);
const cubeUi = name => cube(`ui/${name}.ets`);
const schulteCommon = name => schulte(`components/common/${name}.ets`);
const uiEvidence = ['jidecube/docs/UI_ALIGNMENT.md', 'jideschulte/docs/ui-guidelines.md', 'jide-spatial/docs/ui.md'];

// 人工确认的是职责对应与证据，文件数量/内容哈希和清单状态在运行时生成。
const capabilities = [
  { id: 'geometry', title: '尺寸、排版、页面留白与密度', sources: [cards('utils/应用尺寸.ets')],
    consumers: [cube('ui/CubeUi.ts'), schulte('utils/tokens.ets'), spatial('utils/UiDimensions.ets')], coverage: '部分：UiTokens；页面密度仍归产品' },
  { id: 'colors', title: '明暗语义色与主题资源映射', sources: ['jidecards/entry/src/main/resources/base/element/color.json', 'jidecards/entry/src/main/resources/dark/element/color.json'],
    consumers: [cubeUi('UiResource'), schulte('utils/theme.ets'), 'jide-spatial/entry/src/main/resources/base/element/color.json'], coverage: '部分：六项语义色；完整主题未抽取' },
  { id: 'icons', title: 'SVG 原始资源与明暗图标', sources: ['jidecards/entry/src/main/resources/base/media/ic_common_history.svg'],
    consumers: ['jidecube/docs/ui-icon-provenance.json', 'jideschulte/docs/ui-assets.json', 'jide-spatial/source-reuse.json'], coverage: '未收录资源包；完整逐项记录见清单核对' },
  { id: 'icon-render', title: '图标填色、描边和透明度保留', sources: [common('ActionIcon')],
    consumers: [cubeUi('ActionIcon'), schulteCommon('SchulteActionIcon'), spatial('components/ActionIcon.ets')], coverage: '未抽取' },
  { id: 'icon-button', title: '导航图标按钮、热区与读屏', sources: [common('IconActionButton')],
    consumers: [cubeUi('CubeIconButton'), schulteCommon('SchulteIconButton'), spatial('components/IconActionButton.ets')], coverage: '未抽取' },
  { id: 'text-button', title: '普通文字按钮、禁用和持续选中', sources: [common('按下态按钮')],
    consumers: [cubeUi('CubeStyles'), schulteCommon('SchulteActionButton'), spatial('components/SecondaryActionButton.ets')], coverage: '部分：普通 ActionButton；选中/危险态未统一' },
  { id: 'primary-action', title: '主确认与学习/训练主动作', sources: [common('PrimaryActionButton'), cards('components/开始学习按钮.ets')],
    consumers: [cubeUi('CubeStyles'), schulteCommon('SchulteTrainingButton'), spatial('components/PrimaryActionButton.ets')], coverage: '未抽取：52vp 主训练动作和实色主确认不能混为普通按钮' },
  { id: 'settings-action', title: '设置导航行、说明与动作槽位', sources: [common('SettingsActionRow')],
    consumers: [cubeUi('CubeActionRow'), schulteCommon('SchulteSettingsActionRow'), spatial('components/SettingsActionRow.ets')], coverage: '未抽取' },
  { id: 'settings-toggle', title: '设置开关行与动态说明', sources: [common('SettingsToggleRow')],
    consumers: [cubeUi('CubeStyles'), schulteCommon('SchulteToggleRow')], coverage: '未抽取' },
  { id: 'form-select', title: '表单选择行、原生下拉及行间距', sources: [common('FormSelectRow'), cards('utils/FormRowLayout.ets'), cards('utils/SelectStyle.ets')],
    consumers: [cubeUi('CubeFormSelectRow'), schulteCommon('SchulteSelectRow'), schulte('utils/FormRowStyle.ets')], coverage: '未抽取' },
  { id: 'disclosure', title: '折叠箭头、方向和状态来源', sources: [common('DisclosureChevron')],
    consumers: [cubeUi('CubeChevron'), schulteCommon('SchulteDisclosureChevron'), spatial('components/DisclosureChevron.ets')], coverage: '未抽取' },
  { id: 'help-entry', title: '独立帮助按钮、标题位置与点击隔离', sources: [common('HelpButton'), common('HelpLabel')],
    consumers: [cubeUi('CubeHelpButton'), cubeUi('CubeHelpLabel'), schulteCommon('SchulteSectionHeader'), schulteCommon('SchulteInfoText')], coverage: '未抽取' },
  { id: 'help-dialog', title: '只读帮助/信息弹窗', sources: [cards('components/字段帮助面板.ets'), common('DialogFrame')],
    consumers: [cubeUi('CubeInfoDialog'), schulteCommon('SchultePanel')], coverage: '仅有通用表面；完整帮助/嵌套返回未抽取' },
  { id: 'dialog-frame', title: '弹窗外壳、正文预算与安全区', sources: [common('DialogFrame'), cards('model/WindowSafeLayout.ts')],
    consumers: [cubeUi('CubeDialogFrame'), schulteCommon('SchultePanel')], coverage: '部分：几何和页面内 DialogSurface；不是完整原生窗口宿主' },
  { id: 'dialog-header', title: '弹窗标题、关闭/完成与对称槽位', sources: [common('DialogHeader')],
    consumers: [cubeUi('CubeDialogHeader'), schulteCommon('SchultePanel')], coverage: '未抽取完整标题契约' },
  { id: 'confirmation', title: '危险后果确认、取消与返回策略', sources: [common('DialogHeader'), common('按下态按钮')],
    consumers: [cubeUi('CubeConfirmDialog'), schulte('components/HistoryPanel.ets')], coverage: '语义适配；未提供业务确认组件', relation: 'contract-adaptation' },
  { id: 'backdrop', title: '蒙层与表面开合责任', sources: [common('DialogBackdrop')],
    consumers: [cubeUi('CubeBackdrop'), schulteCommon('SchultePanel')], coverage: '部分：基础蒙层；产品模糊策略有差异' },
  { id: 'transition', title: '页面/弹层转场与设备尺寸时长', sources: [cards('utils/SurfaceTransition.ets'), cards('utils/AppMotion.ets'), cards('utils/转场时长.ets')],
    consumers: [cubeUi('CubeStyles'), schulte('utils/SurfaceTransition.ets'), spatial('utils/AppMotion.ets')], coverage: '仅抽取参数；平台转场未迁入' },
  { id: 'surface-border', title: '表面、输入和分隔线描边', sources: [cards('utils/SurfaceBorder.ets')],
    consumers: [cubeUi('GlassSurface'), schulte('utils/SurfaceBorder.ets')], coverage: '部分控件内使用边框；独立轮廓契约未抽取' },
  { id: 'press', title: '原生按压、恢复与动效档位', sources: [cards('utils/PressFeedback.ets'), cards('model/MotionStyle.ts')],
    consumers: [cubeUi('PressFeedback'), schulte('utils/PressFeedback.ets'), spatial('utils/PressFeedback.ets')], coverage: '已重建纯规则与平台按压；完整档位仍由产品选择' },
  { id: 'primary-surface', title: '按钮表面色层、渐变与稳定底色', sources: [cards('utils/PrimaryGlassSurface.ets'), cards('utils/GlassSurface.ets'), cards('utils/ThemeVisuals.ets')],
    consumers: [cubeUi('GlassSurface'), schulte('utils/SurfaceStyle.ets')], coverage: '未抽取；不能用缩放替代原色层行为' },
  { id: 'expansion-reveal', title: '展开后显露内容与用户滚动取消', sources: [cards('utils/ExpansionReveal.ets')],
    consumers: [cubeUi('CubeScrollReveal'), schulte('utils/ScrollReveal.ets')], coverage: '未抽取；现有实现的布局与延迟策略已分化' }
].map(item => ({ relation: 'adapted-code', evidence: uiEvidence, ...item }));
const sharedCoverage = {
  icons: '部分已接入公共 HAR：返回/历史两组明暗资源，两个产品移除八份本地副本',
  'icon-render': '已提炼公共 HAR；魔方/空间真实消费，舒尔特仍为本地适配',
  'icon-button': '原生按钮/热区/读屏/禁用/按压已入公共 HAR；魔方/空间保留主题、角标和动效差异',
  disclosure: '几何已提炼公共 HAR；魔方/空间真实消费，旋转与动效仍归产品',
  press: '成熟按压实现已入公共 HAR；魔方/空间保留各自档位读取'
};
for (const item of capabilities) if (sharedCoverage[item.id]) item.coverage = sharedCoverage[item.id];

const governance = [
  { title: 'Agent-first、当前入口与单一事实来源', sources: ['jidecards/AGENTS.md', 'jidecards/PROJECT_CONTEXT.md'], consumers: ['jidecube/AGENTS.md', 'jide-spatial/AGENTS.md'] },
  { title: '职责边界、状态拥有者和生产/消费方闭环', sources: ['jidecards/docs/development/ownership.md', 'jidecards/docs/development/task-contract.md'], consumers: ['jidecube/docs/development/ownership.md', 'jide-spatial/AGENTS.md'] },
  { title: '变更影响计划与分级验证', sources: ['jidecards/tools/change-impact.mjs', 'jidecards/docs/development/verification.md'], consumers: ['jidecube/tools/impact.mjs', 'jidecube/docs/development/verification.md'] },
  { title: '业务与平台隔离、可直接执行的纯规则', sources: ['jidecards/AGENTS.md', 'jidecards/docs/development/ownership.md'], consumers: ['jidecube/AGENTS.md', 'jide-spatial/AGENTS.md'] },
  { title: '来源哈希、许可证与实际改造记录', sources: ['jidecards/LICENSE'], consumers: ['jidecube/docs/ui-icon-provenance.json', 'jideschulte/docs/ui-assets.json', 'jide-spatial/source-reuse.json', 'jide-spatial/docs/ui.md'] }
];
const referenceOnly = [
  { title: '五子棋：鸿蒙/C++ 工程和构建组织借鉴', sources: ['jidecards/hvigorfile.ts'], consumers: ['GomokuEvolution/hvigorfile.ts', 'GomokuEvolution/docs/workpacks/07-harmonyos-napi.md'], note: '结构参考，不声称复制代码或完整复用原生桥。' },
  { title: '五子棋：选图/裁切/PixelMap 路径处理', sources: [cards('components/home/DeckCustomizationFeature.ets')], consumers: [ets('GomokuEvolution')('services/AvatarService.ets')], note: '消费者注释引用历史 DeckCustomizePanel；仅记录机制借鉴，不冒充当前来源版本。' },
  { title: '五子棋：页面/Ability 结构', sources: [cards('entryability/EntryAbility.ets')], consumers: [ets('GomokuEvolution')('entryability/EntryAbility.ets'), ets('GomokuEvolution')('pages/SettingsPage.ets')], note: '注释明确自研、未复制源代码；不能按代码迁入统计。' },
  { title: '数独：经舒尔特传递的设置参数组织', sources: [schulte('components/SettingsPanel.ets')], consumers: [ets('Sudoku')('rewrite/presentation/pages/SettingsPage.ets')], note: '间接借鉴舒尔特，不证明这部分直接来自闪卡。' }
];

const snapshots = new Map();
function capture(relative, required = true) {
  const absolute = path.join(workspace, relative);
  if (!existsSync(absolute)) {
    if (required) throw new Error(`Missing evidence: ${relative}`);
    return null;
  }
  const sha256 = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  snapshots.set(relative, { path: relative, sha256 });
  return sha256;
}
for (const item of [...capabilities, ...governance, ...referenceOnly]) {
  for (const relative of [...item.sources, ...item.consumers, ...(item.evidence || [])]) capture(relative);
}
const commonDirectory = cards('components/common');
const internalComponents = readdirSync(path.join(workspace, commonDirectory))
  .filter(name => /\.(ets|ts)$/.test(name)).sort().map(name => `${commonDirectory}/${name}`);
internalComponents.forEach(file => capture(file));

const manifestRecords = [];
function addRecord(project, manifest, source, destination, expectedHash, recordedModification = '', sharedPath = '') {
  const sourcePath = `jidecards/${source}`;
  const targetPath = sharedPath ? `记得系列基础/${sharedPath}` : `${project}/${destination}`;
  const sourceHash = capture(sourcePath, false), targetHash = capture(targetPath, false);
  const sourceTargetTextEqual = sourceHash !== null && targetHash !== null &&
    readFileSync(path.join(workspace, sourcePath), 'utf8').replaceAll('\r\n', '\n') ===
    readFileSync(path.join(workspace, targetPath), 'utf8').replaceAll('\r\n', '\n');
  manifestRecords.push({ project, manifest, source: sourcePath, destination: targetPath,
    consumerDeclaredPath: `${project}/${destination}`, delivery: sharedPath ? 'shared-har' : 'local-source',
    recordedSourceSha256: expectedHash, currentSourceSha256: sourceHash, currentTargetSha256: targetHash,
    sourceTargetTextEqualIgnoringLineEndings: sourceTargetTextEqual, recordedModification,
    sourceStatus: !sourceHash ? 'missing' : sourceHash === expectedHash ? 'record-matches' : 'changed-since-record',
    targetStatus: !targetHash ? 'missing' : targetHash === expectedHash ? 'record-matches' : 'differs-from-source-record' });
}
const cubeManifest = 'jidecube/docs/ui-icon-provenance.json';
for (const item of JSON.parse(readFileSync(path.join(workspace, cubeManifest))).files) {
  addRecord('jidecube', cubeManifest, item.path, item.path, item.sha256, '', item.sharedPath);
}
const schulteManifest = 'jideschulte/docs/ui-assets.json';
for (const item of JSON.parse(readFileSync(path.join(workspace, schulteManifest))).assets) {
  addRecord('jideschulte', schulteManifest, `entry/src/main/resources/${item.source}`,
    `entry/src/main/resources/${item.target}`, item.sha256);
}
const spatialManifest = 'jide-spatial/source-reuse.json';
for (const item of JSON.parse(readFileSync(path.join(workspace, spatialManifest))).files) {
  addRecord('jide-spatial', spatialManifest, item.source, item.destination, item.sourceSha256, item.modification, item.sharedPath);
}
const audit = { schemaVersion: 1, capturedAt: new Date().toISOString(), workspaceRoot: workspace.replaceAll('\\', '/'),
  scope: { source: 'jidecards', inspectedConsumers: ['jidecube', 'jideschulte', 'jide-spatial', 'JideCalc',
    'jideyanggeqi', 'GomokuEvolution', 'Sudoku', 'ThreeKingdomChess', 'yanggeqi'],
    limits: 'Explicit provenance/comments/current UI mappings. No claim that undocumented reuse has been ruled out. No product runtime tests executed.' },
  capabilities, governance, referenceOnly, internalComponents, manifestRecords,
  snapshots: [...snapshots.values()].sort((a, b) => a.path.localeCompare(b.path)) };
writeFileSync(path.join(root, 'reuse-audit.json'), JSON.stringify(audit, null, 2) + '\n');

const link = relative => `[${relative.split('/').at(-1)}](../../${relative})`;
const projectNames = files => [...new Set(files.map(file => file.split('/')[0]))].join('、');
const rows = capabilities.map((item, index) => `| ${index + 1}. ${item.title} | ${item.sources.map(link).join('、')} | ${projectNames(item.consumers)} | ${item.coverage} |`);
const sourceDrift = manifestRecords.filter(item => item.sourceStatus !== 'record-matches').length;
const targetDifference = manifestRecords.filter(item => item.targetStatus !== 'record-matches').length;
const lineEndingOnly = manifestRecords.filter(item => item.sourceStatus !== 'record-matches' &&
  item.targetStatus === 'record-matches' && item.sourceTargetTextEqualIgnoringLineEndings).length;
const document = `# jidecards 复用全景\n\n` +
  `由 \`npm run audit:reuse\` 从当前文件和已核对的职责映射生成。完整来源、消费者路径与 SHA256 见 [reuse-audit.json](../reuse-audit.json)。\n\n` +
  `最初的 12 个模块只是首批实现。当前已将图标绘制、原生图标按钮、按压、箭头与返回/历史资源接入魔方和空间训练；完整交接见 [公共 HAR 接入](公共HAR接入.md)。盘点仍包含 **${capabilities.length} 类跨产品 UI/交互复用、${governance.length} 类工程治理复用**，另有 ${referenceOnly.length} 类历史、机制或间接借鉴。三类含义不同，不合并为已经迁入本基础库的能力数。\n\n` +
  `## 已有跨产品 UI/交互实践\n\n| 能力 | 闪卡来源入口 | 消费者工程 | 新基础当前覆盖 |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\n` +
  `每一行的消费者文件与证据在 JSON 中逐项列出。主要当前说明：${uiEvidence.map(link).join('、')}。同类适配不表示字节相同或所有行为等价；确认行为归各产品，资源复用和视觉约定也不等于公共运行时库。\n\n` +
  `## 工程治理也是复用内容\n\n| 规范 | 来源 | 已采用入口 |\n| --- | --- | --- |\n` +
  governance.map(item => `| ${item.title} | ${item.sources.map(link).join('、')} | ${item.consumers.map(link).join('、')} |`).join('\n') + '\n\n' +
  `## 历史、机制和间接借鉴\n\n| 内容 | 实际证据 | 边界 |\n| --- | --- | --- |\n` +
  referenceOnly.map(item => `| ${item.title} | ${item.consumers.map(link).join('、')} | ${item.note} |`).join('\n') + '\n\n' +
  `## 来源清单实际核对\n\n` +
  `魔方清单 ${manifestRecords.filter(item => item.project === 'jidecube').length} 项，舒尔特 ${manifestRecords.filter(item => item.project === 'jideschulte').length} 项，空间训练 ${manifestRecords.filter(item => item.project === 'jide-spatial').length} 项，共 ${manifestRecords.length} 条迁入记录；同一源文件被多个产品使用分别计数，不能当作唯一能力数。\n\n` +
  `当前来源相对历史记录变化或缺失 ${sourceDrift} 项，其中 ${lineEndingOnly} 项与已迁入文件在规范化行尾后文本相同；不能把行尾字节差异当作行为变更。目标内容相对记录来源不同或缺失 ${targetDifference} 项，空间训练主按钮和颜色表有已记录的适配。差异本身不表示错误，也不能在不读改造说明时当作字节相同。逐项状态与原改造说明见 JSON。\n\n` +
  `## 闪卡内部公共区：完整文件索引\n\n` +
  `当前 \`components/common\` 有 ${internalComponents.length} 个 .ets/.ts 文件。这里包含真正的基础 UI 和笔记/标签/旗标等业务组件，不能把“位于 common”视为已在其他产品复用或可以整包复制。下列索引覆盖该目录，目录之外的工具/模型则沿上表和当前领域文档查找。\n\n` +
  internalComponents.map(file => `- ${link(file)}`).join('\n') + '\n\n' +
  `## 其余可指引领域与接续顺序\n\n` +
  `菜单树/长按划选、目录选择、富文本/媒体、音频焦点、应用内助手、桌面卡片等已有闪卡内部复用和明确边界；本次没有把它们伪称为已经跨产品接通。继续查 ${link('jidecards/docs/development/ownership.md')}、${link('jidecards/docs/development/extension-points.md')} 和 ${link('jidecards/entry/src/main/ets/components/common/README.md')}，按 [跨产品接入规范](跨产品接入规范.md) 抽取规则。\n\n` +
  `优先补齐已在多个产品出现、但新基础还缺失的图标/按钮、设置/表单、帮助、标题与确认、转场/描边/色层和展开显露；现有业务能力保持原所有者。JideCalc、养个棋等本轮未找到明确闪卡来源标记，不能据此认定不存在未记录复用。\n\n` +
  `盘点命令只检查文件、来源记录和契约边界；各次实际产品行为/构建结果见 [公共 HAR 接入](公共HAR接入.md)，不能用该命令或首批测试证明整个清单已经通过行为和设备验收。\n`;
writeFileSync(path.join(root, 'docs/复用全景.md'), document);
console.log(`Audited ${capabilities.length} capability groups, ${governance.length} governance groups, ${internalComponents.length} common files, ${manifestRecords.length} migration records, ${snapshots.size} evidence files.`);
