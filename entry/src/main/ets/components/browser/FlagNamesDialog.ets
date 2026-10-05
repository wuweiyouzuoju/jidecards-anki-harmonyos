// SPDX-License-Identifier: AGPL-3.0-or-later
import { CARD_FLAGS, CardFlagDefinition, FlagLabels, FlagLabelChange, parseFlagLabels,
  customFlagLabel, saveCardFlagLabels } from '../../model/CardMarking';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { AnkiCardMarking } from '../../backend/AnkiCardMarking';
import { BrowserOperationController } from '../../model/BrowserOperationController';
import { autoSyncScheduler } from '../../model/AutoSyncScheduler';
import { syncActivity } from '../../model/SyncSettings';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { localizedNamedResourceText, resourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PressFeedback } from '../../utils/PressFeedback';

@Component
export struct FlagNamesDialog {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('handleBack') backRequest: number = 0;
  onClose: () => void = (): void => {};
  onChanged: () => void = (): void => {};
  @State private isBusy: boolean = true;
  @State private errorText: string = '';
  @State private drafts: string[] = ['', '', '', '', '', '', '', ''];
  private edited: Set<number> = new Set<number>();
  private loaded: boolean = false;
  private mounted: boolean = false;
  private backend: AnkiCardMarking = new AnkiCardMarking();
  private operations: BrowserOperationController = new BrowserOperationController();
  aboutToAppear(): void { this.mounted = true; this.load(); }
  aboutToDisappear(): void { this.mounted = false; this.operations.dispose(); }
  private handleBack(): void { if (!this.isBusy) this.onClose(); }
  private async load(_locale: string = this.uiLanguage): Promise<void> {
    autoSyncScheduler.beginOperation(this);
    try {
      await syncActivity.waitForCollection();
      if (!this.mounted) return;
      const labels: FlagLabels = parseFlagLabels(await this.backend.labels());
      if (this.mounted) {
        this.drafts = CARD_FLAGS.map((flag: CardFlagDefinition): string => customFlagLabel(labels, flag.value));
        this.edited.clear(); this.loaded = true;
      }
    } catch (error) {
      if (this.mounted) this.errorText = resourceText(this.getUIContext(), $r('app.string.card_mark_load_error'));
    } finally {
      autoSyncScheduler.endOperation(this);
      if (this.mounted) this.isBusy = false;
    }
  }
  private async save(_locale: string = this.uiLanguage): Promise<void> {
    if (this.isBusy || !this.loaded) return;
    if (this.edited.size === 0) { this.onClose(); return; }
    const input: FlagLabelChange[] = CARD_FLAGS.filter((flag: CardFlagDefinition): boolean => this.edited.has(flag.value))
      .map((flag: CardFlagDefinition): FlagLabelChange => ({ flag: flag.value, name: this.drafts[flag.value] }));
    const context = this.operations.begin('labels', [], 0, 0);
    if (context === null) return;
    this.isBusy = true;
    this.errorText = '';
    try {
      await this.operations.execute(context, async (): Promise<void> => { await saveCardFlagLabels(this.backend, input); }, {
        afterCommit: async (): Promise<void> => { if (this.mounted) { this.onChanged(); this.onClose(); } },
        changed: (): void => { AppStorage.setOrCreate<number>('需要刷新主页', Date.now()); },
        failed: (): void => { if (this.mounted) this.errorText = resourceText(this.getUIContext(), $r('app.string.card_mark_save_error')); },
        refreshFailed: (): void => {}
      });
    } finally { if (this.mounted) this.isBusy = false; }
  }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.card_mark_flag_names'), closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.isBusy, onClose: (): void => { this.onClose(); },
      actionLabel: $r('app.string.browser_detail_confirm'), actionEnabled: !this.isBusy && this.loaded && this.errorText === '',
      onAction: (): void => { this.save(); } })
  }
  @Builder
  private content() {
    Text($r('app.string.card_mark_flag_names_help')).fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_secondary')).width('100%')
    ForEach(CARD_FLAGS.filter((flag: CardFlagDefinition): boolean => flag.value > 0), (flag: CardFlagDefinition) => {
      Row({ space: 应用尺寸.间距_8 }) {
        Text(localizedNamedResourceText(this.getUIContext(), this.uiLanguage, flag.labelKey)).fontSize(应用尺寸.字号_正文_小)
          .fontColor(flag.color).width(56)
        TextInput({ text: this.drafts[flag.value], placeholder: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, flag.labelKey) })
          .border(SurfaceBorder.options())
          .layoutWeight(1).height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_正文)
          .enabled(!this.isBusy && this.loaded).onChange((name: string): void => {
            const next: string[] = this.drafts.slice(); next[flag.value] = name; this.drafts = next;
            this.edited.add(flag.value); this.errorText = '';
          })
      }.width('100%')
    }, (flag: CardFlagDefinition): string => String(flag.value))
    if (this.errorText !== '') {
      Text(this.errorText).fontColor($r('app.color.error_text')).fontSize(应用尺寸.字号_正文_小)
      Button($r('app.string.card_mark_retry')).enabled(!this.isBusy)
        .height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary')).backgroundColor($r('app.color.surface_card'))
        .borderRadius(应用尺寸.圆角_胶囊).border(SurfaceBorder.options())
        .attributeModifier(new PressFeedback()).stateEffect(false).onClick((): void => {
        this.errorText = ''; if (this.loaded) this.save(); else { this.isBusy = true; this.load(); }
      })
    }
  }
  build() {
    DialogFrame({ canDismiss: !this.isBusy, header: () => { this.header(); },
      content: () => { this.content(); }, onDismiss: (): void => { this.onClose(); } })
  }
}
