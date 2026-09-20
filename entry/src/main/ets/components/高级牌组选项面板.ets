// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-ADV-DECK-OPTIONS-001
// @名称 高级牌组选项面板
//
// @作用
// 高级设置全屏磨砂玻璃覆盖层（嵌套在牌组选项面板之上）。
// 与设置面板同款全屏磨砂遮罩 + 88% 卡片。编辑引用与牌组选项面板
// 共享（form/options），关闭后回到牌组选项页统一保存——本面板不单独落盘。
//
// @输入
// isDark: 是否深色主题
// form: 牌组配置表单（@ObjectLink 引用共享）
// options: 牌组选项编辑（@ObjectLink 引用共享）
// busy: 父级是否正在落盘
//
// @输出
// onClose: 关闭回调
//
// @业务规则
// 测试断言保留：newExpanded / lapsesExpanded / buryingExpanded /
// audioExpanded / timerExpanded / fsrsExpanded / advancedExpanded /
// deckLimitsExpanded / todayLimitsExpanded / enumSelector / labeledInput /
// toggleRow 等字面符号由阶段 6 统一更新；本阶段保留以减小工作量。
// proto 字段名（newCardInsertOrder / newCardGatherPriority / ...）作为
// 依赖层 API 参数保留英文。
//
// @副作用
// 仅编辑 form/options 草稿，不直接落盘。
// ========================================================

import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 牌组配置表单 } from '../model/牌组配置表单';
import { 牌组选项编辑 } from '../model/牌组选项编辑';
import { 字段帮助面板 } from './字段帮助面板';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import type { 校验问题 } from '../model/牌组配置表单';

interface 牌组枚举选项 { value: Resource; numericValue: number; }
interface 牌组下拉选项 { value: string; }

/**
 * 高级设置 section 折叠标题：独立子组件（非 @Builder），expanded 用 @Prop 保证响应式，
 * 只让箭头旋转，内容显隐立即生效，避免布局动画拖慢操作。
 */
@Component
struct 段落标题 {
  @Prop title: Resource;
  @Prop expanded: boolean = false;
  onToggle: () => void = (): void => {};

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      Row() {
        Text(this.title).fontSize(应用尺寸.字号_正文_中).fontWeight(FontWeight.Medium).layoutWeight(1)
        Text('▼')
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_secondary'))
          .rotate({ angle: this.expanded ? 0 : -90 })
          .animation({ duration: 150, curve: Curve.EaseOut })
      }.width('100%').onClick(() => {
        this.onToggle();
      })
    }.width('100%').padding(应用尺寸.间距_10).backgroundColor($r('app.color.surface_page')).borderRadius(应用尺寸.圆角_面板)
  }
}

@Component
export struct 高级牌组选项面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  @ObjectLink form: 牌组配置表单;
  @ObjectLink options: 牌组选项编辑;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};

  @State private newExpanded: boolean = false;
  @State private lapsesExpanded: boolean = false;
  @State private buryingExpanded: boolean = false;
  @State private audioExpanded: boolean = false;
  @State private timerExpanded: boolean = false;
  @State private fsrsExpanded: boolean = false;
  @State private advancedExpanded: boolean = false;
  @State private deckLimitsExpanded: boolean = false;
  @State private todayLimitsExpanded: boolean = false;
  @State private globalExpanded: boolean = false;
  @State private showHelp: boolean = false;
  @State private helpTitle: Resource = $r('app.string.deck_learn_steps');
  @State private helpBody: Resource = $r('app.string.deck_learn_steps_help');
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';

  // ========================================================
  // @块ID UI-ADV-DECK-OPTIONS-002
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
  private openHelp(title: Resource, body: Resource): void { this.helpTitle = title; this.helpBody = body; this.showHelp = true; }

  // ========================================================
  // @块ID UI-ADV-DECK-OPTIONS-003
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
  // 字段键字符串；未命中返回空串
  //
  // @副作用
  // 无。
  // ========================================================
  private fieldKey(label: Resource): string { if (label.id === $r('app.string.deck_newPerDay_label').id) return 'newPerDay'; if (label.id === $r('app.string.deck_reviewsPerDay_label').id) return 'reviewsPerDay'; if (label.id === $r('app.string.deck_learnSteps_label').id) return 'learnSteps'; if (label.id === $r('app.string.deck_relearnSteps_label').id) return 'relearnSteps'; if (label.id === $r('app.string.deck_newPerDayMinimum_label').id) return 'newPerDayMinimum'; if (label.id === $r('app.string.deck_graduatingIntervalGood_label').id) return 'graduatingIntervalGood'; if (label.id === $r('app.string.deck_graduatingIntervalEasy_label').id) return 'graduatingIntervalEasy'; if (label.id === $r('app.string.deck_newCardInsertOrder_label').id) return 'newCardInsertOrder'; if (label.id === $r('app.string.deck_newCardGatherPriority_label').id) return 'newCardGatherPriority'; if (label.id === $r('app.string.deck_newCardSortOrder_label').id) return 'newCardSortOrder'; if (label.id === $r('app.string.deck_newMix_label').id) return 'newMix'; if (label.id === $r('app.string.deck_interdayLearningMix_label').id) return 'interdayLearningMix'; if (label.id === $r('app.string.deck_minimumLapseInterval_label').id) return 'minimumLapseInterval'; if (label.id === $r('app.string.deck_leechThreshold_label').id) return 'leechThreshold'; if (label.id === $r('app.string.deck_leechAction_label').id) return 'leechAction'; if (label.id === $r('app.string.deck_reviewOrder_label').id) return 'reviewOrder'; if (label.id === $r('app.string.deck_buryNew_label').id) return 'buryNew'; if (label.id === $r('app.string.deck_buryReviews_label').id) return 'buryReviews'; if (label.id === $r('app.string.deck_buryInterdayLearning_label').id) return 'buryInterdayLearning'; if (label.id === $r('app.string.deck_disableAutoplay_label').id) return 'disableAutoplay'; if (label.id === $r('app.string.deck_skipQuestionWhenReplayingAnswer_label').id) return 'skipQuestionWhenReplayingAnswer'; if (label.id === $r('app.string.deck_waitForAudio_label').id) return 'waitForAudio'; if (label.id === $r('app.string.deck_capAnswerTimeToSecs_label').id) return 'capAnswerTimeToSecs'; if (label.id === $r('app.string.deck_showTimer_label').id) return 'showTimer'; if (label.id === $r('app.string.deck_stopTimerOnAnswer_label').id) return 'stopTimerOnAnswer'; if (label.id === $r('app.string.deck_secondsToShowQuestion_label').id) return 'secondsToShowQuestion'; if (label.id === $r('app.string.deck_secondsToShowAnswer_label').id) return 'secondsToShowAnswer'; if (label.id === $r('app.string.deck_questionAction_label').id) return 'questionAction'; if (label.id === $r('app.string.deck_answerAction_label').id) return 'answerAction'; if (label.id === $r('app.string.deck_desiredRetention_label').id) return 'desiredRetention'; if (label.id === $r('app.string.deck_fsrsParams4_label').id) return 'fsrsParams4'; if (label.id === $r('app.string.deck_easyDaysPercentages_label').id) return 'easyDaysPercentages'; if (label.id === $r('app.string.deck_fsrsParams5_label').id) return 'fsrsParams5'; if (label.id === $r('app.string.deck_fsrsParams6_label').id) return 'fsrsParams6'; if (label.id === $r('app.string.deck_historicalRetention_label').id) return 'historicalRetention'; if (label.id === $r('app.string.deck_initialEase_label').id) return 'initialEase'; if (label.id === $r('app.string.deck_easyMultiplier_label').id) return 'easyMultiplier'; if (label.id === $r('app.string.deck_hardMultiplier_label').id) return 'hardMultiplier'; if (label.id === $r('app.string.deck_lapseMultiplier_label').id) return 'lapseMultiplier'; if (label.id === $r('app.string.deck_intervalMultiplier_label').id) return 'intervalMultiplier'; if (label.id === $r('app.string.deck_maximumReviewInterval_label').id) return 'maximumReviewInterval'; if (label.id === $r('app.string.deck_ignoreRevlogsBeforeDate_label').id) return 'ignoreRevlogsBeforeDate'; if (label.id === $r('app.string.deck_reviewLimit_label').id) return 'reviewLimit'; if (label.id === $r('app.string.deck_newLimit_label').id) return 'newLimit'; if (label.id === $r('app.string.deck_reviewToday_label').id) return 'reviewToday'; if (label.id === $r('app.string.deck_newToday_label').id) return 'newToday'; if (label.id === $r('app.string.deck_desiredRetentionOverride_label').id) return 'desiredRetentionOverride'; return ''; }

  private 校验问题列表(): 校验问题[] { const 输出: 校验问题[] = []; if (this.form !== null) 输出.push(...this.form.校验()); if (this.options !== null) 输出.push(...this.options.校验()); return 输出; }
  private 是否有字段错误(key: string): boolean { return this.校验问题列表().some((issue: 校验问题): boolean => issue.字段键 === key); }
  private 字段错误资源(key: string): Resource { const issue: 校验问题 | undefined = this.校验问题列表().find((item: 校验问题): boolean => item.字段键 === key); if (issue === undefined) return $r('app.string.deck_invalid_number_validation_error'); switch (issue.消息键) { case 'deck_learn_steps_validation_error': return $r('app.string.deck_learn_steps_validation_error'); case 'deck_relearn_steps_validation_error': return $r('app.string.deck_relearn_steps_validation_error'); case 'deck_limit_validation_error': return $r('app.string.deck_limit_validation_error'); case 'deck_retention_validation_error': return $r('app.string.deck_retention_validation_error'); case 'deck_range_validation_error': return $r('app.string.deck_range_validation_error'); case 'deck_fsrs_parameters_validation_error': return $r('app.string.deck_fsrs_parameters_validation_error'); case 'deck_easy_days_validation_error': return $r('app.string.deck_easy_days_validation_error'); case 'deck_enum_validation_error': return $r('app.string.deck_enum_validation_error'); case 'deck_date_validation_error': return $r('app.string.deck_date_validation_error'); default: return $r('app.string.deck_invalid_number_validation_error'); } }
  // 官方 Select 文档：selected 仅控制菜单初始高亮，按钮文本需由 value 提供，否则框内空白。
  // value 必须传 string：传 Resource 时按钮文本不显示（添加笔记面板用 string 正常，旧版高级牌组选项面板用 Resource 全空白）。
  // 项目已有此 Resource→string 模式：牌组选项面板.字段错误文本。
  private resolveText(resource: Resource): string { return this.getUIContext().getHostContext()!.resourceManager.getStringSync(resource.id); }
  private 枚举转下拉选项(值列表: 牌组枚举选项[]): 牌组下拉选项[] { const 输出: 牌组下拉选项[] = []; for (let i = 0; i < 值列表.length; i++) { const 项: 牌组下拉选项 = { value: this.resolveText(值列表[i].value) }; 输出.push(项); } return 输出; }
  private 枚举索引(值列表: 牌组枚举选项[], 数值: number): number { for (let i = 0; i < 值列表.length; i++) if (值列表[i].numericValue === 数值) return i; return 0; }
  private 枚举标签(值列表: 牌组枚举选项[], 数值: number): string { for (let i = 0; i < 值列表.length; i++) if (值列表[i].numericValue === 数值) return this.resolveText(值列表[i].value); return 值列表.length > 0 ? this.resolveText(值列表[0].value) : this.resolveText($r('app.string.deck_opt_mix')); }
  private 混合选项(): 牌组枚举选项[] { return [{ value: $r('app.string.deck_opt_mix'), numericValue: 0 }, { value: $r('app.string.deck_opt_after_reviews'), numericValue: 1 }, { value: $r('app.string.deck_opt_before_reviews'), numericValue: 2 }]; }

  // ========================================================
  // @块ID UI-ADV-DECK-OPTIONS-004
  // @名称 枚举选择器
  //
  // @作用
  // 渲染一行带帮助按钮 + Select 下拉的枚举字段编辑单元。
  //
  // @输入
  // label: 字段标签资源
  // selected: 当前选中的 numericValue
  // values: 候选枚举列表
  // onChange: 选中回调
  // help: 帮助正文资源
  //
  // @输出
  // Column 子树
  //
  // @副作用
  // 无。
  // ========================================================
  @Builder
  private enumSelector(label: Resource, selected: number, values: 牌组枚举选项[], onChange: (numericValue: number) => void, help: Resource) {
    // 帮助紧跟标签，右侧选择框独立占位。
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
        Select(this.枚举转下拉选项(values))
          .selected(this.枚举索引(values, selected))
          .value(this.枚举标签(values, selected))
          .enabled(!this.busy)
          .attributeModifier(new SelectStyle())
          .font(SelectStyle.controlFont)
          .borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number) => onChange(values[index].numericValue))
      }.width('100%')
      if (this.是否有字段错误(this.fieldKey(label))) Text(this.resolveText(this.字段错误资源(this.fieldKey(label)))).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
    }.width('100%')
  }

  // ========================================================
  // @块ID UI-ADV-DECK-OPTIONS-005
  // @名称 带标签输入框
  //
  // @作用
  // 渲染一行带帮助按钮 + TextInput 的数值字段编辑单元。
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
  // @块ID UI-ADV-DECK-OPTIONS-006
  // @名称 开关行
  //
  // @作用
  // 渲染一行带帮助按钮 + Toggle 的布尔字段编辑单元。
  //
  // @输入
  // label: 字段标签资源
  // value: 当前布尔值
  // onChange: 值变更回调
  // help: 帮助正文资源
  //
  // @输出
  // Column 子树
  //
  // @副作用
  // 无。
  // ========================================================
  @Builder
  private toggleRow(label: Resource, value: boolean, onChange: (value: boolean) => void, help: Resource) {
    Column({ space: 应用尺寸.间距_5 }) {
      Row() {
        Row({ space: 4 }) {
          Text(label).fontSize(应用尺寸.字号_正文_小).flexShrink(1)
          Button($r('app.string.field_help_button'))
            .type(ButtonType.Normal).width(32).height(32).padding(0).flexShrink(0)
            .backgroundColor(Color.Transparent)
            .onClick(() => this.openHelp(label, help))
        }.layoutWeight(1)
        Toggle({ type: ToggleType.Switch, isOn: value })
          .selectedColor(this.主色按钮背景).enabled(!this.busy).onChange(onChange)
      }.width('100%')
      if (this.是否有字段错误(this.fieldKey(label))) {
        Text(this.resolveText(this.字段错误资源(this.fieldKey(label))))
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
      }
    }.width('100%')
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
        .onClick(() => { if (!this.busy) this.onClose(); })
        // 过渡仅动 opacity 合成属性，不触发布局（思路参考：华为官方 TransitionEffect 示例）
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_12 }) {
        DialogHeader({
          title: $r('app.string.deck_group_advanced_hub'),
          actionLabel: $r('app.string.done'),
          actionEnabled: !this.busy,
          showClose: false,
          onAction: () => this.onClose()
        })

        Scroll() {
          Column({ space: 应用尺寸.间距_8 }) {
            if (this.options.sharedDeckCount > 1) {
              this.toggleRow($r('app.string.deck_apply_shared_label', this.options.sharedDeckCount),
                this.options.applyToSharedDecks, (value: boolean) => { this.options.applyToSharedDecks = value; },
                $r('app.string.deck_apply_shared_help'))
            }
            // 顶部「每日上限」6 字段拆成两组 section（用户决策 2026-07-22）：本牌组上限 + 今日上限
            段落标题({ title: $r('app.string.deck_group_deck_limits'), expanded: this.deckLimitsExpanded, onToggle: () => { this.deckLimitsExpanded = !this.deckLimitsExpanded; } })
            if (this.deckLimitsExpanded && this.options !== null && this.form !== null) {
              this.labeledInput($r('app.string.deck_reviewLimit_label'), this.options.复习限额文本, (value: string) => { if (this.options !== null) this.options.复习限额文本 = value; }, $r('app.string.deck_reviewLimit_help'))
              this.labeledInput($r('app.string.deck_newLimit_label'), this.options.新卡限额文本, (value: string) => { if (this.options !== null) this.options.新卡限额文本 = value; }, $r('app.string.deck_newLimit_help'))
            }
            段落标题({ title: $r('app.string.deck_group_today_limits'), expanded: this.todayLimitsExpanded, onToggle: () => { this.todayLimitsExpanded = !this.todayLimitsExpanded; } })
            if (this.todayLimitsExpanded && this.options !== null && this.form !== null) {
              this.labeledInput($r('app.string.deck_reviewToday_label'), this.options.今日复习文本, (value: string) => { if (this.options !== null) this.options.今日复习文本 = value; }, $r('app.string.deck_reviewToday_help'))
              this.toggleRow($r('app.string.deck_reviewTodayActive_label'), this.options.今日复习启用, (value: boolean) => { if (this.options !== null) this.options.今日复习启用 = value; }, $r('app.string.deck_reviewTodayActive_help'))
              this.labeledInput($r('app.string.deck_newToday_label'), this.options.今日新卡文本, (value: string) => { if (this.options !== null) this.options.今日新卡文本 = value; }, $r('app.string.deck_newToday_help'))
              this.toggleRow($r('app.string.deck_newTodayActive_label'), this.options.今日新卡启用, (value: boolean) => { if (this.options !== null) this.options.今日新卡启用 = value; }, $r('app.string.deck_newTodayActive_help'))
            }
            段落标题({ title: $r('app.string.deck_group_new'), expanded: this.newExpanded, onToggle: () => { this.newExpanded = !this.newExpanded; } })
            if (this.newExpanded && this.form !== null) {
              this.labeledInput($r('app.string.deck_newPerDayMinimum_label'), this.form.取字段文本值('newPerDayMinimum'), (value: string) => { if (this.form !== null) this.form.设置数值字段('newPerDayMinimum', value); }, $r('app.string.deck_newPerDayMinimum_help'))
              this.labeledInput($r('app.string.deck_graduatingIntervalGood_label'), this.form.取字段文本值('graduatingIntervalGood'), (value: string) => { if (this.form !== null) this.form.设置数值字段('graduatingIntervalGood', value); }, $r('app.string.deck_graduatingIntervalGood_help'))
              this.labeledInput($r('app.string.deck_graduatingIntervalEasy_label'), this.form.取字段文本值('graduatingIntervalEasy'), (value: string) => { if (this.form !== null) this.form.设置数值字段('graduatingIntervalEasy', value); }, $r('app.string.deck_graduatingIntervalEasy_help'))
              this.enumSelector($r('app.string.deck_newCardInsertOrder_label'), this.form.取配置().newCardInsertOrder, [{ value: $r('app.string.deck_opt_due'), numericValue: 0 }, { value: $r('app.string.deck_opt_random'), numericValue: 1 }], (value: number) => { if (this.form !== null) this.form.设置数值字段('newCardInsertOrder', value.toString()); }, $r('app.string.deck_newCardInsertOrder_help'))
              this.enumSelector($r('app.string.deck_newCardGatherPriority_label'), this.form.取配置().newCardGatherPriority, [{ value: $r('app.string.deck_opt_deck'), numericValue: 0 }, { value: $r('app.string.deck_opt_lowest_position'), numericValue: 1 }, { value: $r('app.string.deck_opt_highest_position'), numericValue: 2 }, { value: $r('app.string.deck_opt_random_notes'), numericValue: 3 }, { value: $r('app.string.deck_opt_random_cards'), numericValue: 4 }, { value: $r('app.string.deck_opt_deck_random_notes'), numericValue: 5 }], (value: number) => { if (this.form !== null) this.form.设置数值字段('newCardGatherPriority', value.toString()); }, $r('app.string.deck_newCardGatherPriority_help'))
              this.enumSelector($r('app.string.deck_newCardSortOrder_label'), this.form.取配置().newCardSortOrder, [{ value: $r('app.string.deck_opt_template'), numericValue: 0 }, { value: $r('app.string.deck_opt_no_sort'), numericValue: 1 }, { value: $r('app.string.deck_opt_template_random'), numericValue: 2 }, { value: $r('app.string.deck_opt_random_note_template'), numericValue: 3 }, { value: $r('app.string.deck_opt_random_cards'), numericValue: 4 }], (value: number) => { if (this.form !== null) this.form.设置数值字段('newCardSortOrder', value.toString()); }, $r('app.string.deck_newCardSortOrder_help'))
              this.enumSelector($r('app.string.deck_newMix_label'), this.form.取配置().newMix, this.混合选项(), (value: number) => { if (this.form !== null) this.form.设置数值字段('newMix', value.toString()); }, $r('app.string.deck_newMix_help'))
              this.enumSelector($r('app.string.deck_interdayLearningMix_label'), this.form.取配置().interdayLearningMix, this.混合选项(), (value: number) => { if (this.form !== null) this.form.设置数值字段('interdayLearningMix', value.toString()); }, $r('app.string.deck_interdayLearningMix_help'))
            }
            段落标题({ title: $r('app.string.deck_group_lapses'), expanded: this.lapsesExpanded, onToggle: () => { this.lapsesExpanded = !this.lapsesExpanded; } })
            if (this.lapsesExpanded && this.form !== null) {
              this.labeledInput($r('app.string.deck_relearnSteps_label'), this.form.重学步骤文本, (value: string) => { if (this.form !== null) this.form.重学步骤文本 = value; }, $r('app.string.deck_relearnSteps_help'))
              this.labeledInput($r('app.string.deck_minimumLapseInterval_label'), this.form.取字段文本值('minimumLapseInterval'), (value: string) => { if (this.form !== null) this.form.设置数值字段('minimumLapseInterval', value); }, $r('app.string.deck_minimumLapseInterval_help'))
              this.labeledInput($r('app.string.deck_leechThreshold_label'), this.form.取字段文本值('leechThreshold'), (value: string) => { if (this.form !== null) this.form.设置数值字段('leechThreshold', value); }, $r('app.string.deck_leechThreshold_help'))
              this.enumSelector($r('app.string.deck_leechAction_label'), this.form.取配置().leechAction, [{ value: $r('app.string.deck_opt_suspend'), numericValue: 0 }, { value: $r('app.string.deck_opt_tag_only'), numericValue: 1 }], (value: number) => { if (this.form !== null) this.form.设置数值字段('leechAction', value.toString()); }, $r('app.string.deck_leechAction_help'))
            }
            段落标题({ title: $r('app.string.deck_group_burying'), expanded: this.buryingExpanded, onToggle: () => { this.buryingExpanded = !this.buryingExpanded; } })
            if (this.buryingExpanded && this.form !== null) { this.toggleRow($r('app.string.deck_buryNew_label'), this.form.取配置().buryNew, (value: boolean) => { if (this.form !== null) this.form.设置布尔字段('buryNew', value); }, $r('app.string.deck_buryNew_help')); this.toggleRow($r('app.string.deck_buryReviews_label'), this.form.取配置().buryReviews, (value: boolean) => { if (this.form !== null) this.form.设置布尔字段('buryReviews', value); }, $r('app.string.deck_buryReviews_help')); this.toggleRow($r('app.string.deck_buryInterdayLearning_label'), this.form.取配置().buryInterdayLearning, (value: boolean) => { if (this.form !== null) this.form.设置布尔字段('buryInterdayLearning', value); }, $r('app.string.deck_buryInterdayLearning_help')); }
            段落标题({ title: $r('app.string.deck_group_audio'), expanded: this.audioExpanded, onToggle: () => { this.audioExpanded = !this.audioExpanded; } })
            if (this.audioExpanded && this.form !== null) { this.toggleRow($r('app.string.deck_disableAutoplay_label'), this.form.取配置().disableAutoplay, (value: boolean) => { if (this.form !== null) this.form.设置布尔字段('disableAutoplay', value); }, $r('app.string.deck_disableAutoplay_help')); this.toggleRow($r('app.string.deck_skipQuestionWhenReplayingAnswer_label'), this.form.取配置().skipQuestionWhenReplayingAnswer, (value: boolean) => { if (this.form !== null) this.form.设置布尔字段('skipQuestionWhenReplayingAnswer', value); }, $r('app.string.deck_skipQuestionWhenReplayingAnswer_help')); this.toggleRow($r('app.string.deck_waitForAudio_label'), this.form.取配置().waitForAudio, (value: boolean) => { if (this.form !== null) this.form.设置布尔字段('waitForAudio', value); }, $r('app.string.deck_waitForAudio_help')); }
            段落标题({ title: $r('app.string.deck_group_timer'), expanded: this.timerExpanded, onToggle: () => { this.timerExpanded = !this.timerExpanded; } })
            if (this.timerExpanded && this.form !== null) {
              this.labeledInput($r('app.string.deck_capAnswerTimeToSecs_label'), this.form.取字段文本值('capAnswerTimeToSecs'), (value: string) => { if (this.form !== null) this.form.设置数值字段('capAnswerTimeToSecs', value); }, $r('app.string.deck_capAnswerTimeToSecs_help'))
              this.toggleRow($r('app.string.deck_showTimer_label'), this.form.取配置().showTimer, (value: boolean) => { if (this.form !== null) this.form.设置布尔字段('showTimer', value); }, $r('app.string.deck_showTimer_help'))
              this.toggleRow($r('app.string.deck_stopTimerOnAnswer_label'), this.form.取配置().stopTimerOnAnswer, (value: boolean) => { if (this.form !== null) this.form.设置布尔字段('stopTimerOnAnswer', value); }, $r('app.string.deck_stopTimerOnAnswer_help'))
              this.labeledInput($r('app.string.deck_secondsToShowQuestion_label'), this.form.取字段文本值('secondsToShowQuestion'), (value: string) => { if (this.form !== null) this.form.设置数值字段('secondsToShowQuestion', value); }, $r('app.string.deck_secondsToShowQuestion_help'))
              this.labeledInput($r('app.string.deck_secondsToShowAnswer_label'), this.form.取字段文本值('secondsToShowAnswer'), (value: string) => { if (this.form !== null) this.form.设置数值字段('secondsToShowAnswer', value); }, $r('app.string.deck_secondsToShowAnswer_help'))
              this.enumSelector($r('app.string.deck_questionAction_label'), this.form.取配置().questionAction, [{ value: $r('app.string.deck_opt_show_answer'), numericValue: 0 }, { value: $r('app.string.deck_opt_show_reminder'), numericValue: 1 }], (value: number) => { if (this.form !== null) this.form.设置数值字段('questionAction', value.toString()); }, $r('app.string.deck_questionAction_help'))
              this.enumSelector($r('app.string.deck_answerAction_label'), this.form.取配置().answerAction, [{ value: $r('app.string.deck_opt_bury_card'), numericValue: 0 }, { value: $r('app.string.deck_opt_answer_again'), numericValue: 1 }, { value: $r('app.string.deck_opt_answer_good'), numericValue: 2 }, { value: $r('app.string.deck_opt_answer_hard'), numericValue: 3 }, { value: $r('app.string.deck_opt_show_reminder'), numericValue: 4 }], (value: number) => { if (this.form !== null) this.form.设置数值字段('answerAction', value.toString()); }, $r('app.string.deck_answerAction_help'))
            }
            段落标题({ title: $r('app.string.deck_group_fsrs'), expanded: this.fsrsExpanded, onToggle: () => { this.fsrsExpanded = !this.fsrsExpanded; } })
            if (this.fsrsExpanded && this.form !== null) {
              // 目标记忆保持率放在 FSRS 组顶部（与 FSRS 语义最贴近）
              this.labeledInput($r('app.string.deck_desiredRetention_label'), this.form.目标保留率文本, (value: string) => { if (this.form !== null) this.form.目标保留率文本 = value; }, $r('app.string.deck_desiredRetention_help'))
              if (this.options !== null) { this.labeledInput($r('app.string.deck_desiredRetentionOverride_label'), this.options.目标保留率覆盖文本, (value: string) => { if (this.options !== null) this.options.目标保留率覆盖文本 = value; }, $r('app.string.deck_desiredRetentionOverride_help'));  this.toggleRow($r('app.string.deck_fsrsReschedule_label'), this.options.FSRS重排, (value: boolean) => { if (this.options !== null) this.options.FSRS重排 = value; }, $r('app.string.deck_fsrsReschedule_help'));  }
              this.labeledInput($r('app.string.deck_fsrsParams4_label'), this.form.取浮点数组文本('fsrsParams4'), (value: string) => { if (this.form !== null) this.form.设置浮点数组字段('fsrsParams4', value); }, $r('app.string.deck_fsrsParams4_help')); this.labeledInput($r('app.string.deck_easyDaysPercentages_label'), this.form.取浮点数组文本('easyDaysPercentages'), (value: string) => { if (this.form !== null) this.form.设置浮点数组字段('easyDaysPercentages', value); }, $r('app.string.deck_easyDaysPercentages_help')); this.labeledInput($r('app.string.deck_fsrsParams5_label'), this.form.取浮点数组文本('fsrsParams5'), (value: string) => { if (this.form !== null) this.form.设置浮点数组字段('fsrsParams5', value); }, $r('app.string.deck_fsrsParams5_help')); this.labeledInput($r('app.string.deck_fsrsParams6_label'), this.form.取浮点数组文本('fsrsParams6'), (value: string) => { if (this.form !== null) this.form.设置浮点数组字段('fsrsParams6', value); }, $r('app.string.deck_fsrsParams6_help')); this.labeledInput($r('app.string.deck_historicalRetention_label'), this.form.取字段文本值('historicalRetention'), (value: string) => { if (this.form !== null) this.form.设置数值字段('historicalRetention', value); }, $r('app.string.deck_historicalRetention_help')); this.labeledInput($r('app.string.deck_paramSearch_label'), this.form.取配置().paramSearch, (value: string) => { if (this.form !== null) this.form.设置文本字段('paramSearch', value); }, $r('app.string.deck_paramSearch_help'))
            }
            段落标题({ title: $r('app.string.deck_group_global'), expanded: this.globalExpanded, onToggle: () => { this.globalExpanded = !this.globalExpanded; } })
            if (this.globalExpanded) {
              Text($r('app.string.deck_global_scope_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
              this.toggleRow($r('app.string.deck_fsrsEnabled_label'), this.options.是否启用FSRS, (value: boolean) => { if (this.options !== null) this.options.是否启用FSRS = value; }, $r('app.string.deck_fsrsEnabled_help'))
              this.toggleRow($r('app.string.deck_fsrsHealthCheck_label'), this.options.FSRS健康检查, (value: boolean) => { if (this.options !== null) this.options.FSRS健康检查 = value; }, $r('app.string.deck_fsrsHealthCheck_help'))
              this.toggleRow($r('app.string.deck_newCardsIgnoreReviewLimit_label'), this.options.新卡忽略复习限额, (value: boolean) => { if (this.options !== null) this.options.新卡忽略复习限额 = value; }, $r('app.string.deck_newCardsIgnoreReviewLimit_help'))
              this.toggleRow($r('app.string.deck_applyAllParentLimits_label'), this.options.应用所有父级限额, (value: boolean) => { if (this.options !== null) this.options.应用所有父级限额 = value; }, $r('app.string.deck_applyAllParentLimits_help'))
            }
            段落标题({ title: $r('app.string.deck_group_advanced'), expanded: this.advancedExpanded, onToggle: () => { this.advancedExpanded = !this.advancedExpanded; } })
            if (this.advancedExpanded && this.form !== null) { this.labeledInput($r('app.string.deck_initialEase_label'), this.form.取字段文本值('initialEase'), (value: string) => { if (this.form !== null) this.form.设置数值字段('initialEase', value); }, $r('app.string.deck_initialEase_help')); this.labeledInput($r('app.string.deck_easyMultiplier_label'), this.form.取字段文本值('easyMultiplier'), (value: string) => { if (this.form !== null) this.form.设置数值字段('easyMultiplier', value); }, $r('app.string.deck_easyMultiplier_help')); this.labeledInput($r('app.string.deck_hardMultiplier_label'), this.form.取字段文本值('hardMultiplier'), (value: string) => { if (this.form !== null) this.form.设置数值字段('hardMultiplier', value); }, $r('app.string.deck_hardMultiplier_help')); this.labeledInput($r('app.string.deck_lapseMultiplier_label'), this.form.取字段文本值('lapseMultiplier'), (value: string) => { if (this.form !== null) this.form.设置数值字段('lapseMultiplier', value); }, $r('app.string.deck_lapseMultiplier_help')); this.labeledInput($r('app.string.deck_intervalMultiplier_label'), this.form.取字段文本值('intervalMultiplier'), (value: string) => { if (this.form !== null) this.form.设置数值字段('intervalMultiplier', value); }, $r('app.string.deck_intervalMultiplier_help')); this.labeledInput($r('app.string.deck_maximumReviewInterval_label'), this.form.取字段文本值('maximumReviewInterval'), (value: string) => { if (this.form !== null) this.form.设置数值字段('maximumReviewInterval', value); }, $r('app.string.deck_maximumReviewInterval_help')); this.labeledInput($r('app.string.deck_ignoreRevlogsBeforeDate_label'), this.form.取配置().ignoreRevlogsBeforeDate, (value: string) => { if (this.form !== null) this.form.设置文本字段('ignoreRevlogsBeforeDate', value); }, $r('app.string.deck_ignoreRevlogsBeforeDate_help')); }
          }.width('100%')
        }.constraintSize({ maxHeight: '60%' }).width('100%').scrollBar(BarState.Auto).edgeEffect(EdgeEffect.Spring)

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

      if (this.showHelp) 字段帮助面板({ 标题: this.helpTitle, 正文: this.helpBody, onClose: () => { this.showHelp = false; } })
    }
    .width('100%')
    .height('100%')
  }
}
