// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText } from '../utils/UiFeedback';
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-DECK-OPTIONS-001
// @名称 牌组选项面板
//
// @作用
// 牌组选项弹层：常用 4 项（每日新卡上限 / 每日复习上限 / 学习步幅 /
// 复习排序顺序）直接平铺；其余全部进入「高级设置」全屏磨砂覆盖层
// （高级牌组选项面板）。form/options 为引用共享，高级设置编辑后
// 回到本面板统一保存。
//
// @输入
// isDark: 是否深色主题
// deckName: 当前牌组显示名
// form: 牌组配置表单（@ObjectLink 引用共享）
// options: 牌组选项编辑（@ObjectLink 引用共享）
// busy: 父级是否正在落盘
// errorMessage: 父级下发的错误文案
//
// @输出
// onCancel: 取消回调
// onSave: 保存回调，参数为 form / options
//
// @业务规则
// 测试断言保留：showAdvanced / reviewOrderSelector / enumSelector /
// labeledInput 等字面符号由阶段 6 统一更新；本阶段保留以减小工作量。
// proto 字段名（newPerDay / reviewsPerDay / learnSteps / reviewOrder /
// fsrsParams4 等）作为依赖层 API 参数保留英文。
//
// @副作用
// 通过外部回调引发后端写入；本组件不直接落盘。
// ========================================================

import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 简洁模式AppStorage键 } from '../model/简洁模式存储';
import { 牌组配置表单 } from '../model/牌组配置表单';
import { 牌组选项编辑 } from '../model/牌组选项编辑';
import { 字段帮助面板 } from './字段帮助面板';
import { 高级牌组选项面板 } from './高级牌组选项面板';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import type { 校验问题 } from '../model/牌组配置表单';

interface 牌组枚举选项 { value: Resource; numericValue: number; }

@Component
export struct 牌组选项面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  @Prop deckName: string = '';
  @ObjectLink form: 牌组配置表单;
  @ObjectLink options: 牌组选项编辑;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  onCancel: () => void = (): void => {};
  onSave: (form: 牌组配置表单, options: 牌组选项编辑) => void = (_form: 牌组配置表单, _options: 牌组选项编辑): void => {};

  @State private showAdvanced: boolean = false;
  @State private showHelp: boolean = false;
  @State private helpTitle: ResourceStr = $r('app.string.deck_learn_steps');
  @State private helpBody: ResourceStr = $r('app.string.deck_learn_steps_help');
  @State private submitError: string = '';
  // 简洁模式：true 时不显示「高级设置」入口，仅保留常用 4 项
  @StorageLink(简洁模式AppStorage键) private 简洁模式: boolean = true;
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';
  @State private savePressed: boolean = false;
  // 复习排序顺序本地副本：@ObjectLink form 看不到 draft 内部字段变化，
  // 用本地 @State 承载 selectedReviewOrder，菜单选中后立即刷新触发器文本与 ✓ 标记
  @State private selectedReviewOrder: number = 0;

  aboutToAppear(): void {
    if (this.form !== null) {
      this.selectedReviewOrder = this.form.取配置().reviewOrder;
    }
  }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-002
  // @名称 打开帮助
  //
  // @作用
  // 设置帮助标题/正文并打开帮助浮层。
  //
  // @输入
  // title: 帮助标题资源
  // body: 帮助正文资源
  //
  // @输出
  // 写 helpTitle / helpBody / showHelp
  //
  // @副作用
  // 无。
  // ========================================================
  private openHelp(title: ResourceStr, body: ResourceStr): void {
    this.helpTitle = title;
    this.helpBody = body;
    this.showHelp = true;
  }

  /** 标题栏说明同时交代当前牌组与保存作用范围，避免表单前额外占用两行。 */
  private openScopeHelp(): void {
    const scope: ResourceStr = this.options.applyToSharedDecks
      ? $r('app.string.deck_save_scope_shared', this.options.sharedDeckCount)
      : $r('app.string.deck_save_scope_current');
    this.openHelp($r('app.string.deck_options_scope_help_title', this.deckName), scope);
  }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-003
  // @名称 是否可提交
  //
  // @作用
  // 校验 form 与 options 均无问题且非忙碌时返回 true。
  //
  // @输入
  // 无
  //
  // @输出
  // boolean
  //
  // @副作用
  // 无。
  // ========================================================
  private canSubmit(): boolean { return !this.busy && this.form.校验().length === 0 && this.options.校验().length === 0; }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-004
  // @名称 提交
  //
  // @作用
  // 合并校验 form 与 options；通过则触发 onSave，否则写 submitError。
  //
  // @输入
  // 无
  //
  // @输出
  // 触发 onSave 或写 submitError
  //
  // @副作用
  // 通过外部回调引发后端写入。
  // ========================================================
  private submit(): void {
    const 问题列表: 校验问题[] = this.form.校验().concat(this.options.校验());
    if (问题列表.length > 0) {
      this.submitError = this.字段错误文本(问题列表[0]);
      return;
    }
    this.submitError = '';
    this.onSave(this.form, this.options);
  }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-005
  // @名称 字段错误文本
  //
  // @作用
  // 把校验问题（含字段键与消息键）转成本地化文案。
  //
  // @输入
  // issue: 校验问题对象
  //
  // @输出
  // 本地化错误文案
  //
  // @副作用
  // 无。
  // ========================================================
  private 字段错误文本(issue: 校验问题): string {
    let resource: Resource = $r('app.string.deck_invalid_number_validation_error');
    switch (issue.消息键) {
      case 'deck_learn_steps_validation_error': resource = $r('app.string.deck_learn_steps_validation_error'); break;
      case 'deck_relearn_steps_validation_error': resource = $r('app.string.deck_relearn_steps_validation_error'); break;
      case 'deck_limit_validation_error': resource = $r('app.string.deck_limit_validation_error'); break;
      case 'deck_retention_validation_error': resource = $r('app.string.deck_retention_validation_error'); break;
      case 'deck_range_validation_error': resource = $r('app.string.deck_range_validation_error'); break;
      case 'deck_fsrs_parameters_validation_error': resource = $r('app.string.deck_fsrs_parameters_validation_error'); break;
      case 'deck_easy_days_validation_error': resource = $r('app.string.deck_easy_days_validation_error'); break;
      case 'deck_enum_validation_error': resource = $r('app.string.deck_enum_validation_error'); break;
      case 'deck_date_validation_error': resource = $r('app.string.deck_date_validation_error'); break;
      default: resource = $r('app.string.deck_invalid_number_validation_error'); break;
    }
    return resourceText(this.getUIContext(), resource);
  }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-006
  // @名称 取字段键
  //
  // @作用
  // 把标签 Resource 反查成 form/options 用的字段键字符串
  // （proto 字段名保留英文）。
  //
  // @输入
  // label: 字段标签资源
  //
  // @输出
  // 字段键字符串（如 'newPerDay'）；未命中返回空串
  //
  // @副作用
  // 无。
  // ========================================================
  private fieldKey(label: Resource): string { if (label.id === $r('app.string.deck_newPerDay_label').id) return 'newPerDay'; if (label.id === $r('app.string.deck_reviewsPerDay_label').id) return 'reviewsPerDay'; if (label.id === $r('app.string.deck_learnSteps_label').id) return 'learnSteps'; if (label.id === $r('app.string.deck_relearnSteps_label').id) return 'relearnSteps'; if (label.id === $r('app.string.deck_newPerDayMinimum_label').id) return 'newPerDayMinimum'; if (label.id === $r('app.string.deck_graduatingIntervalGood_label').id) return 'graduatingIntervalGood'; if (label.id === $r('app.string.deck_graduatingIntervalEasy_label').id) return 'graduatingIntervalEasy'; if (label.id === $r('app.string.deck_newCardInsertOrder_label').id) return 'newCardInsertOrder'; if (label.id === $r('app.string.deck_newCardGatherPriority_label').id) return 'newCardGatherPriority'; if (label.id === $r('app.string.deck_newCardSortOrder_label').id) return 'newCardSortOrder'; if (label.id === $r('app.string.deck_newMix_label').id) return 'newMix'; if (label.id === $r('app.string.deck_interdayLearningMix_label').id) return 'interdayLearningMix'; if (label.id === $r('app.string.deck_minimumLapseInterval_label').id) return 'minimumLapseInterval'; if (label.id === $r('app.string.deck_leechThreshold_label').id) return 'leechThreshold'; if (label.id === $r('app.string.deck_leechAction_label').id) return 'leechAction'; if (label.id === $r('app.string.deck_reviewOrder_label').id) return 'reviewOrder'; if (label.id === $r('app.string.deck_buryNew_label').id) return 'buryNew'; if (label.id === $r('app.string.deck_buryReviews_label').id) return 'buryReviews'; if (label.id === $r('app.string.deck_buryInterdayLearning_label').id) return 'buryInterdayLearning'; if (label.id === $r('app.string.deck_disableAutoplay_label').id) return 'disableAutoplay'; if (label.id === $r('app.string.deck_skipQuestionWhenReplayingAnswer_label').id) return 'skipQuestionWhenReplayingAnswer'; if (label.id === $r('app.string.deck_waitForAudio_label').id) return 'waitForAudio'; if (label.id === $r('app.string.deck_capAnswerTimeToSecs_label').id) return 'capAnswerTimeToSecs'; if (label.id === $r('app.string.deck_showTimer_label').id) return 'showTimer'; if (label.id === $r('app.string.deck_stopTimerOnAnswer_label').id) return 'stopTimerOnAnswer'; if (label.id === $r('app.string.deck_secondsToShowQuestion_label').id) return 'secondsToShowQuestion'; if (label.id === $r('app.string.deck_secondsToShowAnswer_label').id) return 'secondsToShowAnswer'; if (label.id === $r('app.string.deck_questionAction_label').id) return 'questionAction'; if (label.id === $r('app.string.deck_answerAction_label').id) return 'answerAction'; if (label.id === $r('app.string.deck_desiredRetention_label').id) return 'desiredRetention'; if (label.id === $r('app.string.deck_fsrsParams4_label').id) return 'fsrsParams4'; if (label.id === $r('app.string.deck_easyDaysPercentages_label').id) return 'easyDaysPercentages'; if (label.id === $r('app.string.deck_fsrsParams5_label').id) return 'fsrsParams5'; if (label.id === $r('app.string.deck_fsrsParams6_label').id) return 'fsrsParams6'; if (label.id === $r('app.string.deck_historicalRetention_label').id) return 'historicalRetention'; if (label.id === $r('app.string.deck_initialEase_label').id) return 'initialEase'; if (label.id === $r('app.string.deck_easyMultiplier_label').id) return 'easyMultiplier'; if (label.id === $r('app.string.deck_hardMultiplier_label').id) return 'hardMultiplier'; if (label.id === $r('app.string.deck_lapseMultiplier_label').id) return 'lapseMultiplier'; if (label.id === $r('app.string.deck_intervalMultiplier_label').id) return 'intervalMultiplier'; if (label.id === $r('app.string.deck_maximumReviewInterval_label').id) return 'maximumReviewInterval'; if (label.id === $r('app.string.deck_ignoreRevlogsBeforeDate_label').id) return 'ignoreRevlogsBeforeDate'; if (label.id === $r('app.string.deck_reviewLimit_label').id) return 'reviewLimit'; if (label.id === $r('app.string.deck_newLimit_label').id) return 'newLimit'; if (label.id === $r('app.string.deck_reviewToday_label').id) return 'reviewToday'; if (label.id === $r('app.string.deck_newToday_label').id) return 'newToday'; if (label.id === $r('app.string.deck_desiredRetentionOverride_label').id) return 'desiredRetentionOverride'; return ''; }

  private 校验问题列表(): 校验问题[] { const 输出: 校验问题[] = []; if (this.form !== null) 输出.push(...this.form.校验()); if (this.options !== null) 输出.push(...this.options.校验()); return 输出; }
  private 是否有字段错误(key: string): boolean { return this.校验问题列表().some((issue: 校验问题): boolean => issue.字段键 === key); }
  private 字段错误资源(key: string): Resource { const issue: 校验问题 | undefined = this.校验问题列表().find((item: 校验问题): boolean => item.字段键 === key); if (issue === undefined) return $r('app.string.deck_invalid_number_validation_error'); switch (issue.消息键) { case 'deck_learn_steps_validation_error': return $r('app.string.deck_learn_steps_validation_error'); case 'deck_relearn_steps_validation_error': return $r('app.string.deck_relearn_steps_validation_error'); case 'deck_limit_validation_error': return $r('app.string.deck_limit_validation_error'); case 'deck_retention_validation_error': return $r('app.string.deck_retention_validation_error'); case 'deck_range_validation_error': return $r('app.string.deck_range_validation_error'); case 'deck_fsrs_parameters_validation_error': return $r('app.string.deck_fsrs_parameters_validation_error'); case 'deck_easy_days_validation_error': return $r('app.string.deck_easy_days_validation_error'); case 'deck_enum_validation_error': return $r('app.string.deck_enum_validation_error'); case 'deck_date_validation_error': return $r('app.string.deck_date_validation_error'); default: return $r('app.string.deck_invalid_number_validation_error'); } }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-007
  // @名称 复习排序顺序选项
  //
  // @作用
  // 返回 13 项复习排序顺序选项（对齐 rslib ReviewOrder 枚举）。
  //
  // @输入
  // 无
  //
  // @输出
  // 牌组枚举选项[]
  //
  // @副作用
  // 无。
  // ========================================================
  private reviewOrderOptions(): 牌组枚举选项[] {
    return [
      { value: $r('app.string.deck_opt_day'), numericValue: 0 },
      { value: $r('app.string.deck_opt_day_deck'), numericValue: 1 },
      { value: $r('app.string.deck_opt_deck_day'), numericValue: 2 },
      { value: $r('app.string.deck_opt_interval_asc'), numericValue: 3 },
      { value: $r('app.string.deck_opt_interval_desc'), numericValue: 4 },
      { value: $r('app.string.deck_opt_ease_asc'), numericValue: 5 },
      { value: $r('app.string.deck_opt_ease_desc'), numericValue: 6 },
      { value: $r('app.string.deck_opt_retr_asc'), numericValue: 7 },
      { value: $r('app.string.deck_opt_random'), numericValue: 8 },
      { value: $r('app.string.deck_opt_added'), numericValue: 9 },
      { value: $r('app.string.deck_opt_reverse_added'), numericValue: 10 },
      { value: $r('app.string.deck_opt_retr_desc'), numericValue: 11 },
      { value: $r('app.string.deck_opt_relative'), numericValue: 12 }
    ];
  }
  // Resource 转 string：bindMenu 的 MenuElement.value 只接受 string，无法直接传 Resource
  private resolveText(resource: Resource): string { return resourceText(this.getUIContext(), resource); }
  private reviewOrderLabelString(value: number): string {
    const 选项 = this.reviewOrderOptions();
    for (let i = 0; i < 选项.length; i++) {
      if (选项[i].numericValue === value) return this.resolveText(选项[i].value);
    }
    return 选项.length > 0 ? this.resolveText(选项[0].value) : '';
  }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-008
  // @名称 带标签输入框
  //
  // @作用
  // 渲染一行带帮助按钮 + TextInput + 字段错误的字段编辑单元。
  //
  // @输入
  // label: 字段标签资源
  // text: 当前文本值
  // onChange: 文本变更回调
  // info: 帮助正文资源
  //
  // @输出
  // Column 子树
  //
  // @副作用
  // 无。
  // ========================================================
  @Builder
  private labeledInput(label: Resource, text: string, onChange: (value: string) => void, info: Resource) {
    Column({ space: 应用尺寸.间距_5 }) {
      Row({ space: 4 }) {
        Text(label).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).flexShrink(1)
        Button() {
          Text() { ThemeTextSpans($r('app.string.field_help_button'), this.themeAccentColors, this.getUIContext()) }.fontColor(this.动作主色)
        }.type(ButtonType.Normal).width(32).height(32).padding(0).flexShrink(0)
          .backgroundColor(Color.Transparent).fontColor(this.动作主色).onClick(() => this.openHelp(label, info))
      }.width('100%')
      TextInput({ text }).width('100%').height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_正文)
        .backgroundColor($r('app.color.surface_card')).border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') }).borderRadius(应用尺寸.圆角_面板).enabled(!this.busy).onChange(onChange)
      if (this.是否有字段错误(this.fieldKey(label))) Text(this.resolveText(this.字段错误资源(this.fieldKey(label)))).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
    }.width('100%')
  }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-009
  // @名称 复习排序选择器
  //
  // @作用
  // 复习排序选择器：Select 组件 + 横向 Row 布局，对齐添加笔记页「笔记类型」选择行
  // 与高级牌组选项面板 enumSelector 同款形态：帮助紧跟标签，Select 靠右。
  //
  // @输入
  // label: 字段标签资源
  // selected: 当前选中的 numericValue（来自 selectedReviewOrder @State）
  // help: 帮助正文资源
  //
  // @输出
  // Column 子树
  //
  // @业务规则
  // 2026-07-28 弃用原 bindMenu + 自定义触发器方案——用户要求统一为 Select 组件形态，
  // 接受 ▼ 箭头以换取与添加笔记页/高级设置 enumSelector 的视觉一致性。
  //
  // @副作用
  // 无。
  // ========================================================
  @Builder
  private reviewOrderSelector(label: Resource, selected: number, help: Resource) {
    Column({ space: 应用尺寸.间距_5 }) {
      Row() {
        Row({ space: 4 }) {
          Text(label)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor($r('app.color.text_secondary'))
            .flexShrink(1)
          Button() {
            Text() { ThemeTextSpans($r('app.string.field_help_button'), this.themeAccentColors, this.getUIContext()) }.fontColor(this.动作主色)
          }
            .type(ButtonType.Normal)
            .width(32).height(32).padding(0).flexShrink(0)
            .backgroundColor(Color.Transparent)
            .fontColor(this.动作主色)
            .enabled(!this.busy)
            .onClick(() => this.openHelp(label, help))
        }.layoutWeight(1)
        Select(this.reviewOrderOptions().map((项: 牌组枚举选项): SelectOption => ({ value: 项.value })))
          .selected(this.reviewOrderOptionIndex(selected))
          .value(this.reviewOrderLabelString(selected))
          .enabled(!this.busy)
          .attributeModifier(new SelectStyle())
          .font(SelectStyle.controlFont)
          .borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number) => {
            const 选项 = this.reviewOrderOptions();
            if (index >= 0 && index < 选项.length) {
              this.selectedReviewOrder = 选项[index].numericValue;
              if (this.form !== null) this.form.设置数值字段('reviewOrder', this.selectedReviewOrder.toString());
            }
          })
      }.width('100%')
      if (this.是否有字段错误(this.fieldKey(label)))
        Text(this.resolveText(this.字段错误资源(this.fieldKey(label))))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text'))
          .width('100%')
    }.width('100%')
  }

  /** 按 numericValue 查选项索引；未命中返回 0。供 Select.selected 使用。 */
  private reviewOrderOptionIndex(value: number): number {
    const 选项 = this.reviewOrderOptions();
    for (let i = 0; i < 选项.length; i++) {
      if (选项[i].numericValue === value) return i;
    }
    return 0;
  }

  // ========================================================
  // @块ID UI-DECK-OPTIONS-010
  // @名称 高级设置入口
  //
  // @作用
  // 高级设置入口：Row 行按钮，点击打开独立全屏磨砂覆盖层（不展开折叠）。
  //
  // @输入
  // 无
  //
  // @输出
  // Row 子树
  //
  // @副作用
  // 点击写 showAdvanced。
  // ========================================================
  @Builder
  private advancedHubEntry() {
    Row() {
      Text($r('app.string.deck_group_advanced_hub'))
        .fontSize(应用尺寸.字号_正文_中)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
      Text('›')
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_secondary'))
    }
    .width('100%')
    .height(应用尺寸.按钮高度)
    .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
    .backgroundColor($r('app.color.surface_page'))
    .borderRadius(应用尺寸.圆角_面板)
    .onClick(() => {
      if (!this.busy) this.showAdvanced = true;
    })
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        // 磨砂玻璃质感：模糊下层内容避免叠字，材质着色跟随应用内主题（思路参考：华为开发者文档 backgroundBlurStyle）
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        // 遮罩扩展进安全区，否则状态栏/导航条区域露出下层背景
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => { if (!this.busy) this.onCancel(); })
        // 过渡仅动 opacity 合成属性，不触发布局（思路参考：华为官方 TransitionEffect 示例）
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_12 }) {
        DialogHeader({
          title: $r('app.string.deck_options_title'),
          actionLabel: this.busy ? $r('app.string.deck_options_saving') : $r('app.string.deck_options_save'),
          actionEnabled: this.canSubmit(),
          closeLabel: $r('app.string.create_deck_cancel'),
          closeEnabled: !this.busy,
          showHelp: true,
          helpEnabled: !this.busy,
          onClose: () => this.onCancel(),
          onHelp: () => this.openScopeHelp(),
          onAction: () => this.submit()
        })
        Scroll() {
          // 2026-07-28：原 space=间距_8 + 下方 Blank(间距_16) 导致 reviewOrderSelector
          // 上方仅 8px、下方却达 8+16+8=32px，上下比例 1:4 视觉失衡。
          // 改为 space=间距_12 并删除 Blank，使复习排序顺序与上下元素均保持 12px 间距。
          Column({ space: 应用尺寸.间距_12 }) {
            // 常用 4 项直接平铺（目标记忆保持率已移入高级设置的 FSRS 组）
            if (this.form !== null) {
              this.labeledInput($r('app.string.deck_newPerDay_label'), this.form.每日新卡数文本, (value: string) => { if (this.form !== null) this.form.每日新卡数文本 = value; }, $r('app.string.deck_newPerDay_help'))
              this.labeledInput($r('app.string.deck_reviewsPerDay_label'), this.form.每日复习数文本, (value: string) => { if (this.form !== null) this.form.每日复习数文本 = value; }, $r('app.string.deck_reviewsPerDay_help'))
              this.labeledInput($r('app.string.deck_learnSteps_label'), this.form.学习步骤文本, (value: string) => { if (this.form !== null) this.form.学习步骤文本 = value; }, $r('app.string.deck_learnSteps_help'))
              this.reviewOrderSelector($r('app.string.deck_reviewOrder_label'), this.selectedReviewOrder, $r('app.string.deck_reviewOrder_help'))
            }
            // 简洁模式下隐藏「高级设置」入口
            if (!this.简洁模式) {
              this.advancedHubEntry()
            }
          }.width('100%')
        }.constraintSize({ maxHeight: '60%' }).width('100%').scrollBar(BarState.Auto).edgeEffect(EdgeEffect.Spring)

        if (this.errorMessage !== '' || this.submitError !== '') Text(this.errorMessage !== '' ? this.errorMessage : this.submitError).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')

      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {
        // 阻断点击穿透到遮罩
      })
      // 过渡仅动 opacity/translate/scale 合成属性，不触发布局（思路参考：华为官方 TransitionEffect 示例）
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))

      if (this.showAdvanced) {
        高级牌组选项面板({
          isDark: this.isDark,
          form: this.form,
          options: this.options,
          busy: this.busy,
          onClose: (): void => { this.showAdvanced = false; }
        })
      }
      if (this.showHelp) 字段帮助面板({ 标题: this.helpTitle, 正文: this.helpBody, onClose: () => { this.showHelp = false; } })
    }
    .width('100%')
    .height('100%')
  }
}
