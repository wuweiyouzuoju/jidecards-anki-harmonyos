// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText } from '../../utils/UiFeedback';
import { SelectStyle } from '../../utils/SelectStyle';

import { 加载学习布局模式, 保存学习布局模式, 学习布局模式 } from '../../model/学习布局存储';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 设置分组卡片 } from './设置分组卡片';

// ========================================================
// @块ID UI-LAYOUT-001
// @名称 学习页布局分组
//
// @作用
// 提供底部固定 / 浮动可拖 两种学习页布局模式切换，
// 首页进度移至常规，评分振动移至控制；这里只保留复习界面的布局。
// 当前布局模式 = null 表示加载中；加载失败回退 'bottom'。
// 切换后立即生效（下次进入学习页）。
//
// @输入
// 是否深色：当前是否深色模式（影响色板取值）。
//
// @输出
// 渲染布局分组卡片；用户选择模式时持久化并更新当前布局模式；
//
// @副作用
// 调用 加载学习布局模式 / 保存学习布局模式 读写本地持久化；
// 持久化失败仅丢失下次启动后的值，不回滚 UI。
// ========================================================
@Component
export struct 布局分组 {
  @Prop 是否深色: boolean = false;
  // ⓘ 上抛：点击布局行的 ⓘ 时，由父级（设置面板）弹出 字段帮助面板
  打开说明回调: (标题: Resource, 正文: Resource) => void = (标题: Resource, 正文: Resource): void => {};

  // B12-Y5 2026-07-29 修复 Bug 1：@StorageProp('themeMode') 让主题模式切换直接触发重 build，
  // 不依赖 @Prop 是否深色 传播（aurora 主题 主色按钮背景 深浅色相同，@StorageLink 可能不触发）。
  @StorageProp('themeMode') private 主题模式监听: string = 'system';

  @State private 当前布局模式: 学习布局模式 | null = null;
  async aboutToAppear(): Promise<void> {
    // 失败回退到 'bottom'（默认），保证 chip 一直可选。
    try {
      this.当前布局模式 = await 加载学习布局模式();
    } catch (error) {
      this.当前布局模式 = 'bottom';
    }
  }

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  /** 学习页布局模式标签：bottom=底部固定；float=浮动可拖。 */
  private 布局模式标签(模式: 学习布局模式): string {
    if (模式 === 'float') {
      return this.取本地化文本($r('app.string.settings_study_layout_float'));
    }
    return this.取本地化文本($r('app.string.settings_study_layout_bottom'));
  }

  /** Select 选项：底部固定 / 浮动可拖 */
  private 布局模式选项(): SelectOption[] {
    return [
      { value: this.取本地化文本($r('app.string.settings_study_layout_bottom')) },
      { value: this.取本地化文本($r('app.string.settings_study_layout_float')) }
    ];
  }

  /** Select 当前选中索引：float=1；bottom=0；null 加载中按 0 */
  private 布局模式索引(): number {
    return this.当前布局模式 === 'float' ? 1 : 0;
  }

  /** 切换布局模式：乐观更新 UI + 异步持久化；持久化失败仅丢失下次启动后的值，不回滚 UI。 */
  private async 切换布局(模式: 学习布局模式): Promise<void> {
    if (this.当前布局模式 === 模式) {
      return;
    }
    this.当前布局模式 = 模式;
    try {
      await 保存学习布局模式(模式);
    } catch (error) {
      // 持久化失败可接受：UI 已切换，下次启动会回退到上次保存的值。
    }
  }

  // ========================================================
  // @块ID UI-LAYOUT-002
  // @名称 分组头部
  //
  // @作用
  // 渲染详情页的静态设置分区。
  //
  // @副作用
  // ========================================================
  build() {
    设置分组卡片({
      标题: $r('app.string.settings_study_layout'),
      是否深色: this.是否深色
    }) {
      Column({ space: 8 }) {
          // 第 1 行：学习页布局（左侧标题+ⓘ，右侧 Select 选择框——与「当前模式」行同款对齐）
          Row() {
            Row() {
              Text(this.取本地化文本($r('app.string.settings_study_layout_row')))
                .fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Button($r('app.string.field_help_button'))
                .type(ButtonType.Normal)
                .backgroundColor(Color.Transparent)
                .fontSize(14)
                .fontColor(设置面板色板_取(this.是否深色).三级文字)
                .width(28)
                .height(28)
                .padding(0)
                .margin({ left: 4 })
                .onClick(() => {
                  this.打开说明回调(
                    $r('app.string.settings_study_layout_row'),
                    $r('app.string.settings_study_layout_help')
                  );
                })
            }
            .layoutWeight(1)
            Select(this.布局模式选项())
              .selected(this.布局模式索引())
              .value(this.当前布局模式 !== null
                ? this.布局模式标签(this.当前布局模式)
                : this.取本地化文本($r('app.string.settings_study_layout_bottom')))
              .attributeModifier(new SelectStyle())
              .font(SelectStyle.controlFont)
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((索引: number): void => {
                const 模式列表: 学习布局模式[] = ['bottom', 'float'];
                this.切换布局(模式列表[索引]);
              })
          }
          .width('100%')
          .height(48)

      }
      .width('100%')
    }
  }
}
