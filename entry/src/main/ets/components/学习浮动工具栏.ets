// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassSurface } from '../utils/GlassSurface';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';
//
// 复习页浮动工具栏：可拖动，松手吸附到最近侧边（竖版贴左/右）。
// 工具栏只有竖版一种形态（按钮纵向排列），拖动与吸附过程不切换布局，
// 避免形态跳变（曾实现拖动中横版/吸附后竖版双形态，已砍掉）。
// 主工具栏（main）：question 阶段显示「显示答案」；answer 阶段显示 4 个评分按钮。
// 位置以 vp 为单位持久化（StudyLayoutStore），未持久化时使用默认位置（右侧居中）。
// 监听 display.on('change') 自动适配屏幕尺寸变化与横竖屏切换。

import { display } from '@kit.ArkUI';
import {
  加载工具栏位置,
  保存工具栏位置,
  学习工具栏标识,
  工具栏位置
} from '../model/学习布局存储';
import { 应用尺寸 } from '../utils/应用尺寸';
import {
  RATING_AGAIN,
  RATING_EASY,
  RATING_GOOD,
  RATING_HARD
} from '../proto/messages/SchedulerMessages';
import {
  边缘留白,
  工具栏宽度,
  工具栏高度,
  吸附侧
} from '../utils/工具栏尺寸';
import {
  学习阶段,
  吸附结果,
  夹紧X方向,
  夹紧Y方向,
  吸附到侧边,
  推断吸附侧
} from '../utils/吸附计算器';
import { 颜色键 } from '../model/颜色主题';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { themeDefinition } from '../model/ThemeCatalog';
import { PrimaryGlassSurface } from '../utils/PrimaryGlassSurface';
import { PRIMARY_GLASS_KEY, PrimaryGlassStyle, themePrimaryGlass } from '../model/ThemeCatalog';

// 按下的评分 用的辅助 tag（避免与 RATING_AGAIN/HARD/GOOD/EASY 冲突）
const 显示答案标签: number = 100;

// ========================================================
// @块ID COMP-STUDY-TOOLBAR-001
// @名称 学习浮动工具栏组件声明与状态字段
//
// @作用
// 复习页可拖动浮动工具栏组件主体。维护工具栏位置（vp）、当前吸附侧、
// 按下的评分 等响应式状态；持有屏幕宽高与拖动起点等非响应式内部状态。
// 主工具栏（main）按 学习阶段 切换「显示答案」与 4 个评分按钮；
//
// @输入
// 当前阶段（loading/question/answer/done/error）/
// 评分按钮文案 / 是否深色 / 显示答案回调 / 评分回调。
//
// @输出
// 一个可拖动的浮动浮卡（Stack 容器，position 绝对定位），竖版布局。
//
// @业务规则
// 字符串值 'main' / 'left' / 'right' /
// 'loading' / 'question' / 'answer' / 'done' / 'error' 保留英文
// （作为持久化与跨模块约定值）。
// @StorageProp 绑定 颜色键.* 全局主题色键，跟随用户选择的主题即时刷新。
// 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）。
// 单状态 按下的评分：按下记 rating/tag，松开恢复 -1。
// 评分按钮用 RATING_AGAIN/HARD/GOOD/EASY（0/1/2/3）；显示答案用 显示答案标签。
//
// @副作用
// aboutToAppear 读取屏幕尺寸 / 加载位置 / 注册监听；aboutToDisappear 注销监听。
// ========================================================

@Component
export struct 学习浮动工具栏 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(GLASS_COLORS_KEY) private glassColors: string[] = GLASS_HIGHLIGHT_COLORS;
  /** 沿用主工具栏的位置键，保留用户保存的拖动位置。 */
  private 工具栏类型: 学习工具栏标识 = 'main';
  /** 复习阶段：决定主工具栏显示「显示答案」还是 4 个评分按钮。
   *  高度按阶段区分（question 80 / answer 360），阶段切换后位置需重夹紧防溢出。 */
  @Prop @Watch('阶段变化') 当前阶段: 学习阶段 = 'question';
  /** 评分间隔（DescribeNextStates 返回）；缺失时只显示评分名称。 */
  @Prop 评分按钮文案: string[] = [];
  /** 暗色模式：与 StudyPage 同步，决定浮卡底色。 */
  @Prop 是否深色: boolean = false;

  /** 按钮回调：与 StudyPage 同名方法一一对应。 */
  显示答案回调: () => void = (): void => {};
  评分回调: (评分: number) => void = (评分: number): void => {};

  /** 浮动工具栏当前位置（vp，左上角坐标）。拖动时实时更新。 */
  @State private 位置X: number = 0;
  @State private 位置Y: number = 0;
  /** 位置是否已从 preferences 加载完毕；未加载完不渲染，避免位置闪一下默认值。 */
  @State private 位置已加载: boolean = false;
  /** 吸附在哪一侧（left/right）。 */
  @State private 当前吸附侧: 吸附侧 = 'right';

  /** 屏幕宽高（vp），用于松手吸附和边界夹紧。 */
  private 屏幕宽vp: number = 0;
  private 屏幕高vp: number = 0;
  /** 拖动手势起点（手指落点 vp）和对应工具栏起点（左上角 vp），用于增量计算。 */
  private 拖动起点手指X: number = 0;
  private 拖动起点手指Y: number = 0;
  private 拖动起点位置X: number = 0;
  private 拖动起点位置Y: number = 0;

  /** display.on('change') 回调引用，用于 aboutToDisappear 时 off。 */
  private 屏幕变化回调: ((id: number) => void) | null = null;

  // 跟随用户选择的颜色主题（极光蓝/仙野绿/暗夜紫/碧涛青/活力橙/柠檬金）
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(PRIMARY_GLASS_KEY) private primaryGlass: PrimaryGlassStyle = themePrimaryGlass(themeDefinition('aurora'), false);
  @StorageProp(颜色键.主色容器) private 主色容器: string = '#E8EEFC';
  @StorageProp(颜色键.主色边框) private 主色边框: string = '#B8CEFA';
  // 与 StudyPage 同款单状态 按下的评分：按下记 rating，松开恢复 -1。
  // 评分按钮用 RATING_AGAIN/HARD/GOOD/EASY（0/1/2/3）；显示答案用 显示答案标签。
  @State private 按下的评分: number = -1;

  async aboutToAppear(): Promise<void> {
    this.读取屏幕尺寸();
    await this.加载初始位置();
    this.注册屏幕变化监听();
  }

  aboutToDisappear(): void {
    this.注销屏幕变化监听();
  }

  // ========================================================
  // @块ID COMP-STUDY-TOOLBAR-002
  // @名称 屏幕尺寸读取与变化监听
  //
  // @作用
  // 读取屏幕宽高（px→vp），注册 display.on('change') 监听屏幕旋转/分屏/缩放；
  // 屏幕变化时按当前吸附侧重新贴边并夹紧位置，保证工具栏始终在可见区域内。
  //
  // @输入
  // 读取屏幕尺寸：无；注册监听：无；注销监听：无（读 this.屏幕变化回调）。
  // 监听回调内读 this.屏幕宽vp / this.屏幕高vp / this.当前吸附侧 / this.工具栏类型 / this.当前阶段 / this.位置Y。
  //
  // @输出
  // 更新 this.屏幕宽vp / this.屏幕高vp / this.位置X / this.位置Y / this.屏幕变化回调。
  //
  // @业务规则
  // 取不到屏幕尺寸时用保守值 360×720，避免除零。
  // 屏幕尺寸未变化时不处理（避免无谓重夹紧）。
  // 按 当前吸附侧 重新贴到对应边：left/right 用 边缘留白，Y 经 夹紧Y方向。
  //
  // @副作用
  // display.on('change') / display.off('change')；写入响应式 位置X/位置Y 触发重 build。
  // ========================================================

  /** 同步读屏幕尺寸：display.getDefaultDisplaySync 返回 px，转 vp 后保存。 */
  private 读取屏幕尺寸(): void {
    try {
      const 显示器: display.Display = display.getDefaultDisplaySync();
      this.屏幕宽vp = this.getUIContext().px2vp(显示器.width);
      this.屏幕高vp = this.getUIContext().px2vp(显示器.height);
    } catch (error) {
      // 取不到屏幕尺寸时用一个保守值，避免除零；后续拖动夹紧按 360×720 估。
      this.屏幕宽vp = 360;
      this.屏幕高vp = 720;
    }
  }

  /** 注册屏幕变化监听：旋转、分屏、窗口缩放时重新读屏幕尺寸并夹紧位置。 */
  private 注册屏幕变化监听(): void {
    if (this.屏幕变化回调 !== null) {
      return;
    }
    const 屏幕变化回调函数: (id: number) => void = (_id: number): void => {
      const 旧宽: number = this.屏幕宽vp;
      const 旧高: number = this.屏幕高vp;
      this.读取屏幕尺寸();
      // 屏幕尺寸未变化时不处理（避免无谓重夹紧）
      if (this.屏幕宽vp === 旧宽 && this.屏幕高vp === 旧高) {
        return;
      }
      // 按 当前吸附侧 重新贴到对应边
      const 宽: number = 工具栏宽度(this.工具栏类型);
      if (this.当前吸附侧 === 'left') {
        this.位置X = 边缘留白;
      } else {
        this.位置X = Math.max(边缘留白, this.屏幕宽vp - 宽 - 边缘留白);
      }
      this.位置Y = 夹紧Y方向(this.位置Y, this.屏幕高vp, this.工具栏类型, this.当前阶段);
    };
    try {
      display.on('change', 屏幕变化回调函数);
      this.屏幕变化回调 = 屏幕变化回调函数;
    } catch (error) {
      // 监听失败不阻塞，仅丢失自动适配能力
      this.屏幕变化回调 = null;
    }
  }

  private 注销屏幕变化监听(): void {
    if (this.屏幕变化回调 === null) {
      return;
    }
    try {
      display.off('change', this.屏幕变化回调);
    } catch (error) {
      // ignore
    }
    this.屏幕变化回调 = null;
  }

  // ========================================================
  // @块ID COMP-STUDY-TOOLBAR-003
  // @名称 初始位置加载与持久化
  //
  // @作用
  // 加载已保存的工具栏位置（preferences），无保存时用默认位置（右侧居中）；
  // 推断吸附侧时按中心点 X 判断贴左还是贴右。提供持久化当前位置的辅助方法。
  //
  // @输入
  // 加载初始位置：无（读 this.工具栏类型 / this.当前阶段 / this.屏幕宽vp / this.屏幕高vp）；
  // 默认位置：无；
  // 持久化位置：无（读 this.工具栏类型 / this.位置X / this.位置Y）。
  //
  // @输出
  // 加载初始位置：写 this.当前吸附侧 / this.位置X / this.位置Y / this.位置已加载。
  // 默认位置：返回 工具栏位置。
  // 持久化位置：写 preferences。
  //
  // @业务规则
  // 默认位置即吸附态：贴右侧垂直居中。
  // 持久化为 fire-and-forget。
  //
  // @副作用
  // 加载/保存位置经 model/学习布局存储 读写 preferences；写响应式字段触发重 build。
  // ========================================================

  /** 加载已保存位置；没有则用默认位置（右侧居中）。
   *  推断 当前吸附侧 时按中心点 X 判断贴左还是贴右。 */
  private async 加载初始位置(): Promise<void> {
    const 已保存位置: 工具栏位置 | null = await 加载工具栏位置(this.工具栏类型);
    if (已保存位置 !== null) {
      const 推断结果 = 推断吸附侧(
        已保存位置.x, 已保存位置.y,
        this.屏幕宽vp, this.屏幕高vp,
        this.工具栏类型, this.当前阶段
      );
      this.当前吸附侧 = 推断结果.吸附侧;
      this.位置X = 夹紧X方向(已保存位置.x, this.屏幕宽vp, this.工具栏类型);
      this.位置Y = 夹紧Y方向(已保存位置.y, this.屏幕高vp, this.工具栏类型, this.当前阶段);
    } else {
      const 默认位置值: 工具栏位置 = this.默认位置();
      this.位置X = 默认位置值.x;
      this.位置Y = 默认位置值.y;
      this.当前吸附侧 = 'right';
    }
    this.位置已加载 = true;
  }

  /** 默认位置：贴右侧垂直居中。 */
  private 默认位置(): 工具栏位置 {
    const 宽: number = 工具栏宽度(this.工具栏类型);
    const 高: number = 工具栏高度(this.工具栏类型, this.当前阶段);
    const 位置: 工具栏位置 = {
      x: 夹紧X方向(this.屏幕宽vp - 宽 - 边缘留白, this.屏幕宽vp, this.工具栏类型),
      y: 夹紧Y方向((this.屏幕高vp - 高) / 2, this.屏幕高vp, this.工具栏类型, this.当前阶段)
    };
    return 位置;
  }

  /** 持久化当前位置（fire-and-forget）。 */
  private 持久化位置(): void {
    保存工具栏位置(this.工具栏类型, this.位置X, this.位置Y);
  }

  // ========================================================
  // @块ID COMP-STUDY-TOOLBAR-004
  // @名称 拖动手势处理
  //
  // @作用
  // PanGesture 三阶段处理：
  // - 拖动开始：记录手指落点和工具栏起点；
  // - 拖动更新：按手指偏移量增量更新工具栏位置，并夹紧到屏幕边界内；
  // - 拖动结束：调 吸附到侧边 贴到最近的左/右侧边并持久化。
  //
  // @输入
  // 拖动开始/更新：GestureEvent；拖动结束：无。
  //
  // @输出
  // 更新 this.位置X / this.位置Y / this.当前吸附侧 / this.拖动起点*。
  //
  // @业务规则
  // 拖动中保持竖版布局不切换；松手时按中心点 X 贴到左/右较近一侧。
  // 位置更新时立即夹紧，避免拖出可见区域。
  //
  // @副作用
  // 拖动结束调 持久化位置 写 preferences；写响应式字段触发重 build。
  // ========================================================

  /** PanGesture 起点：记录手指落点和工具栏起点。
   *  松手时按中心点 X 贴到左/右较近一侧。 */
  private 拖动开始(event: GestureEvent): void {
    this.拖动起点手指X = event.fingerList[0].localX;
    this.拖动起点手指Y = event.fingerList[0].localY;
    this.拖动起点位置X = this.位置X;
    this.拖动起点位置Y = this.位置Y;
  }

  /** PanGesture 移动：按手指偏移量更新工具栏位置（vp）。 */
  private 拖动更新(event: GestureEvent): void {
    const 手指X_vp: number = event.fingerList[0].localX;
    const 手指Y_vp: number = event.fingerList[0].localY;
    const 增量X: number = 手指X_vp - this.拖动起点手指X;
    const 增量Y: number = 手指Y_vp - this.拖动起点手指Y;
    this.位置X = 夹紧X方向(this.拖动起点位置X + 增量X, this.屏幕宽vp, this.工具栏类型);
    this.位置Y = 夹紧Y方向(this.拖动起点位置Y + 增量Y, this.屏幕高vp, this.工具栏类型, this.当前阶段);
  }

  /** PanGesture 结束：吸附到最近侧边（左/右）并持久化。 */
  private 拖动结束(): void {
    const 吸附结果值: 吸附结果 = 吸附到侧边(
      this.位置X, this.位置Y,
      this.屏幕宽vp, this.屏幕高vp,
      this.工具栏类型, this.当前阶段
    );
    this.位置X = 吸附结果值.x;
    this.位置Y = 吸附结果值.y;
    this.当前吸附侧 = 吸附结果值.吸附侧;
    this.持久化位置();
  }

  /** 阶段切换回调（@Watch 当前阶段）：main 工具栏高度随阶段变化
   *  （question 80 / answer 360），原位置可能超出屏幕，重新夹紧。
   *  两个方向都夹紧——夹紧函数对未越界的值是恒等操作，无副作用。 */
  private 阶段变化(): void {
    if (!this.位置已加载) {
      return;
    }
    this.位置X = 夹紧X方向(this.位置X, this.屏幕宽vp, this.工具栏类型);
    this.位置Y = 夹紧Y方向(this.位置Y, this.屏幕高vp, this.工具栏类型, this.当前阶段);
  }

  // ========================================================
  // @块ID COMP-STUDY-TOOLBAR-005
  // @名称 评分按钮文案与浮卡样式辅助
  //
  // @作用
  // 三个无状态小辅助：
  // - 取评分按钮文案：展示后端返回的间隔，缺失时返回空串；
  // - 浮卡底色：暗色用深蓝灰，亮色用白；
  // - 阴影样式：返回 OUTER_DEFAULT_MD（拖动与静止共用，预留接口）。
  //
  // @输入
  // 取评分按钮文案：索引（number）；浮卡底色：无；阴影样式：无。
  //
  // @输出
  // 取评分按钮文案：string；浮卡底色：色值字符串；阴影样式：ShadowStyle。
  //
  // @业务规则
  // 索引越界或对应文案为空时返回空串，评分名称始终可见。
  //
  // @副作用
  // 无。
  // ========================================================

  /** 读取后端间隔，不用评分名称替代缺失的时间。 */
  private 取评分按钮文案(索引: number): string {
    if (索引 < this.评分按钮文案.length && this.评分按钮文案[索引].length > 0) {
      return this.评分按钮文案[索引];
    }
    return '';
  }

  /** 浮卡底色：暗色用深蓝灰，亮色用白。 */
  private 浮卡底色(): string {
    return this.是否深色 ? '#1E293B' : '#FFFFFF';
  }

  /** 浮卡阴影：拖动时阴影更深，静止时浅一些，提供"被拿起"的视觉反馈。 */
  private 阴影样式(): ShadowStyle {
    return ShadowStyle.OUTER_DEFAULT_MD;
  }

  // ========================================================
  // @块ID COMP-STUDY-TOOLBAR-006
  // @名称 竖版布局构建器集合
  //
  // @作用
  // 竖版布局的 4 个 @Builder：
  // - 竖版显示答案按钮：main 在 question 阶段，文字允许 maxLines=2 跨行；
  // - 竖版评分按钮 / 竖版评分按钮列：main 在 answer 阶段，4 个评分按钮纵向排列；
  //
  // @输入
  // 竖版评分按钮：评分（number）/ 文字色（ResourceColor）。
  //
  // @输出
  // 渲染 Button / Column 竖版组合，layoutWeight 平均分配高度。
  //
  // @业务规则
  // 按下态：评分使用共用玻璃反馈，显示答案使用带主题染色的主操作玻璃；
  // GOOD 评分按下时边框高亮 动作主色。
  // 触摸事件：Down 记 按下的评分；Up/Cancel 恢复 -1。
  // 按钮内 Text 用 maxLines=2 + Ellipsis，允许跨行展示完整文案。
  //
  // @副作用
  // 无（仅渲染；点击通过 显示答案回调 / 评分回调 上抛）。
  // ========================================================

  @Builder
  private 竖版显示答案按钮() {
    Button({ type: ButtonType.Normal }) {
      Text() { ThemeTextSpans($r('app.string.study_show_answer'), this.themeAccentColors, this.getUIContext()) }
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textAlign(TextAlign.Center)
        .fontSize(应用尺寸.字号_按钮)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.动作主色)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 4, right: 4 })
    .attributeModifier(new PrimaryGlassSurface(this.按下的评分 === 显示答案标签, this.primaryGlass))
    .stateEffect(false)
    .borderRadius(应用尺寸.圆角_面板)
    .animation({ duration: 80, curve: Curve.EaseOut })
    .onTouch((event: TouchEvent): void => {
      if (event.type === TouchType.Down) { this.按下的评分 = 显示答案标签; }
      else if (event.type === TouchType.Up || event.type === TouchType.Cancel) { this.按下的评分 = -1; }
    })
    .onClick(() => {
      this.显示答案回调();
    })
  }

  @Builder
  private 竖版评分按钮(评分: number, 标签: ResourceStr, 文字色: ResourceColor) {
    Button({ type: ButtonType.Normal }) {
      Column({ space: 2 }) {
        Text(标签)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .fontSize(应用尺寸.字号_按钮)
          .fontWeight(FontWeight.Medium)
          .fontColor(文字色)
        if (this.取评分按钮文案(评分).length > 0) {
          Text(this.取评分按钮文案(评分))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
        }
      }
      .width('100%')
    }
    .width('100%')
    .padding({ left: 4, right: 4 })
    .layoutWeight(1)
    .attributeModifier(new GlassSurface(this.按下的评分 === 评分, this.glassColors))
    .stateEffect(false)
    .borderRadius(应用尺寸.圆角_面板)
    .animation({ duration: 80, curve: Curve.EaseOut })
    .onTouch((event: TouchEvent): void => {
      if (event.type === TouchType.Down) { this.按下的评分 = 评分; }
      else if (event.type === TouchType.Up || event.type === TouchType.Cancel) { this.按下的评分 = -1; }
    })
    .onClick(() => {
      this.评分回调(评分);
    })
  }

  @Builder
  private 竖版评分按钮列() {
    Column({ space: 应用尺寸.间距_8 }) {
      this.竖版评分按钮(RATING_AGAIN, $r('app.string.rating_again'), $r('app.color.error_text'))
      this.竖版评分按钮(RATING_HARD, $r('app.string.rating_hard'), $r('app.color.text_primary'))
      this.竖版评分按钮(RATING_GOOD, $r('app.string.rating_good'), this.动作主色)
      this.竖版评分按钮(RATING_EASY, $r('app.string.rating_easy'), $r('app.color.text_primary'))
    }
    .width('100%')
    .height('100%')
  }

  // ========================================================
  // @块ID COMP-STUDY-TOOLBAR-007
  // @名称 主构建方法
  //
  // @作用
  // 主 build：位置未加载完前不渲染（避免位置闪一下默认值）；
  // 加载完后渲染竖版布局，外层 Stack 用 position 绝对定位到 位置X/位置Y。
  //
  // @输入
  // 读 this.位置已加载 / this.工具栏类型 / this.当前阶段 / this.位置X / this.位置Y。
  //
  // @输出
  // 渲染一个 Stack（width/height 由 工具栏宽度 / 工具栏高度 计算），position 绝对定位；
  // 内层 Column 竖版布局，padding/背景/圆角/边框/阴影统一。
  //
  // @业务规则
  // Stack 仅作占位容器不影响布局；PanGesture 三阶段分别调 拖动开始/拖动更新/拖动结束。
  //
  // @副作用
  // 无（仅渲染）。
  // ========================================================

  build() {
    if (!this.位置已加载 || (this.当前阶段 !== 'question' && this.当前阶段 !== 'answer')) {
      // 非学习阶段连外框与拖动热区一起隐藏，保留组件的位置状态供继续学习复用。
      Stack() {
      }
      .width(0)
      .height(0)
    } else {
      Stack() {
        // 竖版布局：按钮纵向排列（唯一形态，拖动与吸附不切换）
        Column() {
          if (this.当前阶段 === 'question') {
            this.竖版显示答案按钮()
          } else if (this.当前阶段 === 'answer') {
            this.竖版评分按钮列()
          }
        }
        .width('100%')
        .height('100%')
        .padding(应用尺寸.间距_8)
        .backgroundColor(this.浮卡底色())
        .borderRadius(应用尺寸.圆角_面板)
        .border({ width: 应用尺寸.卡片边框, color: this.主色边框 })
        .shadow(this.阴影样式())
      }
      // position 是绝对定位（相对父容器左上角），Stack 作占位容器不影响布局
      .width(工具栏宽度(this.工具栏类型))
      .height(工具栏高度(this.工具栏类型, this.当前阶段))
      .position({ x: this.位置X, y: this.位置Y })
      .gesture(
        PanGesture()
          .onActionStart((event: GestureEvent): void => {
            this.拖动开始(event);
          })
          .onActionUpdate((event: GestureEvent): void => {
            this.拖动更新(event);
          })
          .onActionEnd((): void => {
            this.拖动结束();
          })
      )
    }
  }
}
