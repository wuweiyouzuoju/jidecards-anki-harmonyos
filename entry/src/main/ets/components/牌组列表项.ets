// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText } from '../utils/UiFeedback';
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeDefinition, themeDefinition, THEME_VISUALS_KEY } from '../model/ThemeCatalog';
import { themeGradient } from '../utils/ThemeVisuals';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';

import { 牌组汇总, 牌组色调, 牌组显示名 } from '../model/主页模型';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 简洁模式AppStorage键 } from '../model/简洁模式存储';
import { image } from '@kit.ImageKit';
import { fileIo as fs } from '@kit.CoreFileKit';

// ========================================================
// @块ID UI-DECK-LIST-001
// @名称 牌组列表项 组件主体字段
//
// @作用
// 卡组列表行的展示与交互承载：色条 + 名称/描述 + 待学计数，
// 选中态高亮，长按弹色条切换/排序/自定义/隐藏/删除菜单。
//
// @输入
// @Prop deck：牌组汇总数据（保留英文名以兼容 deck-hierarchy-contract 测试断言 deck.depth / deck.hasChildren）。
// @Prop selected：是否已选中（高亮描边）。
// @Prop expanded：是否已展开子牌组（保留英文名以兼容测试断言）。
// @Prop reorderMode：是否处于排序模式（显示 ≡ 手柄、禁用选牌与长按菜单）。
// 父组件传入的回调 onSelect / onToggle / onToneChange / onCustomizeDeck / onEnterReorder / onDeleteDeck / onHideDeck / onDoubleTap。
//
// @输出
// 渲染单行卡组列表项；通过回调上抛用户操作，不直接改外部状态。
//
// @业务规则
// 双击检测：两次 onClick 间隔 < 300ms 且 hasChildren 时触发递归展开。
// ArkUI TapGesture({count:2}) 与 .onClick 冲突，必须手动用时序判定。
// 沙盒背景图必须用 PixelMap 渲染——ArkUI Image 直接传沙盒绝对路径解析不稳定（白屏）。
//
// @副作用
// 无。仅渲染与回调，状态修改由父页面完成。
//
// @注意
// 三个计数不能用 @Builder 方法渲染——ArkUI @Builder 在首次渲染时捕获 @Prop 值后不响应后续变化，
// 必须 inline 写在 build() 中。修改字段命名时需同步关注 deck-hierarchy-contract.test.mjs 阶段 6 断言。
// ========================================================

/** bindPopup onStateChange 回调的事件参数。 */
interface 弹层状态事件 {
  isVisible: boolean;
}

/** 色条选择项：持久化色调与本地化名称。 */
interface 色条选项 {
  tone: 牌组色调;
  labelResource: Resource;
}

@Component
export struct 牌组列表项 {
  @StorageProp(GLASS_COLORS_KEY) private glassColors: string[] = GLASS_HIGHLIGHT_COLORS;
  @StorageProp(THEME_VISUALS_KEY) private visual: ThemeDefinition = themeDefinition('aurora');
  // 注：deck / expanded / onToggle 保留英文名以兼容 deck-hierarchy-contract.test.mjs 阶段 6 前的断言。
  @Prop deck: 牌组汇总 = {
    id: '', name: '', fullName: '', depth: 0, parentId: '', hasChildren: false, ancestorIds: [],
    description: '',
    newCount: 0, learningCount: 0, reviewCount: 0, totalCards: 0,
    tone: 牌组色调.Blue,
    displayName: '',
    backgroundImage: ''
  };
  @Prop selected: boolean = false;
  @Prop expanded: boolean = false;
  // 排序模式：true 时左侧显示≡手柄、行高亮描边、onClick 不触发选牌、长按不弹菜单。
  // 用户通过 牌组列表项 长按菜单的「拖动排序」项进入；Index.ets 顶部 Bar 上的「完成」退出。
  @Prop reorderMode: boolean = false;
  @State private 显示牌组菜单: boolean = false;
  // 沙盒背景图异步加载的 PixelMap。
  // 必须用 PixelMap 而不是直接传文件路径给 Image——ArkUI Image 对沙盒绝对路径解析不稳定，
  // 标准方式是 fileIo.openSync → image.createImageSource → createPixelMap → Image(pixelMap)。
  // LazyForEach keyItem 含 backgroundImage，deck 变化时 ListItem 重建，aboutToAppear 重新加载。
  @State private 背景像素图: PixelMap | null = null;
  // 双击检测：记录上次 onClick 时间戳，两次点击间隔 < 300ms 且 hasChildren 判为双击。
  // ArkUI 的 TapGesture({count:2}) 与 .onClick 冲突——onClick 消费第一次点击后双击手势收不到完整序列，
  // 必须手动用时序判定替代。
  private 上次点击时间: number = 0;
  onSelect: (deckId: string) => void = (deckId: string): void => {
  };
  onToggle: (deckId: string) => void = (deckId: string): void => {
  };
  onToneChange: (deckId: string, tone: 牌组色调) => void = (deckId: string, tone: 牌组色调): void => {
  };
  onCustomizeDeck: (deckId: string) => void = (deckId: string): void => {
  };
  // 用户在长按菜单选「拖动排序」时触发；Index.ets 进入 isReorderMode=true 状态。
  onEnterReorder: (deckId: string) => void = (deckId: string): void => {
  };
  // 用户在长按菜单选「删除牌组」时触发；Index.ets 弹 AlertDialog 二次确认后真正调 removeDecks。
  onDeleteDeck: (deckId: string) => void = (deckId: string): void => {
  };
  // 用户在长按菜单选「隐藏牌组」时触发；Index.ets 写入 hiddenDeckIds 持久化并从列表过滤。
  // 与删除不同：隐藏只在前端列表里隐藏，不动后端数据；可在设置页「已隐藏牌组」恢复。
  onHideDeck: (deckId: string) => void = (deckId: string): void => {
  };
  // 双击牌组行：递归展开/折叠所有子牌组。仅 hasChildren=true 时触发。
  onDoubleTap: (deckId: string) => void = (deckId: string): void => {
  };
  // 用户在长按菜单选「自定义学习」时触发；Index.ets 弹自定义学习对话框。
  onCustomStudy: (deckId: string) => void = (deckId: string): void => {
  };
  // 用户在长按菜单选「创建过滤牌组」时触发；Index.ets 弹创建过滤牌组面板。
  onCreateFilteredDeck: () => void = (): void => {
  };

  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.选中背景) private 选中背景色: string = '#E8EEFC';
  @StorageProp(颜色键.主色边框) private 主色边框色: string = '#B8CEFA';
  @StorageProp(颜色键.新卡计数色) private 新卡计数色: string = '#3974D9';
  // 简洁模式：true 时长按菜单不显示「自定义学习」「创建过滤牌组」两项高级入口
  @StorageLink(简洁模式AppStorage键) private 简洁模式: boolean = true;
  @StorageProp(颜色键.学习中计数色) private 学习中计数色: string = '#B56A22';
  @StorageProp(颜色键.复习中计数色) private 复习中计数色: string = '#7056C8';

  aboutToAppear(): void {
    this.异步加载背景像素图();
  }

  // ========================================================
  // @块ID UI-DECK-LIST-002
  // @名称 异步加载背景像素图
  //
  // @作用
  // 把沙盒背景图读入为 PixelMap，供 Image 组件稳定渲染。
  //
  // @输入
  // this.deck.backgroundImage：沙盒绝对路径，空串表示无背景图。
  //
  // @输出
  // this.背景像素图：成功时为 PixelMap，失败或路径为空时为 null（Stack 显示底色）。
  //
  // @业务规则
  // ArkUI Image 直接传沙盒绝对路径解析不稳定（部分版本白屏），
  // 标准方式是 fileIo.openSync → image.createImageSource(fd) → createPixelMap → Image(pixelMap)。
  // 失败时静默——背景像素图 保持 null，Stack 显示 surface_card 底色。
  //
  // @副作用
  // 读取沙盒文件、分配 PixelMap 资源；imageSource 在 finally 中 release。
  // ========================================================
  private async 异步加载背景像素图(): Promise<void> {
    const 路径: string = this.deck.backgroundImage;
    if (路径 === '') {
      this.背景像素图 = null;
      return;
    }
    try {
      const 文件: fs.File = fs.openSync(路径, fs.OpenMode.READ_ONLY);
      try {
        const 图像源: image.ImageSource = image.createImageSource(文件.fd);
        try {
          this.背景像素图 = await 图像源.createPixelMap();
        } finally {
          图像源.release();
        }
      } finally {
        await fs.close(文件);
      }
    } catch (error) {
      // 文件不存在或解码失败：背景像素图 保持 null，UI 显示底色
      this.背景像素图 = null;
    }
  }

  // ========================================================
  // @块ID UI-DECK-LIST-003
  // @名称 取色条颜色
  //
  // @作用
  // 把 牌组色调 枚举映射到对应的 color 资源。
  //
  // @输入
  // tone：牌组色调 枚举值。
  //
  // @输出
  // 对应的 $r('app.color.deck_xxx') 资源；未知值回退到 blue。
  //
  // @业务规则
  // 与 色条选项列表 中的 6 色资源一一对应；None 不走此方法（在 build 中判 transparent）。
  //
  // @副作用
  // 无。
  // ========================================================
  private 取色条颜色(tone: 牌组色调): Resource {
    switch (tone) {
      case 牌组色调.Purple:
        return $r('app.color.deck_purple');
      case 牌组色调.Mint:
        return $r('app.color.deck_mint');
      case 牌组色调.Amber:
        return $r('app.color.deck_amber');
      case 牌组色调.Black:
        return $r('app.color.deck_black');
      case 牌组色调.Red:
        return $r('app.color.deck_red');
      case 牌组色调.Blue:
      default:
        return $r('app.color.deck_blue');
    }
  }

  /** 五种常用颜色与无色条，顺序同时用于 Select 索引和回调映射。 */
  private readonly 色条选项列表: 色条选项[] = [
    { tone: 牌组色调.Blue, labelResource: $r('app.string.deck_tone_blue') },
    { tone: 牌组色调.Purple, labelResource: $r('app.string.deck_tone_purple') },
    { tone: 牌组色调.Mint, labelResource: $r('app.string.deck_tone_mint') },
    { tone: 牌组色调.Amber, labelResource: $r('app.string.deck_tone_amber') },
    { tone: 牌组色调.Red, labelResource: $r('app.string.deck_tone_red') },
    { tone: 牌组色调.None, labelResource: $r('app.string.deck_tone_none') }
  ];

  /** 原生选择框使用本地化名称，不修改持久化色调值。 */
  private toneOptions(): SelectOption[] {
    return this.色条选项列表.map((option: 色条选项): SelectOption => ({
      value: resourceText(this.getUIContext(), option.labelResource)
    }));
  }

  /** 历史黑色可继续显示，但不作为新的候选项。 */
  private toneIndex(): number {
    return this.色条选项列表.findIndex((option: 色条选项): boolean => option.tone === this.deck.tone);
  }

  /** 旧黑色色条不误标成蓝色。 */
  private toneLabel(): string {
    const index: number = this.toneIndex();
    const label: Resource = index >= 0 ? this.色条选项列表[index].labelResource : $r('app.string.deck_tone_black');
    return resourceText(this.getUIContext(), label);
  }

  /** 选择后关闭菜单，由首页保存并刷新当前牌组。 */
  private selectTone(index: number): void {
    if (index < 0 || index >= this.色条选项列表.length) return;
    this.显示牌组菜单 = false;
    this.onToneChange(this.deck.id, this.色条选项列表[index].tone);
  }

  // 注意：三个计数不能用 @Builder 方法渲染——ArkUI 的 @Builder 在首次渲染时
  // 捕获 this.deck 字段值后不响应 @Prop 后续变化，会导致学完卡后列表项的"新/学/复"
  // 数字不刷新。必须 inline 写在 build() 中，并由 build() 直接访问 this.deck.xxx。
  // 说明小字「今日还能学」用于解释这三个数字是"今日还能学多少"而非"总卡数"，
  // 对应 Anki 的 newCount = min(new_per_day - new_studied, 实际待学新卡数) 语义。

  // ========================================================
  // @块ID UI-DECK-LIST-004
  // @名称 长按弹层菜单构建器
  //
  // @作用
  // 渲染长按弹出的菜单与色条选择框，并上抛用户选择。
  //
  // @输入
  // this.色条选项列表：7 个色条候选项。
  //
  // @输出
  // 通过 onEnterReorder / onCustomizeDeck / onHideDeck / onDeleteDeck / onToneChange 上抛用户操作；
  // 关 Popup 时置 this.显示牌组菜单=false。
  //
  // @业务规则
  // 色条通过原生 Select 展示当前值；选择后关 Popup 再上抛回调。
  //
  // @副作用
  // 无。仅修改内部 @State 与上抛回调。
  // ========================================================

  /** 主菜单：色条选择框与牌组操作入口。 */
  @Builder
  private 主菜单() {
    Column({ space: 0 }) {
      Row() {
        Select(this.toneOptions())
          .selected(this.toneIndex())
          .value(this.toneLabel())
          .width('100%')
          .accessibilityText(
            $r('app.string.deck_menu_switch_tone'))
          .attributeModifier(new SelectStyle())
          .font(SelectStyle.controlFont)
          .borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number): void => { this.selectTone(index); })
      }
      .width('100%')
      .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
      .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding, top: 10, bottom: 10 })
      Row() {
        Text($r('app.string.deck_menu_reorder'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')
      .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
      .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding, top: 10, bottom: 10 })
      .onClick(() => {
        this.显示牌组菜单 = false;
        this.onEnterReorder(this.deck.id);
      })
      Row() {
        Text($r('app.string.deck_customize'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')
      .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
      .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding, top: 10, bottom: 10 })
      .onClick(() => {
        this.显示牌组菜单 = false;
        this.onCustomizeDeck(this.deck.id);
      })
      // 简洁模式下隐藏「自定义学习」「创建过滤牌组」两项高级入口
      if (!this.简洁模式) {
        Row() {
          Text($r('app.string.custom_study_menu'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .layoutWeight(1)
        }
        .width('100%')
        .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
        .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding, top: 10, bottom: 10 })
        .onClick(() => {
          this.显示牌组菜单 = false;
          this.onCustomStudy(this.deck.id);
        })
        Row() {
          Text($r('app.string.filtered_deck_title'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .layoutWeight(1)
        }
        .width('100%')
        .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
        .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding, top: 10, bottom: 10 })
        .onClick(() => {
          this.显示牌组菜单 = false;
          this.onCreateFilteredDeck();
        })
      }
      Row() {
        Text($r('app.string.deck_menu_hide'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')
      .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
      .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding, top: 10, bottom: 10 })
      .onClick(() => {
        this.显示牌组菜单 = false;
        this.onHideDeck(this.deck.id);
      })
      Row() {
        Text($r('app.string.deck_menu_delete'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.error_text'))
          .layoutWeight(1)
      }
      .width('100%')
      .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
      .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding, top: 10, bottom: 10 })
      .onClick(() => {
        this.显示牌组菜单 = false;
        this.onDeleteDeck(this.deck.id);
      })
    }
    .width(应用尺寸.contextMenuWidth)
    .backgroundColor($r('app.color.surface_card'))
    .borderRadius(应用尺寸.圆角_面板)
  }

  /** Popup 内容与页面其他菜单保持相同容器。 */
  @Builder
  private 弹层内容() {
    Column() {
      this.主菜单();
    }
  }

  // ========================================================
  // @块ID UI-DECK-LIST-005
  // @名称 牌组列表项主渲染
  //
  // @作用
  // 渲染单行：背景图层 + 行内容（箭头/手柄 + 色条 + 名称描述 + 计数）。
  // 处理选牌/双击/长按菜单交互。
  //
  // @输入
  // @Prop deck / selected / expanded / reorderMode；
  // @State 背景像素图 / 显示牌组菜单；
  // @StorageProp 6 个颜色键。
  //
  // @输出
  // 单行卡组列表项视觉；通过 onSelect / onToggle / onDoubleTap / 长按 Popup 上抛用户操作。
  //
  // @业务规则
  // 排序模式：onClick 不触发选牌，长按 duration 设极大值等效禁用。
  // 双击检测：两次 onClick 间隔 < 300ms 且 hasChildren → onDoubleTap（递归展开）。
  // 色条 tone===None 时不渲染色块，但保留 Column 占位维持行内对齐。
  // 排序模式下行描边用 动作主色 高亮，选中态用 主色边框色（更浅避免视觉过重）。
  //
  // @副作用
  // 无。仅上抛回调。
  // ========================================================
  build() {
    Stack() {
      // 底层：背景图（objectFit=Cover 与 牌组定制面板 预览口径一致，
      // 用户在面板内裁剪出来的选区就是这里实际显示的区域）
      // 必须用 PixelMap 渲染——ArkUI Image 直接传沙盒绝对路径解析不稳定（白屏）
      if (this.背景像素图 !== null) {
        Image(this.背景像素图)
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Cover)
          .borderRadius(应用尺寸.圆角_牌组行)
      }
      // Row 内容：箭头/手柄/色条/文字/计数
      Row({ space: 应用尺寸.间距_12 }) {
        // 箭头槽位：所有行同宽占位，父子行内容纵向对齐；仅用 ▼ 字形旋转向右，规避 ▶ 的 emoji 呈现
        // reorderMode 时显示 ≡ 手柄（提示可拖），且 onClick 不触发折叠/展开
        Column() {
          if (this.reorderMode) {
            Text('≡')
              .fontSize(应用尺寸.字号_标题)
              .fontColor($r('app.color.text_secondary'))
          } else if (this.deck.hasChildren) {
            Text('▼')
              .fontSize(应用尺寸.字号_标题)
              .fontColor($r('app.color.text_secondary'))
              .rotate({ angle: this.expanded ? 0 : -90 })
              .animation({ duration: 150, curve: Curve.EaseOut })
          }
        }
        .width(应用尺寸.箭头槽位宽度)
        .height(应用尺寸.箭头槽位高度)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .margin({ left: -应用尺寸.间距_10 })
        .onClick(() => {
          if (this.reorderMode) {
            return;
          }
          if (this.deck.hasChildren) {
            this.onToggle(this.deck.id);
          }
        })
        // 色条：tone===None 时不渲染色块，但保留 Column 占位以维持行内对齐。
        Column()
          .width(应用尺寸.色条宽度)
          .height(应用尺寸.色条高度)
          .backgroundColor(
            this.deck.tone === 牌组色调.None ? Color.Transparent : this.取色条颜色(this.deck.tone))
          .borderRadius(应用尺寸.圆角_色条)
        Column({ space: 应用尺寸.间距_5 }) {
          Text(牌组显示名(this.deck))
            .fontSize(应用尺寸.字号_标题)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.deck.description)
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_secondary'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Column({ space: 应用尺寸.间距_5 }) {
          Row({ space: 应用尺寸.间距_8 }) {
            Text($r('app.string.deck_new_short', this.deck.newCount))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor(this.新卡计数色)
            Text($r('app.string.deck_learning_short', this.deck.learningCount))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor(this.学习中计数色)
            Text($r('app.string.deck_review_short', this.deck.reviewCount))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor(this.复习中计数色)
          }
        }
        .alignItems(HorizontalAlign.End)
      }
      .width('100%')
      .padding({
        left: 应用尺寸.间距_14 + this.deck.depth * 应用尺寸.间距_16,
        right: 应用尺寸.间距_14,
        top: 应用尺寸.间距_13,
        bottom: 应用尺寸.间距_13
      })
      .onClick(() => {
        // 排序模式下不触发选牌；长按手柄+拖动才是预期操作
        if (this.reorderMode) {
          return;
        }
        // 双击检测：两次点击间隔 < 300ms 且当前牌组有子牌组时，触发递归展开/折叠。
        // 第一次点击走 onSelect（选牌），第二次点击（间隔内）走 onDoubleTap（递归展开）。
        const 当前时间: number = Date.now();
        const 间隔: number = 当前时间 - this.上次点击时间;
        if (间隔 < 300 && this.deck.hasChildren) {
          this.上次点击时间 = 0;
          this.onDoubleTap(this.deck.id);
          return;
        }
        this.上次点击时间 = 当前时间;
        this.onSelect(this.deck.id);
      })
      // 排序模式下把 LongPressGesture 的 duration 改到极大值（等效禁用），
      // 避免子组件的长按手势偷走 List.onMove 的事件；onAction 内再加守卫兜底。
      .gesture(
        LongPressGesture({ repeat: false, duration: this.reorderMode ? 99999999 : 500 })
          .onAction(() => {
            if (this.reorderMode) {
              return;
            }
            this.显示牌组菜单 = true;
          })
      )
      .bindPopup(this.显示牌组菜单, {
        builder: this.弹层内容,
        placement: Placement.Bottom,
        popupColor: $r('app.color.surface_card'),
        enableArrow: true,
        onStateChange: (event: 弹层状态事件): void => {
          if (!event.isVisible) {
            this.显示牌组菜单 = false;
          }
        }
      })
    }
    .width('100%')
    .height(应用尺寸.牌组行高度)
    .clip(true)
    .borderRadius(应用尺寸.圆角_牌组行)
    .linearGradient({ angle: 110, colors: this.visual.selectedColors.length > 0 && this.selected
      ? themeGradient(this.glassColors)
      : [[Color.Transparent, 0], [Color.Transparent, 1]] })
    // 背景已经是柔化彩雾，透明底与高光形成玻璃感，无需列表逐项实时模糊。
    .backgroundColor(this.selected
      ? (this.visual.selectedColors.length > 0 ? Color.Transparent : this.选中背景色)
      : $r('app.color.surface_card'))
    .shadow({ radius: this.selected && this.visual.selectedColors.length > 0 ? 8 : 0,
      color: '#140F2350', offsetY: 2 })
    .border({
      width: 应用尺寸.卡片边框,
      // 排序模式下行描边用 动作主色 高亮，让用户感知「现在可拖」；
      // 选中态用 主色边框色（比 动作主色 浅，避免选中行视觉过重）
      color: this.reorderMode
        ? this.动作主色 : (this.selected ?
          (this.visual.selectedColors.length > 0 ? '#80FFFFFF' : this.主色边框色) : $r('app.color.border_subtle'))
    })
  }
}
