// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { appInterface } from '../backend/AppInterfaceService';
import { StudyLeaderboardService } from '../backend/StudyLeaderboardService';
import { ProfileAvatarImage } from '../components/account/ProfileAvatarImage';
import { AppInterfaceControl, visibleInterfaceItems } from '../model/AppInterface';
import { LeaderboardBoard, LeaderboardEntry, LeaderboardOwnEntry, LeaderboardPreview, LEADERBOARD_FILTERS,
  LEADERBOARD_PERIODS, LEADERBOARD_PREVIEW_KEY, LEADERBOARD_SURFACE } from '../model/StudyLeaderboard';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { appearanceElementColor, appearanceElementRadius } from '../utils/AppearanceElements';
import { interfaceItemText } from '../utils/AppInterfaceText';
import { namedResourceText, resourceText } from '../utils/UiFeedback';
import { 应用尺寸 } from '../utils/应用尺寸';
import { DelayedLoadingIndicator } from '../components/common/DelayedLoadingIndicator';
import { IconActionButton } from '../components/common/IconActionButton';
import { PageActionShell } from '../components/common/PageActionShell';
import { PAGE_TOOLBAR_SCOPE, PageToolbarActionScope } from '../model/PageToolbarActions';
import { LeaderboardSettings } from '../components/settings/LeaderboardSettings';
import { DialogFrame } from '../components/common/DialogFrame';
import { DialogHeader } from '../components/common/DialogHeader';
import { GlassSource } from '../components/common/GlassSource';
import { PAGE_COMPACT_LAYOUT_KEY } from '../model/AppLayoutState';
import { WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY } from '../model/WindowSafeLayout';
import { SurfaceSelect } from '../components/common/SurfaceSelect';
import { 范围切换条 } from '../components/stats/范围切换条';
import { 按下态按钮 } from '../components/common/按下态按钮';

const LEADERBOARD_GLASS_SOURCE: string = 'jide-glass-study-leaderboard';

@Component
export struct StudyLeaderboardPage {
  @Provide(PAGE_TOOLBAR_SCOPE) private pageToolbarScope: PageToolbarActionScope = new PageToolbarActionScope();
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @StorageProp('系统语言') @Watch('publishInterface') private language: string = 'zh-Hans';
  @StorageProp(LEADERBOARD_PREVIEW_KEY) private loopbackPreview: boolean = false;
  @State private settingsOpen: boolean = false;
  @State private disclosureOpen: boolean = true;
  @State private board: LeaderboardBoard | null = null;
  @State private shareProfile: boolean = false;
  @State private metric: string = 'answers';
  @State private periodIndex: number = 1;
  @State private periodsAvailable: boolean = false;
  @State private durationAvailable: boolean = false;
  @State private filterIndex: number = 0;
  @State private busy: boolean = false;
  @State private locked: boolean = false;
  @State private errorKey: string = '';
  private active: boolean = false;
  private readonly service: StudyLeaderboardService = new StudyLeaderboardService();
  pathStack: NavPathStack = new NavPathStack();
  @StorageProp('状态栏高度') private statusBarHeight: number = 0;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private compact: boolean = false;
  private readonly scroller: Scroller = new Scroller();

  aboutToAppear(): void {
    this.active = true;
    this.refresh();
  }

  aboutToDisappear(): void {
    this.active = false;
    appInterface.leave(LEADERBOARD_SURFACE);
  }

  private label(id: string): string {
    return interfaceItemText(this.getUIContext(), LEADERBOARD_SURFACE, id, this.language);
  }

  private title(): string {
    return interfaceItemText(this.getUIContext(), 'home_more', 'leaderboard', this.language);
  }

  private subject(id: string): string {
    return namedResourceText(this.getUIContext(), 'leaderboard_subject_' + (id === 'mixed' ? 'other' : id));
  }

  private categories(subject: string, subjects?: string[]): string {
    return (subjects ?? [subject]).map((id: string): string => this.subject(id)).join(', ');
  }

  private period(): string { return LEADERBOARD_PERIODS[this.periodIndex]; }

  private filter(): string { return LEADERBOARD_FILTERS[this.filterIndex]; }

  private canShow(id: string): boolean {
    if (id === 'close') return true;
    if (this.disclosureOpen) return id === 'publish' ||
      (id === 'share_profile' && (this.board?.profile?.revision ?? 0) > 0);
    if (this.settingsOpen) return id === 'anonymous' ||
      (id === 'login' && this.board?.signedIn === false);
    if (id === 'settings') return true;
    if (id === 'filter') return true;
    if (id === 'retry') return this.errorKey !== '' && this.board === null;
    if (id === 'metric') return this.durationAvailable;
    if (id === 'period') return this.periodsAvailable;
    if (this.board === null) return false;
    if (id === 'login') return !this.board.signedIn;
    if (id === 'sample') return this.board.signedIn;
    return id === 'leave' && this.board.mine !== null;
  }

  private publishInterface(_locale: string = this.language): void {
    if (!this.active) return;
    const controls: AppInterfaceControl[] = visibleInterfaceItems(LEADERBOARD_SURFACE,
      { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
      .filter((item): boolean => this.canShow(item.id))
      .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, title: this.label(item.id),
        enabled: item.id === 'close' ? !this.locked :
          item.id === 'publish' ? this.canPublish() :
          item.id === 'anonymous' ? this.canChangeAnonymous() : !this.busy,
        selected: item.id === 'anonymous' ? this.board?.anonymous !== false :
          item.id === 'share_profile' && this.shareProfile }));
    const phase: string = this.disclosureOpen ? 'consent' : this.settingsOpen ? 'settings' : 'board';
    appInterface.observe({ surface: LEADERBOARD_SURFACE, sectionId: phase,
      selectedId: phase === 'board' ? this.filter() : '', optionIds: phase === 'board' ? LEADERBOARD_FILTERS : [],
      optionLabels: phase === 'board' ? LEADERBOARD_FILTERS.map((id): string => this.subject(id)) : [],
      busy: this.busy, controlsComplete: true, items: controls,
      values: [{ id: 'phase', value: this.errorKey ? 'error' : phase }, { id: 'metric', value: this.metric },
        { id: 'period', value: this.period() }, { id: 'public_profile', value: this.shareProfile ? 'shared' : 'anonymous' },
        { id: 'joined', value: !this.board?.signedIn ? 'unknown' : String(this.board.mine !== null) },
        { id: 'active', value: this.board?.mine === null || this.board?.mine === undefined ? 'unknown' : String(this.board.mine.active) }] });
  }

  private async run(task: () => Promise<void>, lock: boolean = false): Promise<void> {
    if (this.busy || !this.active) return;
    this.busy = true;
    this.locked = lock;
    this.errorKey = '';
    this.publishInterface();
    try {
      await task();
    } catch (error) {
      if (!this.active) return;
      const code: string = (error as Error).message;
      switch (code) {
        case 'leaderboard_no_learning':
        case 'leaderboard_no_samples':
        case 'leaderboard_score_limit':
        case 'leaderboard_wait':
        case 'leaderboard_login_failed':
          this.errorKey = code;
          break;
        case 'profile_changed':
          this.errorKey = 'leaderboard_profile_changed';
          break;
        case 'login_required':
          if (this.loopbackPreview && this.board !== null) {
            this.updateBoard({ entries: this.board.entries, mine: null, signedIn: false,
              metrics: this.board.metrics, periods: this.board.periods });
          } else {
            this.board = null;
          }
          this.errorKey = 'account_session_expired';
          break;
        default:
          this.errorKey = 'leaderboard_unavailable';
      }
    } finally {
      if (this.active) {
        this.busy = false;
        this.locked = false;
        this.publishInterface();
      }
    }
  }

  /** @throws {Error} 读取失败交给调用它的 run() 按错误码提示。 */
  private async readBoard(): Promise<void> {
    if (this.loopbackPreview) {
      const preview: LeaderboardBoard = await this.service.viewLoopbackPreview(this.filter(), this.metric, this.period());
      if (!this.active) return;
      this.updateBoard(preview);
      const personal: LeaderboardBoard | null = await this.service.viewPersonal(this.filter(), this.metric, this.period());
      if (this.active && personal !== null) this.updateBoard(personal);
    } else {
      const board: LeaderboardBoard = await this.service.view(this.filter(), this.metric, this.period());
      if (this.active) this.updateBoard(board);
    }
  }

  private updateBoard(board: LeaderboardBoard): void {
    if (this.loopbackPreview && board.signedIn && this.board !== null) {
      this.board = { entries: this.board.entries, mine: board.mine, signedIn: true, profile: board.profile,
        anonymous: board.anonymous, anonymousAlias: board.anonymousAlias, metrics: this.board.metrics, periods: this.board.periods };
    } else {
      this.board = board;
    }
    this.durationAvailable = this.board.metrics?.includes('duration') === true;
    this.periodsAvailable = this.board.periods?.includes('month') === true && this.board.periods?.includes('today') === true;
  }

  private isSignedIn(): boolean { return this.board?.signedIn === true; }

  private canPublish(): boolean {
    return this.disclosureOpen && !this.busy;
  }

  private confirmParticipation(): void {
    if (!this.canPublish()) return;
    const revision: number | undefined = this.shareProfile ? this.board?.profile?.revision : undefined;
    this.run(async (): Promise<void> => {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      if (this.board === null) await this.readBoard();
      if (!this.active) return;
      if (!this.isSignedIn()) {
        await this.signIn(context);
        if (!this.active) return;
        await this.readBoard();
        if (!this.active) return;
        if (!this.isSignedIn()) throw new Error('leaderboard_login_failed');
      }
      const payload: LeaderboardPreview = await this.service.preview(context.filesDir,
        (): boolean => this.active, this.periodsAvailable);
      if (!this.active) return;
      const board: LeaderboardBoard = await this.service.publish(
        this.filter(), payload, revision, this.metric, this.durationAvailable, this.period());
      if (this.active) {
        this.updateBoard(board);
        this.disclosureOpen = false;
      }
    }, true);
  }

  private closeDisclosure(): void {
    if (this.locked) return;
    this.disclosureOpen = false;
    this.publishInterface();
  }

  private refresh(): void { this.run((): Promise<void> => this.readBoard()); }

  private select(index: number): void {
    if (this.busy || index === this.filterIndex || index < 0 || index >= LEADERBOARD_FILTERS.length) return;
    this.filterIndex = index;
    this.board = null;
    this.refresh();
  }

  private selectMetric(metric: string): void {
    if (this.busy || metric === this.metric) return;
    this.metric = metric;
    this.board = null;
    this.scroller.scrollTo({ xOffset: 0, yOffset: 0 });
    this.refresh();
  }

  private selectPeriod(index: number): void {
    if (this.busy || index === this.periodIndex || index < 0 || index >= LEADERBOARD_PERIODS.length) return;
    this.periodIndex = index;
    this.board = null;
    this.scroller.scrollTo({ xOffset: 0, yOffset: 0 });
    this.refresh();
  }

  private formatDuration(ms: number): string {
    const seconds: number = Math.floor(ms / 1000);
    const minutes: number = Math.floor(seconds / 60);
    return minutes < 60 ?
      resourceText(this.getUIContext(), $r('app.string.stats_time_format'), minutes, seconds % 60) :
      resourceText(this.getUIContext(), $r('app.string.stats_time_format_hour'), Math.floor(minutes / 60), minutes % 60);
  }

  private async signIn(context: common.UIAbilityContext): Promise<void> {
    try {
      await this.service.login(context);
    } catch (error) {
      throw new Error('leaderboard_login_failed');
    }
  }

  private login(): void {
    this.run(async (): Promise<void> => {
      await this.signIn(this.getUIContext().getHostContext() as common.UIAbilityContext);
      if (this.active) await this.readBoard();
    }, true);
  }

  private sample(): void {
    if (!this.active || this.busy || this.board?.signedIn !== true || this.disclosureOpen) return;
    this.shareProfile = false;
    this.disclosureOpen = true;
    this.publishInterface();
  }

  private leave(): void {
    this.run(async (): Promise<void> => {
      const board: LeaderboardBoard = await this.service.leave(this.filter(), this.metric, this.period());
      if (this.active) this.updateBoard(board);
    }, true);
  }

  private dismiss(): void {
    if (this.locked) return;
    if (this.settingsOpen) { this.showSettings(false); return; }
    if (this.disclosureOpen) { this.closeDisclosure(); return; }
    this.pathStack.pop();
  }

  private showSettings(open: boolean): void {
    if (this.busy || this.disclosureOpen) return;
    this.settingsOpen = open;
    this.errorKey = '';
    this.publishInterface();
  }

  private canChangeAnonymous(): boolean {
    return !this.busy && this.board?.signedIn === true && this.board.anonymous !== undefined &&
      (this.board.anonymous === false || (this.board.profile?.revision ?? 0) > 0);
  }

  private setAnonymous(anonymous: boolean): void {
    if (!this.canChangeAnonymous() || this.board?.anonymous === anonymous) return;
    this.run(async (): Promise<void> => {
      const board: LeaderboardBoard = await this.service.setAnonymous(this.filter(), this.metric, this.period(),
        anonymous, this.board?.profile?.revision);
      if (this.active) this.updateBoard(board);
    }, true);
  }

  private anonymousHint(): ResourceStr {
    if (this.board?.signedIn !== true) return $r('app.string.leaderboard_privacy_login');
    if (this.board.anonymous === undefined) return $r('app.string.leaderboard_unavailable');
    if (this.board.anonymous && (this.board.profile?.revision ?? 0) < 1) {
      return $r('app.string.leaderboard_privacy_profile');
    }
    return $r('app.string.leaderboard_privacy_hint');
  }

  @Builder
  private action(id: string, onAction: () => void, isPrimary: boolean = false) {
    按下态按钮({ 文案: this.label(id), 是否启用: !this.busy, themeText: isPrimary,
      fillWidth: true, autoHeight: true, 点击回调: onAction })
  }

  @Builder
  private note(text: ResourceStr) {
    Text(text).width('100%').fontSize(应用尺寸.字号_正文_小)
      .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
  }

  @Builder
  private rankingHeader() {
    Row({ space: 应用尺寸.间距_12 }) {
      Text($r('app.string.leaderboard_rank_column')).width(38).textAlign(TextAlign.Center)
      Text($r('app.string.leaderboard_learner_column')).layoutWeight(1)
      Text(this.metric === 'duration' ? $r('app.string.leaderboard_duration_column') :
        $r('app.string.leaderboard_score_column')).width('32%').textAlign(TextAlign.End)
    }.width('100%').constraintSize({ minHeight: 32 })
      .padding({ left: 应用尺寸.间距_8, right: 应用尺寸.间距_8 })
  }

  private anonymousName(alias: string, label: string = ''): string {
    const number: number = parseInt(alias.slice(0, 12), 16);
    if (!Number.isFinite(number)) {
      return label || namedResourceText(this.getUIContext(), 'leaderboard_anonymous_learner');
    }
    const displayNumber: string = String(1000000000 + number % 9000000000);
    return label === '' ? displayNumber :
      resourceText(this.getUIContext(), $r('app.string.leaderboard_name_with_label'), displayNumber, label);
  }

  private learnerName(entry: LeaderboardEntry): string {
    return entry.avatar === undefined ? this.anonymousName(entry.alias) :
      entry.nickname || namedResourceText(this.getUIContext(), 'leaderboard_learner_column');
  }

  private myName(mine: LeaderboardOwnEntry | null): string {
    const self: string = namedResourceText(this.getUIContext(), 'leaderboard_self');
    if (this.board?.anonymous === true) {
      return this.anonymousName(mine?.alias ?? this.board.anonymousAlias ?? '', self);
    }
    const published: LeaderboardEntry | undefined = this.board?.entries.find(
      (entry: LeaderboardEntry): boolean => entry.alias === mine?.alias);
    const nickname: string = published?.nickname ?? this.board?.profile?.nickname ?? '';
    return nickname ? resourceText(this.getUIContext(), $r('app.string.leaderboard_name_with_label'), nickname, self) : self;
  }

  private rankText(rank: number | null): string {
    return rank === null ? '—' : rank > 99 ? '99+' : String(rank);
  }

  private scoreText(score: number | null): string {
    if (score === null) return '—';
    return this.metric === 'duration' ? this.formatDuration(score) : score.toLocaleString();
  }

  private myAvatar(mine: LeaderboardOwnEntry | null): string | undefined {
    if (this.board?.anonymous === true) return undefined;
    return this.board?.entries.find((entry: LeaderboardEntry): boolean => entry.alias === mine?.alias)?.avatar ??
      this.board?.profile?.avatar;
  }

  @Builder
  private entry(entry: LeaderboardEntry) {
    this.rankingRow(this.rankText(entry.rank), this.learnerName(entry), this.categories(entry.subject, entry.subjects),
      this.scoreText(entry.score), entry.avatar)
  }

  @Builder
  private myRow(mine: LeaderboardOwnEntry | null) {
    this.rankingRow(this.rankText(mine?.rank ?? null),
      this.myName(mine),
      mine === null ? $r('app.string.leaderboard_self_unranked') :
        !mine.active ? $r('app.string.leaderboard_expired') : this.categories(mine.subject, mine.subjects),
      this.scoreText(mine?.score ?? null), this.myAvatar(mine), true)
  }

  @Builder
  private rankingRow(rank: string, name: ResourceStr, detail: ResourceStr, score: string,
    avatar: string | undefined, isMine: boolean = false) {
    Row({ space: 应用尺寸.间距_12 }) {
      Text(rank).fontWeight(FontWeight.Medium).width(38).textAlign(TextAlign.Center)
        .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
      Row({ space: 应用尺寸.间距_8 }) {
        if (avatar !== undefined) {
          ProfileAvatarImage({ avatar: avatar, diameter: 32 })
        } else {
          Image($r('app.media.app_icon')).width(32).height(32).objectFit(ImageFit.Cover)
            .borderRadius(16).clip(true).accessibilityLevel('no')
        }
        Column({ space: 应用尺寸.间距_4 }) {
          Text(name).width('100%').maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
          this.note(detail)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      }.layoutWeight(1)
      Text(score)
        .fontWeight(FontWeight.Medium).width('32%').textAlign(TextAlign.End)
        .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
    }.width('100%').constraintSize({ minHeight: 48 })
      .padding({ left: 应用尺寸.间距_8, right: 应用尺寸.间距_8, top: 应用尺寸.间距_4, bottom: 应用尺寸.间距_4 })
      .border(SurfaceBorder.options(isMine ? 应用尺寸.卡片边框 : 0, undefined, this.appearanceElements))
      .borderRadius(appearanceElementRadius(this.appearanceElements, 应用尺寸.圆角_卡片))
  }

  @Builder
  private filterBar() {
    Flex({ wrap: FlexWrap.Wrap, alignItems: ItemAlign.Center,
      space: { main: LengthMetrics.vp(应用尺寸.页面分组间距(this.compact)),
        cross: LengthMetrics.vp(应用尺寸.页面分组间距(this.compact)) } }) {
      if (this.durationAvailable) {
        范围切换条({
          当前索引: this.metric === 'duration' ? 1 : 0,
          标签集: [$r('app.string.leaderboard_score_column'), $r('app.string.leaderboard_duration_column')],
          label: $r('app.string.leaderboard_metric'), isInteractive: !this.busy,
          onRangeChange: (index: number): void => this.selectMetric(index === 1 ? 'duration' : 'answers')
        })
      }
      if (this.periodsAvailable) {
        范围切换条({
          当前索引: this.periodIndex,
          标签集: [$r('app.string.leaderboard_period_today'), $r('app.string.leaderboard_period_week'),
            $r('app.string.leaderboard_period_month')],
          label: $r('app.string.leaderboard_period'), isInteractive: !this.busy,
          onRangeChange: (index: number): void => this.selectPeriod(index)
        })
      }
      SurfaceSelect({ options: LEADERBOARD_FILTERS.map((id): SelectOption => ({ value: this.subject(id) })),
        label: this.label('filter'), value: this.subject(this.filter()), selectedIndex: this.filterIndex,
        isInteractive: !this.busy, onSelect: (index: number): void => this.select(index) })
    }.width('100%').padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平 })
  }

  @Builder
  private boardContent() {
    if (this.board !== null) {
      this.rankingHeader()
      if (this.board.signedIn || this.board.mine !== null) {
        ForEach([this.board.mine], (mine: LeaderboardOwnEntry | null) => {
          this.myRow(mine)
        }, (mine: LeaderboardOwnEntry | null): string => JSON.stringify([mine, this.metric, this.myName(mine), this.myAvatar(mine)]))
      }
      if (this.board.entries.length === 0) {
        this.note($r('app.string.leaderboard_empty'))
      } else {
        ForEach(this.board.entries.slice(0, 30), (entry: LeaderboardEntry) => {
          this.entry(entry)
        }, (entry: LeaderboardEntry): string => JSON.stringify([entry.alias, entry.rank, entry.score, entry.subject, entry.subjects, entry.nickname, entry.avatar]))
      }
    }
    if (!this.disclosureOpen && this.canShow('login')) this.action('login', (): void => this.login(), true)
    if (this.canShow('sample')) this.action('sample', (): void => this.sample(), true)
    if (this.canShow('leave')) this.action('leave', (): void => this.leave())
  }

  @Builder
  private identityChoice() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.canShow('share_profile')) {
        范围切换条({
          当前索引: this.shareProfile ? 1 : 0,
          标签集: [$r('app.string.leaderboard_publish_anonymous'), $r('app.string.leaderboard_share_profile')],
          label: $r('app.string.leaderboard_identity'), isInteractive: !this.busy,
          onRangeChange: (index: number): void => { this.shareProfile = index === 1; this.publishInterface(); }
        })
      } else {
        Text($r('app.string.leaderboard_publish_anonymous')).width('100%').fontWeight(FontWeight.Medium)
          .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
      }
      if (this.shareProfile) {
        Row({ space: 应用尺寸.间距_8 }) {
          ProfileAvatarImage({ avatar: this.board?.profile?.avatar ?? '', diameter: 28 })
          Text(this.board?.profile?.nickname ?? '').layoutWeight(1).maxLines(1)
        }.width('100%')
      } else {
        this.note($r('app.string.leaderboard_anonymous_notice'))
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  private header() {
    Stack({ alignContent: Alignment.Center }) {
      Text(this.title()).fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Medium)
        .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
        .width('55%').textAlign(TextAlign.Center).maxLines(1).hitTestBehavior(HitTestMode.None)
      Row() {
        IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_common_arrow_left'),
          label: $r('app.string.study_back'), isInteractive: !this.locked,
          onAction: (): void => this.dismiss() })
        Blank()
        IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_home_settings'),
          label: $r('app.string.leaderboard_settings_title'), isInteractive: !this.busy && !this.disclosureOpen,
          onAction: (): void => this.showSettings(true) })
      }.width('100%').height('100%')
    }.width('100%').height(应用尺寸.pageToolbarHeight(this.statusBarHeight, this.compact, this.safeTop))
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.pageToolbarTop(this.statusBarHeight, this.compact, this.safeTop) })
  }

  @Builder
  private content() {
    if (this.busy) {
      Row({ space: 应用尺寸.间距_8 }) {
        DelayedLoadingIndicator()
        this.note($r('app.string.common_loading'))
      }.width('100%')
    }
    if (this.errorKey !== '' && !this.settingsOpen && !this.disclosureOpen) {
      this.note(namedResourceText(this.getUIContext(), this.errorKey))
      if (this.canShow('retry')) this.action('retry', (): void => this.refresh())
    }
    this.boardContent()
  }

  @Builder
  private settingsDialog() {
    DialogFrame({ refractionSource: LEADERBOARD_GLASS_SOURCE, maximumWidth: 应用尺寸.dialogCompactMaxWidth,
      canDismiss: !this.busy, showPreparation: true,
      onDismiss: (): void => this.showSettings(false),
      header: (): void => { this.settingsTitle() },
      content: (): void => { this.settingsBody() }
    })
  }

  @Builder
  private settingsTitle() {
    DialogHeader({ title: $r('app.string.leaderboard_settings_title'), showAction: false, closeEnabled: !this.busy,
      closeLabel: $r('app.string.close'), onClose: (): void => this.showSettings(false) })
  }

  @Builder
  private settingsBody() {
    LeaderboardSettings({ fromBoard: true, anonymous: this.board?.anonymous !== false,
      anonymousHint: this.anonymousHint(), canChangeAnonymous: this.canChangeAnonymous(),
      onAnonymousChange: (anonymous: boolean): void => this.setAnonymous(anonymous) })
    if (this.board?.signedIn === false) {
      this.action('login', (): void => this.login())
    }
    if (this.errorKey !== '') {
      Text(namedResourceText(this.getUIContext(), this.errorKey)).width('100%')
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text'))
    }
  }

  @Builder
  private disclosure() {
    DialogFrame({ refractionSource: LEADERBOARD_GLASS_SOURCE, maximumWidth: 应用尺寸.dialogCompactMaxWidth,
      canDismiss: !this.locked, onDismiss: (): void => this.closeDisclosure(),
      header: (): void => { this.disclosureTitle() },
      content: (): void => { this.disclosureContent() },
      showFooter: true, footer: (): void => { this.disclosureFooter() }
    })
  }

  @Builder
  private disclosureTitle() {
    DialogHeader({ title: this.title(), closeLabel: this.label('close'), closeIcon: $r('app.media.ic_common_close'),
      showAction: false, closeEnabled: !this.locked, onClose: (): void => this.closeDisclosure() })
  }

  @Builder
  private disclosureFooter() {
    按下态按钮({ 文案: this.label('publish'), 是否启用: this.canPublish(), themeText: true,
      fillWidth: true, autoHeight: true, 点击回调: (): void => this.confirmParticipation() })
  }

  @Builder
  private disclosureContent() {
    this.identityChoice()
    this.note($r('app.string.leaderboard_disclosure'))
    if (this.errorKey !== '') this.note(namedResourceText(this.getUIContext(), this.errorKey))
  }

  build() {
    NavDestination() {
      PageActionShell({ surface: LEADERBOARD_SURFACE }) {
        Stack() {
          GlassSource({ sourceId: LEADERBOARD_GLASS_SOURCE }) {
            Column() {
              this.header()
              Column({ space: 应用尺寸.页面分组间距(this.compact) }) {
                this.filterBar()
                Scroll(this.scroller) {
                  Column({ space: 应用尺寸.页面分组间距(this.compact) }) {
                    this.content()
                  }.width('100%').alignItems(HorizontalAlign.Start)
                    .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
                      bottom: this.safeBottom + 应用尺寸.页面底部间距(this.compact) })
                }.width('100%').layoutWeight(1).align(Alignment.Top)
              }.width('100%').layoutWeight(1).padding({ top: 应用尺寸.页面内容顶部间距(this.compact) })
            }.width('100%').height('100%')
          }
          if (this.disclosureOpen) this.disclosure()
          if (this.settingsOpen) this.settingsDialog()
        }.width('100%').height('100%')
      }
    }.hideTitleBar(true).backgroundColor(Color.Transparent)
      .onBackPressed((): boolean => { this.dismiss(); return true; })
      .onShown((): void => { appInterface.showPage(LEADERBOARD_SURFACE); this.publishInterface(); })
      .onHidden((): void => { appInterface.hidePage(LEADERBOARD_SURFACE); })
  }
}
