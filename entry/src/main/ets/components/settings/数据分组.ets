// SPDX-License-Identifier: AGPL-3.0-or-later

import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 应用尺寸 } from '../../utils/应用尺寸';

// ========================================================
// @块ID UI-DATA-GROUP-001
// @名称 数据管理分组
//
// @作用
// 在同一列表展示导入导出、媒体和实验版维护工具；回调交由页面处理。
// 数据库检查状态由父组件下传；点「导出/导入数据」由父组件打开 DataTransferPanel，
// 用户在面板内 Select 下拉切换 exportDeck / exportPersonalData / importDeck / importPersonalData 四种模式。
// 点「清除未用标签」由父组件弹确认对话框并调后端。
// 点「查找空卡」由父组件打开 空卡列表面板。
//
// @输入
// 是否深色：当前是否深色模式（影响色板取值）。
// 点击导出导入回调 / 点击已隐藏牌组回调 / 点击空卡回调 / 点击清除未用标签回调：父组件注入。
//
// @输出
// 渲染数据管理分组卡片；用户点击行时触发对应回调。
//
// @副作用
// 无（点击行为由父组件处理）。
// ========================================================
@Component
export struct 数据分组 {
  @Prop 是否深色: boolean = false;
  点击导出导入回调: () => void = (): void => {};
  点击笔记类型回调: () => void = (): void => {};
  点击已隐藏牌组回调: () => void = (): void => {};
  // 简洁模式：true 时只显示导出导入+媒体管理，隐藏其余高级入口
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
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  build() {
      Column() {
          // 导出/导入数据行（合并原「导入数据」+「导出数据」两行；点开 DataTransferPanel 后用户在 Select 下拉切换四种模式）
          Row() {
            Column({ space: 2 }) {
              Text($r('app.string.settings_export_import_data'))
                .fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Text($r('app.string.settings_export_import_data_subtitle'))
                .fontSize(12)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .alignItems(HorizontalAlign.Start)
            Blank()
            Text('›')
              .fontSize(20)
              .fontColor(设置面板色板_取(this.是否深色).弱化文字)
          }
          .width('100%')
          .height(58)
          .onClick(() => {
            this.点击导出导入回调();
          })

          // 管理笔记类型行（简洁模式下隐藏）
          if (!this.简洁模式) {
            Row() {
              Column({ space: 2 }) {
                Text($r('app.string.notetype_mgmt_entry'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.notetype_mgmt_entry_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              Text('›')
                .fontSize(20)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .width('100%')
            .height(58)
            .onClick(() => {
              this.点击笔记类型回调();
            })
          }

          // 已隐藏牌组行（简洁模式下隐藏）
          if (!this.简洁模式) {
            Row() {
              Column({ space: 2 }) {
                Text($r('app.string.hidden_decks_entry'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.hidden_decks_entry_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              Text('›')
                .fontSize(20)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .width('100%')
            .height(58)
            .onClick(() => {
              this.点击已隐藏牌组回调();
            })
          }

          // 自动备份与恢复：Core 负责间隔、保留和实际归档；面板负责手动创建与安全恢复
          Row() {
            Column({ space: 2 }) {
              Text($r('app.string.backup_management_title'))
                .fontSize(15).fontColor(设置面板色板_取(this.是否深色).主文字)
              Text($r('app.string.backup_management_subtitle'))
                .fontSize(12).fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }.alignItems(HorizontalAlign.Start)
            Blank()
            Text('›').fontSize(20).fontColor(设置面板色板_取(this.是否深色).弱化文字)
          }.width('100%').height(58).onClick((): void => { this.点击备份管理回调(); })

          // 媒体管理行：检查未使用/缺失媒体 + 回收站操作
          Row() {
            Column({ space: 2 }) {
              Text($r('app.string.settings_media_management'))
                .fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Text($r('app.string.settings_media_management_subtitle'))
                .fontSize(12)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .alignItems(HorizontalAlign.Start)
            Blank()
            Text('›')
              .fontSize(20)
              .fontColor(设置面板色板_取(this.是否深色).弱化文字)
          }
          .width('100%')
          .height(58)
          .onClick(() => {
            this.点击媒体管理回调();
          })

          if (!this.简洁模式) {
          Row() {
              Column({ space: 2 }) {
                Row() {
                  Text(this.databaseBusy ? $r('app.string.check_db_running') : $r('app.string.check_db_title'))
                    .fontSize(15).fontColor(设置面板色板_取(this.是否深色).主文字)
                  Button($r('app.string.field_help_button'))
                    .type(ButtonType.Normal).backgroundColor(Color.Transparent)
                    .fontSize(14).fontColor(设置面板色板_取(this.是否深色).三级文字)
                    .width(28).height(28).padding(0)
                    .accessibilityText($r('app.string.check_db_title'))
                    .onClick((): void => { this.onDatabaseHelp(); })
                }
                Text($r('app.string.check_db_hint'))
                  .fontSize(12).fontColor(设置面板色板_取(this.是否深色).弱化文字)
                  .maxLines(2)
              }.alignItems(HorizontalAlign.Start)
            Blank()
            Text('›')
              .fontSize(20)
              .fontColor(设置面板色板_取(this.是否深色).弱化文字)
          }.width('100%').height(58)
            .enabled(!this.databaseBusy)
            .onClick((): void => { this.onCheckDatabase(); })
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
          if (!this.简洁模式) {
            Row() {
              Column({ space: 2 }) {
                Text($r('app.string.empty_cards_entry'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.empty_cards_entry_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              Text('›')
                .fontSize(20)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .width('100%')
            .height(58)
            .onClick(() => {
              this.点击空卡回调();
            })
          }

          // 查找重复笔记行（简洁模式下隐藏）
          if (!this.简洁模式) {
            Row() {
              Column({ space: 2 }) {
                Text($r('app.string.find_dupes_entry'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.find_dupes_entry_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              Text('›')
                .fontSize(20)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .width('100%')
            .height(58)
            .onClick(() => {
              this.点击查找重复回调();
            })
          }

          // 清除未用标签行（简洁模式下隐藏）
          if (!this.简洁模式) {
            Row() {
              Column({ space: 2 }) {
                Text($r('app.string.settings_clear_unused_tags'))
                  .fontSize(15)
                  .fontColor(设置面板色板_取(this.是否深色).主文字)
                Text($r('app.string.settings_clear_unused_tags_subtitle'))
                  .fontSize(12)
                  .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              }
              .alignItems(HorizontalAlign.Start)
              Blank()
              Text('›')
                .fontSize(20)
                .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            }
            .width('100%')
            .height(58)
            .onClick(() => {
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
