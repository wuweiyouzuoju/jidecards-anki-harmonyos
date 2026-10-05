// SPDX-License-Identifier: AGPL-3.0-or-later
import { isSettingsItemVisible } from '../../model/SettingsStructure';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { DataActionRow } from './DataActionRow';
import { settingsIcon } from '../../utils/SettingsIcons';
import { SurfaceBorder } from '../../utils/SurfaceBorder';

import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 应用尺寸 } from '../../utils/应用尺寸';

// 数据操作按任务分流；备份入口汇集整库文件和自动历史备份。
@Component
export struct 数据分组 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop 是否深色: boolean = false;
  点击导入回调: () => void = (): void => {};
  点击导出回调: () => void = (): void => {};
  点击笔记类型回调: () => void = (): void => {};
  点击已隐藏牌组回调: () => void = (): void => {};
  // 简洁模式保留导入导出、隐藏牌组恢复、备份与媒体管理。
  @Prop 简洁模式: boolean = true;
  点击空卡回调: () => void = (): void => {};
  点击查找重复回调: () => void = (): void => {};
  点击清除未用标签回调: () => void = (): void => {};
  点击媒体管理回调: () => void = (): void => {};
  点击备份管理回调: () => void = (): void => {};
  @Prop databaseBusy: boolean = false;
  @Prop databaseChecked: boolean = false;
  @Prop databaseError: string = '';
  @Prop databaseProblems: string[] = [];
  onCheckDatabase: () => void = (): void => {};
  onDatabaseHelp: () => void = (): void => {};

  build() {
    Column() {
      DataActionRow({ title: settingsItemText(this.getUIContext(), 'import', this.uiLanguage),
        hint: $r('app.string.transfer_import_file_hint'), icon: settingsIcon('import'),
        onAction: this.点击导入回调 })
      DataActionRow({ title: settingsItemText(this.getUIContext(), 'export_deck', this.uiLanguage),
        hint: $r('app.string.transfer_subtitle_export_deck'), icon: settingsIcon('export_deck'),
        onAction: this.点击导出回调 })
      DataActionRow({ title: settingsItemText(this.getUIContext(), 'backups', this.uiLanguage),
        hint: $r('app.string.backup_hub_hint'), icon: settingsIcon('backups'),
        onAction: this.点击备份管理回调 })
      if (isSettingsItemVisible('notetypes', this.简洁模式, true)) {
        DataActionRow({ title: settingsItemText(this.getUIContext(), 'notetypes', this.uiLanguage),
          hint: $r('app.string.notetype_mgmt_entry_subtitle'), icon: settingsIcon('notetypes'),
          onAction: this.点击笔记类型回调 })
      }
      // 简洁版与实验版都展示隐藏牌组入口，也必须能恢复。
      DataActionRow({ title: settingsItemText(this.getUIContext(), 'hidden_decks', this.uiLanguage),
        hint: $r('app.string.hidden_decks_entry_subtitle'), icon: settingsIcon('hidden_decks'),
        onAction: this.点击已隐藏牌组回调 })
      // 媒体管理行：检查未使用/缺失媒体 + 回收站操作。
      DataActionRow({ title: settingsItemText(this.getUIContext(), 'media_management', this.uiLanguage),
        hint: $r('app.string.settings_media_management_subtitle'), icon: settingsIcon('media_management'),
        onAction: this.点击媒体管理回调 })
      if (isSettingsItemVisible('check_database', this.简洁模式, true)) {
        DataActionRow({ title: this.databaseBusy ? $r('app.string.check_db_running') : $r('app.string.check_db_title'),
          hint: $r('app.string.check_db_hint'), icon: settingsIcon('check_database'),
          isInteractive: !this.databaseBusy, showHelp: true, onHelp: this.onDatabaseHelp,
          onAction: (): void => { this.onCheckDatabase(); } })
        if (this.databaseError !== '') {
          Text(this.databaseError).fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).错误色)
            .width('100%').padding({ bottom: 10 })
        } else if (this.databaseChecked) {
          Text(this.databaseProblems.length === 0 ? $r('app.string.check_db_passed') :
            $r('app.string.check_db_problems', this.databaseProblems.length))
            .fontSize(12).fontColor(设置面板色板_取(this.是否深色).次文字)
            .width('100%').padding({ bottom: 10 })
          ForEach(this.databaseProblems.slice(0, 3), (problem: string) => {
            Text(problem).fontSize(12).fontColor(设置面板色板_取(this.是否深色).次文字)
              .maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).width('100%')
          }, (problem: string): string => problem)
        }
      }
      if (isSettingsItemVisible('empty_cards', this.简洁模式, true)) {
        DataActionRow({ title: settingsItemText(this.getUIContext(), 'empty_cards', this.uiLanguage),
          hint: $r('app.string.empty_cards_entry_subtitle'), icon: settingsIcon('empty_cards'),
          onAction: this.点击空卡回调 })
      }
      if (isSettingsItemVisible('duplicate_notes', this.简洁模式, true)) {
        DataActionRow({ title: settingsItemText(this.getUIContext(), 'duplicate_notes', this.uiLanguage),
          hint: $r('app.string.find_dupes_entry_subtitle'), icon: settingsIcon('duplicate_notes'),
          onAction: this.点击查找重复回调 })
      }
      if (isSettingsItemVisible('unused_tags', this.简洁模式, true)) {
        DataActionRow({ title: settingsItemText(this.getUIContext(), 'unused_tags', this.uiLanguage),
          hint: $r('app.string.settings_clear_unused_tags_subtitle'), icon: settingsIcon('unused_tags'),
          onAction: this.点击清除未用标签回调 })
      }
    }
    .width('100%')
    .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距, top: 8, bottom: 8 })
    .backgroundColor(设置面板色板_取(this.是否深色).背景)
    .border(SurfaceBorder.options()).borderRadius(16)
  }
}
