// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { HelpLabel } from './common/HelpLabel';
import { 字段帮助对话框 } from './字段帮助面板';
import { DialogBackdrop } from './common/DialogBackdrop';
import { resourceText } from '../utils/UiFeedback';
import { SelectStyle } from '../utils/SelectStyle';
import { FormSelectRow } from './common/FormSelectRow';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { SettingsToggleRow } from './common/SettingsToggleRow';

import { DialogHeader } from './common/DialogHeader';
import { DialogFrame } from './common/DialogFrame';
import { PackageImportOptions } from './import/PackageImportOptions';
import { CsvImportOptions } from './import/CsvImportOptions';
import { ImportResult } from './import/ImportResult';
import { ImportAnkiPackageOptions, ImportSummary, DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS,
  copyImportAnkiPackageOptions } from '../proto/messages/ImportExportMessages';
import { CsvMetadata } from '../proto/messages/CsvImportMessages';
import { CsvImportPreview, validateCsvMapping } from '../model/CsvImport';
import { ImportProgress } from '../model/ImportOperation';
// 每次只展示入口指定的任务；文件选择、格式识别和写入由 DataTransferSession 拥有。

import type { 整库导出选项, 牌组导出选项 } from '../model/数据传输模型';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 设置面板色板_取 } from '../utils/设置面板配色';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import { 颜色键 } from '../model/颜色主题';

import type { 数据迁移模式, 导出牌组选项, 导出牌组意图, 导出个人数据意图, 导入牌组意图, 替换个人数据意图, 数据迁移意图 } from '../model/DataTransferIntent';
export type { 数据迁移模式, 导出牌组选项, 导出牌组意图, 导出个人数据意图, 导入牌组意图, 替换个人数据意图, 数据迁移意图 } from '../model/DataTransferIntent';

class 牌组选择项 {
  value: string = '';
}


/** Presentation-only data management panel. File and backend work stay with its owner. */
@Component
export struct 数据迁移面板 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop deckId: number = 0;
  @Prop @Watch('syncMode') initialMode: 数据迁移模式 = 'exportDeck';
  @Prop deckOptions: 导出牌组选项[] = [];
  @Prop allowDeckSelection: boolean = false;
  @Prop busy: boolean = false;
  @Prop picking: boolean = false;
  @Prop loadingPresets: boolean = false;
  @Prop errorMessage: string = '';
  @Prop personalReplacementStep: number = 0;
  @Prop stage: number = -1;
  @Prop isDark: boolean = false;
  @Prop result: ImportSummary | null = null;
  @Prop csv: CsvImportPreview | null = null;
  @Prop progress: ImportProgress = { text: '', processed: 0, total: 0, cancellable: false };
  @Prop cancelRequested: boolean = false;
  @Prop cancelled: boolean = false;
  @Prop externalInput: boolean = false;
  @Prop fileName: string = '';
  @Prop @Watch('loadImportOptions') packagePresets: ImportAnkiPackageOptions | null = null;
  @State private importOptions: ImportAnkiPackageOptions = DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS;
  @State private csvDraft: CsvMetadata | null = null;
  onCancel: () => void = (): void => {};
  onReparse: (delimiter: number, notetypeId: number) => void = (_delimiter: number, _notetypeId: number): void => {};
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 模式: 数据迁移模式 = 'exportDeck';
  @State private 已选导出牌组Id: number = 0;
  @State private 包含调度信息: boolean = true;
  @State private 包含牌组配置: boolean = true;
  @State private 包含媒体: boolean = true;
  @State private 旧版兼容: boolean = false;
  @State private 已确认替换个人数据: boolean = false;
  @State private exportFormat: number = 0;
  @State private textWithHtml: boolean = true;
  @State private textWithTags: boolean = true;
  @State private textWithDeck: boolean = true;
  @State private textWithNotetype: boolean = true;
  @State private textWithGuid: boolean = true;
  onIntent: (意图: 数据迁移意图) => void = (_意图: 数据迁移意图): void => {};
  onClose: () => void = (): void => {};

  aboutToAppear(): void {
    this.loadImportOptions();
    this.模式 = this.initialMode;
    this.已选导出牌组Id = this.deckId;
    if (this.已选导出牌组Id <= 0 && this.deckOptions.length > 0) {
      this.已选导出牌组Id = this.deckOptions[0].id;
    }
  }

  private syncMode(): void { this.模式 = this.initialMode; this.csvDraft = null; }

  private loadImportOptions(): void {
    if (this.packagePresets !== null) this.importOptions = copyImportAnkiPackageOptions(this.packagePresets);
  }

  private 已选牌组索引(): number {
    const 索引 = this.deckOptions.findIndex((牌组: 导出牌组选项): boolean => 牌组.id === this.已选导出牌组Id);
    return 索引 < 0 ? 0 : 索引;
  }

  // 官方 Select 文档：selected 仅控制菜单初始高亮，按钮文本需由 value 提供，否则框内空白
  private 已选牌组名称(): string {
    for (const 牌组 of this.deckOptions) {
      if (牌组.id === this.已选导出牌组Id) {
        return 牌组.name;
      }
    }
    return '';
  }

  private 牌组下拉选项(): 牌组选择项[] {
    return this.deckOptions.map((牌组: 导出牌组选项): 牌组选择项 => {
      const 选项 = new 牌组选择项();
      选项.value = 牌组.name;
      return 选项;
    });
  }

  // 官方 Select 文档：selected 仅控制菜单初始高亮，按钮文本需由 value 提供，否则框内空白。
  // value 必须传 string：传 Resource 时按钮文本不显示（同 高级牌组选项面板 同款 bug）。
  private 解析文本(资源: Resource, _locale: string = this.uiLanguage): string { return resourceText(this.getUIContext(), 资源); }
  private 模式标签(模式: 数据迁移模式): string {
    if (模式 === 'importFile') return this.解析文本($r('app.string.transfer_import_file'));
    if (模式 === 'importText') return this.解析文本($r('app.string.transfer_import_text'));
    if (模式 === 'exportDeck') return this.解析文本($r('app.string.transfer_export_deck'));
    if (模式 === 'exportPersonalData') return this.解析文本($r('app.string.transfer_export_personal'));
    if (模式 === 'importDeck') return this.解析文本($r('app.string.transfer_import_deck'));
    return this.解析文本($r('app.string.transfer_import_personal'));
  }

  private 副标题(): string {
    if (this.模式 === 'importFile') return this.解析文本($r('app.string.transfer_import_file_hint'));
    if (this.模式 === 'importText') return this.解析文本($r('app.string.transfer_csv_subtitle'));
    if (this.模式 === 'exportDeck') return this.解析文本($r('app.string.transfer_subtitle_export_deck'));
    if (this.模式 === 'exportPersonalData') return this.解析文本($r('app.string.transfer_subtitle_export_personal'));
    if (this.模式 === 'importDeck') return this.解析文本($r('app.string.transfer_subtitle_import_deck'));
    return this.解析文本($r('app.string.transfer_subtitle_import_personal'));
  }

  private 主按钮文案(): string {
    if (this.result !== null) return this.解析文本($r('app.string.close'));
    if (this.模式 === 'importFile') return this.解析文本($r('app.string.transfer_csv_choose'));
    if (this.模式 === 'importText') return this.解析文本(this.csv === null ?
      $r('app.string.transfer_csv_choose') : $r('app.string.transfer_csv_submit'));
    if (this.模式 === 'importDeck') return this.解析文本($r('app.string.transfer_import_deck_merge'));
    if (this.模式 === 'importPersonalData') {
      return this.personalReplacementStep === 0
        ? this.解析文本($r('app.string.transfer_confirm_personal'))
        : this.解析文本($r('app.string.transfer_replace_personal'));
    }
    return this.解析文本($r('app.string.continue'));
  }

  private 忙碌文案(): string {
    if (this.loadingPresets) return this.解析文本($r('app.string.transfer_loading_presets'));
    if (this.picking) return this.解析文本($r('app.string.transfer_selecting_file'));
    if (this.模式 === 'exportDeck' || this.模式 === 'exportPersonalData') {
      return this.解析文本($r('app.string.transfer_exporting'));
    }
    return this.解析文本($r('app.string.transfer_importing'));
  }

  // 阶段文案：根据 模式 + stage 返回对应文字；stage < 0 时回退到通用 忙碌文案
  private 阶段文案(): string {
    if (this.cancelRequested) return this.解析文本($r('app.string.transfer_cancelling'));
    if (this.progress.text !== '') return this.progress.text;
    if (this.stage < 0) return this.忙碌文案();
    if (this.模式 === 'importDeck' || this.模式 === 'importText') {
      if (this.stage === 0) return this.解析文本($r('app.string.transfer_stage_prepare_file'));
      if (this.stage === 1) return this.解析文本($r('app.string.transfer_stage_import_data'));
      if (this.stage === 2) return this.解析文本($r('app.string.transfer_stage_refresh_list'));
    } else if (this.模式 === 'exportDeck' || this.模式 === 'exportPersonalData') {
      if (this.stage === 0) return this.解析文本($r('app.string.transfer_stage_export_data'));
      if (this.stage === 1) return this.解析文本($r('app.string.transfer_stage_save_file'));
    } else if (this.模式 === 'importPersonalData') {
      if (this.stage === 0) return this.解析文本($r('app.string.transfer_stage_prepare_file'));
      if (this.stage === 1) return this.解析文本($r('app.string.transfer_stage_close_db'));
      if (this.stage === 2) return this.解析文本($r('app.string.transfer_stage_import_data'));
      if (this.stage === 3) return this.解析文本($r('app.string.transfer_stage_restore_db'));
      if (this.stage === 4) return this.解析文本($r('app.string.transfer_stage_refresh_list'));
    }
    return this.忙碌文案();
  }

  private legacyHelp: CustomDialogController = new CustomDialogController({
    builder: 字段帮助对话框({ 标题: $r('app.string.transfer_legacy'), 正文: $r('app.string.transfer_legacy_help') }),
    customStyle: true, autoCancel: true, alignment: DialogAlignment.Center,
    width: '100%', height: '100%', maskColor: Color.Transparent
  });

  aboutToDisappear(): void { this.legacyHelp.close(); }

  private 打开旧版帮助(): void {
    if (!this.busy) this.legacyHelp.open();
  }

  private 可提交(): boolean {
    if (this.result !== null) return true;
    if (this.模式 === 'importDeck') return this.packagePresets !== null;
    if (this.模式 === 'importText' && this.csv !== null) return this.csvDraft !== null && validateCsvMapping(this.csvDraft);
    if (this.模式 === 'exportDeck') return this.已选导出牌组Id > 0;
    if (this.模式 === 'importPersonalData') return this.已确认替换个人数据;
    return true;
  }

  private 提交(): void {
    if (this.busy) return;
    if (this.result !== null) { this.onClose(); return; }
    if (this.模式 === 'importFile' || (this.模式 === 'importText' && this.csv === null)) {
      this.onIntent({ kind: 'chooseImportFile' }); return;
    }
    if (this.模式 === 'importText') {
      this.onIntent({ kind: 'importText', metadata: this.csv === null ? undefined : this.csvDraft ?? this.csv.metadata });
      return;
    }
    if (this.模式 === 'exportDeck') {
      if (this.已选导出牌组Id <= 0) return;
      if (this.exportFormat > 0) {
        this.onIntent({ kind: 'exportText', deckId: this.已选导出牌组Id,
          options: { kind: this.exportFormat === 1 ? 'notes' : 'cards', withHtml: this.textWithHtml,
            withTags: this.textWithTags, withDeck: this.textWithDeck, withNotetype: this.textWithNotetype,
            withGuid: this.textWithGuid } });
        return;
      }
      const 选项: 牌组导出选项 = {
        withScheduling: this.包含调度信息, withDeckConfigs: this.包含牌组配置,
        withMedia: this.包含媒体, legacy: this.旧版兼容
      };
      const 意图: 导出牌组意图 = { kind: 'exportDeck', deckId: this.已选导出牌组Id, options: 选项 };
      this.onIntent(意图);
      return;
    }
    if (this.模式 === 'exportPersonalData') {
      const 选项: 整库导出选项 = { includeMedia: this.包含媒体, legacy: this.旧版兼容 };
      const 意图: 导出个人数据意图 = { kind: 'exportPersonalData', options: 选项 };
      this.onIntent(意图);
      return;
    }
    if (this.模式 === 'importDeck') {
      if (this.packagePresets === null) return;
      const 意图: 导入牌组意图 = { kind: 'importDeck', options: this.importOptions };
      this.onIntent(意图);
      return;
    }
    if (this.已确认替换个人数据) {
      const 意图: 替换个人数据意图 = { kind: 'replacePersonalData', confirmed: true };
      this.onIntent(意图);
    }
  }

  // 选项行：label 左侧 layoutWeight(1) 撑满 + Toggle 右侧
  @Builder
  选项行(标签: string, 是否开启: boolean, 改变回调: (值: boolean) => void) {
    Row() {
      Text(标签)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
      Toggle({ type: ToggleType.Switch, isOn: 是否开启 })
        .selectedColor(this.主色按钮背景)
        .onChange(改变回调)
    }
    .width('100%')
  }

  private errorText(): string {
    if (this.errorMessage === 'transfer_file_unsupported') return this.解析文本($r('app.string.transfer_file_unsupported'));
    if (this.errorMessage === 'transfer_space_insufficient') return this.解析文本($r('app.string.transfer_space_insufficient'));
    if (this.errorMessage === 'transfer_csv_mapping_invalid') return this.解析文本($r('app.string.transfer_csv_mapping_invalid'));
    if (this.errorMessage === 'transfer_recovery_pending' || this.errorMessage === 'transfer_recovery_incomplete') {
      return this.解析文本($r('app.string.transfer_recovery_error'));
    }
    return this.errorMessage;
  }

  @Builder
  private panelHeader() {
    DialogHeader({
      title: this.模式标签(this.模式),
      actionLabel: this.主按钮文案(), actionEnabled: !this.busy && this.可提交(),
      closeLabel: this.busy ? $r('app.string.transfer_cancel_action') : $r('app.string.create_deck_cancel'),
      closeEnabled: !this.busy || (this.progress.cancellable && !this.cancelRequested),
      onClose: (): void => { if (this.busy) this.onCancel(); else this.onClose(); },
      onAction: (): void => { this.提交(); }
    })
  }

  @Builder
  private operationProgress() {
      // 取消与执行并排，执行期间保持原有禁用条件。

      // === busy LoadingProgress + 文案 ===
      if (this.busy) {
        Row({ space: 应用尺寸.间距_8 }) {
          LoadingProgress()
            .width(20)
            .height(20)
            .color($r('app.color.action_primary'))
          Text(this.阶段文案())
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_secondary'))
        }
        .width('100%')
        .justifyContent(FlexAlign.Center)
      }
      if (this.busy && this.progress.total > 0) {
        Progress({ value: this.progress.processed, total: this.progress.total, type: ProgressType.Linear }).width('100%')
        Text(Math.min(100, Math.floor(this.progress.processed * 100 / this.progress.total)).toString() + '%')
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      }
  }

  @Builder
  private panelContent() {
    if (this.busy) {
      this.operationProgress()
    } else if (this.result !== null) {
      ImportResult({ summary: this.result })
    } else {
          Text(this.副标题())
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_secondary'))
            .margin({ top: 应用尺寸.间距_4 })

      if (this.fileName !== '') {
        Text(this.fileName).fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_primary')).width('100%')
      }

      // === 牌组选择（仅 exportDeck 且允许选牌）===
      if (this.模式 === 'exportDeck' && this.allowDeckSelection) {
        Row({ space: 应用尺寸.间距_12 }) {
          Text(this.解析文本($r('app.string.transfer_label_deck')))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .layoutWeight(1)
          Select(this.牌组下拉选项())
            .selected(this.已选牌组索引())
            .value(this.已选牌组名称())
            .width(SelectStyle.fieldWidth).constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
            .enabled(!this.busy && this.deckOptions.length > 0)
            .attributeModifier(new SelectStyle())
            .height(SelectStyle.controlHeight)
            .padding(SelectStyle.controlPadding)
            .space(SelectStyle.controlSpace)
            .font(SelectStyle.controlFont)
            .optionFont(SelectStyle.optionFont)
            .selectedOptionFont(SelectStyle.selectedOptionFont)
            .textModifier(SelectStyle.labelText())
            .borderRadius(SelectStyle.controlRadius).border(SelectStyle.controlBorder)
            .onSelect((索引: number): void => {
              this.已选导出牌组Id = this.deckOptions[索引].id;
            })
        }
        .width('100%')
      }

      if (this.模式 === 'importDeck' && this.packagePresets !== null) {
        PackageImportOptions({ options: this.importOptions, isInteractive: !this.busy, isDark: this.isDark,
          onChange: (options: ImportAnkiPackageOptions): void => { this.importOptions = options; } })
      }
      if (this.模式 === 'importText' && this.csv !== null) {
        CsvImportOptions({ preview: this.csv, decks: this.deckOptions, isInteractive: !this.busy, isDark: this.isDark,
          onChange: (metadata: CsvMetadata): void => { this.csvDraft = metadata; }, onReparse: this.onReparse })
      }
      if (this.模式 === 'exportDeck') {
        FormSelectRow({ label: $r('app.string.transfer_export_format'), options: [
          { value: this.解析文本($r('app.string.transfer_format_apkg')) },
          { value: this.解析文本($r('app.string.transfer_format_notes')) },
          { value: this.解析文本($r('app.string.transfer_format_cards')) }
        ], selectedIndex: this.exportFormat, value: this.解析文本(this.exportFormat === 0 ? $r('app.string.transfer_format_apkg') :
          this.exportFormat === 1 ? $r('app.string.transfer_format_notes') : $r('app.string.transfer_format_cards')),
          isInteractive: !this.busy, onSelect: (index: number): void => { this.exportFormat = index; } })
        if (this.exportFormat > 0) {
          Text($r('app.string.transfer_text_export_hint')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary')).width('100%')
          SettingsToggleRow({ title: $r('app.string.transfer_text_html'), isOn: this.textWithHtml, isDark: this.isDark, isInteractive: !this.busy,
            onChange: (value: boolean): void => { this.textWithHtml = value; } })
          if (this.exportFormat === 1) {
            SettingsToggleRow({ title: $r('app.string.transfer_text_tags'), isOn: this.textWithTags, isDark: this.isDark, isInteractive: !this.busy,
              onChange: (value: boolean): void => { this.textWithTags = value; } })
            SettingsToggleRow({ title: $r('app.string.transfer_text_deck'), isOn: this.textWithDeck, isDark: this.isDark, isInteractive: !this.busy,
              onChange: (value: boolean): void => { this.textWithDeck = value; } })
            SettingsToggleRow({ title: $r('app.string.transfer_text_notetype'), isOn: this.textWithNotetype, isDark: this.isDark, isInteractive: !this.busy,
              onChange: (value: boolean): void => { this.textWithNotetype = value; } })
            SettingsToggleRow({ title: $r('app.string.transfer_text_guid'), isOn: this.textWithGuid, isDark: this.isDark, isInteractive: !this.busy,
              onChange: (value: boolean): void => { this.textWithGuid = value; } })
          }
        }
      }
      // === 导出选项（默认展开，label+Toggle 同行）===
      if ((this.模式 === 'exportDeck' && this.exportFormat === 0) || this.模式 === 'exportPersonalData') {
        Column({ space: 应用尺寸.间距_8 }) {
          if (this.模式 === 'exportDeck') {
            this.选项行(this.解析文本($r('app.string.transfer_include_scheduling')),
              this.包含调度信息, (值: boolean) => { this.包含调度信息 = 值; })
            Text($r('app.string.card_mark_export_hint')).fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
            this.选项行(this.解析文本($r('app.string.transfer_include_deck_configs')),
              this.包含牌组配置, (值: boolean) => { this.包含牌组配置 = 值; })
          }
          this.选项行(this.解析文本($r('app.string.transfer_include_media')),
            this.包含媒体, (值: boolean) => { this.包含媒体 = 值; })
          Row() {
            HelpLabel({ title: $r('app.string.transfer_legacy'), textSize: 应用尺寸.字号_正文,
              isHelpEnabled: !this.busy, onHelp: (): void => { this.打开旧版帮助(); }
            }).layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.旧版兼容 })
              .selectedColor(this.主色按钮背景)
              .onChange((值: boolean) => { this.旧版兼容 = 值; })
          }
          .width('100%')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
      }

      // === 个人数据替换警告（红色背景 + ⚠ + 勾选确认）===
      if (this.模式 === 'importPersonalData') {
        Column({ space: 应用尺寸.间距_8 }) {
          Row({ space: 应用尺寸.间距_8 }) {
            SymbolGlyph($r('sys.symbol.exclamationmark_triangle'))
              .fontSize(应用尺寸.字号_标题)
              .fontColor([$r('app.color.error_text')]).accessibilityLevel('no')
            Text(this.解析文本($r('app.string.transfer_personal_replace_warning')))
              .fontSize(应用尺寸.字号_正文_中)
              .fontColor($r('app.color.error_text'))
              .layoutWeight(1)
          }
          .width('100%')
          Row() {
            Text(this.解析文本($r('app.string.transfer_acknowledge_personal')))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .layoutWeight(1)
            Toggle({ type: ToggleType.Checkbox, isOn: this.已确认替换个人数据 })
              .selectedColor(this.主色按钮背景)
              .onChange((是否开启: boolean) => { this.已确认替换个人数据 = 是否开启; })
          }
          .width('100%')
        }
        .width('100%')
        .padding(应用尺寸.间距_12)
        .backgroundColor($r('app.color.surface_page'))
        .borderRadius(应用尺寸.圆角_面板).border(SurfaceBorder.options())
      }

      // === 错误信息（红字）===
      if (this.errorMessage !== '') {
        Text(this.errorText())
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.error_text'))
          .width('100%')
      }

      if (this.cancelled) {
        Text($r('app.string.transfer_cancelled')).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary'))
      }

    }
  }

  build() {
    DialogFrame({ canDismiss: !this.busy, onDismiss: (): void => { this.onClose(); },
      header: () => { this.panelHeader(); }, content: () => { this.panelContent(); } })
  }
}
