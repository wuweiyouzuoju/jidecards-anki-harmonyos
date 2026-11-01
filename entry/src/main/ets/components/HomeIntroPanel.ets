import { RectShape } from '@kit.ArkUI';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './common/DialogFrame';
import { DialogHeader } from './common/DialogHeader';
import { AppearanceReveal } from './common/AppearanceReveal';
import { ActionStatus } from './common/ActionStatus';
import { PrimaryActionButton } from './common/PrimaryActionButton';
import { 按下态按钮 } from './common/按下态按钮';
import { PressFeedback } from '../utils/PressFeedback';
import { SurfaceTransition } from '../utils/SurfaceTransition';
import { currentMotionProfile, motionAnimation } from '../utils/AppMotion';
import { prefersReducedMotion } from '../utils/ReducedMotion';
import { GLASS_HOME_SOURCE } from '../utils/GlassBackdrop';
import { completeGlassSuggestion } from '../utils/SurfaceMaterialStore';
import { 保存简洁模式 } from '../model/简洁模式存储';
import { 颜色键 } from '../model/颜色主题';
import { HomeIntroPage, HomeIntroBlock, HomeIntroAction, HOME_INTRO_PAGES, HOME_INTRO_ACTIONS,
  homeIntroPageIndex, homeIntroActionVisible, homeIntroBlocks, homeIntroTarget } from '../model/HomeIntro';
import { AppInterfaceControl } from '../model/AppInterface';
import { appInterface } from '../backend/AppInterfaceService';
import { namedResourceText, resourceText, showToastSafely } from '../utils/UiFeedback';

/** 一屏一个问题；答案紧随正文，外壳按内容收缩，长文字仍可滚动。 */
@Component
export struct HomeIntroPanel {
  onClose: () => void = (): void => {};
  onStart: (action: string) => void = (_action: string): void => {};
  onDismiss: () => void = (): void => {};
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private primaryColor: string = '#2F5FD0';
  @State @Watch('onPageChanged') private pageIndex: number = 0;
  @State private savingMode: boolean = false;
  @State private experienced: boolean = false;
  @State private selectedStart: string = '';
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
  private selectAction(id: string): void {
    if (!this.isActive || this.savingMode || !homeIntroActionVisible(id, this.pageIndex, this.experienced)) return;
    if (id === 'used_anki' || id === 'new_anki') this.chooseExperience(id === 'used_anki');
    else if (id === 'start_import' || id === 'start_create' || id === 'start_sync') { this.selectedStart = id; this.movePage(homeIntroTarget(this.pageIndex, true, this.experienced)); }
    else if (id === 'glass' || id === 'keep_material') this.chooseMaterial(id === 'glass');
    else if (id === 'previous') this.movePage(homeIntroTarget(this.pageIndex, false, this.experienced));
    else if (id === 'next') this.movePage(homeIntroTarget(this.pageIndex, true, this.experienced));
    else if (id === 'finish') this.onClose();
    else if (id === 'later') this.onDismiss();
  }
  private async chooseExperience(usedAnki: boolean): Promise<void> {
    this.pendingAnswer = usedAnki ? 'used_anki' : 'new_anki';
    this.savingMode = true; this.publishInterface();
    try {
      await 保存简洁模式(!usedAnki);
      if (!this.isActive) return;
      this.experienced = usedAnki; this.movePage(1);
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
      if (this.isActive) this.onStart(this.selectedStart);
    } catch {
      if (this.isActive) showToastSafely(this.getUIContext(), { message: $r('app.string.surface_material_save_failed') });
    } finally { this.savingMode = false; this.pendingAnswer = ''; this.publishInterface(); }
  }
  private publishInterface(): void {
    if (!this.isActive) return;
    const page: HomeIntroPage = this.currentPage();
    const controls: AppInterfaceControl[] = HOME_INTRO_ACTIONS.filter((action: HomeIntroAction): boolean =>
      homeIntroActionVisible(action.id, this.pageIndex, this.experienced)).map((action: HomeIntroAction): AppInterfaceControl =>
      ({ id: action.id, titleKey: action.titleKey, title: this.text(action.titleKey), enabled: !this.savingMode,
        selected: this.pendingAnswer === action.id }));
    appInterface.observe({ surface: 'intro', sectionId: page.id, selectedId: page.id, busy: this.savingMode,
      items: controls, controlsComplete: true, optionIds: [], optionLabels: [], values: [
        { id: 'page', value: String(this.pageIndex + 1) }, { id: 'page_count', value: String(HOME_INTRO_PAGES.length) },
        { id: 'page_title', value: this.text(page.titleKey) },
        { id: 'anki_experience', value: this.pageIndex === 0 ? 'unanswered' : String(this.experienced) },
        { id: 'selected_start', value: this.selectedStart },
        { id: 'start_actions', value: this.pageIndex === 1 ? (this.experienced ? 'start_sync,start_import,start_create' : 'start_import,start_create') : '' } ] });
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
      .border({ width: this.pendingAnswer === id ? 2 : 0, color: this.primaryColor }).borderRadius(20)
      .enabled(!this.savingMode).attributeModifier(new PressFeedback()).stateEffect(false)
      .clipShape(new RectShape({ width: '100%', height: '100%' }).radius(20))
      .onClick((): void => { this.selectAction(id); })
  }
  @Builder
  private pageBody(page: HomeIntroPage) {
    Column({ space: 20 }) {
      if (page.id === 'appearance') {
        AppearanceReveal({ label: $r('app.string.surface_material_glass'), colors: ['#8893A3', '#8893A3', '#8893A3'] })
      }
      Column({ space: 10 }) {
        Text(this.text(homeIntroBlocks(this.pageIndex, this.selectedStart)[0].titleKey)).fontSize(28).fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary')).width('100%')
        Text(this.text(homeIntroBlocks(this.pageIndex, this.selectedStart)[0].bodyKey)).fontSize(15).lineHeight(23)
          .fontColor($r('app.color.text_secondary')).width('100%')
      }.alignItems(HorizontalAlign.Start).width('100%')
      if (page.id === 'experience') {
        this.choice('new_anki', 'intro_answer_new', 'intro_answer_new_hint', $r('app.media.ic_intro_mode_simple'))
        this.choice('used_anki', 'intro_answer_used', 'intro_answer_used_hint', $r('app.media.ic_intro_mode_experimental'))
      } else if (page.id === 'appearance') {
        PrimaryActionButton({ label: $r('app.string.glass_suggestion_confirm'), isInteractive: !this.savingMode,
          glassSurface: true, glassAccent: this.primaryColor, tint: `#33${this.primaryColor.slice(-6)}`, foreground: this.primaryColor,
          feedback: this.pendingAnswer === 'glass' ? 'busy' : '', onAction: (): void => { this.selectAction('glass'); } })
        Button({ type: ButtonType.Normal }) {
          Text($r('app.string.intro_keep_appearance')).fontSize(13).maxLines(1)
            .fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center).width('100%')
        }.width('100%').constraintSize({ minHeight: 44 }).backgroundColor(Color.Transparent)
          .border({ width: 0 }).enabled(!this.savingMode).attributeModifier(new PressFeedback()).stateEffect(false)
          .onClick((): void => { this.selectAction('keep_material'); })
      } else if (page.id === 'start') {
        if (this.experienced) {
          this.choice('start_sync', 'intro_start_sync', 'intro_start_sync_hint', $r('app.media.ic_home_sync'))
        }
        this.choice('start_import', 'intro_start_import', 'intro_start_import_hint', $r('app.media.ic_home_import'))
        this.choice('start_create', 'intro_start_create', 'intro_start_create_hint', $r('app.media.ic_home_create_deck'))
      }


    }.width('100%').alignItems(HorizontalAlign.Start).padding({ top: 8, bottom: 8 })
  }
  @Builder
  private headerContent() {
    DialogHeader({ title: $r('app.string.app_name'), showAction: false, showDivider: false,
      showClose: true, closeEnabled: !this.savingMode, closeLabel: $r('app.string.home_intro_later'),
      onClose: (): void => { this.selectAction('later'); } })
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
  private footerContent() {
    if (this.pageIndex > 0) {
      Row({ space: 12 }) {
        按下态按钮({ 文案: $r('app.string.home_intro_previous'), 是否启用: !this.savingMode,
          点击回调: (): void => { this.selectAction('previous'); } })
        if (homeIntroActionVisible('next', this.pageIndex, this.experienced)) {
          PrimaryActionButton({ label: $r('app.string.home_intro_next'),
            onAction: (): void => { this.selectAction('next'); } }).layoutWeight(1)
        }
      }.width('100%')
    }
  }
  build() {
    DialogFrame({ maximumWidth: 480, materialOverride: 'glass', refractionSource: GLASS_HOME_SOURCE,
      showPreparation: true, fillBody: false, canDismiss: false, showFooter: this.pageIndex > 0,
      header: () => { this.headerContent(); }, content: () => { this.bodyContent(); }, footer: () => { this.footerContent(); } })
  }
}
