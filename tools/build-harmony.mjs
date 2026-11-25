// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageInputs, sourceClosure } from './package-inputs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const studio = process.env.DEVECO_STUDIO_HOME || (process.platform === 'darwin' ? '/Applications/DevEco-Studio.app/Contents' : 'C:/Program Files/Huawei/DevEco Studio');
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}
const inputs = packageInputs(root);
const sourceHashes = Object.fromEntries(inputs.map(file => [file,
  createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]));
mkdirSync(path.join(root, '.local'), { recursive: true });
// hvigor 不接受中文工程路径；只在独立的 ASCII 临时工程中编译副本。
const fixture = mkdtempSync(path.join(tmpdir(), 'jide-foundation-smoke-'));
function save(name, content) {
  const target = path.join(fixture, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
const exampleInputs = sourceClosure(root, ['src/harmony/ActionButton.ets', 'src/harmony/StateView.ets',
  'src/harmony/DialogSurface.ets', 'src/harmony/SystemTheme.ets', 'src/harmony/SystemHaptics.ets', 'src/core/CalendarDay.ts']);
for (const name of exampleInputs) {
  const destination = path.join(fixture, 'entry/src/main/ets/foundation', name.slice(4));
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(path.join(root, name), destination);
}
for (const name of inputs) {
  const destination = path.join(fixture, 'shared', name);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(path.join(root, name), destination);
}
save('hvigorfile.ts', `import { appTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: appTasks, plugins: [] };`);
save('entry/hvigorfile.ts', `import { hapTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: hapTasks, plugins: [] };`);
save('hvigor/hvigor-config.json5', JSON.stringify({ modelVersion: '5.0.0', dependencies: {}, execution: { daemon: false } }));
save('oh-package.json5', JSON.stringify({ modelVersion: '5.0.0', name: 'jide-foundation-smoke', version: '0.1.0', dependencies: {} }));
save('entry/oh-package.json5', JSON.stringify({ name: 'entry', version: '0.1.0', dependencies: { 'jide_foundation': 'file:../shared' } }));
save('build-profile.json5', JSON.stringify({ app: { products: [{ name: 'default', compatibleSdkVersion: '6.0.1(21)',
  targetSdkVersion: '6.1.0(23)', runtimeOS: 'HarmonyOS' }], buildModeSet: [{ name: 'debug' }] },
  modules: [{ name: 'entry', srcPath: './entry', targets: [{ name: 'default', applyToProducts: ['default'] }] },
    { name: 'jide_foundation', srcPath: './shared' }] }));
save('entry/build-profile.json5', JSON.stringify({ apiType: 'stageMode', targets: [{ name: 'default' }] }));
save('AppScope/app.json5', JSON.stringify({ app: { bundleName: 'com.jide.foundation.smoke', vendor: 'jide',
  versionCode: 1, versionName: '0.1.0', icon: '$media:app_icon', label: '$string:app_name' } }));
save('AppScope/resources/base/element/string.json', JSON.stringify({ string: [{ name: 'app_name', value: '记得基础编译检查' }] }));
save('AppScope/resources/base/media/app_icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="#2F5FD0"/></svg>`);
save('entry/src/main/resources/base/profile/main_pages.json', JSON.stringify({ src: ['pages/OliveOilShowcase', 'pages/VisualShowcase', 'pages/GlassShowcase', 'pages/GlassFusionLab', 'pages/Index'] }));
save('entry/src/main/module.json5', JSON.stringify({ module: { name: 'entry', type: 'entry', mainElement: 'EntryAbility',
  deviceTypes: ['phone', 'tablet'], deliveryWithInstall: true, installationFree: false, pages: '$profile:main_pages',
  requestPermissions: [{ name: 'ohos.permission.VIBRATE' }], abilities: [{ name: 'EntryAbility',
  srcEntry: './ets/entryability/EntryAbility.ets', icon: '$media:app_icon', label: '$string:app_name',
  startWindowIcon: '$media:app_icon', startWindowBackground: '$color:start_window_background', exported: false }] } }));
save('entry/src/main/resources/base/element/color.json', JSON.stringify({ color: [{ name: 'start_window_background', value: '#F5F7FA' }] }));
save('entry/src/main/ets/entryability/EntryAbility.ets', `import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
export default class EntryAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void { stage.loadContent('pages/OliveOilShowcase').catch((): void => {}); }
}`);
save('entry/src/main/ets/pages/Index.ets', `import { ActionButton } from '../foundation/harmony/ActionButton';
import { SharedActionIcon, SharedIconButton, SharedDisclosureChevron, SharedPressFeedback } from 'jide_foundation';
import { StateView } from '../foundation/harmony/StateView';
import { DialogSurface } from '../foundation/harmony/DialogSurface';
import { readSystemDarkMode } from '../foundation/harmony/SystemTheme';
import { SystemHapticBackend } from '../foundation/harmony/SystemHaptics';
import { playHaptic } from '../foundation/core/Haptics';
import { localDayKey, addCalendarDays, calendarDayDistance } from '../foundation/core/CalendarDay';
import { resolveDarkMode } from '../foundation/core/Theme';
@Entry
@Component
struct Index {
  @State dark: boolean = false;
  @State opened: boolean = false;
  @State status: string = localDayKey(new Date());
  build() {
    Stack() {
      Column({ space: 12 }) {
        SharedActionIcon({ source: $r('app.media.app_icon'), strokeColor: '#2F5FD0' })
        SharedDisclosureChevron({ tint: '#2F5FD0' }).attributeModifier(new SharedPressFeedback())
        SharedIconButton({ label: '示例动作', surfaceColor: '#FFFFFF', frameLineColor: '#CCCCCC',
          onAction: (): void => { this.status = '图标动作'; } }) {
          SharedDisclosureChevron({ tint: '#2F5FD0' })
        }
        ActionButton({ label: '打开设置', isDark: this.dark, onAction: (): void => { this.opened = true; } })
        ActionButton({ label: '跟随系统', onAction: (): void => {
          try { this.dark = resolveDarkMode('auto', readSystemDarkMode()); }
          catch { this.status = '系统主题读取失败'; }
        } })
        ActionButton({ label: '触感', onAction: (): void => {
          playHaptic('correct', new SystemHapticBackend(), true).catch((): void => { this.status = '设备不可用'; });
        } })
        StateView({ title: this.status, description: addCalendarDays('2026-10-15', calendarDayDistance('2026-10-15', '2026-10-16')),
          actionLabel: '重试', onAction: (): void => { this.status = '重试'; }, isDark: this.dark })
      }
      if (this.opened) {
        DialogSurface({ title: '设置', closeLabel: '关闭', isDark: this.dark,
          viewport: { width: 360, height: 720, safeTop: 24, safeBottom: 24, safeLeft: 0, safeRight: 0, keyboardTop: 0 },
          onRequestClose: (): void => { this.opened = false; } }) {
          StateView({ title: '内容', isDark: this.dark })
        }
      }
    }.width('100%').height('100%')
  }
}`);
save('entry/src/main/ets/pages/OliveOilShowcase.ets', readFileSync(path.join(root, 'examples/OliveOilShowcase.ets'), 'utf8'));
save('entry/src/main/ets/pages/VisualShowcase.ets', readFileSync(path.join(root, 'examples/VisualShowcase.ets'), 'utf8'));
save('entry/src/main/ets/pages/GlassShowcase.ets', readFileSync(path.join(root, 'examples/GlassShowcase.ets'), 'utf8'));
save('entry/src/main/ets/pages/GlassFusionLab.ets', readFileSync(path.join(root, 'examples/GlassFusionLab.ets'), 'utf8'));
const java = process.env.JAVA_HOME || path.join(studio, process.platform === 'darwin' ? 'jbr/Contents/Home' : 'jbr');
const env = { ...process.env, JAVA_HOME: java, DEVECO_SDK_HOME: path.join(studio, 'sdk'),
  PATH: path.join(java, 'bin') + path.delimiter + process.env.PATH };
const install = spawnSync(process.execPath, [path.join(studio, 'tools/ohpm/bin/pm-cli.js'), 'install'],
  { cwd: fixture, stdio: 'inherit', env });
if (install.error || install.status !== 0) {
  throw install.error || new Error(`ohpm install failed: ${install.status}`);
}
const result = spawnSync('devecocli', ['build', '--modules', 'entry'], {
  cwd: fixture, stdio: 'inherit', env
});
if (result.error) console.error(result.error.message);
const hap = path.join(fixture, 'entry/build/default/outputs/default/entry-default-unsigned.hap');
if (result.status !== 0) process.exit(result.status || 1);
const harBuild = spawnSync(process.execPath, [path.join(studio, 'tools/hvigor/bin/hvigorw.js'),
  'assembleHar', '--mode', 'module', '-p', 'product=default', '-p', 'module=jide_foundation@default', '--no-daemon'],
  { cwd: fixture, stdio: 'inherit', env });
if (harBuild.error || harBuild.status !== 0) throw harBuild.error || new Error('HAR build failed');
const harCandidates = sourceFiles(path.join(fixture, 'shared/build')).filter(file => file.endsWith('.har'));
if (harCandidates.length !== 1) throw new Error('Expected one built HAR');
const artifact = path.join(root, '.local/packages/jide_foundation.har');
mkdirSync(path.dirname(artifact), { recursive: true });
cpSync(harCandidates[0], artifact);
const artifactHash = createHash('sha256').update(readFileSync(artifact)).digest('hex');
const changed = inputs.filter(file => createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') !== sourceHashes[file]);
if (changed.length) throw new Error('Library sources changed during build: ' + changed.join(', '));
writeFileSync(path.join(root, '.local/packages/report.json'), JSON.stringify({
  builtAt: new Date().toISOString(), artifact, sha256: artifactHash, sourceHashes
}, null, 2));
const report = { builtAt: new Date().toISOString(), fixture, status: result.status,
  unsignedHap: result.status === 0 ? hap : null,
  sha256: result.status === 0 ? createHash('sha256').update(readFileSync(hap)).digest('hex') : null,
  sharedHar: artifact, sharedHarSha256: artifactHash,
  scope: 'Unsigned compilation fixture and shared HAR. Not installed; not a device or visual test.' };
writeFileSync(path.join(root, '.local/harmony-build.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = result.status ?? 1;
