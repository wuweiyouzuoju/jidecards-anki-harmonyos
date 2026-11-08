import { RectShape } from '@kit.ArkUI';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './common/DialogFrame';
import { DialogHeader } from './common/DialogHeader';
import { AppearanceReveal } from './common/AppearanceReveal';
import { ActionStatus } from './common/ActionStatus';
import { PrimaryActionButton } from './common/PrimaryActionButton';
import { 按下态按钮 } from './common/按下态按钮';
import { AboutSettings } from './settings/AboutSettings';
import { INTRO_ABOUT_ITEMS } from '../model/SettingsStructure';
import { 应用尺寸 } from '../utils/应用尺寸';
import { PressFeedback } from '../utils/PressFeedback';
import { SurfaceTransition } from '../utils/SurfaceTransition';
import { currentMotionProfile, motionAnimation } from '../utils/AppMotion';
import { prefersReducedMotion } from '../utils/ReducedMotion';
import { GLASS_HOME_SOURCE } from '../utils/GlassBackdrop';
import { completeGlassSuggestion } from '../utils/SurfaceMaterialStore';
import { 保存简洁模式 } from '../model/简洁模式存储';
import { 颜色键 } from '../model/颜色主题';
import { HomeIntroPage, HomeIntroBlock, HomeIntroAction, HOME_INTRO_PAGES, HOME_INTRO_ACTIONS,
  homeIntroPageIndex, homeIntroActionVisible, homeIntroTarget } from '../model/HomeIntro';
import { AppInterfaceControl } from '../model/AppInterface';
import { appInterface } from '../backend/AppInterfaceService';
import { namedResourceText, resourceText, showToastSafely } from '../utils/UiFeedback';

/** 一屏一个问题；答案紧随正文，外壳按内容收缩，长文字仍可滚动。 */
@Component
export struct HomeIntroPanel {
  @Prop isDark: boolean = false;
  onFinish: () => void = (): void => {};
  onOpenLicenses: () => void = (): void => {};
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private primaryColor: string = '#2F5FD0';
  @State @Watch('onPageChanged') private pageIndex: number = 0;
  @State private framePrepared: boolean = false;
  @State private savingMode: boolean = false;
  @State private answeredExperience: boolean = false;
  @State private experienced: boolean = false;
  @State private pageForward: boolean = true;
  @State private pendingAnswer: string = '';
  private isActive: boolean = false;

  aboutToAppear(): void { this.isActive = true; this.publishInterface(); }
  aboutToDisappear(): void { this.isActive = false; appInterface.leave('intro'); }
  private currentPage(): HomeIntroPage { return HOME_INTRO_PAGES[homeIntroPageIndex(this.pageIndex)]; }
  private text(key: string, _locale: string = this.uiLanguage): string { return namedResourceText(this.getUIContext(), key); }
  private onPageChanged(): void { this.publishInterface(); }
  private movePage(index: number): void {
    const target: number = homeIntroPageIndex(index);
    this.pageForward = target >= this.pageIndex;
    this.pageIndex = target;
  }
  private readyToAdvance(): boolean {
    return this.pageIndex > 1 || this.answeredExperience;
  }
  private selectAction(id: string): void {
    if (!this.isActive || this.savingMode || !homeIntroActionVisible(id, this.pageIndex, this.experienced, this.readyToAdvance())) return;
    if (id === 'used_anki' || id === 'new_anki') this.chooseExperience(id === 'used_anki');
    else if (id === 'glass' || id === 'keep_material') this.chooseMaterial(id === 'glass');
    else if (id === 'finish') this.onFinish();
    else if (id === 'previous') this.movePage(homeIntroTarget(this.pageIndex, false, this.experienced));
    else if (id === 'next') this.movePage(homeIntroTarget(this.pageIndex, true, this.experienced));
  }
  private async chooseExperience(usedAnki: boolean): Promise<void> {
    this.pendingAnswer = usedAnki ? 'used_anki' : 'new_anki';
    this.savingMode = true; this.publishInterface();
    try {
      await 保存简洁模式(!usedAnki);
      if (!this.isActive) return;
      this.experienced = usedAnki;
      this.answeredExperience = true;
      this.movePage(homeIntroTarget(this.pageIndex, true, usedAnki));
    } catch {
      if (this.isActive) showToastSafely(this.getUIContext(), { message: $r('app.string.home_intro_mode_failed') });
    } finally { this.savingMode = false; this.pendingAnswer = ''; this.publishInterface(); }
  }
  private async chooseMaterial(useGlass: boolean): Promise<void> {
    this.pendingAnswer = useGlass ? 'glass' : 'keep_material';
    this.savingMode = true; this.publishInterface();
    try {
      // 与老用户的一次推荐共用回复记录，完成后不会再弹独立推荐。
      await completeGlassSuggestion(useGlass);
      if (this.isActive) this.movePage(1);
    } catch {
      if (this.isActive) showToastSafely(this.getUIContext(), { message: $r('app.string.surface_material_save_failed') });
    } finally { this.savingMode = false; this.pendingAnswer = ''; this.publishInterface(); }
  }
  private publishInterface(): void {
    if (!this.isActive) return;
    const page: HomeIntroPage = this.currentPage();
    const controls: AppInterfaceControl[] = HOME_INTRO_ACTIONS.filter((action: HomeIntroAction): boolean =>
      homeIntroActionVisible(action.id, this.pageIndex, this.experienced, true)).map((action: HomeIntroAction): AppInterfaceControl =>
      ({ id: action.id, titleKey: action.titleKey, title: this.text(action.titleKey), enabled: !this.savingMode && (action.id !== 'next' || this.readyToAdvance()),
        selected: this.choiceSelected(action.id) }));
    if (page.id === 'community') {
      INTRO_ABOUT_ITEMS.forEach(item => {
        controls.push({ id: item.id, titleKey: item.titleKey, title: this.text(item.titleKey),
          enabled: true, selected: false });
      });
    }
    appInterface.observe({ surface: 'intro', sectionId: page.id, selectedId: page.id, busy: this.savingMode,
      items: controls, controlsComplete: true, optionIds: [], optionLabels: [], values: [
        { id: 'page', value: String(this.pageIndex + 1) }, { id: 'page_count', value: String(HOME_INTRO_PAGES.length) },
        { id: 'page_title', value: this.text(page.titleKey) },
        { id: 'anki_experience', value: this.answeredExperience ? String(this.experienced) : 'unanswered' } ] });
  }

  private choiceSelected(id: string): boolean {
    return this.pendingAnswer === id ||
      (this.answeredExperience && id === (this.experienced ? 'used_anki' : 'new_anki'));
  }
  @Builder
  private choice(id: string, titleKey: string, hintKey: string, icon: Resource) {
    Button({ type: ButtonType.Normal }) {
      Row({ space: 16 }) {
        Image(icon).width(28).height(28).flexShrink(0)
        Column({ space: 6 }) {
          Text(this.text(titleKey)).fontSize(18).fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary')).width('100%')
          Text(this.text(hintKey)).fontSize(14).lineHeight(21)
            .fontColor($r('app.color.text_secondary')).width('100%')
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        if (this.pendingAnswer === id) { ActionStatus({ phase: 'busy', tint: this.primaryColor }) }
      }.width('100%').padding(18)
    }.width('100%').height('auto')
      .backgroundColor($r('app.color.surface_page'))
      .border({ width: this.choiceSelected(id) ? 2 : 0, color: this.primaryColor }).borderRadius(20)
      .enabled(!this.savingMode).attributeModifier(new PressFeedback()).stateEffect(false)
      .clipShape(new RectShape({ width: '100%', height: '100%' }).radius(20))
      .onClick((): void => { this.selectAction(id); })
  }
  @Builder
  private pageBody(page: HomeIntroPage) {
    Column({ space: 20 }) {
      if (page.id === 'appearance') {
        AppearanceReveal({ ready: this.framePrepared, label: $r('app.string.surface_material_glass'), colors: ['#8893A3', '#8893A3', '#8893A3'] })
      }
      if (page.id !== 'community') {
      Column({ space: 10 }) {
        Text(this.text(page.blocks[0].titleKey)).fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary')).width('100%')
        Text(this.text(page.blocks[0].bodyKey)).fontSize(应用尺寸.字号_正文).lineHeight(23)
          .fontColor($r('app.color.text_secondary')).width('100%')
      }.alignItems(HorizontalAlign.Start).width('100%')
      }
      if (page.id === 'experience') {
        this.choice('new_anki', 'intro_answer_new', 'intro_answer_new_hint', $r('app.media.ic_intro_mode_simple'))
        this.choice('used_anki', 'intro_answer_used', 'intro_answer_used_hint', $r('app.media.ic_intro_mode_experimental'))
      } else if (page.id === 'community') {
        Text($r('app.string.home_intro_about_revisit')).fontSize(14).lineHeight(21)
          .fontColor($r('app.color.text_secondary')).width('100%')
        AboutSettings({ 是否深色: this.isDark, centerCommunity: true, 打开许可证回调: this.onOpenLicenses })
      }



    }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: 8, bottom: 8 })
  }
  @Builder
  private headerContent() {
    DialogHeader({ title: this.currentPage().id === 'community' ? $r('app.string.settings_about') : $r('app.string.app_name'), showDivider: false,
      showClose: this.pageIndex > 0, closeEnabled: !this.savingMode,
      closeIcon: $r('app.media.ic_common_arrow_left'), closeLabel: $r('app.string.home_intro_previous'),
      onClose: (): void => { this.selectAction('previous'); },
      showAction: this.pageIndex > 0,
      actionEnabled: !this.savingMode && this.readyToAdvance(),
      actionIcon: this.currentPage().id === 'community' ? '' : $r('app.media.ic_common_arrow_right'),
      actionLabel: this.currentPage().id === 'community' ? $r('app.string.done') : $r('app.string.home_intro_next'),
      onAction: (): void => { this.selectAction(this.currentPage().id === 'community' ? 'finish' : 'next'); } })
      .visibility(this.pageIndex === 0 ? Visibility.Hidden : Visibility.Visible)
  }
  @Builder
  private bodyContent() {
    Column() {
      ForEach([this.currentPage()], (page: HomeIntroPage) => {
        Column() { this.pageBody(page) }.width('100%')
          .transition(SurfaceTransition.pageContent(this.pageForward, !prefersReducedMotion(this.getUIContext())))
      }, (page: HomeIntroPage): string => page.id)
    }.width('100%')
  }
  @Builder
  private appearanceFooter() {
    Column({ space: 8 }) {
        PrimaryActionButton({ label: $r('app.string.glass_suggestion_confirm'), isInteractive: !this.savingMode,
          feedback: this.pendingAnswer === 'glass' ? 'busy' : '', onAction: (): void => { this.selectAction('glass'); } })
        按下态按钮({ 文案: $r('app.string.intro_keep_appearance'), compact: true, fillWidth: true,
          字号: 应用尺寸.字号_正文, 字色: $r('app.color.text_secondary'),
          feedback: this.pendingAnswer === 'keep_material' ? 'busy' : '', 是否启用: !this.savingMode,
          点击回调: (): void => { this.selectAction('keep_material'); } })
    }.width('100%')
  }

  build() {
    DialogFrame({ maximumWidth: 480, fixedHeight: 600, refractionSource: GLASS_HOME_SOURCE,
      onPrepared: (): void => { this.framePrepared = true; }, showPreparation: true, fillBody: false, canDismiss: false, showFooter: this.pageIndex === 0,
      header: () => { this.headerContent(); }, content: () => { this.bodyContent(); }, footer: () => { this.appearanceFooter(); } })
  }
}
