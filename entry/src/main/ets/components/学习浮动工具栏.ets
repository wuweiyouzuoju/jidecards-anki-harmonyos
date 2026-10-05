// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassSurface } from '../utils/GlassSurface';
import { GesturePointer, gesturePointer } from '../model/GesturePointer';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';
//
// 复习页浮动工具栏：可拖动，松手吸附到最近侧边（竖版贴左/右）。
// 工具栏只有竖版一种形态（按钮纵向排列），拖动与吸附过程不切换布局，
// 避免形态跳变（曾实现拖动中横版/吸附后竖版双形态，已砍掉）。
// 主工具栏（main）：question 阶段显示「显示答案」；answer 阶段显示 4 个评分按钮。
// 位置以 vp 为单位持久化（StudyLayoutStore），未持久化时使用默认位置（右侧居中）。
// 父层提供实测容器尺寸与安全区；智感模式仅调整吸附侧，独立保存高度。

import { StudyGripSensor } from '../backend/StudyGripSensor';
import { StudyGripSession } from '../model/StudyGripSession';
import { StudyGripAvailability, StudyToolbarSide, StudyToolbarBounds, studyToolbarBounds,
  clampStudyToolbar } from '../model/StudyLayout';
import { THEME_MOTION_KEY } from '../model/ThemeCatalog';
import { showToastSafely } from '../utils/UiFeedback';
import {
  加载工具栏位置,
  保存工具栏位置,
  学习工具栏标识,
  工具栏位置,
  loadStudyGripHeight,
  saveStudyGripHeight
} from '../model/学习布局存储';
import { 应用尺寸 } from '../utils/应用尺寸';
import {
  RATING_AGAIN,
  RATING_EASY,
  RATING_GOOD,
  RATING_HARD
} from '../proto/messages/SchedulerMessages';
import {
  工具栏宽度,
  工具栏高度,
  吸附侧
} from '../utils/工具栏尺寸';
import { 学习阶段 } from '../utils/吸附计算器';
import { 颜色键 } from '../model/颜色主题';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { themeDefinition } from '../model/ThemeCatalog';
import { PrimaryGlassSurface } from '../utils/PrimaryGlassSurface';
import { PRIMARY_GLASS_KEY, PrimaryGlassStyle, themePrimaryGlass } from '../model/ThemeCatalog';


// ========================================================
// @块ID COMP-STUDY-TOOLBAR-001
// @名称 学习浮动工具栏组件声明与状态字段
//
// @作用
// 复习页可拖动浮动工具栏组件主体。维护工具栏位置（vp）、当前吸附侧、
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
//
// @副作用
// aboutToAppear 读取屏幕尺寸 / 加载位置 / 注册监听；aboutToDisappear 注销监听。
// ========================================================

@Component
export struct 学习浮动工具栏 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
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
  @Prop @Watch('gripActivityChanged') isGripLayout: boolean = false;
  @Prop @Watch('gripActivityChanged') isGripActive: boolean = false;
  @Prop @Watch('viewportChanged') viewportWidth: number = 0;
  @Prop @Watch('viewportChanged') viewportHeight: number = 0;
  @Prop @Watch('viewportChanged') topInset: number = 0;
  @Prop @Watch('viewportChanged') bottomInset: number = 0;
  @StorageProp(THEME_MOTION_KEY) private isMotionEnabled: boolean = true;
  onGripState: (availability: StudyGripAvailability, side: StudyToolbarSide) => void =
    (_availability: StudyGripAvailability, _side: StudyToolbarSide): void => {};
  private gripAvailability: StudyGripAvailability = 'unchecked';
  private mounted: boolean = false;
  private touchIds: number[] = [];
  private gripSession: StudyGripSession = new StudyGripSession(new StudyGripSensor(), {
    schedule: (callback: () => void, delay: number): number => setTimeout(callback, delay),
    cancel: (timer: number): void => { clearTimeout(timer); },
    move: (side: StudyToolbarSide): void => { this.moveToGripSide(side); },
    report: (availability: StudyGripAvailability): void => {
      this.gripAvailability = availability;
      if (this.mounted) this.onGripState(availability, this.当前吸附侧);
    }
  });

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
  private dragPointerId: number = -1;
  private 拖动起点位置X: number = 0;
  private 拖动起点位置Y: number = 0;

  // 跟随用户选择的颜色主题（极光蓝/仙野绿/暗夜紫/碧涛青/活力橙/柠檬金）
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(PRIMARY_GLASS_KEY) private primaryGlass: PrimaryGlassStyle = themePrimaryGlass(themeDefinition('aurora'), false);
  @StorageProp(颜色键.主色容器) private 主色容器: string = '#E8EEFC';
  @StorageProp(颜色键.主色边框) private 主色边框: string = '#B8CEFA';

  async aboutToAppear(): Promise<void> {
    this.mounted = true;
    this.读取屏幕尺寸();
    await this.加载初始位置();
    if (this.mounted) this.gripActivityChanged();
  }

  aboutToDisappear(): void {
    this.mounted = false;
    this.dragPointerId = -1;
    this.touchIds = [];
    this.gripSession.dispose();
  }

  // ========================================================
  // @块ID COMP-STUDY-TOOLBAR-002
  // @名称 窗口边界与握姿监听
  //
  // @作用
  // 使用父容器实测尺寸，窗口变化时重新贴边；握姿会话只在可操作前台学习状态订阅。
  //
  // @输入
  // 父层容器尺寸、安全区与可操作状态；握姿事件和工具栏触摸。
  //
  // @输出
  // 更新容器宽高、工具栏位置与真实握姿能力状态。
  //
  // @业务规则
  // 容纳不下完整评分栏时由父层回退底部操作区；真实安全区只贡献一次。
  //
  // @副作用
  // 订阅/取消握姿事件，写入响应式位置并发布真实能力状态。
  // ========================================================

  /** 使用父层实测窗口容器尺寸；分屏不再误用物理整屏尺寸。 */
  private 读取屏幕尺寸(): void {
    this.屏幕宽vp = this.viewportWidth;
    this.屏幕高vp = this.viewportHeight;
  }

  private toolbarBounds(): StudyToolbarBounds {
    return studyToolbarBounds(this.屏幕宽vp, this.屏幕高vp, this.topInset, this.bottomInset,
      工具栏宽度(this.工具栏类型), 工具栏高度(this.工具栏类型, this.当前阶段));
  }

  private viewportChanged(): void {
    this.读取屏幕尺寸();
    if (!this.位置已加载) return;
    this.cancelDrag();
    this.gripSession.setTouching(this.touchIds.length > 0);
    const bounds: StudyToolbarBounds = this.toolbarBounds();
    this.位置X = this.当前吸附侧 === 'left' ? bounds.left : bounds.right;
    this.位置Y = clampStudyToolbar(this.位置Y, bounds.top, bounds.bottom);
    this.gripActivityChanged();
  }

  private gripActivityChanged(): void {
    this.gripSession.setActive(this.mounted && this.位置已加载 && this.isGripLayout && this.isGripActive &&
      this.toolbarBounds().fits && (this.当前阶段 === 'question' || this.当前阶段 === 'answer'));
    if (!this.isGripActive) {
      this.cancelDrag(); this.touchIds = []; this.gripSession.setTouching(false);
    }
  }

  private moveToGripSide(side: StudyToolbarSide): void {
    if (!this.mounted || !this.isGripActive) return;
    const bounds: StudyToolbarBounds = this.toolbarBounds();
    const move: () => void = (): void => {
      this.当前吸附侧 = side;
      this.位置X = side === 'left' ? bounds.left : bounds.right;
      this.位置Y = clampStudyToolbar(this.位置Y, bounds.top, bounds.bottom);
    };
    if (this.isMotionEnabled) this.getUIContext().animateTo({ duration: 150, curve: Curve.EaseOut }, move);
    else move();
    this.onGripState(this.gripAvailability, side);
  }

  private handleToolbarTouch(event: TouchEvent): void {
    if (event.type === TouchType.Cancel) this.touchIds = [];
    else {
      for (const point of event.changedTouches) {
        if (point === undefined || point === null) continue;
        if (event.type === TouchType.Down && !this.touchIds.includes(point.id)) this.touchIds.push(point.id);
        if (event.type === TouchType.Up) this.touchIds = this.touchIds.filter((id: number): boolean => id !== point.id);
      }
    }
    this.gripSession.setTouching(this.touchIds.length > 0 || this.dragPointerId >= 0);
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
    let gripY: number | null = null;
    if (this.isGripLayout) {
      try { gripY = await loadStudyGripHeight(); }
      catch (error) {
        if (this.mounted) showToastSafely(this.getUIContext(), { message: $r('app.string.settings_study_grip_load_failed') });
      }
    }
    if (!this.mounted) return;
    const bounds: StudyToolbarBounds = this.toolbarBounds();
    this.当前吸附侧 = 已保存位置 !== null &&
      已保存位置.x + 工具栏宽度(this.工具栏类型) / 2 < this.屏幕宽vp / 2 ? 'left' : 'right';
    this.位置X = this.当前吸附侧 === 'left' ? bounds.left : bounds.right;
    this.位置Y = clampStudyToolbar(gripY ?? 已保存位置?.y ?? this.默认位置().y, bounds.top, bounds.bottom);
    this.gripSession.restoreSide(this.当前吸附侧);
    this.位置已加载 = true;
  }

  /** 默认位置：贴右侧垂直居中。 */
  private 默认位置(): 工具栏位置 {
    const 高: number = 工具栏高度(this.工具栏类型, this.当前阶段);
    const bounds: StudyToolbarBounds = this.toolbarBounds();
    const 位置: 工具栏位置 = {
      x: bounds.right,
      y: clampStudyToolbar((this.屏幕高vp - 高) / 2, bounds.top, bounds.bottom)
    };
    return 位置;
  }

  /** 持久化当前位置（fire-and-forget）。 */
  private async 持久化位置(): Promise<void> {
    try {
      if (this.isGripLayout) await saveStudyGripHeight(this.位置Y);
      else await 保存工具栏位置(this.工具栏类型, this.位置X, this.位置Y);
    } catch (error) {
      if (this.mounted) showToastSafely(this.getUIContext(), { message: $r('app.string.settings_study_grip_save_failed') });
    }
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
    const point: GesturePointer | null = gesturePointer(event.fingerInfos, event.fingerList);
    if (point === null) return;
    this.dragPointerId = point.id;
    this.gripSession.setTouching(true);
    this.拖动起点手指X = point.localX;
    this.拖动起点手指Y = point.localY;
    this.拖动起点位置X = this.位置X;
    this.拖动起点位置Y = this.位置Y;
  }

  /** PanGesture 移动：按手指偏移量更新工具栏位置（vp）。 */
  private 拖动更新(event: GestureEvent): void {
    if (this.dragPointerId < 0) return;
    const point: GesturePointer | null = gesturePointer(event.fingerInfos, event.fingerList, this.dragPointerId);
    if (point === null) return;
    const 手指X_vp: number = point.localX;
    const 手指Y_vp: number = point.localY;
    const 增量X: number = 手指X_vp - this.拖动起点手指X;
    const 增量Y: number = 手指Y_vp - this.拖动起点手指Y;
    const bounds: StudyToolbarBounds = this.toolbarBounds();
    if (!this.isGripLayout || this.gripAvailability !== 'available') {
      this.位置X = clampStudyToolbar(this.拖动起点位置X + 增量X, bounds.left, bounds.right);
    }
    this.位置Y = clampStudyToolbar(this.拖动起点位置Y + 增量Y, bounds.top, bounds.bottom);
  }

  /** PanGesture 结束：吸附到最近侧边（左/右）并持久化。 */
  private 拖动结束(): void {
    if (this.dragPointerId < 0) return;
    this.dragPointerId = -1;
    const bounds: StudyToolbarBounds = this.toolbarBounds();
    if (!this.isGripLayout || this.gripAvailability !== 'available') {
      this.当前吸附侧 = this.位置X + 工具栏宽度(this.工具栏类型) / 2 < this.屏幕宽vp / 2 ? 'left' : 'right';
    }
    this.位置X = this.当前吸附侧 === 'left' ? bounds.left : bounds.right;
    this.位置Y = clampStudyToolbar(this.位置Y, bounds.top, bounds.bottom);
    this.gripSession.restoreSide(this.当前吸附侧);
    this.gripSession.setTouching(this.touchIds.length > 0);
    if (this.isGripLayout) this.onGripState(this.gripAvailability, this.当前吸附侧);
    this.持久化位置();
  }

  private cancelDrag(): void {
    if (this.dragPointerId < 0) return;
    this.dragPointerId = -1;
    this.位置X = this.拖动起点位置X;
    this.位置Y = this.拖动起点位置Y;
    this.gripSession.setTouching(this.touchIds.length > 0);
  }

  /** 阶段切换回调（@Watch 当前阶段）：main 工具栏高度随阶段变化
   *  （question 80 / answer 360），原位置可能超出屏幕，重新夹紧。
   *  两个方向都夹紧——夹紧函数对未越界的值是恒等操作，无副作用。 */
  private 阶段变化(): void {
    if (!this.位置已加载) {
      return;
    }
    this.viewportChanged();
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
  // 按下态：评分使用共用玻璃反馈，显示答案在不透明白底上叠加主题反馈；
  // GOOD 评分按下时边框高亮 动作主色。
  // 按钮内 Text 用 maxLines=2 + Ellipsis，允许跨行展示完整文案。
  //
  // @副作用
  // 无（仅渲染；点击通过 显示答案回调 / 评分回调 上抛）。
  // ========================================================

  @Builder
  private 竖版显示答案按钮() {
    Button({ type: ButtonType.Normal }) {
      Text() { ForEach([this.uiLanguage], (_locale: string) => { ThemeTextSpans($r('app.string.study_show_answer'), this.themeAccentColors, this.getUIContext()) }, (_locale: string): string => _locale) }
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
    .attributeModifier(new PrimaryGlassSurface(this.primaryGlass))
    .stateEffect(false)
    .borderRadius(应用尺寸.圆角_面板)
    .onClick(() => {
      this.显示答案回调();
    })
  }

  @Builder
  private 竖版评分按钮(评分: number, 标签: ResourceStr, 文字色: ResourceColor, 底色: ResourceColor) {
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
            .fontColor(文字色)
        }
      }
      .width('100%')
    }
    .width('100%')
    .padding({ left: 4, right: 4 })
    .layoutWeight(1)
    .attributeModifier(new GlassSurface(this.glassColors, 底色))
    .stateEffect(false)
    .borderRadius(应用尺寸.圆角_面板)
    .onClick(() => {
      this.评分回调(评分);
    })
  }

  @Builder
  private 竖版评分按钮列() {
    Column({ space: 应用尺寸.间距_8 }) {
      this.竖版评分按钮(RATING_AGAIN, $r('app.string.rating_again'),
        $r('app.color.study_again_text'), $r('app.color.study_again_background'))
      this.竖版评分按钮(RATING_HARD, $r('app.string.rating_hard'),
        $r('app.color.study_hard_text'), $r('app.color.study_hard_background'))
      this.竖版评分按钮(RATING_GOOD, $r('app.string.rating_good'),
        $r('app.color.study_good_text'), $r('app.color.study_good_background'))
      this.竖版评分按钮(RATING_EASY, $r('app.string.rating_easy'),
        $r('app.color.study_easy_text'), $r('app.color.study_easy_background'))
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
      .onTouch((event: TouchEvent): void => { this.handleToolbarTouch(event); })
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
          .onActionCancel((): void => { this.cancelDrag(); })
      )
    }
  }
}
