// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceClosure } from './package-inputs.mjs';

// 等级示例独立编译；不变更公共 HAR 的 Index 导出或任何现有产品。
const root = fileURLToPath(new URL('../', import.meta.url));
const studio = process.env.DEVECO_STUDIO_HOME || 'C:/Program Files/Huawei/DevEco Studio';
const fixture = mkdtempSync(path.join(tmpdir(), 'jide-levels-'));
const inputs = sourceClosure(root, ['examples/LevelShowcase.ets']);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceHashes = Object.fromEntries(inputs.map(name => [name, hash(path.join(root, name))]));
function save(name, value) {
  const file = path.join(fixture, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}
for (const name of inputs) {
  const file = path.join(fixture, 'entry/src/main/ets', name);
  mkdirSync(path.dirname(file), { recursive: true });
  cpSync(path.join(root, name), file);
}
save('hvigorfile.ts', "import { appTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: appTasks, plugins: [] };");
save('entry/hvigorfile.ts', "import { hapTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: hapTasks, plugins: [] };");
save('hvigor/hvigor-config.json5', { modelVersion: '5.0.0', dependencies: {}, execution: { daemon: false } });
save('oh-package.json5', { modelVersion: '5.0.0', name: 'jide-levels-demo', version: '1.0.0', dependencies: {} });
save('entry/oh-package.json5', { name: 'entry', version: '1.0.0', dependencies: {} });
save('build-profile.json5', { app: { products: [{ name: 'default', compatibleSdkVersion: '6.0.1(21)',
  targetSdkVersion: '6.1.0(23)', runtimeOS: 'HarmonyOS' }], buildModeSet: [{ name: 'debug' }] },
  modules: [{ name: 'entry', srcPath: './entry', targets: [{ name: 'default', applyToProducts: ['default'] }] }] });
save('entry/build-profile.json5', { apiType: 'stageMode', targets: [{ name: 'default' }] });
save('AppScope/app.json5', { app: { bundleName: 'com.jide.levels.demo', vendor: 'jide', versionCode: 1,
  versionName: '1.0.0', icon: '$media:app_icon', label: '$string:app_name' } });
save('AppScope/resources/base/element/string.json', { string: [{ name: 'app_name', value: '记得等级示例' }] });
save('AppScope/resources/base/media/app_icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="#2F5FD0"/></svg>');
save('entry/src/main/resources/base/profile/main_pages.json', { src: ['examples/LevelShowcase'] });
save('entry/src/main/resources/base/element/color.json', { color: [{ name: 'start_window_background', value: '#F5F7FA' }] });
save('entry/src/main/module.json5', { module: { name: 'entry', type: 'entry', mainElement: 'EntryAbility',
  deviceTypes: ['phone', 'tablet'], deliveryWithInstall: true, installationFree: false, pages: '$profile:main_pages',
  abilities: [{ name: 'EntryAbility', srcEntry: './ets/EntryAbility.ets', icon: '$media:app_icon',
    label: '$string:app_name', startWindowIcon: '$media:app_icon', startWindowBackground: '$color:start_window_background',
    exported: false }] } });
save('entry/src/main/ets/EntryAbility.ets', `import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
export default class EntryAbility extends UIAbility {
  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('examples/LevelShowcase').catch((error: Error): void => { console.error(error.message); });
  }
}`);
const java = path.join(studio, 'jbr');
const env = { ...process.env, JAVA_HOME: java, DEVECO_SDK_HOME: path.join(studio, 'sdk'),
  PATH: path.join(java, 'bin') + path.delimiter + process.env.PATH };
const install = spawnSync(process.execPath, [path.join(studio, 'tools/ohpm/bin/pm-cli.js'), 'install'],
  { cwd: fixture, stdio: 'inherit', env });
if (install.error || install.status !== 0) throw install.error || new Error('ohpm install failed');
const build = spawnSync(process.execPath, [path.join(studio, 'tools/hvigor/bin/hvigorw.js'),
  'assembleHap', '--mode', 'module', '-p', 'product=default', '--no-daemon'],
  { cwd: fixture, stdio: 'inherit', env });
const changed = inputs.filter(name => hash(path.join(root, name)) !== sourceHashes[name]);
const hap = path.join(fixture, 'entry/build/default/outputs/default/entry-default-unsigned.hap');
const success = !build.error && build.status === 0 && changed.length === 0;
const report = { builtAt: new Date().toISOString(), fixture, status: success ? 0 : 1, changed,
  unsignedHap: success ? hap : null, sha256: success ? hash(hap) : null, sourceHashes,
  scope: 'Real LevelShowcase and dependency closure compiled. Unsigned, not installed; no device/visual acceptance.' };
mkdirSync(path.join(root, '.local'), { recursive: true });
writeFileSync(path.join(root, '.local/levels-build.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ fixture, status: report.status, unsignedHap: report.unsignedHap, changed }, null, 2));
if (build.error) console.error(build.error.message);
process.exitCode = report.status;
