// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { DialogBackdrop } from '../common/DialogBackdrop';
import { resourceText, showToastSafely } from '../../utils/UiFeedback';
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { DialogHeader } from '../common/DialogHeader';
// 同页选择六种学习方式；筛选与排程交给 Anki Core，表单只维护输入和标签选择。
import { 调度器服务 } from '../../backend/调度器服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';
import { CustomStudyCardKind, CustomStudyCram, 自定义学习预设 } from '../../proto/messages/SchedulerMessages';
import { 自定义学习默认值, 自定义学习标签 } from '../../proto/messages/SchedulerMessages';

import { customStudyInitialValue, customStudyValueValid, isCustomStudyLimit } from '../../model/CustomStudyOptions';
import { CustomStudyPreferences } from '../../backend/CustomStudyPreferences';
import { SelectStyle } from '../../utils/SelectStyle';

interface 预设选项 {
  字段号: number;
  标题资源: Resource;
  说明资源: Resource;
  /** true=天数（uint32 正数），false=增量（int32 可负） */
  是天数: boolean;
}

@Component
export struct 自定义学习对话框 {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!(this.处理中)) this.onClose();
  }

  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  @Prop deckId: string = '';
  @Prop deckName: string = '';
  onClose: () => void = (): void => {};
  onSuccess: () => void = (): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 选中预设: number = 0;
  @State private 输入值: string = '';
  @State private 处理中: boolean = false;
  @State private 错误信息: string = '';
  @State private 默认值: 自定义学习默认值 | null = null;
  @State private 加载默认值中: boolean = false;

  @State private cardKindIndex: number = 0;
  @State private includedTags: string[] = [];
  @State private excludedTags: string[] = [];
  private mounted: boolean = false;
  private readonly rememberedValues: Map<number, number> = new Map<number, number>();
  private readonly preferences: CustomStudyPreferences = new CustomStudyPreferences();
  private readonly cardKinds: CustomStudyCardKind[] = [CustomStudyCardKind.New, CustomStudyCardKind.Due,
    CustomStudyCardKind.Review, CustomStudyCardKind.All];
  private readonly kindLabels: Resource[] = [$r('app.string.custom_study_kind_new'),
    $r('app.string.custom_study_kind_due'), $r('app.string.custom_study_kind_review'),
    $r('app.string.custom_study_kind_all')];

  private readonly 调度器: 调度器服务 = new 调度器服务();

  private readonly 预设列表: 预设选项[] = [
    {
      字段号: 自定义学习预设.新卡上限增量,
      标题资源: $r('app.string.custom_study_preset_new_limit'),
      说明资源: $r('app.string.custom_study_preset_new_limit_hint'),
      是天数: false
    },
    {
      字段号: 自定义学习预设.复习上限增量,
      标题资源: $r('app.string.custom_study_preset_review_limit'),
      说明资源: $r('app.string.custom_study_preset_review_limit_hint'),
      是天数: false
    },
    {
      字段号: 自定义学习预设.复习遗忘天数,
      标题资源: $r('app.string.custom_study_preset_forgotten'),
      说明资源: $r('app.string.custom_study_preset_forgotten_hint'),
      是天数: true
    },
    {
      字段号: 自定义学习预设.提前复习天数,
      标题资源: $r('app.string.custom_study_preset_ahead'),
      说明资源: $r('app.string.custom_study_preset_ahead_hint'),
      是天数: true
    },
    {
      字段号: 自定义学习预设.预览新卡天数,
      标题资源: $r('app.string.custom_study_preset_preview'),
      说明资源: $r('app.string.custom_study_preset_preview_hint'),
      是天数: true
    },
    {
      字段号: 自定义学习预设.按状态或标签,
      标题资源: $r('app.string.custom_study_preset_cram'),
      说明资源: $r('app.string.custom_study_preset_cram_hint'),
      是天数: false
    }
  ];

  aboutToAppear(): void {
    this.选中预设 = 自定义学习预设.新卡上限增量;
    this.mounted = true;
    this.输入值 = '0';
    this.加载默认值();
  }

  aboutToDisappear(): void { this.mounted = false; }

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private 取本地化带参文本(资源: Resource, 参数: Array<string | number>): string {
    return resourceText(this.getUIContext(), 资源, ...参数);
  }

  private async 加载默认值(): Promise<void> {
    this.加载默认值中 = true;
    this.错误信息 = '';
    try {
      const defaults = await this.调度器.获取自定义学习默认值(Number(this.deckId));
      if (!this.mounted) { return; }
      for (const preset of this.预设列表) {
        if (!isCustomStudyLimit(preset.字段号)) {
          const fallback = customStudyInitialValue(preset.字段号, defaults);
          this.rememberedValues.set(preset.字段号, this.preferences.read(preset.字段号, fallback));
        }
      }
      this.默认值 = defaults;
      this.includedTags = defaults.tags.filter(tag => tag.include).map(tag => tag.name);
      this.excludedTags = defaults.tags.filter(tag => tag.exclude).map(tag => tag.name);
      this.输入值 = this.initialValue(this.选中预设).toString();
    } catch (error) {
      if (this.mounted) { this.错误信息 = error instanceof Error ? error.message : `${error}`; }
    } finally {
      if (this.mounted) { this.加载默认值中 = false; }
    }
  }

  private initialValue(preset: number): number {
    const remembered = this.rememberedValues.get(preset);
    return remembered === undefined ? customStudyInitialValue(preset, this.默认值) : remembered;
  }

  private 当前预设(): 预设选项 {
    for (const 预设 of this.预设列表) {
      if (预设.字段号 === this.选中预设) {
        return 预设;
      }
    }
    return this.预设列表[0];
  }

  private 切换预设(字段号: number): void {
    if (this.处理中 || this.加载默认值中 || this.默认值 === null) {
      return;
    }
    this.选中预设 = 字段号;
    this.输入值 = this.initialValue(字段号).toString();
    this.错误信息 = '';
  }

  private 可提交(): boolean {
    return !this.处理中 && !this.加载默认值中 && this.默认值 !== null &&
      customStudyValueValid(this.选中预设, this.输入值);
  }

  private tagSelection(name: string): number {
    return this.excludedTags.includes(name) ? 2 : (this.includedTags.includes(name) ? 1 : 0);
  }

  private setTagSelection(name: string, index: number): void {
    this.includedTags = this.includedTags.filter(tag => tag !== name);
    this.excludedTags = this.excludedTags.filter(tag => tag !== name);
    if (index === 1) { this.includedTags = [...this.includedTags, name]; }
    if (index === 2) { this.excludedTags = [...this.excludedTags, name]; }
  }

  private availableCount(isNew: boolean): string {
    if (this.默认值 === null) { return ''; }
    const count = isNew ? this.默认值.availableNew : this.默认值.availableReview;
    const children = isNew ? this.默认值.availableNewInChildren : this.默认值.availableReviewInChildren;
    const text = this.取本地化带参文本(isNew ? $r('app.string.custom_study_available_new') :
      $r('app.string.custom_study_available_review'), [count]);
    return children === 0 ? text : text + ' ' +
      this.取本地化带参文本($r('app.string.custom_study_child_count'), [children]);
  }

  private async 执行提交(): Promise<void> {
    if (!this.可提交()) {
      return;
    }
    const id: number = Number(this.deckId);
    if (id === 0) {
      this.错误信息 = this.取本地化文本($r('app.string.custom_study_error'));
      return;
    }
    const 预设 = this.当前预设();
    const 值: number = Number(this.输入值.trim());
    this.处理中 = true;
    this.错误信息 = '';
    try {
      if (预设.字段号 === 自定义学习预设.按状态或标签) {
        const cram: CustomStudyCram = {
          kind: this.cardKinds[this.cardKindIndex], cardLimit: 值,
          tagsToInclude: [...this.includedTags], tagsToExclude: [...this.excludedTags]
        };
        await this.调度器.customStudyByStateOrTags(id, cram);
      } else {
        await this.调度器.自定义学习(id, 预设.字段号, 值);
      }
      // 创建成功后偏好失败只提示，不把已成功操作变成可重复提交的错误。
      let message: Resource = $r('app.string.custom_study_success');
      if (!isCustomStudyLimit(预设.字段号)) {
        try { await this.preferences.save(预设.字段号, 值); } catch (error) {
          message = $r('app.string.custom_study_preferences_error');
        }
      }
      showToastSafely(this.getUIContext(), {
        message: this.取本地化文本(message), duration: 3000
      });
      this.onSuccess();
      this.onClose();
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.处理中 = false;
    }
  }

  @Builder
  private 预设行(预设: 预设选项) {
    Row({ space: 应用尺寸.间距_8 }) {
      Row() {
        Column({ space: 2 }) {
          Text() { ThemeTextSpans(预设.标题资源, (this.选中预设 === 预设.字段号) ? this.themeAccentColors : [], this.getUIContext()) }
            .fontSize(应用尺寸.字号_正文)
            .fontColor(this.选中预设 === 预设.字段号 ?
              设置面板色板_取(this.isDark).主色 : 设置面板色板_取(this.isDark).主文字)
            .fontWeight(this.选中预设 === 预设.字段号 ? FontWeight.Bold : FontWeight.Medium)
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
      }
      .width('100%')
      .padding({
        left: 应用尺寸.间距_14,
        right: 应用尺寸.间距_14,
        top: 应用尺寸.间距_8,
        bottom: 应用尺寸.间距_8
      })
      .backgroundColor(this.选中预设 === 预设.字段号 ?
        设置面板色板_取(this.isDark).标签背景 : 设置面板色板_取(this.isDark).背景)
      .border({
        width: 应用尺寸.卡片边框,
        color: this.选中预设 === 预设.字段号 ?
          设置面板色板_取(this.isDark).主色 : Color.Transparent
      })
      .borderRadius(应用尺寸.圆角_面板)
      .enabled(!this.处理中 && !this.加载默认值中 && this.默认值 !== null)
      .attributeModifier(new PressFeedback())
      .onClick(() => { this.切换预设(预设.字段号); })
    }
    .width('100%')
  }

  @Builder
  private 输入设置() {
    Column({ space: 应用尺寸.间距_8 }) {
      Text(this.当前预设().说明资源)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .width('100%')
      if (isCustomStudyLimit(this.选中预设)) {
        Text(this.availableCount(this.选中预设 === 自定义学习预设.新卡上限增量))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
      }
      Text(this.选中预设 === 自定义学习预设.按状态或标签 ? $r('app.string.custom_study_cards_label') :
        (this.当前预设().是天数 ? $r('app.string.custom_study_days_label') : $r('app.string.custom_study_value_label')))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .width('100%')
      TextInput({ text: this.输入值 })
        .width('100%')
        .height(应用尺寸.按钮高度)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .backgroundColor($r('app.color.surface_card'))
        .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
        .borderRadius(应用尺寸.圆角_面板)
        .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
        .type(isCustomStudyLimit(this.选中预设) ? InputType.Normal : InputType.Number)
        .inputFilter(isCustomStudyLimit(this.选中预设) ? '^-?[0-9]*$' : '^[0-9]*$')
        .enabled(!this.处理中 && !this.加载默认值中 && this.默认值 !== null)
        .onChange((value: string) => { this.输入值 = value; })
        .onSubmit((): void => { this.执行提交(); })
      if (this.输入值 !== '' && !customStudyValueValid(this.选中预设, this.输入值)) {
        Text($r('app.string.custom_study_invalid_value'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text'))
      }
      if (this.选中预设 === 自定义学习预设.按状态或标签) {
        Select(this.kindLabels.map((label: Resource): SelectOption => ({ value: this.取本地化文本(label) })))
          .width('100%')
          .selected(this.cardKindIndex)
          .value(this.取本地化文本(this.kindLabels[this.cardKindIndex]))
          .font(SelectStyle.controlFont)
          .optionFont(SelectStyle.optionFont)
          .selectedOptionFont(SelectStyle.selectedOptionFont)
          .textModifier(SelectStyle.labelText())
          .borderRadius(SelectStyle.controlRadius)
          .height(SelectStyle.controlHeight)
          .padding(SelectStyle.controlPadding)
          .space(SelectStyle.controlSpace)
          .attributeModifier(new SelectStyle())
          .enabled(!this.处理中)
          .onSelect((index: number) => { this.cardKindIndex = index; })
        if (this.默认值 !== null && this.默认值.tags.length > 0) {
          Text($r('app.string.custom_study_tags_hint'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
          ForEach(this.默认值.tags, (tag: 自定义学习标签) => {
            Row({ space: 应用尺寸.间距_8 }) {
              Text(tag.name).layoutWeight(1).fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_primary'))
              Select([
                { value: this.取本地化文本($r('app.string.custom_study_tags_any')) },
                { value: this.取本地化文本($r('app.string.custom_study_tags_include')) },
                { value: this.取本地化文本($r('app.string.custom_study_tags_exclude')) }
              ])
                .width(SelectStyle.fieldWidth)
                .constraintSize(SelectStyle.fieldConstraint)
                .selected(this.tagSelection(tag.name))
                .value(this.取本地化文本(this.tagSelection(tag.name) === 1 ? $r('app.string.custom_study_tags_include') :
                  (this.tagSelection(tag.name) === 2 ? $r('app.string.custom_study_tags_exclude') :
                    $r('app.string.custom_study_tags_any'))))
                .font(SelectStyle.controlFont)
                .optionFont(SelectStyle.optionFont)
                .selectedOptionFont(SelectStyle.selectedOptionFont)
                .textModifier(SelectStyle.labelText())
                .borderRadius(SelectStyle.controlRadius)
                .height(SelectStyle.controlHeight)
                .padding(SelectStyle.controlPadding)
                .space(SelectStyle.controlSpace)
                .attributeModifier(new SelectStyle())
                .enabled(!this.处理中)
                .onSelect((index: number) => { this.setTagSelection(tag.name, index); })
            }.width('100%')
          }, (tag: 自定义学习标签): string => tag.name)
        }
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  build() {
    Stack() {
      DialogBackdrop()
        .onClick(() => { if (!this.处理中) { this.onClose(); } })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      Column({ space: 应用尺寸.间距_16 }) {
        DialogHeader({
          title: $r('app.string.custom_study_title'),
          actionLabel: this.处理中 ? $r('app.string.custom_study_running') : $r('app.string.custom_study_confirm'),
          actionEnabled: this.可提交(),
          closeLabel: $r('app.string.custom_study_cancel'), closeEnabled: !this.处理中,
          onClose: () => { this.onClose(); }, onAction: () => { this.执行提交(); }
        })
        // 方式和设置共用一个按内容收缩的滚动区域，键盘/大字号下仍可操作。
        Scroll() {
          Column({ space: 应用尺寸.间距_12 }) {
            if (this.deckName !== '') {
              Text(this.deckName).fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary')).width('100%')
            }
            Column({ space: 应用尺寸.间距_5 }) {
              ForEach(this.预设列表, (预设: 预设选项) => { this.预设行(预设) },
                (预设: 预设选项): string => 预设.字段号.toString())
            }.width('100%')
            if (this.加载默认值中) {
              LoadingProgress().width(24).height(24)
            } else if (this.默认值 !== null) {
              this.输入设置()
            }
            if (this.错误信息 !== '') {
              Text(this.错误信息).fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.error_text')).width('100%')
              if (this.默认值 === null) {
                Button($r('app.string.custom_study_retry'))
                  .enabled(!this.加载默认值中).attributeModifier(new PressFeedback())
                  .stateEffect(false)
                  .onClick(() => { this.加载默认值(); })
              }
            }
          }.width('100%').alignItems(HorizontalAlign.Start)
        }
        .width('100%').flexShrink(1).align(Alignment.TopStart)
        .scrollBar(BarState.Auto).edgeEffect(EdgeEffect.Spring)
      }
      .width('88%').constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(应用尺寸.面板内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {})
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0).combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0).animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
    }.width('100%').height('100%')
  }
}
