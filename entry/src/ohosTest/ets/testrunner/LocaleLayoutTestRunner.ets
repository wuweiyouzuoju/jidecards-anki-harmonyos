// SPDX-License-Identifier: AGPL-3.0-or-later
import { abilityDelegatorRegistry, TestRunner } from '@kit.TestKit';
import { i18n } from '@kit.LocalizationKit';
import { util } from '@kit.ArkTS';
import { common } from '@kit.AbilityKit';
import { APP_LOCALES, resolveAppLocale } from '../../../main/ets/model/AppLocales';
import { localeDate, localeNumber, localePercent } from '../../../main/ets/utils/LocaleFormatting';
import { UTF8解码 } from '../../../main/ets/proto/core/utf8';
import { DECK_LIST_STYLE_KEY, DECK_LIST_NARROW_KEY, DECK_WIDTH_HINT_HANDLED_KEY,
  DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY } from '../../../main/ets/model/DeckListAppearance';

interface LocaleProbe { key: string; value: string; }
function check(value: boolean, message: string): void { if (!value) throw new Error(message); }
function settle(): Promise<void> { return new Promise<void>((done): void => { setTimeout(done, 350); }); }

/** 主应用的实际资源和首页截图；不创建笔记或发布提醒。 */
export default class LocaleLayoutTestRunner implements TestRunner {
  onPrepare(): void {}
  async onRun(): Promise<void> {
    const delegator = abilityDelegatorRegistry.getAbilityDelegator();
    const context = delegator.getAppContext();
    const application = context.getApplicationContext();
    const args = abilityDelegatorRegistry.getArguments().parameters;
    const locale: string = args['-s locale'] ?? '';
    const scale: number = Number(args['-s scale']);
    const scene: string = args['-s scene'] ?? 'home';
    const originalLanguage: string = i18n.System.getAppPreferredLanguage();
    const originalContext = AppStorage.get<common.UIAbilityContext>('abilityContext');
    let originalScale: number = 1;
    let failed: string = '';
    let originalStyle: string = '';
    let originalNarrow: boolean = false;
    let originalWidthHint: boolean = false;
    let originalDoubleHint: boolean = false;
    const monitor: abilityDelegatorRegistry.AbilityMonitor = { abilityName: 'EntryAbility' };
    try {
      check(APP_LOCALES.some((option): boolean => option.locale === locale), 'unsupported locale');
      check(scale >= 1 && scale <= 3.2, 'invalid font scale');
      check(scene === 'home' || scene === 'layout_suggestion' || scene === 'double_columns', 'invalid UI scene');
      await delegator.addAbilityMonitor(monitor);
      await delegator.startAbility({ bundleName: 'com.jide.kapian', moduleName: 'entry', abilityName: 'EntryAbility' });
      const ability = await delegator.waitAbilityMonitor(monitor, 10000);
      await settle();
      if (scene !== 'home') {
        originalStyle = AppStorage.get<string>(DECK_LIST_STYLE_KEY) ?? 'single_wide';
        originalNarrow = AppStorage.get<boolean>(DECK_LIST_NARROW_KEY) ?? false;
        originalWidthHint = AppStorage.get<boolean>(DECK_WIDTH_HINT_HANDLED_KEY) ?? false;
        originalDoubleHint = AppStorage.get<boolean>(DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY) ?? false;
        // 仅临时改变当前进程布局，不写偏好，不点击确认；结束后恢复。
        AppStorage.setOrCreate(DECK_WIDTH_HINT_HANDLED_KEY, scene === 'double_columns');
        AppStorage.setOrCreate(DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY, scene === 'double_columns');
        AppStorage.setOrCreate(DECK_LIST_STYLE_KEY, scene === 'double_columns' ? 'single_wide' : 'double_wide');
        await settle();
        AppStorage.setOrCreate(DECK_LIST_NARROW_KEY, false);
        AppStorage.setOrCreate(DECK_LIST_STYLE_KEY, scene === 'double_columns' ? 'double_wide' : 'single_wide');
        await settle();
      }
      originalScale = ability.context.config.fontSizeScale ?? 1;
      i18n.System.setAppPreferredLanguage(locale);
      application.setFontSizeScale(scale);
      AppStorage.setOrCreate('abilityContext', ability.context);
      AppStorage.setOrCreate<string>('系统语言', resolveAppLocale(locale));
      AppStorage.setOrCreate<boolean>('appForeground', true);
      const probes: LocaleProbe[] = JSON.parse(UTF8解码(new util.Base64Helper().decodeSync(args['-s probes'] ?? ''))) as LocaleProbe[];
      check(probes.length >= 5, 'missing resource probes');
      for (const probe of probes) {
        const actual: string = ability.context.resourceManager.getStringByNameSync(probe.key);
        check(actual === probe.value, `${locale}/${probe.key}: resource selection differs`);
      }
      await settle();
      // UiTest 初始化必须晚于 AbilityDelegator，不能在加载测试运行器时导入。
      const uiChecks = await import('./LocaleLayoutUiChecks');
      const id: string = `${locale}-font${scale}-${scene}`;
      const path: string = `${ability.context.cacheDir}/jide-locale-${id}.png`;
      await uiChecks.checkLocaleLayout(ability.context.resourceManager.getStringByNameSync(
        scene === 'layout_suggestion' ? 'deck_width_hint_title' : 'today_progress'), path, scene !== 'layout_suggestion', scene === 'double_columns');
      await delegator.print(`LOCALE_LAYOUT_PASS:${id}:${path}`);
      await delegator.print('LOCALE_FORMAT:' + JSON.stringify({ locale: locale, number: localeNumber(12345.6, locale, 1),
        percentage: localePercent(0.876, locale, 1), date: localeDate(1792368000000, locale, false) }));
    } catch (error) {
      failed = (error as Error).message;
    } finally {
      try {
        if (originalStyle !== '') {
          AppStorage.setOrCreate(DECK_WIDTH_HINT_HANDLED_KEY, originalWidthHint);
          AppStorage.setOrCreate(DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY, originalDoubleHint);
          AppStorage.setOrCreate(DECK_LIST_NARROW_KEY, originalNarrow);
          AppStorage.setOrCreate(DECK_LIST_STYLE_KEY, originalStyle);
        }
        await delegator.removeAbilityMonitor(monitor);
        i18n.System.setAppPreferredLanguage(originalLanguage);
        application.setFontSizeScale(originalScale);
        AppStorage.setOrCreate<string>('系统语言', resolveAppLocale(originalLanguage));
        if (originalContext !== undefined) AppStorage.setOrCreate('abilityContext', originalContext);
      } catch (error) { failed += '; restore: ' + (error as Error).message; }
    }
    try {
      if (failed !== '') {
        await delegator.print('LOCALE_LAYOUT_FAIL:' + failed);
        await delegator.finishTest('LOCALE_LAYOUT_FAIL', -1);
      } else {
        await delegator.finishTest('LOCALE_LAYOUT_PASS', 0);
      }
    } catch (error) { console.error('LOCALE_LAYOUT_FAIL: runner reporting failed: ' + (error as Error).message); }
  }
}
