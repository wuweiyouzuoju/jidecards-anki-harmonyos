// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';
import { ThemeTextSpans } from '../common/ThemeText';
import type { 卡片草稿 } from '../../model/agent/AgentConversationView';
@Component
export struct AgentEditableCard {
  @Prop card: 卡片草稿 = { fields: [], 已选中: true, 状态: 'draft', 失败提示: '' };
  @Prop fieldNames: string[] = [];
  @Prop busy: boolean = false;
  index: number = 0;
  messageId: number = 0;
  onSelected: (selected: boolean) => void = (): void => {};
  onField: (index: number, value: string) => void = (): void => {};
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  build() {
    Column({ space: 应用尺寸.间距_5 }) {
      Row({ space: 应用尺寸.间距_8 }) {
        // 选中圈：已保存的卡固定勾选且不可改
        Row() {
          if (this.card.已选中) {
            Text('✓')
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.action_on_primary'))
          }
        }
        .width(20)
        .height(20)
        .borderRadius(10)
        .backgroundColor(this.card.已选中
          && this.card.状态 !== 'saved'
          ? this.动作主色 : Color.Transparent)
        .border({ width: 应用尺寸.卡片边框, color: this.动作主色 })
        .justifyContent(FlexAlign.Center)
        .alignItems(VerticalAlign.Center)
        .enabled(!this.busy && this.card.状态 !== 'saved')
        .onClick((): void => {
          const 当前: 卡片草稿 = this.card;
          this.onSelected(!当前.已选中);
        })

        Text($r('app.string.ai_card_card_index', `${this.index + 1}`))
          .fontSize(应用尺寸.字号_正文)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
          .opacity(this.card.已选中 ? 1 : 0.5)

        if (this.card.状态 === 'saved') {
          Text() { ThemeTextSpans($r('app.string.ai_card_saved'), this.themeAccentColors, this.getUIContext()) }
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(this.动作主色)
        } else if (this.card.状态 === 'failed') {
          Text($r('app.string.ai_card_save_failed'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
        }
      }
      .width('100%')

      if (this.card.状态 === 'failed'
        && this.card.失败提示 !== '') {
        Text(this.card.失败提示)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text'))
          .width('100%')
      }

      // 字段编辑区：勾选才展开；已保存的卡展示为只读
      if (this.card.已选中) {
        ForEach(this.fieldNames, (字段名: string, 字段索引: number) => {
          Column({ space: 应用尺寸.间距_5 }) {
            Text(字段名)
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
            TextArea({
              text: this.card.fields[字段索引]
            })
              .width('100%')
              .height(56)
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .backgroundColor($r('app.color.surface_card'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
              .borderRadius(应用尺寸.圆角_面板)
              .padding(应用尺寸.间距_10)
              .enabled(!this.busy && this.card.状态 !== 'saved')
              .onChange((值: string): void => {
                this.onField(字段索引, 值);
              })
          }
          .width('100%')
        }, (字段名: string, 字段索引: number): string =>
          `${this.messageId}-${this.index}-${字段索引}-${字段名}`)
      }
    }
    .width('100%')
    .padding(应用尺寸.间距_10)
    .backgroundColor($r('app.color.surface_page'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
    .borderRadius(应用尺寸.圆角_面板)
  }
}
