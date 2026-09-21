// SPDX-License-Identifier: AGPL-3.0-or-later

import type { 牌组背景动作, 牌组定制结果 } from '../model/DeckCustomization';
import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-DECK-CUSTOMIZE-001
// @名称 牌组定制面板
//
// @作用
// 牌组自定义弹层（全屏磨砂覆盖层）。承载两件事：
//   1. 牌组改名（保留原 fullName 含 :: 以编辑层级；走本地 displayName
//      覆盖，不动后端）
//   2. 牌组背景图：PhotoViewPicker 选图 → IBestImageCropper 裁剪 →
//      PixelMap 上抛父级落盘
//
// 裁剪框尺寸 = 预览区实际尺寸（onAreaChange 测量），与牌组列表项渲染时
// objectFit=Cover 保持一致，确保用户在裁剪器里看到的选区就是牌组行实际
// 显示的区域。
//
// @输入
// isDark: 是否深色主题（控制遮罩色与磨砂风格）
// deck: 当前牌组汇总（含 id/name/fullName/backgroundImage 等）
// busy: 父级是否正在落盘（禁用所有交互）
// errorMessage: 父级下发的错误文案（空则不显示）
//
// @输出
// onClose: 用户取消时回调（点遮罩）
// onSave: 用户提交时回调，参数为 牌组定制结果（新名 + 背景动作 + 像素图）
//
// @业务规则
// 保留字面量字符串值 'keep' | 'remove' | 'replace'（背景动作枚举值，
// 与父级处理逻辑耦合，作为协议值保留英文）。
// IBestImageCropper / IBestImageCropperController / fileIo / image / common
// 等第三方与 HarmonyOS API 保留英文。
//
// @副作用
// 仅通过外部回调引发后端写入；本组件不直接落盘。裁剪后的 PixelMap 通过
// onSave 上抛，由父级负责持久化。
// ========================================================

import { common } from '@kit.AbilityKit';
import { IBestImageCropper } from '@ibestservices/ibest-ui';
import { IBestImageCropperController } from '@ibestservices/ibest-ui';
import { image } from '@kit.ImageKit';
import { fileIo } from '@kit.CoreFileKit';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 牌组汇总, 牌组色调, 牌组显示名 } from '../model/主页模型';
import { 从图库选取图片 } from '../utils/文件导入助手';
import { 颜色键 } from '../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';

export type { 牌组背景动作, 牌组定制结果 } from '../model/DeckCustomization';

@Component
export struct 牌组定制面板 {
  @Prop isDark: boolean = false;
  @Prop deck: 牌组汇总 = {
    id: '', name: '', fullName: '', depth: 0, parentId: '', hasChildren: false, ancestorIds: [],
    description: '',
    newCount: 0, learningCount: 0, reviewCount: 0, totalCards: 0,
    tone: 牌组色调.Blue,
    displayName: '',
    backgroundImage: ''
  };
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  onClose: () => void = (): void => {};
  onSave: (结果: 牌组定制结果) => void = (_r: 牌组定制结果): void => {};

  // 裁剪/选图等内部操作的错误信息（与父组件传入的 errorMessage 分开，build 里一并显示）
  @State private 本地错误: string = '';

  @State private 编辑中名称: string = '';
  // 选图后等待裁剪的源图 uri（PhotoViewPicker 返回的 provider uri）
  @State private 待裁剪Uri: string = '';
  // 是否进入裁剪模式（全屏覆盖原面板）
  @State private 裁剪模式: boolean = false;
  // 裁剪框尺寸（由预览区 onAreaChange 测量得到，未测量前用 0 占位，0 时 cropper 不渲染）
  @State private 预览宽度: number = 0;
  @State private 预览高度: number = 0;
  // 用户在裁剪模式按"取消"前的背景图动作意图：用于区分"用户主动移除"与"保留原状"
  @State private 背景动作: 牌组背景动作 = 'keep';
  // 裁剪后的 PixelMap（仅 replace 时非空）；@State 持有让 Image 预览能响应刷新
  @State private 已裁剪像素图: PixelMap | null = null;
  // 原背景图（keep 态显示）异步加载的 PixelMap；与牌组列表项同款方式：
  // fileIo.openSync → image.createImageSource → createPixelMap，避免直接传沙盒路径白屏
  @State private 原像素图: PixelMap | null = null;

  private readonly 裁剪器控制器: IBestImageCropperController = new IBestImageCropperController();
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';

  aboutToAppear(): void {
    this.编辑中名称 = 牌组显示名(this.deck);
    // 已有背景图：保留态；无背景图：保留态（不修改）。用户操作后切到 remove/replace。
    this.背景动作 = 'keep';
    this.加载原像素图();
  }

  /** 异步加载牌组原有背景图为 PixelMap（与牌组列表项.loadBackgroundPixelMap 同款）。
   *  ArkUI Image 直接传沙盒绝对路径解析不稳定，必须用 PixelMap。 */
  private async 加载原像素图(): Promise<void> {
    const 路径: string = this.deck.backgroundImage;
    if (路径 === '') {
      this.原像素图 = null;
      return;
    }
    try {
      const 文件: fileIo.File = fileIo.openSync(路径, fileIo.OpenMode.READ_ONLY);
      try {
        const 图像源: image.ImageSource = image.createImageSource(文件.fd);
        try {
          this.原像素图 = await 图像源.createPixelMap();
        } finally {
          图像源.release();
        }
      } finally {
        await fileIo.close(文件);
      }
    } catch (错误) {
      this.原像素图 = null;
    }
  }

  private 可提交(): boolean {
    if (this.busy) {
      return false;
    }
    if (this.编辑中名称.trim().length === 0) {
      return false;
    }
    // 替换背景必须先完成裁剪（待裁剪Uri === '' 表示已裁剪完成或未选图）
    if (this.背景动作 === 'replace' && this.待裁剪Uri !== '') {
      return false;
    }
    return true;
  }

  /** 点"选择图片"或"替换图片"：调起 PhotoViewPicker → 进入裁剪模式。 */
  private async 选取并裁剪(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.本地错误 = '';
    const 上下文: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (上下文 === undefined) {
      return;
    }
    const uri: string | null = await 从图库选取图片(上下文);
    if (uri === null || uri === '') {
      // 用户取消或选图失败：静默返回，不打错误提示（cancel 是正常流程）
      return;
    }
    this.待裁剪Uri = uri;
    this.裁剪模式 = true;
  }

  /** 用户在裁剪模式点"应用裁剪"：从 cropper 拿 PixelMap，标记 replace，关闭裁剪模式。
   *  PixelMap 暂存到 已裁剪像素图 字段（@State），submit 时上抛。
   *  注意：必须清空 待裁剪Uri——可提交() 用 `背景动作 === 'replace'
   *  && 待裁剪Uri !== ''` 判断"replace 但还没裁剪"，若不清空会卡死保存键。 */
  private async 应用裁剪(): Promise<void> {
    if (this.busy) {
      return;
    }
    try {
      const 像素图: PixelMap = await this.裁剪器控制器.getResult();
      this.已裁剪像素图 = 像素图;
      this.背景动作 = 'replace';
      this.裁剪模式 = false;
      this.待裁剪Uri = '';
    } catch (错误) {
      // 裁剪失败：留在裁剪模式让用户重试，错误显示到面板底部 本地错误
      this.本地错误 = 错误 instanceof Error ? 错误.message : `${错误}`;
    }
  }

  /** 当前预览框是否有图（用于按钮文本/显示判断）。
   *  remove 态无图；replace 态看 已裁剪像素图；keep 态看 原像素图。 */
  private 是否有背景(): boolean {
    if (this.背景动作 === 'remove') {
      return false;
    }
    if (this.背景动作 === 'replace') {
      return this.已裁剪像素图 !== null;
    }
    // keep
    return this.原像素图 !== null;
  }

  /** 用户在裁剪模式点"取消"：放弃当前选图，回到面板。
   *  只关闭裁剪模式 + 清 待裁剪Uri；不动 已裁剪像素图 与 背景动作：
   *  - 首次选图取消：背景动作 仍是 keep、已裁剪像素图 仍是 null → 回到原态
   *  - 已裁剪后再次选图取消：背景动作 仍是 replace、已裁剪像素图 保留上次结果 → 回到上次裁剪预览
   *  旧实现清掉 已裁剪像素图 并把 replace 回退为 keep，会丢失用户上一次的裁剪成果。 */
  private 取消裁剪(): void {
    this.裁剪模式 = false;
    this.待裁剪Uri = '';
  }

  /** 用户点"移除背景"：标记 remove，清掉待裁剪状态。 */
  private 标记移除(): void {
    if (this.busy) {
      return;
    }
    this.背景动作 = 'remove';
    this.已裁剪像素图 = null;
    this.待裁剪Uri = '';
  }

  /** 移除后又想保留：点预览区恢复。 */
  private 撤销移除(): void {
    if (this.busy) {
      return;
    }
    this.背景动作 = 'keep';
  }

  /** 提交时把 已裁剪像素图 拼进结果（覆盖 null 占位）。 */
  private 提交带像素图(): void {
    if (!this.可提交()) {
      return;
    }
    this.onSave({
      新名: this.编辑中名称,
      背景动作: this.背景动作,
      背景像素图: this.已裁剪像素图
    });
  }

  build() {
    Stack() {
      // ---- 底层：磨砂遮罩 + 主面板 ----
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => { if (!this.busy && !this.裁剪模式) this.onClose(); })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      // ---- 主面板 ----
      Column({ space: 应用尺寸.间距_12 }) {
        DialogHeader({
          title: $r('app.string.deck_customize_title'),
          actionLabel: $r('app.string.deck_customize_save'),
          actionEnabled: this.可提交(),
          closeLabel: $r('app.string.create_deck_cancel'),
          closeEnabled: !this.busy,
          onClose: (): void => { this.onClose(); },
          onAction: () => { this.提交带像素图(); }
        })

        // 牌组名输入：保留原 fullName（含 ::）以编辑层级
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.deck_customize_name_label'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          TextInput({ text: this.编辑中名称 })
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .enabled(!this.busy)
            .onChange((值: string) => { this.编辑中名称 = 值; })
        }.width('100%')

        // 背景图预览与操作区
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.deck_customize_background_label'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          Text($r('app.string.deck_customize_background_hint'))
            .fontSize(应用尺寸.字号_说明)
            .fontColor($r('app.color.text_tertiary'))
            .width('100%')

          // 预览框：与牌组行实际渲染口径一致（objectFit=Cover + 同宽度 + 同高度）
          // onAreaChange 测量实际尺寸供 cropper 使用；
          // 预览框高度 = 应用尺寸.牌组行高度（与牌组列表项自适应行高一致，
          // 保证用户在裁剪器看到的选区比例就是牌组行实际显示的比例）
          Stack() {
            if (this.背景动作 === 'remove') {
              // 已标记移除：显示空态可恢复
              Column({ space: 应用尺寸.间距_5 }) {
                Text($r('app.string.deck_customize_background_remove'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_tertiary'))
              }
              .width('100%')
              .height('100%')
              .justifyContent(FlexAlign.Center)
              .alignItems(HorizontalAlign.Center)
              .onClick(() => { this.撤销移除(); })
            } else if (this.背景动作 === 'replace' && this.已裁剪像素图 !== null) {
              // 已裁剪：显示裁剪结果预览（PixelMap）
              Image(this.已裁剪像素图)
                .width('100%')
                .height('100%')
                .objectFit(ImageFit.Cover)
                .borderRadius(应用尺寸.圆角_面板)
              // 右上角 × 删除：markAnchor 锚定元素右上角，position 锚定 Stack 右上角，
              // translate 推 4px 内边距；避免 position('88%') 在不同预览宽度下距右边漂移
              Button('×')
                .type(ButtonType.Circle)
                .width(24)
                .height(24)
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_primary'))
                .backgroundColor('rgba(0,0,0,0.45)')
                .markAnchor({ x: '100%', y: '0%' })
                .position({ x: '100%', y: 0 })
                .translate({ x: -4, y: 4 })
                .onClick(() => { this.标记移除(); })
            } else if (this.原像素图 !== null) {
              // 沿用原背景图（用 PixelMap 渲染，避免沙盒路径白屏）
              Image(this.原像素图)
                .width('100%')
                .height('100%')
                .objectFit(ImageFit.Cover)
                .borderRadius(应用尺寸.圆角_面板)
              Button('×')
                .type(ButtonType.Circle)
                .width(24)
                .height(24)
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_primary'))
                .backgroundColor('rgba(0,0,0,0.45)')
                .markAnchor({ x: '100%', y: '0%' })
                .position({ x: '100%', y: 0 })
                .translate({ x: -4, y: 4 })
                .onClick(() => { this.标记移除(); })
            } else {
              // 无背景图：空态
              Column()
                .width('100%')
                .height('100%')
                .justifyContent(FlexAlign.Center)
                .alignItems(HorizontalAlign.Center)
            }
          }
          .width('100%')
          .height(应用尺寸.牌组行高度)
          .backgroundColor($r('app.color.surface_page'))
          .borderRadius(应用尺寸.圆角_面板)
          .border({
            width: 应用尺寸.卡片边框,
            color: $r('app.color.border_subtle')
          })
          .onAreaChange((_旧: Area, 新区域: Area) => {
            // Area.width/height 在 ArkTS 里是 Length 类型（string|number），需转 number
            const 宽: number = typeof 新区域.width === 'number'
              ? 新区域.width : parseInt(新区域.width as string, 10);
            const 高: number = typeof 新区域.height === 'number'
              ? 新区域.height : parseInt(新区域.height as string, 10);
            if (!Number.isNaN(宽) && !Number.isNaN(高)) {
              this.预览宽度 = 宽;
              this.预览高度 = 高;
            }
          })

          // 操作按钮：选择图片 / 替换图片 / 移除背景
          // 按钮文本与显示用 是否有背景() 统一判断，避免 标记移除 后 deck.backgroundImage
          // 仍非空导致按钮文本/显示不正确
          Row({ space: 应用尺寸.间距_8 }) {
            Button(this.是否有背景()
              ? $r('app.string.deck_customize_background_replace')
              : $r('app.string.deck_customize_background_pick'))
              .type(ButtonType.Normal)
              .layoutWeight(1)
              .height(应用尺寸.按钮高度)
              .fontSize(应用尺寸.字号_按钮)
              .fontColor($r('app.color.text_primary'))
              .backgroundColor($r('app.color.surface_card'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
              .borderRadius(应用尺寸.圆角_胶囊)
              .enabled(!this.busy)
              .onClick(() => { this.选取并裁剪(); })
            if (this.是否有背景()) {
              Button($r('app.string.deck_customize_background_remove'))
                .type(ButtonType.Normal)
                .layoutWeight(1)
                .height(应用尺寸.按钮高度)
                .fontSize(应用尺寸.字号_按钮)
                .fontColor($r('app.color.error_text'))
                .backgroundColor($r('app.color.surface_card'))
                .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
                .borderRadius(应用尺寸.圆角_胶囊)
                .enabled(!this.busy)
                .onClick(() => { this.标记移除(); })
            }
          }
          .width('100%')
        }
        .width('100%')

        if (this.errorMessage !== '') {
          Text(this.errorMessage)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
        }
        if (this.本地错误 !== '') {
          Text(this.本地错误)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
        }

        Blank()

      }
      .width('88%')
      .height('88%')
      .constraintSize({ maxWidth: 480 })
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {
        // 阻断点击穿透到遮罩
      })
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))

      // ---- 顶层：裁剪模式覆盖层（仅 裁剪模式=true 时显示）----
      if (this.裁剪模式) {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('rgba(0,0,0,0.85)')
          .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        Column({ space: 应用尺寸.间距_12 }) {
          DialogHeader({
            title: $r('app.string.deck_customize_background_crop_title'),
            actionLabel: $r('app.string.deck_customize_background_crop_confirm'),
            actionEnabled: true,
            closeLabel: $r('app.string.deck_customize_background_crop_cancel'),
            closeEnabled: true,
            onClose: () => { this.取消裁剪(); },
            onAction: () => { this.应用裁剪(); }
          })
          Text($r('app.string.deck_customize_background_crop_hint'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')

          // 裁剪器：仅在 预览宽度/高度 测量完成后渲染（避免 0 尺寸导致组件初始化异常）
          // 组件高度 = 预览高度 * 3，给用户足够的拖动空间；裁剪框尺寸 = 预览尺寸（与实机一致）
          if (this.预览宽度 > 0 && this.预览高度 > 0 && this.待裁剪Uri !== '') {
            Column() {
              IBestImageCropper({
                componentWidth: this.预览宽度,
                componentHeight: this.预览高度 * 3,
                url: this.待裁剪Uri,
                shape: 'rect',
                centerWidth: this.预览宽度,
                centerHeight: this.预览高度,
                showBorder: true,
                bdColor: this.动作主色,
                maxScale: 4,
                enableRotate: false,
                controller: this.裁剪器控制器
              })
            }
            .width('100%')
            .height(this.预览高度 * 3)
          }

        }
        .width('92%')
        .height('88%')
        .constraintSize({ maxWidth: 560 })
        .padding(应用尺寸.卡片内边距)
        .backgroundColor($r('app.color.surface_card'))
        .borderRadius(应用尺寸.圆角_卡片)
        .transition(TransitionEffect.asymmetric(
          TransitionEffect.opacity(0)
            .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
            .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
          TransitionEffect.opacity(0)
            .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
        ))
      }
    }
    .width('100%')
    .height('100%')
  }
}
