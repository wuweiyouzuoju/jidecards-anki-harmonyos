// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @名称 欢迎弹窗 — 首次启动欢迎+更新日志+作者的话
//
// @作用
// 用户首次打开应用时显示，介绍此次更新改动 / 作者的话（含同系列应用跳转 + 评论入口）
// 样式复刻 jidecube WelcomePanel：磨砂玻璃遮罩 + 白色内容卡 + 圆角阴影
//
// @输入
// onClose: 关闭回调（首页负责调 标记已展示欢迎弹窗 持久化「已显示」标记）
//
// @输出
// 无（通过 onClose 回调关闭）
//
// @业务规则
// 文案走 string.json 资源（welcome_* key），便于 i18n 与后续调整
// Section 2、3 因含可点击跳转的 Span，文案在代码内拼接（资源文件无法绑事件）
// 点击遮罩 / 点击「开始体验」按钮 / 点击右上角 × 均可关闭
//
// @副作用
// 点击同系列应用名 / 「评论」时调 startAbility 跳转应用市场详情页（失败静默）
// 点击 ankiweb.net 链接时调 startAbility 跳转浏览器（失败静默）
// ========================================================

import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import { 颜色键 } from '../model/颜色主题';

// 更新日志条目：【新增】/【优化】/【修复】前缀 + 正文
interface 更新条目 {
  前缀: string;
  正文: string;
}

@Component
export struct 欢迎弹窗 {
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  onClose: () => void = () => {};
  @Prop 是否深色: boolean = false;
  // 跟随用户选择的颜色主题（与首页"创建牌组"按钮同款绑定）

  // 同系列应用 + 本应用包名（用于跳转应用市场详情页）
  private static readonly 包名_记得卡片: string = 'com.jide.kapian';
  private static readonly 包名_记得魔方: string = 'com.jide.cube';
  private static readonly 包名_记得舒尔特: string = 'com.example.schultetable';
  // AnkiWeb 共享牌组页面（点击「获取牌组」Section 的蓝色链接时跳转）
  private static readonly 网址_获取牌组: string = 'https://ankiweb.net/shared/decks/';
  // 官方 QQ 群号（方式 2 获取牌组渠道，长按可选中复制）
  private static readonly QQ群号: string = '726837065';

  // 中部滚动区上限（vp）：屏高×88% 减去固定区（标题栏/分割线/底部按钮行，约 150vp）。
  // 必须是数字——constraintSize({ maxHeight: 数字 }) 才有"内容少随内容、超限封顶滚动"语义
  // （华为官方 FAQ 弹窗动态高度方案）。此前用 layoutWeight(1)+maxHeight'88%'，弹窗永远撑满
  // 88% 屏高不随文案长度收缩（v1.9.0 文案变短后下方大片空白）。
  @State private 滚动上限: number = 400;

  /** 全屏 Stack onAreaChange：按实际屏高（vp）重算滚动上限，横竖屏切换自动适配 */
  private 重算滚动上限(屏高vp: number): void {
    this.滚动上限 = Math.max(200, 屏高vp * 0.88 - 150);
  }

  build() {
    Stack() {
      // 遮罩 + 磨砂玻璃（点击空白处关闭）
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.35)')
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.是否深色 ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
        .onClick(() => this.onClose())

      // 内容卡（居中，最大宽度 380）
      Column() {
        // 标题栏：标题居中 + × 右上角
        DialogHeader({
          title: $r('app.string.welcome_title'),
          actionLabel: $r('app.string.welcome_btn_start'),
          showClose: false,
          onAction: (): void => { this.onClose(); }
        })
        .padding({ left: 20, right: 20, top: 12 })

        Divider().color($r('app.color.surface_card')).strokeWidth(1)

        // 中间三段：高度随文案长度自适应；文案多到超过上限（屏高 88% - 固定区）时封顶，
        // 在本 Scroll 内上下滚动查看，底部按钮始终固定在卡片内
        Scroll() {
          Column() {
            // Section 1：此次更新改动（【新增】/【优化】/【修复】前缀加粗）
            Column({ space: 4 }) {
          Text($r('app.string.welcome_section1_title'))
            .fontSize(应用尺寸.字号_按钮)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
          Text() {
            ForEach(this.解析更新条目(), (条目: 更新条目) => {
              Span(条目.前缀)
                .fontWeight(FontWeight.Bold)
                .fontColor($r('app.color.text_primary'))
              Span(条目.正文 + '\n')
            })
          }
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding({ left: 20, right: 20, top: 14, bottom: 14 })

        Divider().color($r('app.color.surface_card')).strokeWidth(1)

        // Section 2：获取牌组（方式1 ankiweb 链接 + 方式2 QQ 群号可长按选中复制）
        Column({ space: 6 }) {
          Text($r('app.string.welcome_section2_title'))
            .fontSize(应用尺寸.字号_按钮)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
          // 方式 1：ankiweb.net 链接可点击跳转浏览器
          Text() {
            Span($r('app.string.welcome_section2_way1_label'))
            Span($r('app.string.welcome_section2_body'))
            Span('ankiweb.net/shared/decks')
              .fontColor(this.动作主色)
              .fontWeight(FontWeight.Medium)
              .onClick(() => this.跳转网页(欢迎弹窗.网址_获取牌组))
            Span($r('app.string.welcome_section2_way1_tail'))
          }
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
          // 方式 2：QQ 群号可长按选中复制（copyOption On 启用整段文本选择）
          Text() {
            Span($r('app.string.welcome_section2_way2_label'))
            Span($r('app.string.welcome_section2_qq_prefix'))
            Span(欢迎弹窗.QQ群号)
              .fontColor(this.动作主色)
              .fontWeight(FontWeight.Bold)
            Span($r('app.string.welcome_section2_qq_suffix'))
          }
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_secondary'))
          .copyOption(CopyOptions.LocalDevice)
          .width('100%')
          // 提示：获取牌组方式可在设置-关于中再次查看
          Text($r('app.string.welcome_section2_hint'))
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding({ left: 20, right: 20, top: 14, bottom: 14 })

        Divider().color($r('app.color.surface_card')).strokeWidth(1)

        // Section 3：作者的话（含可点击的同系列应用名 + 「评论」入口，点击跳转应用市场详情页）
        Column({ space: 4 }) {
          Text($r('app.string.welcome_section3_title'))
            .fontSize(应用尺寸.字号_按钮)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
          Text() {
            Span('本应用后端复用开源项目Anki，因此具备极其成熟的闪卡算法。有任何建议可以在应用市场直接')
            Span('评论')
              .fontColor(this.动作主色)
              .fontWeight(FontWeight.Medium)
              .onClick(() => this.跳转应用(欢迎弹窗.包名_记得卡片))
            Span('或在QQ群反馈')
          }
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding({ left: 20, right: 20, top: 14, bottom: 18 })
          }
          .width('100%')
        }
        .scrollable(ScrollDirection.Vertical)
        .constraintSize({ maxHeight: this.滚动上限 })
        .width('100%')
        .align(Alignment.Top)
        .edgeEffect(EdgeEffect.Spring)

        // 底部「开始体验」按钮

      }
      .width('88%')
      // 高度完全自适应：Scroll 已按数字上限封顶（88% 屏高 - 固定区），卡片不再设
      // maxHeight 百分比（layoutWeight(1)+'88%' 组合会让弹窗永远撑满屏高 88% 不收缩）
      .constraintSize({ maxWidth: 480 })
      .backgroundColor($r('app.color.surface_page'))
      .borderRadius(应用尺寸.圆角_卡片)
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
    .alignContent(Alignment.Center)
    .onAreaChange((_旧区域: Area, 新区域: Area): void => {
      // Area 尺寸单位为 vp，类型为 Length，按项目惯例转 number 后重算滚动上限
      const 屏高vp: number = typeof 新区域.height === 'number'
        ? 新区域.height : parseInt(新区域.height as string, 10);
      if (!Number.isNaN(屏高vp)) {
        this.重算滚动上限(屏高vp);
      }
    })
  }

  // 解析更新日志资源文本为条目数组：中文行按「【..】」、英文行按「[..]」切分前缀与正文
  // 资源文本用 \n 分行（string.json 转义）；无匹配前缀的行整体作为前缀、正文留空
  private 解析更新条目(): 更新条目[] {
    const 资源管理器 = getContext(this).resourceManager;
    let 文本: string = '';
    try {
      文本 = 资源管理器.getStringSync($r('app.string.welcome_section1_body').id);
    } catch (_错误) {
      return [];
    }
    const 结果: 更新条目[] = [];
    const 行数组: string[] = 文本.split('\n');
    for (let i: number = 0; i < 行数组.length; i++) {
      const 行: string = 行数组[i];
      if (行 === '') {
        continue;
      }
      const 全角收尾: number = 行.indexOf('】');
      if (行.startsWith('【') && 全角收尾 > 0) {
        结果.push({ 前缀: 行.substring(0, 全角收尾 + 1), 正文: 行.substring(全角收尾 + 1) });
        continue;
      }
      const 半角收尾: number = 行.indexOf(']');
      if (行.startsWith('[') && 半角收尾 > 0) {
        结果.push({ 前缀: 行.substring(0, 半角收尾 + 1), 正文: 行.substring(半角收尾 + 1) });
        continue;
      }
      结果.push({ 前缀: 行, 正文: '' });
    }
    return 结果;
  }

  // 跳转应用市场详情页：用 store:// scheme 隐式拉起应用市场；失败静默忽略
  private 跳转应用(包名: string): void {
    try {
      const 上下文 = getContext(this) as common.UIAbilityContext;
      上下文.startAbility({
        uri: `store://appgallery.huawei.com/app/detail?id=${包名}`
      }).catch((_错误: BusinessError) => {
        // 应用市场不可用或未上架时静默忽略，不阻塞用户体验
      });
    } catch (_错误) {
      // startAbility 同步抛出时静默忽略
    }
  }

  // 跳转网页：用 ohos.want.action.viewData 隐式拉起浏览器；失败静默忽略
  private 跳转网页(url: string): void {
    try {
      const 上下文 = getContext(this) as common.UIAbilityContext;
      上下文.startAbility({
        action: 'ohos.want.action.viewData',
        uri: url
      }).catch((_错误: BusinessError) => {
        // 无浏览器可用时静默忽略，不阻塞用户体验
      });
    } catch (_错误) {
      // startAbility 同步抛出时静默忽略
    }
  }
}
