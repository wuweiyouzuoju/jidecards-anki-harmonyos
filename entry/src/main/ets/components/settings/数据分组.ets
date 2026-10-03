// SPDX-License-Identifier: AGPL-3.0-or-later
import { isSettingsItemVisible } from '../../model/SettingsStructure';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { DataActionRow } from './DataActionRow';
import { PressFeedback } from '../../utils/PressFeedback';
import { HelpLabel } from '../common/HelpLabel';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { resourceText } from '../../utils/UiFeedback';

import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 应用尺寸 } from '../../utils/应用尺寸';

// 数据操作按任务分流；备份入口汇集整库文件和自动历史备份。
@Component
export struct 数据分组 {
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

  // @StorageProp 触发颜色主题切换时重 build，让 设置面板色板_取(是否深色).主色 即时变化
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  build() {
      Column() {
          DataActionRow({ title: settingsItemText(this.getUIContext(), 'import'), hint: $r('app.string.transfer_import_file_hint'),
            onAction: this.点击导入回调 })
          DataActionRow({ title: settingsItemText(this.getUIContext(), 'export_deck'), hint: $r('app.string.transfer_subtitle_export_deck'),
            onAction: this.点击导出回调 })
          DataActionRow({ title: settingsItemText(this.getUIContext(), 'backups'), hint: $r('app.string.backup_hub_hint'),
            onAction: this.点击备份管理回调 })

          // 管理笔记类型行（简洁模式下隐藏）
          if (isSettingsItemVisible('notetypes', this.简洁模式, true)) {
            Row() {
              Column({ space: 2 }) {
                Text(settingsItemText(this.getUIContext(), 'notetypes'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.notetype_mgmt_entry_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
            }
            .width('100%')
            .height(58)
            .attributeModifier(new PressFeedback()).onClick(() => {
              this.点击笔记类型回调();
            })
          }

          // 简洁版与实验版都展示隐藏牌组入口，也必须能恢复。
          Row() {
            Column({ space: 2 }) {
              Text(settingsItemText(this.getUIContext(), 'hidden_decks'))
                .fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Text($r('app.string.hidden_decks_entry_subtitle'))
                .fontSize(12)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .alignItems(HorizontalAlign.Start)
            Blank()
            DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
          }
          .width('100%')
          .height(58)
          .attributeModifier(new PressFeedback()).onClick(() => {
            this.点击已隐藏牌组回调();
          })

          // 媒体管理行：检查未使用/缺失媒体 + 回收站操作
          Row() {
            Column({ space: 2 }) {
              Text(settingsItemText(this.getUIContext(), 'media_management'))
                .fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Text($r('app.string.settings_media_management_subtitle'))
                .fontSize(12)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .alignItems(HorizontalAlign.Start)
            Blank()
            DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
          }
          .width('100%')
          .height(58)
          .attributeModifier(new PressFeedback()).onClick(() => {
            this.点击媒体管理回调();
          })

          if (isSettingsItemVisible('check_database', this.简洁模式, true)) {
          Row() {
              Column({ space: 2 }) {
                HelpLabel({ title: this.databaseBusy ? $r('app.string.check_db_running') : $r('app.string.check_db_title'),
                  textColor: 设置面板色板_取(this.是否深色).主文字,
                  onHelp: (): void => { this.onDatabaseHelp(); }
                })
                Text($r('app.string.check_db_hint'))
                  .fontSize(12).fontColor(设置面板色板_取(this.是否深色).弱化文字)
                  .maxLines(2)
              }.alignItems(HorizontalAlign.Start).layoutWeight(1)

            DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
          }.width('100%').constraintSize({ minHeight: 64 })
            .enabled(!this.databaseBusy)
            .attributeModifier(new PressFeedback()).onClick((): void => { this.onCheckDatabase(); })
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

          // 查找空卡行（简洁模式下隐藏）
          if (isSettingsItemVisible('empty_cards', this.简洁模式, true)) {
            Row() {
              Column({ space: 2 }) {
                Text(settingsItemText(this.getUIContext(), 'empty_cards'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.empty_cards_entry_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
            }
            .width('100%')
            .height(58)
            .attributeModifier(new PressFeedback()).onClick(() => {
              this.点击空卡回调();
            })
          }

          // 查找重复笔记行（简洁模式下隐藏）
          if (isSettingsItemVisible('duplicate_notes', this.简洁模式, true)) {
            Row() {
              Column({ space: 2 }) {
                Text(settingsItemText(this.getUIContext(), 'duplicate_notes'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.find_dupes_entry_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
            }
            .width('100%')
            .height(58)
            .attributeModifier(new PressFeedback()).onClick(() => {
              this.点击查找重复回调();
            })
          }

          // 清除未用标签行（简洁模式下隐藏）
          if (isSettingsItemVisible('unused_tags', this.简洁模式, true)) {
            Row() {
              Column({ space: 2 }) {
                Text(settingsItemText(this.getUIContext(), 'unused_tags'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.settings_clear_unused_tags_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              DisclosureChevron({ tint: 设置面板色板_取(this.是否深色).弱化文字 })
            }
            .width('100%')
            .height(58)
            .attributeModifier(new PressFeedback()).onClick(() => {
              this.点击清除未用标签回调();
            })
          }
      }
      .width('100%')
      .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距, top: 8, bottom: 8 })
      .backgroundColor(设置面板色板_取(this.是否深色).背景)
      .borderRadius(16)
  }
}
