// SPDX-License-Identifier: AGPL-3.0-or-later
import { 配置服务 } from './配置服务';
import { ConfigKeyBool } from '../proto/messages/ConfigMessages';
import { BrowserPreferences, BrowserPreferencePatch, parseBrowserPreferences, updateBrowserPreferences } from '../model/BrowserPreferences';
interface BrowserConfig { jideBrowserPreferences?: object; }
let preferenceTail: Promise<void> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result: Promise<T> = preferenceTail.then(operation, operation);
  preferenceTail = result.then((): void => {}, (): void => {});
  return result;
}
async function read(): Promise<BrowserPreferences> {
  const config: 配置服务 = new 配置服务();
  const values: BrowserConfig = JSON.parse(await config.获取全部配置()) as BrowserConfig;
  return parseBrowserPreferences(values.jideBrowserPreferences === undefined ? '' : JSON.stringify(values.jideBrowserPreferences),
    await config.获取配置布尔(ConfigKeyBool.BROWSER_TABLE_SHOW_NOTES_MODE));
}
/** 手动和 JIDE 共用读改写队列，不以旧页面完整快照覆盖另一方的修改。 */
export function loadBrowserPreferences(): Promise<BrowserPreferences> { return enqueue(read); }
export function saveBrowserPreferences(patch: BrowserPreferencePatch, expected?: string): Promise<BrowserPreferences> {
  return enqueue(async (): Promise<BrowserPreferences> => {
    const before: BrowserPreferences = await read();
    if (expected !== undefined && JSON.stringify(before) !== expected) throw new Error('Browser preferences changed');
    const after: BrowserPreferences = updateBrowserPreferences(before, patch);
    await new 配置服务().设置配置JSON({ key: 'jideBrowserPreferences', valueJson: JSON.stringify(after), undoable: false });
    const actual: BrowserPreferences = await read();
    if (JSON.stringify(actual) !== JSON.stringify(after)) throw new Error('Browser preferences save not confirmed');
    AppStorage.setOrCreate<number>('browserPreferencesChangedTick', Date.now());
    return actual;
  });
}
export function loadBrowserIgnoreAccents(): Promise<boolean> {
  return enqueue((): Promise<boolean> => new 配置服务().获取配置布尔(ConfigKeyBool.IGNORE_ACCENTS_IN_SEARCH));
}
export function saveBrowserIgnoreAccents(value: boolean): Promise<void> {
  return enqueue(async (): Promise<void> => {
    const config: 配置服务 = new 配置服务();
    await config.设置配置布尔({ key: ConfigKeyBool.IGNORE_ACCENTS_IN_SEARCH, value: value, undoable: false });
    if (await config.获取配置布尔(ConfigKeyBool.IGNORE_ACCENTS_IN_SEARCH) !== value) throw new Error('Search option save not confirmed');
  });
}
