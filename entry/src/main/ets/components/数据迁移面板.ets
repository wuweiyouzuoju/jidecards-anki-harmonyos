// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-DATA-TRANSFER-001
// @名称 数据迁移面板
//
// @作用
// 纯展示层数据管理面板：覆盖 4 种迁移模式（导出牌组 / 导出个人数据 /
// 导入牌组 / 替换个人数据），通过模式切换下拉选择目标动作，配置导出选项
// （调度信息 / 牌组配置 / 媒体 / 旧版兼容），提交时上抛 数据迁移意图 由
// 父级处理文件与后端调用。文件与后端工作不落在本组件。
//
// @输入
// deckId: 当前牌组 ID（导出牌组模式默认选中）
// initialMode: 初始模式（exportDeck / exportPersonalData / importDeck / importPersonalData）
// deckOptions: 牌组候选列表（允许选牌时显示）
// allowDeckSelection: 是否允许选牌
// busy: 父级是否正在落盘
// errorMessage: 父级下发的错误文案
// personalReplacementStep: 替换个人数据进度（0=未确认 / 1=已确认待执行）
// stage: busy 期间阶段编号（-1 表示无阶段文案）
// isDark: 是否深色主题
//
// @输出
// onIntent: 提交时回调，参数为 数据迁移意图（4 种之一）
// onClose: 取消时回调
//
// @业务规则
// 测试断言保留：mode / selectedExportDeckId / includeScheduling /
// includeDeckConfigs / includeMedia / legacy / personalReplacementAcknowledged /
// primaryButtonColor / modeSelectOptions / modeSelectIndex / selectedDeckIndex /
// selectedDeckName / deckSelectOptions / optionRow / resolveText / modeLabel /
// subtitle / primaryButtonLabel / busyLabel / stageLabel / openLegacyHelp /
// canSubmit / submit 等字面符号由阶段 6 统一更新；本阶段保留以减小工作量。
// 字面量字符串值 'exportDeck' | 'exportPersonalData' | 'importDeck' |
// 'importPersonalData' | 'replacePersonalData' 作为意图 kind 协议值保留英文，
// 与父级 handleDataTransfer 的 switch 分支耦合。
// 资源 key（transfer_* / continue / close / field_help_button / done 等）
// 作为 i18n 键保留英文。
// 牌组导出选项 / 整库导出选项 字段（withScheduling / withDeckConfigs /
// withMedia / legacy / includeMedia）作为依赖层 DTO 字段保留英文。
//
// @副作用
// 仅通过外部回调引发后端写入与文件操作；本组件不直接落盘。
// ========================================================

import type { 整库导出选项, 牌组导出选项 } from '../model/数据传输模型';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 设置面板色板_取 } from '../utils/设置面板配色';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import { 颜色键 } from '../model/颜色主题';

export type 数据迁移模式 = 'exportDeck' | 'exportPersonalData' | 'importDeck' | 'importPersonalData';

export interface 导出牌组选项 {
  id: number;
  name: string;
}

export interface 导出牌组意图 {
  kind: 'exportDeck';
  deckId: number;
  options: 牌组导出选项;
}

export interface 导出个人数据意图 {
  kind: 'exportPersonalData';
  options: 整库导出选项;
}

export interface 导入牌组意图 {
  kind: 'importDeck';
}

export interface 替换个人数据意图 {
  kind: 'replacePersonalData';
  confirmed: true;
}

export type 数据迁移意图 = 导出牌组意图 | 导出个人数据意图 | 导入牌组意图 | 替换个人数据意图;

class 牌组选择项 {
  value: string = '';
}

const 迁移模式列表: 数据迁移模式[] = ['exportDeck', 'exportPersonalData', 'importDeck', 'importPersonalData'];

/** Presentation-only data management panel. File and backend work stay with its owner. */
@Component
export struct 数据迁移面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop deckId: number = 0;
  @Prop initialMode: 数据迁移模式 = 'exportDeck';
  @Prop deckOptions: 导出牌组选项[] = [];
  @Prop allowDeckSelection: boolean = false;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop personalReplacementStep: number = 0;
  @Prop stage: number = -1;
  @Prop isDark: boolean = false;
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 模式: 数据迁移模式 = 'exportDeck';
  @State private 已选导出牌组Id: number = 0;
  @State private 包含调度信息: boolean = true;
  @State private 包含牌组配置: boolean = true;
  @State private 包含媒体: boolean = true;
  @State private 旧版兼容: boolean = false;
  @State private 已确认替换个人数据: boolean = false;
  onIntent: (意图: 数据迁移意图) => void = (_意图: 数据迁移意图): void => {};
  onClose: () => void = (): void => {};

  aboutToAppear(): void {
    this.模式 = this.initialMode;
    this.已选导出牌组Id = this.deckId;
    if (this.已选导出牌组Id <= 0 && this.deckOptions.length > 0) {
      this.已选导出牌组Id = this.deckOptions[0].id;
    }
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
  private 解析文本(资源: Resource): string { return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id); }
  private 模式标签(模式: 数据迁移模式): string {
    if (模式 === 'exportDeck') return this.解析文本($r('app.string.transfer_export_deck'));
    if (模式 === 'exportPersonalData') return this.解析文本($r('app.string.transfer_export_personal'));
    if (模式 === 'importDeck') return this.解析文本($r('app.string.transfer_import_deck'));
    return this.解析文本($r('app.string.transfer_import_personal'));
  }

  private 副标题(): string {
    if (this.模式 === 'exportDeck') return this.解析文本($r('app.string.transfer_subtitle_export_deck'));
    if (this.模式 === 'exportPersonalData') return this.解析文本($r('app.string.transfer_subtitle_export_personal'));
    if (this.模式 === 'importDeck') return this.解析文本($r('app.string.transfer_subtitle_import_deck'));
    return this.解析文本($r('app.string.transfer_subtitle_import_personal'));
  }

  private 主按钮文案(): string {
    if (this.模式 === 'importDeck') return this.解析文本($r('app.string.transfer_import_deck_merge'));
    if (this.模式 === 'importPersonalData') {
      return this.personalReplacementStep === 0
        ? this.解析文本($r('app.string.transfer_confirm_personal'))
        : this.解析文本($r('app.string.transfer_replace_personal'));
    }
    return this.解析文本($r('app.string.continue'));
  }

  private 忙碌文案(): string {
    if (this.模式 === 'exportDeck' || this.模式 === 'exportPersonalData') {
      return this.解析文本($r('app.string.transfer_exporting'));
    }
    return this.解析文本($r('app.string.transfer_importing'));
  }

  // 阶段文案：根据 模式 + stage 返回对应文字；stage < 0 时回退到通用 忙碌文案
  private 阶段文案(): string {
    if (this.stage < 0) return this.忙碌文案();
    if (this.模式 === 'importDeck') {
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

  /** 弹出 AlertDialog 说明「旧版兼容」含义：何时启用、代价是什么 */
  private 打开旧版帮助(): void {
    this.getUIContext().showAlertDialog({
      title: this.解析文本($r('app.string.transfer_legacy')),
      message: this.解析文本($r('app.string.transfer_legacy_help')),
      autoCancel: true,
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: this.解析文本($r('app.string.close')),
        action: (): void => {}
      }
    });
  }

  private 可提交(): boolean {
    if (this.模式 === 'exportDeck') return this.已选导出牌组Id > 0;
    if (this.模式 === 'importPersonalData') return this.已确认替换个人数据;
    return true;
  }

  private 提交(): void {
    if (this.模式 === 'exportDeck') {
      if (this.已选导出牌组Id <= 0) return;
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
      const 意图: 导入牌组意图 = { kind: 'importDeck' };
      this.onIntent(意图);
      return;
    }
    if (this.已确认替换个人数据) {
      const 意图: 替换个人数据意图 = { kind: 'replacePersonalData', confirmed: true };
      this.onIntent(意图);
    }
  }

  // 模式下拉选项：复用 牌组选择项，value 传 string（与牌组选择器同款）
  private 模式下拉选项(): 牌组选择项[] {
    return 迁移模式列表.map((模式: 数据迁移模式): 牌组选择项 => {
      const 选项 = new 牌组选择项();
      选项.value = this.模式标签(模式);
      return 选项;
    });
  }

  private 模式下拉索引(): number {
    const 索引 = 迁移模式列表.indexOf(this.模式);
    return 索引 < 0 ? 0 : 索引;
  }

  // 选项行：label 左侧 layoutWeight(1) 撑满 + Toggle 右侧
  @Builder 选项行(标签: string, 是否开启: boolean, 改变回调: (值: boolean) => void) {
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

  build() {
    Stack() {
      // B13 2026-07-22：磨砂玻璃遮罩层（Thin 比 Regular/Thick 更轻薄，避免磨砂过厚）
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(设置面板色板_取(this.isDark).遮罩)
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => { if (!this.busy) this.onClose(); })
        // 过渡仅动 opacity/translate/scale 合成属性，不触发布局（思路参考：华为官方 TransitionEffect 示例）
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_12 }) {
      // === Header：标题 + 副标题 + 右上角 × ===
      DialogHeader({
        title: this.解析文本($r('app.string.transfer_panel_title')),
        actionLabel: this.主按钮文案(),
        actionEnabled: !this.busy && (this.模式 !== 'exportDeck' || this.已选导出牌组Id > 0) &&
            (this.模式 !== 'importPersonalData' || this.已确认替换个人数据),
        closeLabel: $r('app.string.create_deck_cancel'),
        closeEnabled: !this.busy,
        onClose: (): void => { this.onClose(); },
        onAction: () => this.提交()
      })
          Text(this.副标题())
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_secondary'))
            .margin({ top: 应用尺寸.间距_4 })

      // === 模式选择下拉（单 Select 替代原 4 个横排 Tab，避免宽屏越界）===
      Select(this.模式下拉选项())
        .selected(this.模式下拉索引())
        .value(this.模式标签(this.模式))
        .width('100%')
        .enabled(!this.busy)
        .attributeModifier(new SelectStyle())
        .font(SelectStyle.controlFont)
        .borderRadius(SelectStyle.controlRadius)
        .onSelect((索引: number): void => {
          this.模式 = 迁移模式列表[索引];
        })

      // === 牌组选择（仅 exportDeck 且允许选牌）===
      if (this.模式 === 'exportDeck' && this.allowDeckSelection) {
        Row() {
          Text(this.解析文本($r('app.string.transfer_label_deck')))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .margin({ right: 应用尺寸.间距_8 })
          Select(this.牌组下拉选项())
            .selected(this.已选牌组索引())
            .value(this.已选牌组名称())
            .layoutWeight(1)
            .enabled(!this.busy && this.deckOptions.length > 0)
            .attributeModifier(new SelectStyle())
            .font(SelectStyle.controlFont)
            .borderRadius(SelectStyle.controlRadius)
            .onSelect((索引: number): void => {
              this.已选导出牌组Id = this.deckOptions[索引].id;
            })
        }
        .width('100%')
      }

      // === 导出选项（默认展开，label+Toggle 同行）===
      if (this.模式 === 'exportDeck' || this.模式 === 'exportPersonalData') {
        Column({ space: 应用尺寸.间距_8 }) {
          if (this.模式 === 'exportDeck') {
            this.选项行(this.解析文本($r('app.string.transfer_include_scheduling')),
              this.包含调度信息, (值: boolean) => { this.包含调度信息 = 值; })
            this.选项行(this.解析文本($r('app.string.transfer_include_deck_configs')),
              this.包含牌组配置, (值: boolean) => { this.包含牌组配置 = 值; })
          }
          this.选项行(this.解析文本($r('app.string.transfer_include_media')),
            this.包含媒体, (值: boolean) => { this.包含媒体 = 值; })
          // 旧版兼容 行单独写：加 ⓘ 帮助按钮，点击弹 AlertDialog 说明旧版兼容含义（用户决策 2026-07-24）
          Row() {
            Text(this.解析文本($r('app.string.transfer_legacy')))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .layoutWeight(1)
            Button() {
              Text() { ThemeTextSpans($r('app.string.field_help_button'), this.themeAccentColors, this.getUIContext()) }.fontColor(this.主色按钮背景).fontSize(应用尺寸.字号_正文)
            }
              .type(ButtonType.Normal)
              .backgroundColor(Color.Transparent)
              .fontColor(this.主色按钮背景)
              .fontSize(应用尺寸.字号_正文)
              .onClick(() => this.打开旧版帮助())
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
            Text('⚠')
              .fontSize(应用尺寸.字号_标题)
              .fontColor($r('app.color.error_text'))
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
        .backgroundColor('#FFEBEE')
        .borderRadius(应用尺寸.圆角_面板)
      }

      // === 错误信息（红字）===
      if (this.errorMessage !== '') {
        Text(this.errorMessage)
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.error_text'))
          .width('100%')
      }

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
    }
    .width('88%')
    // B12-Y2 2026-07-22：maxWidth 400 → 480（与 创建牌组面板/设置面板 等其他弹层一致）
    .constraintSize({ maxWidth: 480, maxHeight: '88%' })
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .borderRadius(应用尺寸.圆角_卡片)
    // 居中浮卡：缩放+淡入过渡（思路参考：华为官方 TransitionEffect 示例）
    .transition(TransitionEffect.asymmetric(
      TransitionEffect.opacity(0)
        .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
        .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
      TransitionEffect.opacity(0)
        .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
    ))
    }
  }
}
