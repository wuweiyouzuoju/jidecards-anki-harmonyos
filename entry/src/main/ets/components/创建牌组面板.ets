// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-CREATE-DECK-001
// @名称 新建牌组弹层
//
// @作用
// 纯 UI 积木：在磨砂遮罩上方弹出居中浮卡，引导用户填写新牌组名
// 并选择父牌组，预览归属路径后通过 onConfirm 上抛 fullName。
// 不直接接触后端；忙碌态与错误信息由父级通过 @Prop 下发。
//
// @输入
// isDark: 是否深色主题（控制遮罩色与磨砂风格）
// busy: 父级是否正在落盘（禁用所有交互、切按钮文案）
// errorMessage: 父级下发的错误文案（空则不显示）
// parentOptions: 父牌组候选列表（牌组汇总[]，含 id/name/fullName/depth）
// initialParentId: 初始选中父牌组 ID
//
// @输出
// onCancel: 用户取消时回调（点遮罩 / 取消按钮）
// onConfirm: 用户提交时回调，参数 fullName 为新牌组完整层级路径
//
// @业务规则
// 名称经 onConfirm 上抛，忙碌/错误态由父级通过 Prop 下发。
// 测试断言保留：busy / errorMessage / initialParentId / parentOptions /
// canSubmit / deckName / onConfirm / onCancel / fullName 不改名。
//
// @副作用
// 无。本组件不写后端、不写存储；仅触发外部回调。
// ========================================================

import { 应用尺寸 } from '../utils/应用尺寸';
import { 组合牌组路径, 规范化牌组路径 } from '../model/牌组层级';
import type { 牌组汇总 } from '../model/主页模型';
import { 颜色键 } from '../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';

@Component
export struct 创建牌组面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop parentOptions: 牌组汇总[] = [];
  @Prop initialParentId: string = '';
  onCancel: () => void = (): void => {
  };
  onConfirm: (fullName: string) => void = (fullName: string): void => {
  };

  @State private deckName: string = '';
  @State private parentId: string = '';

  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';
  @StorageProp(颜色键.选中背景) private 选中背景色: string = '#E8EEFC';
  @State private 已按下确认: boolean = false;

  aboutToAppear(): void {
    this.parentId = this.initialParentId;
  }

  // ========================================================
  // @块ID UI-CREATE-DECK-002
  // @名称 按 ID 查找父牌组
  //
  // @作用
  // 在 parentOptions 中线性查找匹配 id 的牌组汇总，找不到返回 null。
  //
  // @输入
  // id: 待查找的父牌组 ID
  //
  // @输出
  // 牌组汇总 | null
  //
  // @副作用
  // 无。
  // ========================================================
  private 按ID查找父牌组(id: string): 牌组汇总 | null {
    for (const 父牌组 of this.parentOptions) {
      if (父牌组.id === id) {
        return 父牌组;
      }
    }
    return null;
  }

  // ========================================================
  // @块ID UI-CREATE-DECK-003
  // @名称 取本地化文本
  //
  // @作用
  // 通过 resourceManager 同步读取 Resource 对应的字符串。
  //
  // @输入
  // resource: 资源句柄
  //
  // @输出
  // 本地化字符串
  //
  // @副作用
  // 无。
  // ========================================================
  private 取本地化文本(resource: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(resource.id);
  }

  /** 先格式化牌组名，再交给主题文字渲染，避免资源参数在 Builder 中丢失。 */
  private formatPreview(resource: Resource, ...names: string[]): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(resource.id, ...names);
  }

  // ========================================================
  // @块ID UI-CREATE-DECK-004
  // @名称 预览父路径
  //
  // @作用
  // 预览取词：父路径与规范化叶名分态展示，一眼可见新牌组归属。
  // 返回当前选中父牌组的 fullName，无父牌组时返回空串。
  //
  // @输入
  // 无（读 this.parentId）
  //
  // @输出
  // 父牌组 fullName 或空串
  //
  // @副作用
  // 无。
  // ========================================================
  private 预览父路径(): string {
    const 父牌组: 牌组汇总 | null = this.按ID查找父牌组(this.parentId);
    return 父牌组 === null ? '' : 父牌组.fullName;
  }

  // ========================================================
  // @块ID UI-CREATE-DECK-005
  // @名称 预览叶节点
  //
  // @作用
  // 对当前输入的 deckName 走规范化牌组路径校验，返回规范化后的叶节点
  // 名（用于预览）。输入为空或非法时返回空串。
  //
  // @输入
  // 无（读 this.deckName）
  //
  // @输出
  // 规范化后的叶节点名或空串
  //
  // @副作用
  // 无。
  // ========================================================
  private 预览叶节点(): string {
    if (this.deckName.trim().length === 0) {
      return '';
    }
    const 规范化结果: string | null = 规范化牌组路径(this.deckName);
    return 规范化结果 === null ? '' : 规范化结果;
  }

  // ========================================================
  // @块ID UI-CREATE-DECK-006
  // @名称 是否可提交
  //
  // @作用
  // 综合判断当前是否可提交：非忙碌 + 牌组名非空 + 组合路径合法。
  // 名称保留 canSubmit 以匹配测试断言。
  //
  // @输入
  // 无（读 busy / deckName / parentId）
  //
  // @输出
  // boolean
  //
  // @副作用
  // 无。
  // ========================================================
  private canSubmit(): boolean {
    const 父牌组: 牌组汇总 | null = this.按ID查找父牌组(this.parentId);
    const 完整路径: string | null = 组合牌组路径(父牌组 === null ? '' : 父牌组.fullName, this.deckName);
    return !this.busy && this.deckName.trim().length > 0 && 完整路径 !== null;
  }

  // ========================================================
  // @块ID UI-CREATE-DECK-007
  // @名称 提交
  //
  // @作用
  // canSubmit 通过后，组合出 fullName 并触发 onConfirm 回调。
  //
  // @输入
  // 无
  //
  // @输出
  // 调用 onConfirm(fullName)
  //
  // @副作用
  // 触发外部回调，可能引发父级落盘。
  // ========================================================
  private 提交(): void {
    if (this.canSubmit()) {
      const 父牌组: 牌组汇总 | null = this.按ID查找父牌组(this.parentId);
      const 完整路径: string | null = 组合牌组路径(父牌组 === null ? '' : 父牌组.fullName, this.deckName);
      if (完整路径 !== null) {
        this.onConfirm(完整路径);
      }
    }
  }

  // ========================================================
  // @块ID UI-CREATE-DECK-008
  // @名称 父牌组候选行
  //
  // @作用
  // 渲染单行父牌组选项：外层 padding 实现整张选择卡向右缩进
  // （框开头短一截），内层承载边框/背景/文字。字号 12→14、字重
  // Normal→Medium / Medium→Bold、padding 加大，整体更「粗」。
  //
  // @输入
  // id: 父牌组 ID（空串表示顶级）
  // label: 显示文本
  // depth: 缩进层级
  //
  // @输出
  // 渲染 Row 子树
  //
  // @副作用
  // 点击时写 this.parentId。
  // ========================================================
  @Builder
  private 父牌组候选行(id: string, label: string, depth: number) {
    Row() {
      Row() {
        Text() { ThemeTextSpans(label, (this.parentId === id) ? this.themeAccentColors : [], this.getUIContext()) }
          .fontSize(应用尺寸.字号_正文)
          .fontColor(this.parentId === id ? this.动作主色 : $r('app.color.text_primary'))
          .fontWeight(this.parentId === id ? FontWeight.Bold : FontWeight.Medium)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
      }
      .width('100%')
      .padding({
        left: 应用尺寸.间距_14,
        right: 应用尺寸.间距_14,
        top: 应用尺寸.间距_12,
        bottom: 应用尺寸.间距_12
      })
      .backgroundColor(this.parentId === id ?
        this.选中背景色 : $r('app.color.surface_page'))
      .border({
        width: 应用尺寸.卡片边框,
        color: this.parentId === id ? this.动作主色 : Color.Transparent
      })
      .borderRadius(应用尺寸.圆角_面板)
      .onClick(() => {
        if (!this.busy) {
          this.parentId = id;
        }
      })
    }
    .width('100%')
    .padding({ left: depth * 应用尺寸.父牌组候选项缩进 })
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
        .onClick(() => {
          if (!this.busy) {
            this.onCancel();
          }
        })
        // 过渡仅动 opacity/translate/scale 合成属性，不触发布局（思路参考：华为官方 TransitionEffect 示例）
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_16 }) {
        // 标题行
        DialogHeader({
          title: $r('app.string.create_deck_title'),
          actionLabel: this.busy ? $r('app.string.create_deck_creating') : $r('app.string.create_deck_confirm'),
          actionEnabled: this.canSubmit(),
          closeLabel: $r('app.string.create_deck_cancel'),
          closeEnabled: !this.busy,
          onClose: () => {
            this.onCancel();
          },
          onAction: () => {
            this.提交();
          }
        })

        // 牌组名称输入框上移到标题下方（先填名称 → 再选父牌组 → 看预览 → 提交）
        TextInput({ placeholder: $r('app.string.deck_name_placeholder'), text: this.deckName })
          .width('100%')
          .height(应用尺寸.按钮高度)
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .placeholderColor($r('app.color.text_tertiary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
          .borderRadius(应用尺寸.圆角_面板)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .enabled(!this.busy)
          .onChange((value: string) => {
            this.deckName = value;
          })
          .onSubmit((): void => {
            this.提交();
          })

        if (this.预览父路径() !== '' && this.预览叶节点() !== '') {
          Text(this.formatPreview($r('app.string.create_deck_preview_child'), this.预览父路径(), this.预览叶节点()))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(this.动作主色)
            .fontWeight(FontWeight.Medium)
            .width('100%')
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        } else if (this.预览父路径() !== '') {
          Text(this.formatPreview($r('app.string.create_deck_preview_child_pending'), this.预览父路径()))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(this.动作主色)
            .fontWeight(FontWeight.Medium)
            .width('100%')
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        } else if (this.预览叶节点() !== '') {
          Text(this.formatPreview($r('app.string.create_deck_preview_top'), this.预览叶节点()))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(this.动作主色)
            .fontWeight(FontWeight.Medium)
            .width('100%')
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }

        // 父牌组列表：layoutWeight(1) 吃掉卡片撑高后的剩余空间，按钮自然贴底，无底部空白
        Scroll() {
          Column({ space: 应用尺寸.间距_5 }) {
            this.父牌组候选行('', this.取本地化文本($r('app.string.top_level_deck')), 0)
            ForEach(this.parentOptions, (父牌组: 牌组汇总) => {
              this.父牌组候选行(父牌组.id, 父牌组.name, 父牌组.depth)
            }, (父牌组: 牌组汇总): string => 父牌组.id)
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)

        if (this.errorMessage !== '') {
          Text(this.errorMessage)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }

      }
      .width('88%')
      .constraintSize({ maxWidth: 480, minHeight: '65%' })
      .padding(应用尺寸.面板内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {
        // 阻断点击穿透到遮罩
      })
      // 居中浮卡：缩放+淡入过渡（思路参考：华为官方 TransitionEffect 示例）
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
    }
    .width('100%')
    .height('100%')
  }
}
