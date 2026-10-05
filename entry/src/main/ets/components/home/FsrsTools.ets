// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckOptionsFsrsState, FsrsPresetResult } from '../../model/home/DeckOptionsSession';
import { FsrsWorkloadPoint } from '../../proto/messages/FsrsMessages';
import { DeckOptionField, DeckOptionChoice } from './DeckOptionField';
import { DeckOptionRow } from './DeckOptionRow';
import { 统一加载态 } from '../common/统一加载态';
import { resourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { appInterface } from '../../backend/AppInterfaceService';
import { visibleInterfaceItems } from '../../model/AppInterface';
import type { AppInterfaceControl } from '../../model/AppInterface';
import { namedResourceText } from '../../utils/UiFeedback';

/** Actions return to the existing draft owner; this component only owns comparison controls. */
@Component
export struct FsrsTools {
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('publishInterface') state: DeckOptionsFsrsState = new DeckOptionsFsrsState();
  @Prop @Watch('publishInterface') busy: boolean = false;
  onOptimize: (all: boolean, retry: boolean) => void = (): void => {};
  onSimulate: (days: number) => void = (): void => {};
  onEvaluate: () => void = (): void => {};
  onRetention: (value: string) => void = (): void => {};
  @State @Watch('publishInterface') private daysText: string = '365';
  @State @Watch('publishInterface') private selectedRetention: string = '90';
  private mounted: boolean = false;

  aboutToAppear(): void { this.mounted = true; this.publishInterface(); }
  aboutToDisappear(): void { this.mounted = false; appInterface.leave('deck_options_fsrs'); }
  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.mounted) return;
    const controls: AppInterfaceControl[] = visibleInterfaceItems('deck_options_fsrs',
      { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
      .filter((item): boolean => !['use_retention', 'compare_retention'].includes(item.id) || this.state.workload !== null)
      .filter((item): boolean => item.id !== 'retry' || this.state.results.some((result: FsrsPresetResult): boolean => result.error !== ''))
      .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey,
        title: namedResourceText(this.getUIContext(), item.titleKey), enabled: !this.busy, selected: false }));
    appInterface.observe({ surface: 'deck_options_fsrs', sectionId: 'tools', selectedId: '', optionIds: [], optionLabels: [],
      busy: this.busy, controlsComplete: true, items: controls,
      values: [{ id: 'operation', value: this.state.operation }, { id: 'search', value: this.state.evaluationSearch },
        { id: 'ignore_before_date', value: this.state.evaluationDate },
        { id: 'log_loss', value: this.state.evaluation === null ? '' : String(this.state.evaluation.logLoss) },
        { id: 'rmse_bins', value: this.state.evaluation === null ? '' : String(this.state.evaluation.rmseBins) },
        { id: 'included_cards', value: this.state.historyCount === null ? '' : String(this.state.historyCount.included) },
        { id: 'total_cards', value: this.state.historyCount === null ? '' : String(this.state.historyCount.total) },
        { id: 'days', value: this.daysText }, { id: 'compare_retention', value: this.selectedRetention }] });
  }

  private validateDays(value: string, _locale: string = this.uiLanguage): string {
    const days: number = Number(value);
    return new RegExp('^\\d+$').test(value.trim()) && days >= 1 && days <= 3650
      ? '' : resourceText(this.getUIContext(), $r('app.string.deck_fsrs_days_invalid'));
  }

  private choices(_locale: string = this.uiLanguage): DeckOptionChoice[] {
    const choices: DeckOptionChoice[] = [];
    for (let retention = 70; retention <= 99; retention++) {
      choices.push({ label: resourceText(this.getUIContext(), $r('app.string.deck_fsrs_percent'), retention),
        value: String(retention) });
    }
    return choices;
  }

  private resultText(result: FsrsPresetResult, _locale: string = this.uiLanguage): string {
    if (result.error !== '') return resourceText(this.getUIContext(), $r('app.string.deck_fsrs_failed'), result.name, result.error);
    const status: Resource = result.fsrsItems === 0 ? $r('app.string.deck_fsrs_no_history') :
      (result.fsrsItems < 400 ? $r('app.string.deck_fsrs_limited_history') : $r('app.string.deck_fsrs_optimized'));
    const health: Resource = result.healthCheckPassed === null ? $r('app.string.deck_fsrs_health_unavailable') :
      (result.healthCheckPassed ? $r('app.string.deck_fsrs_health_passed') : $r('app.string.deck_fsrs_health_failed'));
    return resourceText(this.getUIContext(), $r('app.string.deck_fsrs_result'), result.name, result.fsrsItems,
      resourceText(this.getUIContext(), status), resourceText(this.getUIContext(), health));
  }

  private comparisonPoints(): FsrsWorkloadPoint[] {
    return this.state.workload === null ? [] : this.state.workload.points.filter((point: FsrsWorkloadPoint): boolean =>
      point.retention === Number(this.selectedRetention) || [80, 90, 95, 99].includes(point.retention));
  }

  private pointText(point: FsrsWorkloadPoint, _locale: string = this.uiLanguage): string {
    const days: number = this.state.workloadDays;
    return resourceText(this.getUIContext(), $r('app.string.deck_fsrs_workload_point'), point.retention,
      (point.costSeconds / days / 60).toFixed(1), (point.reviewCount / days).toFixed(1), point.memorized.toFixed(1));
  }

  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      DeckOptionRow({ title: $r('app.string.deck_fsrs_optimize_current'), busy: this.busy,
        onOpen: (): void => { this.onOptimize(false, false); } })
      DeckOptionRow({ title: $r('app.string.deck_fsrs_optimize_all'), busy: this.busy,
        onOpen: (): void => { this.onOptimize(true, false); } })
      Text($r('app.string.deck_fsrs_draft_help')).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      DeckOptionRow({ title: $r('app.string.deck_fsrs_evaluate_current'), busy: this.busy, onOpen: this.onEvaluate })
      if (this.state.busy) {
        统一加载态({ 文案: this.state.operation === 'optimize'
          ? $r('app.string.deck_fsrs_progress', this.state.current, this.state.total)
          : this.state.operation === 'evaluate' ? $r('app.string.deck_fsrs_evaluating') : $r('app.string.deck_fsrs_simulating') })
      }
      if (this.state.historyCount !== null) {
        Text($r('app.string.deck_fsrs_history_count', this.state.historyCount.included, this.state.historyCount.total))
          .fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
        Text($r('app.string.deck_fsrs_evaluation_scope', this.state.evaluationSearch,
          this.state.evaluationDate || resourceText(this.getUIContext(), $r('app.string.deck_fsrs_all_history'))))
          .fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      }
      if (this.state.evaluation !== null) {
        Text($r('app.string.deck_fsrs_evaluation_result', this.state.evaluation.logLoss.toFixed(4), this.state.evaluation.rmseBins.toFixed(4)))
          .fontSize(14).fontColor($r('app.color.text_primary')).width('100%')
        Text($r('app.string.deck_fsrs_evaluation_help')).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      }
      ForEach(this.state.results, (result: FsrsPresetResult) => {
        Text(this.resultText(result)).fontSize(14).width('100%')
          .fontColor(result.error !== '' || result.healthCheckPassed === false
            ? $r('app.color.error_text') : $r('app.color.text_secondary'))
      }, (result: FsrsPresetResult): string => String(result.id) + ':' + String(result.fsrsItems) + ':' + result.error + ':' + String(result.healthCheckPassed))
      if (this.state.results.some((result: FsrsPresetResult): boolean => result.error !== '')) {
        DeckOptionRow({ title: $r('app.string.deck_fsrs_retry_failed'), busy: this.busy,
          onOpen: (): void => { this.onOptimize(this.state.allPresets, true); } })
      }
      if (this.state.batchDraft) {
        Text($r('app.string.deck_fsrs_batch_scope')).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      }
      DeckOptionField({ title: $r('app.string.deck_fsrs_days'), value: this.daysText,
        help: $r('app.string.deck_fsrs_simulation_help'), busy: this.busy,
        validate: (value: string): string => this.validateDays(value),
        onChange: (value: string): void => { this.daysText = value; } })
      DeckOptionRow({ title: $r('app.string.deck_fsrs_simulate'), busy: this.busy,
        onOpen: (): void => { if (this.validateDays(this.daysText) === '') this.onSimulate(Number(this.daysText)); } })
      Text($r('app.string.deck_fsrs_simulation_help')).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      if (this.state.error !== '') {
        Text(this.state.error).fontSize(14).fontColor($r('app.color.error_text')).width('100%')
      }
      if (this.state.workload !== null) {
        Text($r('app.string.deck_fsrs_workload_title', this.state.workloadDays))
          .fontSize(15).fontColor($r('app.color.text_primary')).width('100%')
        DeckOptionField({ title: $r('app.string.deck_fsrs_compare_retention'), value: this.selectedRetention,
          choices: this.choices(), help: $r('app.string.deck_fsrs_simulation_help'), busy: this.busy,
          onChange: (value: string): void => { this.selectedRetention = value; } })
        ForEach(this.comparisonPoints(), (point: FsrsWorkloadPoint) => {
          Text(this.pointText(point)).fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
        }, (point: FsrsWorkloadPoint): string => String(point.retention) + ':' + String(point.costSeconds) + ':' + String(point.memorized) + ':' + String(point.reviewCount))
        DeckOptionRow({ title: $r('app.string.deck_fsrs_use_retention'), busy: this.busy,
          onOpen: (): void => { this.onRetention(String(Number(this.selectedRetention) / 100)); } })
      }
    }.width('100%')
  }
}
