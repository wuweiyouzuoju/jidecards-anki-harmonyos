// SPDX-License-Identifier: AGPL-3.0-or-later
import { disclosureAnimation } from '../utils/AppMotion';
import { PressFeedback } from '../utils/PressFeedback';
import { DeckRowMenuGesture } from '../utils/DeckRowMenuGesture';
import { ActionMenuAnchor } from './common/ActionMenuLayout';
import { DisclosureChevron } from './common/DisclosureChevron';
import { ActionIcon } from './common/ActionIcon';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { DECK_LIST_NARROW_KEY } from '../model/DeckListAppearance';
import { resourceText } from '../utils/UiFeedback';
import { ThemeDefinition, themeDefinition, THEME_VISUALS_KEY } from '../model/ThemeCatalog';
import { themeGradient } from '../utils/ThemeVisuals';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';

import { 牌组汇总, 牌组色调, 牌组显示名 } from '../model/主页模型';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { loadDeckBackground, releaseDeckBackground } from '../backend/DeckBackgroundImage';

// ========================================================
// @块ID UI-DECK-LIST-001
// @名称 牌组列表项 组件主体字段
//
// @作用
// 卡组列表行的展示与交互承载：色条 + 名称/描述 + 待学计数，
// 选中态高亮，长按将牌组 ID 和实时行锚点交给首页公共菜单。
//
// @输入
// @Prop deck：牌组汇总数据（保留英文名以兼容 deck-hierarchy-contract 测试断言 deck.depth / deck.hasChildren）。
// @Prop selected：是否已选中（高亮描边）。
// @Prop expanded：是否已展开子牌组（保留英文名以兼容测试断言）。
// @Prop reorderMode：是否处于排序模式（显示 ≡ 手柄、禁用选牌与长按菜单）。
// 父组件传入的回调 onSelect / onToggle / onMenu / onDoubleTap。
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

@Component
export struct 牌组列表项 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(DECK_LIST_NARROW_KEY) private narrow: boolean = false;
  @StorageProp(GLASS_COLORS_KEY) private glassColors: string[] = GLASS_HIGHLIGHT_COLORS;
  @StorageProp(THEME_VISUALS_KEY) private visual: ThemeDefinition = themeDefinition('aurora');
  // 注：deck / expanded / onToggle 保留英文名以兼容 deck-hierarchy-contract.test.mjs 阶段 6 前的断言。
  @Prop @Watch('backgroundChanged') deck: 牌组汇总 = {
    id: '', name: '', fullName: '', depth: 0, parentId: '', hasChildren: false, ancestorIds: [],
    description: '',
    newCount: 0, learningCount: 0, reviewCount: 0, totalCards: 0,
    tone: 牌组色调.Blue,
    displayName: '',
    backgroundImage: ''
  };
  @Prop selected: boolean = false;
  @Prop hideStudyCounts: boolean = false;
  @Prop expanded: boolean = false;
  // 排序模式：true 时左侧显示≡手柄、行高亮描边、onClick 不触发选牌、长按不弹菜单。
  // 用户通过 牌组列表项 长按菜单的「拖动排序」项进入；Index.ets 顶部 Bar 上的「完成」退出。
  @Prop reorderMode: boolean = false;
  @Prop menuOpen: boolean = false;
  @State private textColumnWidth: number = 0;
  // 沙盒背景图异步加载的 PixelMap。
  // 必须用 PixelMap 而不是直接传文件路径给 Image——ArkUI Image 对沙盒绝对路径解析不稳定，
  // 标准方式是 fileIo.openSync → image.createImageSource → createPixelMap → Image(pixelMap)。
  // LazyForEach keyItem 含 backgroundImage，deck 变化时 ListItem 重建，aboutToAppear 重新加载。
  @State private 背景像素图: PixelMap | null = null;
  // 双击检测：记录上次 onClick 时间戳，两次点击间隔 < 300ms 且 hasChildren 判为双击。
  // ArkUI 的 TapGesture({count:2}) 与 .onClick 冲突——onClick 消费第一次点击后双击手势收不到完整序列，
  // 必须手动用时序判定替代。
  private 上次点击时间: number = 0;
  private disposed: boolean = true;
  private imageGeneration: number = 0;
  private backgroundPath: string = '';
  private menuAnchor: ActionMenuAnchor = { left: 0, top: 0, width: 0, height: 0 };
  onSelect: (deckId: string) => void = (deckId: string): void => {
  };
  onToggle: (deckId: string) => void = (deckId: string): void => {
  };
  onMenu: (deckId: string, anchor: ActionMenuAnchor) => void = (): void => {};
  onDoubleTap: (deckId: string) => void = (_deckId: string): void => {};

  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.选中背景) private 选中背景色: string = '#E8EEFC';
  @StorageProp(颜色键.主色边框) private 主色边框色: string = '#B8CEFA';
  @StorageProp(颜色键.新卡计数色) private 新卡计数色: string = '#3974D9';
  @StorageProp(颜色键.学习中计数色) private 学习中计数色: string = '#B56A22';
  @StorageProp(颜色键.复习中计数色) private 复习中计数色: string = '#7056C8';

  aboutToAppear(): void {
    this.disposed = false;
    this.backgroundChanged();
  }

  aboutToDisappear(): void {
    this.disposed = true;
    this.imageGeneration++;
    this.backgroundPath = '';
    const previous: PixelMap | null = this.背景像素图;
    this.背景像素图 = null;
    releaseDeckBackground(previous);
  }

  private backgroundChanged(): void {
    if (this.disposed || this.backgroundPath === this.deck.backgroundImage) return;
    this.backgroundPath = this.deck.backgroundImage;
    this.异步加载背景像素图();
  }

  private openMenu(event: GestureEvent): void {
    if (this.reorderMode || this.menuOpen || this.menuAnchor.width <= 0) return;
    // 长按回调里的局部/窗口坐标属于同一个行节点；列表滚动不依赖 onAreaChange 重新触发。
    const finger: FingerInfo | undefined = event.fingerList.find((point: FingerInfo): boolean =>
      point !== undefined && Number.isFinite(point.globalX) && Number.isFinite(point.globalY) &&
      Number.isFinite(point.localX) && Number.isFinite(point.localY));
    const anchor: ActionMenuAnchor = finger === undefined ? this.menuAnchor : {
      left: finger.globalX - finger.localX, top: finger.globalY - finger.localY,
      width: this.menuAnchor.width, height: this.menuAnchor.height
    };
    this.onMenu(this.deck.id, anchor);
  }

  /** 组件拥有返回图片；旧请求与销毁后的解码结果只释放，不回写。 */
  private async 异步加载背景像素图(): Promise<void> {
    const path: string = this.deck.backgroundImage;
    const generation: number = ++this.imageGeneration;
    const previous: PixelMap | null = this.背景像素图;
    this.背景像素图 = null;
    releaseDeckBackground(previous);
    if (path === '') return;
    try {
      const pixels: PixelMap = await loadDeckBackground(path);
      if (this.disposed || generation !== this.imageGeneration || path !== this.deck.backgroundImage) {
        releaseDeckBackground(pixels);
        return;
      }
      this.背景像素图 = pixels;
    } catch (error) {
      console.warn('[deck-background] Preview unavailable: ' + String(error));
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
  // 保留历史黑色；None 不走此方法（在 build 中判 transparent）。
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
  // @State 背景像素图；@Prop menuOpen；
  // @StorageProp 6 个颜色键。
  //
  // @输出
  // 单行卡组列表项视觉；通过 onSelect / onToggle / onDoubleTap / 长按菜单 上抛用户操作。
  //
  // @业务规则
  // 排序模式：onClick 不触发选牌，移除菜单长按识别器，由 ListItem 接管拖动。
  // 双击检测：两次 onClick 间隔 < 300ms 且 hasChildren → onDoubleTap（递归展开）。
  // 色条 tone===None 时不渲染色块，但保留 Column 占位维持行内对齐。
  // 排序模式下行描边用 动作主色 高亮，选中态用 主色边框色（更浅避免视觉过重）。
  //
  // @副作用
  // 无。仅上抛回调。
  // ========================================================
  private expansionLabel(_locale: string = this.uiLanguage): string {
    const label: Resource = this.expanded ? $r('app.string.deck_collapse') : $r('app.string.deck_expand');
    return resourceText(this.getUIContext(), label, 牌组显示名(this.deck, this.uiLanguage));
  }

  private compactText(): boolean {
    if (!this.narrow || this.deck.description.trim().length === 0 ||
      this.textColumnWidth <= 0) {
      return false;
    }
    const name: string = 牌组显示名(this.deck, this.uiLanguage);
    // 始终测原字号，避免缩小后变成一行又恢复字号的反复跳动。
    const nameWidth: number = this.getUIContext().getMeasureUtils().measureText({
      textContent: name,
      fontSize: 应用尺寸.字号_强调,
      fontWeight: FontWeight.Medium
    });
    return name.includes('\n') || name.includes('\r') ||
      nameWidth > Math.ceil(this.getUIContext().vp2px(this.textColumnWidth));
  }

  @Builder
  private expansionControl() {
    Column() {
      if (this.reorderMode) {
        ActionIcon({ source: $r('app.media.ic_common_drag'), tint: Color.Transparent })
      } else if (this.deck.hasChildren) {
        DisclosureChevron()
          .rotate({ angle: this.expanded ? 90 : 0 })
          .animation(disclosureAnimation())
      }
    }
    .width(this.narrow ? 24 : 应用尺寸.箭头槽位宽度)
    .height(应用尺寸.箭头槽位高度)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .margin({ left: this.narrow ? 0 : -应用尺寸.间距_10 })
    .accessibilityText(this.expansionLabel())
    .accessibilityLevel(!this.reorderMode && this.deck.hasChildren ? 'yes' : 'no')
    .attributeModifier(new PressFeedback())
    .onClick(() => {
      if (!this.reorderMode && this.deck.hasChildren) {
        this.onToggle(this.deck.id);
      }
    })
  }

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
      Row({ space: this.narrow ? 应用尺寸.间距_6 : 应用尺寸.间距_12 }) {
        // 同层级统一保留左侧槽位；窄版缩小槽宽，无子牌组也占位以对齐名称。
        this.expansionControl()
        // 窄版连同色条占位一起移除；保留色调偏好，切回宽版恢复。
        if (!this.narrow) {
          Column()
            .width(应用尺寸.色条宽度)
            .height(应用尺寸.色条高度)
            .backgroundColor(
              this.deck.tone === 牌组色调.None ? Color.Transparent : this.取色条颜色(this.deck.tone))
            .borderRadius(应用尺寸.圆角_色条)
        }
        Column({ space: this.narrow ? 应用尺寸.间距_3 : 应用尺寸.间距_5 }) {
          Text(牌组显示名(this.deck, this.uiLanguage))
            .fontSize(this.narrow ?
              (this.compactText() ? 应用尺寸.字号_正文 : 应用尺寸.字号_强调) : 应用尺寸.字号_标题)
            .lineHeight(this.narrow ? (this.compactText() ? 16 : 20) : 22)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary'))
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          if (!this.narrow || this.deck.description.trim().length > 0) {
            Text(this.deck.description)
              .fontSize(this.narrow ?
                (this.compactText() ? 应用尺寸.字号_说明 : 应用尺寸.字号_正文_小) : 应用尺寸.字号_正文_中)
              .lineHeight(this.compactText() ? 12 : 16)
              .fontColor($r('app.color.text_secondary'))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        .onAreaChange((_oldArea: Area, newArea: Area): void => {
          this.textColumnWidth = Number(newArea.width);
        })
        if (!this.hideStudyCounts) {
          Column({ space: 应用尺寸.间距_5 }) {
            Row({ space: this.narrow ? 应用尺寸.间距_6 : 应用尺寸.间距_8 }) {
              Text($r('app.string.deck_new_short', this.deck.newCount))
                .fontSize(this.narrow ? 应用尺寸.字号_说明 : 应用尺寸.字号_正文_小)
                .fontColor(this.新卡计数色)
              Text($r('app.string.deck_learning_short', this.deck.learningCount))
                .fontSize(this.narrow ? 应用尺寸.字号_说明 : 应用尺寸.字号_正文_小)
                .fontColor(this.学习中计数色)
              Text($r('app.string.deck_review_short', this.deck.reviewCount))
                .fontSize(this.narrow ? 应用尺寸.字号_说明 : 应用尺寸.字号_正文_小)
                .fontColor(this.复习中计数色)
            }
          }
          .alignItems(HorizontalAlign.End)
        }
      }
      .width('100%')
      .padding({
        left: (this.narrow ? 应用尺寸.间距_12 : 应用尺寸.间距_14) + this.deck.depth * 应用尺寸.间距_16,
        right: this.narrow ? 应用尺寸.间距_12 : 应用尺寸.间距_14,
        top: this.narrow ? 应用尺寸.间距_6 : 应用尺寸.间距_13,
        bottom: this.narrow ? 应用尺寸.间距_6 : 应用尺寸.间距_13
      })
      .attributeModifier(new PressFeedback())
      .onClick(() => {
        if (this.reorderMode || this.menuOpen) return;
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
    }
    .width('100%')
    .height(应用尺寸.deckRowHeight(this.narrow))
    .onAreaChange((_old: Area, area: Area): void => {
      this.menuAnchor = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
        width: Number(area.width), height: Number(area.height) };
    })
    .gestureModifier(new DeckRowMenuGesture(this.reorderMode, (event: GestureEvent): void => { this.openMenu(event); }))
    .clip(true)
    .linearGradient({ angle: 110, colors: this.visual.selectedColors.length > 0 && this.selected
      ? themeGradient(this.glassColors)
      : [[Color.Transparent, 0], [Color.Transparent, 1]] })
    // 背景已经是柔化彩雾，透明底与高光形成玻璃感，无需列表逐项实时模糊。
    .backgroundColor(this.selected
      ? (this.visual.selectedColors.length > 0 ? Color.Transparent : this.选中背景色)
      : $r('app.color.surface_card'))
    .shadow({ radius: this.selected && this.visual.selectedColors.length > 0 ? 8 : 0,
      color: '#140F2350', offsetY: 2 })
    .border(SurfaceBorder.options(应用尺寸.卡片边框,
      // 排序模式下行描边用 动作主色 高亮，让用户感知「现在可拖」；
      // 选中态用 主色边框色（比 动作主色 浅，避免选中行视觉过重）
      this.reorderMode
        ? this.动作主色 : (this.selected ?
          (this.visual.selectedColors.length > 0 ? '#80FFFFFF' : this.主色边框色) : SurfaceBorder.color())
    )).borderRadius(应用尺寸.圆角_牌组行)
  }
}
