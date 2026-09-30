// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { 牌组详情面板 } from '../牌组详情面板';
import { 按下态按钮 } from '../common/按下态按钮';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import { 颜色键 } from '../../model/颜色主题';

/** 手机详情与宽屏侧栏共用展示，动作及选择仍由首页持有。 */
@Component
export struct HomeDeckDetails {
  @Prop compact: boolean = false;
  @Prop isDark: boolean = false;
  @Prop optionsBusy: boolean = false;
  @Prop historyRefreshToken: number = 0;
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  onBack: () => void = (): void => {};
  onStudy: () => void = (): void => {};
  onPreview: () => void = (): void => {};
  onAddNote: () => void = (): void => {};
  onCreateChild: () => void = (): void => {};
  onExport: () => void = (): void => {};
  onOptions: () => void = (): void => {};

  build() {
    Column() {
      if (this.compact) {
        Row() {
          Button($r('app.string.study_back'))
            .height(应用尺寸.按钮高度)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
            .constraintSize({ minWidth: 0 })
            .fontSize(应用尺寸.字号_按钮)
            .fontColor($r('app.color.text_primary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
            .borderRadius(应用尺寸.圆角_胶囊)
            .attributeModifier(new PressFeedback())
            .stateEffect(false)
            .onClick(() => {
              this.onBack();
            })
          Blank()
          按下态按钮({
            文案: $r('app.string.deck_add_card'),
            字色: this.动作主色,
            themeText: true,
            点击回调: (): void => { this.onAddNote(); }
          })
        }
        .width('100%')
        .height(应用尺寸.pageToolbarHeight(this.状态栏高度, this.narrowDeckLayout))
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout),
          bottom: 0
        })
        .backgroundColor(this.页面底色微染值)
      }

      牌组详情面板({
        historyRefreshToken: this.historyRefreshToken,
        showAddCard: !this.compact,
        是否深色: this.isDark,
        牌组选项加载中: this.optionsBusy,
        开始学习: (): void => {
          this.onStudy();
        },
        预览: (): void => { this.onPreview(); },
        添加卡片: (): void => {
          this.onAddNote();
        },
        创建子牌组: (): void => {
          this.onCreateChild();
        },
        导出牌组: (): void => {
          this.onExport();
        },
        打开牌组选项: (): void => {
          this.onOptions();
        }
      })
      .layoutWeight(1)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.compact ? this.页面底色微染值 : Color.Transparent)
  }
}
