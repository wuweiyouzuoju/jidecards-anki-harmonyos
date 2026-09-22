// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeTextSpans } from '../components/common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';

// 添加笔记页：独立全屏建卡页（Task 9）。
// 由 首页.ets 通过 Navigation pathStack 以 NavDestination 形式入栈（与 学习页 同机制），
// 取代原 添加笔记面板 弹层。Cloze 笔记类型下提供 c1-c5 快捷挖空按钮与保存前预校验。
// Task 10：笔记类型加载失败时 try/catch 捕获，错误信息在 错误信息 显示，不静默 rejection。
// 图片遮盖类型使用选图与遮罩编辑器创建卡片。

import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { 后端会话 } from '../backend/后端会话';
import { 笔记服务, 笔记字段校验错误 } from '../backend/笔记服务';
import { 笔记类型服务 } from '../backend/笔记类型服务';
import { 图片遮罩服务 } from '../backend/图片遮罩服务';
import { importNoteImage } from '../backend/NoteImageImport';
import { NoteFieldImage, prepareNoteImageFields } from '../model/NoteImageDraft';
import { 文本中的填空编号 } from '../model/填空解析器';
import { 生成Occlusions字符串, 识别图片扩展名 } from '../model/图片遮罩模型';
import type { 遮罩描述 } from '../model/图片遮罩模型';
import { 加载主题模式 } from '../model/主题存储';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 字段帮助面板 } from '../components/字段帮助面板';
import { 图片遮罩编辑器 } from '../components/图片遮罩编辑器';
import { 按下态按钮 } from '../components/common/按下态按钮';
import { 从图库选取图片 } from '../utils/文件导入助手';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { CustomTransition } from '../utils/自定义转场';
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { NotetypeNameId, NotetypeView } from '../proto/messages/NotetypeMessages';
import { 标准笔记类型种类 } from '../proto/messages/NotetypeMessages';

/** 建卡目标牌组候选（通过 Navigation param 传入） */
export interface 添加笔记牌组选项 {
  id: number;
  name: string;
}

/** 笔记类型下拉候选 */
export interface 添加笔记笔记类型选项 {
  id: number;
  name: string;
}

/** Select 组件所需选项结构 */
interface 添加笔记下拉选项 {
  value: string;
}

/** Navigation 入栈参数（与 学习页参数 同风格） */
export interface 添加笔记页参数 {
  deckId?: string;
  deckName?: string;
  deckOptions?: 添加笔记牌组选项[];
}

@Component
export struct 添加笔记页 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(PAGE_SURFACE_KEY) private pageSurface: string = '#F5F7FA';
  /** Navigation 入栈参数 */
  pageDeckId: string = '';
  pageDeckName: string = '';
  pageDeckOptions: 添加笔记牌组选项[] = [];
  /** 页面栈：保存成功 / 取消时 pop 返回牌组详情 */
  pathStack: NavPathStack = new NavPathStack();

  private readonly 笔记服务实例: 笔记服务 = new 笔记服务();
  private readonly 笔记类型服务实例: 笔记类型服务 = new 笔记类型服务();
  private readonly 图片遮罩服务实例: 图片遮罩服务 = new 图片遮罩服务();
  // Cloze Text 字段专用 controller：用于点击 c1-c5 后定位光标。
  // 仅 cloze 笔记类型的 Text 字段绑定此 controller，其它字段不绑定。
  private readonly 填空字段控制器: TextAreaController = new TextAreaController();

  @State private 牌组ID: number = 0;
  @State private 牌组名: string = '';
  @State private 牌组选项: 添加笔记牌组选项[] = [];
  @State private 已选笔记类型ID: number = 0;
  @State private 笔记类型选项: 添加笔记笔记类型选项[] = [];
  @State private 字段名列表: string[] = [];
  @State private 字段值列表: string[] = [];
  @State private fieldImages: NoteFieldImage[] = [];
  @State private pickingFieldImage: boolean = false;
  private imageRequest: number = 0;
  private nextImageId: number = 0;
  private pageActive: boolean = false;
  // 笔记类型名称用于判断是否为 Cloze（Anki 默认 Cloze 笔记类型名为 "Cloze"）
  @State private 笔记类型名: string = '';
  @State private 笔记类型帮助: Resource = $r('app.string.add_note_notetype_help');
  @State private 标签: string = '';
  @State private 高级已展开: boolean = false;
  @State private 错误信息: string = '';
  @State private 处理中: boolean = false;
  @State private 显示帮助: boolean = false;
  @State private 帮助标题: Resource = $r('app.string.add_note_deck');
  @State private 帮助正文: Resource = $r('app.string.add_note_deck_help');
  // Cloze Text 字段最近一次选区/光标位置（onSelect 更新）。
  // 起===止 视为光标位置；起=-1 表示从未触发 onSelect，回退到文末插入。
  @State private 填空选区起: number = -1;
  @State private 填空选区止: number = -1;

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-IMG-OCC-STATE
  // @名称 图片遮盖建卡状态
  //
  // @作用
  // Image Occlusion 笔记类型下的建卡状态：是否进入专属布局、选图 URI、
  // 遮罩列表、Header/Back Extra 文本、是否显示遮罩编辑器全屏弹层。
  // 仅当 是否图片遮盖模式 === true 时这些字段才被读写。
  //
  // @输入
  // 加载笔记类型 进入 'Image Occlusion' 时置位；选图/编辑遮罩/输入文本时由 UI 写入。
  //
  // @输出
  // 驱动 build() 中的条件渲染与 图片遮盖_提交() 的字段填充。
  //
  // @业务规则
  // 切换出 ImageOcclusion 模式时所有字段重置为初值，避免脏数据残留。
  //
  // @副作用
  // 无（纯状态字段）。
  // ========================================================
  @State private 是否图片遮盖模式: boolean = false;
  @State private 图片遮盖_源图Uri: string = '';
  @State private 图片遮盖_遮罩列表: 遮罩描述[] = [];
  @State private 图片遮盖_标题: string = '';
  @State private 图片遮盖_额外: string = '';
  @State private 图片遮盖_显示编辑器: boolean = false;
  // 当前实际是否深色模式（与 首页/学习页 同语义：主题模式 + 系统暗黑模式合成）
  @State private 主题模式值: 主题模式 = 'system';
  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;

  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景色: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下色: string = '#1E4FB8';
  // ⓘ 圆形按钮背景色（淡蓝容器色，配 动作主色 深蓝字符）
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  // 手势导航条高度（底部固定按钮排需抬高避让导航条）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  // 状态栏高度（沉浸式全屏下，顶部条需让出状态栏区域，避免返回按钮叠在状态栏上）
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  /** NavDestination 透明度（由 customNavContentTransition 回调控制，实现淡入淡出转场）。 */
  @State private 转场透明度: number = 1;

  async aboutToAppear(): Promise<void> {
    this.pageActive = true;
    this.牌组ID = this.pageDeckId === '' ? 0 : parseInt(this.pageDeckId);
    this.牌组名 = this.pageDeckName;
    this.牌组选项 = this.pageDeckOptions;
    // 注册自定义转场回调：首页 Navigation.customNavContentTransition 通过此 name 查找回调，
    // 在 animateTo 内调用起点/终点回调修改 转场透明度，实现淡入淡出（替代系统默认左右平移）。
    // key 用 'AddNotePage'（NavPathStack pushPath 时传的 name，与 from.name / to.name 一致）。
    CustomTransition.getInstance().注册NavParam('AddNotePage',
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 1 : 0;
      },
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 0 : 1;
      }
    );
    // 加载主题模式用于图片遮罩编辑器的深色判断；失败回退默认 'system'，不阻塞建卡流程。
    try {
      this.主题模式值 = await 加载主题模式();
    } catch (错误) {
      this.主题模式值 = 'system';
    }
    await this.加载初始数据();
  }

  aboutToDisappear(): void {
    this.pageActive = false;
    this.imageRequest++;
    // 注销自定义转场回调，避免内存泄漏与野回调
    CustomTransition.getInstance().注销NavParam('AddNotePage');
  }

  /**
   * 系统返回键 / 屏幕边缘滑动返回：编辑器/帮助浮层打开时优先关闭，否则走 NavPathStack 默认 pop。
   * Invariants: 图片遮盖编辑器优先于帮助浮层（编辑器更靠上层）。
   */
  onBackPress(): boolean {
    if (this.图片遮盖_显示编辑器) { this.图片遮盖_显示编辑器 = false; return true; }
    if (this.显示帮助) { this.显示帮助 = false; return true; }
    return false;
  }

  /** 暗色模式判断：主题模式值=system 时跟随系统，否则按显式选择。与 学习页.ets 同语义。 */
  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const 上下文: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return 上下文 === undefined ? null : 上下文;
  }

  /** 读取本地化文案，context 不可用时回退空串。 */
  private 取本地化文案(资源: Resource): string {
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return '';
    }
    try {
      return 上下文.resourceManager.getStringSync(资源.id);
    } catch (错误) {
      return '';
    }
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-001
  // @名称 加载初始数据
  //
  // @作用
  // 打开本地 collection，拉取默认笔记类型与笔记类型名列表，进入首个笔记类型字段加载。
  //
  // @输入
  // 无（从 取能力上下文 取 filesDir，调后端服务）
  //
  // @输出
  // 成功 → 填充 笔记类型选项 并调 加载笔记类型；失败 → 在 错误信息 显示加载失败文案
  //
  // @业务规则
  // context 不可用时直接报错，不进入后端调用。
  // 笔记类型名列表映射为下拉候选结构（id + name）。
  // 图片遮盖类型缺失时通过专属服务补建，并与其他类型一起展示。
  //
  // @副作用
  // 调后端 确保已打开 / 获取添加默认值 / 获取笔记类型名列表；读写 处理中 状态
  // ========================================================
  private async 加载初始数据(): Promise<void> {
    this.处理中 = true;
    this.错误信息 = '';
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_notetype_load_failed'));
      this.处理中 = false;
      return;
    }
    try {
      await 后端会话.获取实例().确保已打开(上下文.filesDir);
      const 默认值 = await this.笔记服务实例.获取添加默认值();
      let 名称列表: NotetypeNameId[] = await this.笔记类型服务实例.获取笔记类型名列表();
      // 兜底恢复缺失的标准笔记类型：Basic / Cloze / 3 个 Basic 变种。
      // Anki 26.05 默认 collection 预置 Basic + 3 个 Basic 变种 + Cloze；
      // 但云同步替换 collection 后，云端可能缺这些标准类型（如账号曾被清理）。
      // 走 Anki 桌面版「管理笔记类型 → 添加 → 选择基础类型」同款流程：
      //   1. GetStockNotetypeLegacy(kind) 拿到 JSON
      //   2. AddNotetypeLegacy(json) 落库
      // 调用失败不阻断主流程（用户仍能选其他已有类型）；只在 错误信息 追加提示。
      let 类型缺失: boolean = false;
      if (!名称列表.some((项: NotetypeNameId): boolean => 添加笔记页.Basic笔记类型名集合.indexOf(项.name) >= 0)) {
        try {
          const json = await this.笔记类型服务实例.获取标准笔记类型JSON(标准笔记类型种类.BASIC);
          await this.笔记类型服务实例.添加笔记类型旧版(json);
          类型缺失 = true;
        } catch (e) {
          this.错误信息 = e instanceof Error ? e.message : `${e}`;
        }
      }
      if (!名称列表.some((项: NotetypeNameId): boolean => 添加笔记页.填空笔记类型名集合.indexOf(项.name) >= 0)) {
        try {
          const json = await this.笔记类型服务实例.获取标准笔记类型JSON(标准笔记类型种类.CLOZE);
          await this.笔记类型服务实例.添加笔记类型旧版(json);
          类型缺失 = true;
        } catch (e) {
          this.错误信息 = e instanceof Error ? e.message : `${e}`;
        }
      }
      if (!名称列表.some((项: NotetypeNameId): boolean => 添加笔记页.Basic反转笔记类型名集合.indexOf(项.name) >= 0)) {
        try {
          const json = await this.笔记类型服务实例.获取标准笔记类型JSON(标准笔记类型种类.BASIC_AND_REVERSED);
          await this.笔记类型服务实例.添加笔记类型旧版(json);
          类型缺失 = true;
        } catch (e) {
          this.错误信息 = e instanceof Error ? e.message : `${e}`;
        }
      }
      if (!名称列表.some((项: NotetypeNameId): boolean => 添加笔记页.Basic可选反转笔记类型名集合.indexOf(项.name) >= 0)) {
        try {
          const json = await this.笔记类型服务实例.获取标准笔记类型JSON(标准笔记类型种类.BASIC_OPTIONAL_REVERSED);
          await this.笔记类型服务实例.添加笔记类型旧版(json);
          类型缺失 = true;
        } catch (e) {
          this.错误信息 = e instanceof Error ? e.message : `${e}`;
        }
      }
      if (!名称列表.some((项: NotetypeNameId): boolean => 添加笔记页.Basic输入答案笔记类型名集合.indexOf(项.name) >= 0)) {
        try {
          const json = await this.笔记类型服务实例.获取标准笔记类型JSON(标准笔记类型种类.BASIC_TYPING);
          await this.笔记类型服务实例.添加笔记类型旧版(json);
          类型缺失 = true;
        } catch (e) {
          this.错误信息 = e instanceof Error ? e.message : `${e}`;
        }
      }
      if (!名称列表.some((项: NotetypeNameId): boolean => this.是图片遮盖笔记类型名(项.name))) {
        try {
          await this.图片遮罩服务实例.添加图片遮罩笔记类型();
          类型缺失 = true;
        } catch (e) {
          this.错误信息 = e instanceof Error ? e.message : `${e}`;
        }
      }
      if (类型缺失) {
        名称列表 = await this.笔记类型服务实例.获取笔记类型名列表();
      }
      this.笔记类型选项 = 名称列表.map((项: NotetypeNameId): 添加笔记笔记类型选项 => ({
        id: 项.id, name: 项.name
      }));
      if (this.笔记类型选项.length === 0) {
        this.错误信息 = this.取本地化文案($r('app.string.add_note_notetype_load_failed'));
        return;
      }
      // 已保存的默认类型可能被删除，此时回退到第一个可用类型。
      let 默认笔记类型ID: number = 默认值.notetypeId;
      const 默认ID可见: boolean = this.笔记类型选项.some(
        (项: 添加笔记笔记类型选项): boolean => 项.id === 默认笔记类型ID);
      if (!默认ID可见) {
        默认笔记类型ID = this.笔记类型选项[0].id;
      }
      await this.加载笔记类型(默认笔记类型ID);
    } catch (错误) {
      this.已选笔记类型ID = 0;
      this.字段名列表 = [];
      this.字段值列表 = [];
      this.错误信息 = this.取本地化文案($r('app.string.add_note_notetype_load_failed'));
    } finally {
      this.处理中 = false;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-002
  // @名称 加载笔记类型
  //
  // @作用
  // 按 notetypeId 拉取笔记类型视图，填充字段名/字段值/帮助文案；失败时清空字段并在 错误信息 提示。
  //
  // @输入
  // notetypeId: 笔记类型 ID
  //
  // @输出
  // 成功 → 更新 已选笔记类型ID / 笔记类型名 / 笔记类型帮助 / 字段名列表 / 字段值列表；
  //        字段值列表全部初始化为空串，填空选区重置为 -1。
  // 失败 → 清空上述字段并显示加载失败文案。
  //
  // @业务规则
  // Task 10：失败时 try/catch 捕获并在 错误信息 提示，不静默 rejection。
  //
  // @副作用
  // 调后端 获取笔记类型；读写 处理中 状态
  // ========================================================
  private async 加载笔记类型(notetypeId: number): Promise<void> {
    this.imageRequest++;
    this.fieldImages = [];
    this.pickingFieldImage = false;
    this.处理中 = true;
    try {
      const 视图: NotetypeView = await this.笔记类型服务实例.获取笔记类型(notetypeId);
      this.已选笔记类型ID = notetypeId;
      this.笔记类型名 = 视图.name;
      this.笔记类型帮助 = this.笔记类型帮助文案(视图.name);
      this.字段名列表 = 视图.fieldNames;
      this.字段值列表 = 视图.fieldNames.map((_名: string): string => '');
      this.填空选区起 = -1;
      this.填空选区止 = -1;
      // T3.3-T3.4：进入 / 退出 ImageOcclusion 模式标志与状态变量重置。
      // 进入时设为 true，build() 切换为图片遮盖专属布局；切换出时清空遮盖状态，避免脏数据残留。
      // 注意：后端笔记类型名是本地化的（中文环境下为「图片遮盖」），用 是图片遮盖笔记类型名 识别。
      if (this.是图片遮盖笔记类型名(视图.name)) {
        this.是否图片遮盖模式 = true;
        this.图片遮盖_源图Uri = '';
        this.图片遮盖_遮罩列表 = [];
        this.图片遮盖_标题 = '';
        this.图片遮盖_额外 = '';
        this.图片遮盖_显示编辑器 = false;
      } else {
        this.是否图片遮盖模式 = false;
        this.图片遮盖_源图Uri = '';
        this.图片遮盖_遮罩列表 = [];
        this.图片遮盖_标题 = '';
        this.图片遮盖_额外 = '';
        this.图片遮盖_显示编辑器 = false;
      }
      this.错误信息 = '';
    } catch (错误) {
      this.已选笔记类型ID = 0;
      this.字段名列表 = [];
      this.字段值列表 = [];
      this.笔记类型名 = '';
      this.笔记类型帮助 = $r('app.string.add_note_notetype_help');
      this.是否图片遮盖模式 = false;
      this.图片遮盖_源图Uri = '';
      this.图片遮盖_遮罩列表 = [];
      this.图片遮盖_标题 = '';
      this.图片遮盖_额外 = '';
      this.图片遮盖_显示编辑器 = false;
      this.错误信息 = this.取本地化文案($r('app.string.add_note_notetype_load_failed'));
    } finally {
      this.处理中 = false;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-LOCALE-MATCH
  // @名称 笔记类型与字段名本地化识别
  //
  // @作用
  // Anki 后端创建 stock notetype 时使用 tr.*() 翻译笔记类型名与字段名，
  // 中文环境下后端返回的是「图片遮盖」「填空题」「问答题」等中文名，不是英文 'Image Occlusion' / 'Cloze' / 'Basic'。
  // 前端如果只按英文名比较，会导致：
  //   - 是否图片遮盖模式 永远 false → 用户看到 4 个 TextArea 而非选图 UI
  //   - 笔记类型帮助文案 switch 永远走 default → 用户看到「一套词」
  //   - 是填空笔记类型 永远 false → c1-c5 按钮不出现
  // 本组助手覆盖 en / zh-CN / zh-TW 三种已知译名，按字段结构识别而非按单一字符串。
  //
  // @输入
  // 笔记类型名或字段名（来自 NotetypeView.name / NotetypeView.fieldNames）
  //
  // @输出
  // boolean：是否匹配
  //
  // @业务规则
  // 译名来源 anki/ftl/core-repo/core/{en,zh-CN,zh-TW}/notetypes.ftl。
  // 新增语言支持时往对应数组追加译名即可，不需改调用点。
  //
  // @副作用
  // 无（纯函数）。
  // ========================================================
  private static readonly 图片遮盖笔记类型名集合: string[] = ['Image Occlusion', '图片遮盖', '影像遮擋'];
  private static readonly 填空笔记类型名集合: string[] = ['Cloze', '填空题'];
  private static readonly Basic笔记类型名集合: string[] = ['Basic', '问答题'];
  private static readonly Basic反转笔记类型名集合: string[] = ['Basic (and reversed card)', '问答题（附翻转卡片）'];
  private static readonly Basic可选反转笔记类型名集合: string[] = ['Basic (optional reversed card)', '问答题（可选附翻转卡片）'];
  private static readonly Basic输入答案笔记类型名集合: string[] = ['Basic (type in the answer)', '问答题（输入答案）'];
  private static readonly Header字段名集合: string[] = ['Header', '标题'];
  private static readonly BackExtra字段名集合: string[] = ['Back Extra', '背面额外'];
  private static readonly TextField名集合: string[] = ['Text', '文字'];

  private 是图片遮盖笔记类型名(名: string): boolean {
    return 添加笔记页.图片遮盖笔记类型名集合.indexOf(名) >= 0;
  }

  private 是填空笔记类型名(名: string): boolean {
    return 添加笔记页.填空笔记类型名集合.indexOf(名) >= 0;
  }

  private 是Header字段(名: string): boolean {
    return 添加笔记页.Header字段名集合.indexOf(名) >= 0;
  }

  private 是BackExtra字段(名: string): boolean {
    return 添加笔记页.BackExtra字段名集合.indexOf(名) >= 0;
  }

  private 是Text字段(名: string): boolean {
    return 添加笔记页.TextField名集合.indexOf(名) >= 0;
  }

  /** 按当前笔记类型名称返回对应的专门帮助文案；未知类型回退到通用 add_note_notetype_help。 */
  private 笔记类型帮助文案(名: string): Resource {
    if (添加笔记页.Basic笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_basic_help');
    }
    if (添加笔记页.Basic反转笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_basic_reversed_help');
    }
    if (添加笔记页.Basic可选反转笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_basic_optional_reversed_help');
    }
    if (添加笔记页.Basic输入答案笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_basic_type_answer_help');
    }
    if (添加笔记页.填空笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_cloze_help');
    }
    if (添加笔记页.图片遮盖笔记类型名集合.indexOf(名) >= 0) {
      return $r('app.string.add_note_notetype_image_occlusion_help');
    }
    return $r('app.string.add_note_notetype_help');
  }

  private 是填空笔记类型(): boolean {
    return this.是填空笔记类型名(this.笔记类型名);
  }

  /** Cloze 挖空作用于 "Text" 字段（Anki Cloze 笔记类型首字段）；找不到则回退首字段。 */
  private 填空字段索引(): number {
    const 索引: number = this.字段名列表.findIndex((名: string): boolean => this.是Text字段(名));
    return 索引 >= 0 ? 索引 : 0;
  }

  private 填空编号列表(): number[] {
    return [1, 2, 3, 4, 5];
  }

  private 更新字段(索引: number, 值: string): void {
    const 下一个 = this.字段值列表.slice();
    下一个[索引] = 值;
    this.字段值列表 = 下一个;
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-003
  // @名称 解析标签
  //
  // @作用
  // 将 标签 文本按空白拆分并去重，返回有效标签数组。
  //
  // @输入
  // 无（读取 标签 字段）
  //
  // @输出
  // 去重后的标签数组（顺序保留首次出现顺序）
  //
  // @业务规则
  // 空白分隔（含多空格）；空串跳过；已出现的标签不重复加入。
  //
  // @副作用
  // 无
  // ========================================================
  private 解析标签(): string[] {
    const 已见: string[] = [];
    for (const 标签 of this.标签.split(/\s+/)) {
      const 已修剪 = 标签.trim();
      if (已修剪 !== '' && 已见.indexOf(已修剪) < 0) {
        已见.push(已修剪);
      }
    }
    return 已见;
  }

  /**
   * 点击 c{n} 按钮：选中文本则包裹为 {{c{n}::选中文本}}；无选中则在光标位置插入 {{c{n}::}}，
   * 光标移到 :: 之后便于直接输入内容。
   */
  private 应用填空(编号: number): void {
    if (this.处理中) {
      return;
    }
    const 索引: number = this.填空字段索引();
    if (索引 < 0 || 索引 >= this.字段值列表.length) {
      return;
    }
    const 值: string = this.字段值列表[索引];
    const 起: number = this.填空选区起;
    const 止: number = this.填空选区止;
    if (止 > 起 && 起 >= 0 && 止 <= 值.length) {
      const 已选文本: string = 值.substring(起, 止);
      const 标记 = `{{c${编号}::${已选文本}}}`;
      const 新值 = 值.substring(0, 起) + 标记 + 值.substring(止);
      this.更新字段(索引, 新值);
      const 光标位置: number = 起 + 标记.length;
      this.填空选区起 = 光标位置;
      this.填空选区止 = 光标位置;
      this.调度光标(光标位置);
    } else {
      const 插入位置: number = (起 >= 0 && 起 <= 值.length) ? 起 : 值.length;
      const 前缀 = `{{c${编号}::`;
      const 标记 = `${前缀}}}`;
      const 新值 = 值.substring(0, 插入位置) + 标记 + 值.substring(插入位置);
      this.更新字段(索引, 新值);
      // 光标定位到 :: 之后（前缀末尾），便于直接输入答案
      const 光标位置: number = 插入位置 + 前缀.length;
      this.填空选区起 = 光标位置;
      this.填空选区止 = 光标位置;
      this.调度光标(光标位置);
    }
  }

  // TextArea 绑定的 text 由 @State 驱动，更新后下一帧才重渲染，故光标定位延后到下一个事件循环。
  private 调度光标(位置: number): void {
    setTimeout(() => {
      try {
        this.填空字段控制器.caretPosition(位置);
      } catch (错误) {
        // 光标定位失败不影响功能，用户可手动点选
      }
    }, 0);
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-004
  // @名称 提交前校验填空
  //
  // @作用
  // Cloze 笔记类型保存前预校验：Text 字段必须含至少一个 {{cN::}} 标记，避免后端 MISSING_CLOZE。
  //
  // @输入
  // 无（读取 笔记类型名 / 字段名列表 / 字段值列表）
  //
  // @输出
  // 非 Cloze 类型 → true（跳过校验）；
  // Cloze 类型且 Text 字段含 {{cN::}} 标记 → true；否则 → false。
  //
  // @业务规则
  // 非 Cloze 笔记类型无需校验；Cloze 字段索引找不到时也跳过（兜底首字段也无标记则后端报错）。
  //
  // @副作用
  // 无
  // ========================================================
  private 提交前校验填空(): boolean {
    if (!this.是填空笔记类型()) {
      return true;
    }
    const 索引: number = this.填空字段索引();
    if (索引 < 0 || 索引 >= this.字段值列表.length) {
      return true;
    }
    return 文本中的填空编号(this.字段值列表[索引]).length > 0;
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-005
  // @名称 提交
  //
  // @作用
  // 校验通过后新建笔记并写入指定牌组；成功 pop 返回牌组详情，失败在 错误信息 显示友好提示。
  //
  // @输入
  // 无（使用 已选笔记类型ID / 字段值列表 / 标签 / 牌组ID）
  //
  // @输出
  // 成功 → pop 页面栈返回牌组详情；
  // 失败 → 在 错误信息 显示对应友好文案（空字段 / 重复 / 缺填空标记 / 其他错误）
  //
  // @业务规则
  // 防重入：处理中 / 牌组ID=0 / 已选笔记类型ID=0 时直接返回。
  // 提交前先调 提交前校验填空，校验失败显示缺填空标记文案。
  // 笔记字段校验错误 按 messageKey 区分：add_note_empty_error / add_note_duplicate_error 单独处理，
  // 其余（MISSING_CLOZE / NOTETYPE_NOT_CLOZE / FIELD_NOT_CLOZE）友好化为同一提示。
  //
  // @副作用
  // 调后端 新建笔记 / 添加笔记；读写 处理中 状态；成功后 pop 页面栈
  // ========================================================
  private async 提交(): Promise<void> {
    if (this.处理中 || this.pickingFieldImage || this.牌组ID === 0 || this.已选笔记类型ID === 0) {
      return;
    }
    // T3.6：ImageOcclusion 模式走专属提交流程，不复用 Cloze 校验与字段直接填充逻辑。
    if (this.是否图片遮盖模式) {
      await this.图片遮盖_提交();
      return;
    }
    if (!this.提交前校验填空()) {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_cloze_missing'));
      return;
    }
    this.错误信息 = '';
    this.处理中 = true;
    const fields: string[] = this.字段值列表.slice();
    const images: NoteFieldImage[] = this.fieldImages.slice();
    const tags: string[] = this.解析标签();
    const notetypeId: number = this.已选笔记类型ID;
    const deckId: number = this.牌组ID;
    try {
      let preparedFields: string[];
      try {
        preparedFields = await prepareNoteImageFields(fields, images, importNoteImage);
      } catch (error) {
        throw new Error(this.取本地化文案($r('app.string.add_note_image_import_failed')));
      }
      const 笔记: EditableNote = await this.笔记服务实例.新建笔记(notetypeId);
      笔记.fields = preparedFields;
      笔记.tags = tags;
      await this.笔记服务实例.添加笔记(笔记, deckId);
      // 笔记添加成功：写 AppStorage 标志位通知首页/牌组详情面板立即刷新统计计数。
      // 不依赖 NavPathStack.onPop 回调（不同设备/API 版本偶发不触发），用 @StorageLink + @Watch 兜底。
      AppStorage.setOrCreate<number>('noteAddedTick', Date.now());
      if (this.pageActive) { this.pathStack.pop(); }
    } catch (错误) {
      if (!this.pageActive) { return; }
      if (错误 instanceof 笔记字段校验错误) {
        if (错误.messageKey === 'add_note_empty_error') {
          this.错误信息 = this.取本地化文案($r('app.string.add_note_empty_error'));
        } else if (错误.messageKey === 'add_note_duplicate_error') {
          this.错误信息 = this.取本地化文案($r('app.string.add_note_duplicate_error'));
        } else {
          // MISSING_CLOZE / NOTETYPE_NOT_CLOZE / FIELD_NOT_CLOZE 友好化为同一提示
          this.错误信息 = this.取本地化文案($r('app.string.add_note_cloze_missing'));
        }
      } else {
        this.错误信息 = 错误 instanceof Error ? 错误.message : `${错误}`;
      }
    } finally {
      this.处理中 = false;
    }
  }

  private async pickFieldImage(fieldIndex: number): Promise<void> {
    if (this.处理中 || this.pickingFieldImage) { return; }
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    if (!context) { return; }
    const request: number = ++this.imageRequest;
    this.pickingFieldImage = true;
    try {
      const uri: string | null = await 从图库选取图片(context);
      if (!this.pageActive || request !== this.imageRequest || uri === null) { return; }
      const attachment: NoteFieldImage = {
        id: ++this.nextImageId, fieldIndex: fieldIndex, uri: uri, filename: ''
      };
      this.fieldImages = this.fieldImages.concat([attachment]);
      this.错误信息 = '';
    } finally {
      if (request === this.imageRequest) { this.pickingFieldImage = false; }
    }
  }

  private imagesForField(fieldIndex: number): NoteFieldImage[] {
    return this.fieldImages.filter((attachment: NoteFieldImage): boolean => attachment.fieldIndex === fieldIndex);
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-IMG-OCC-PICK
  // @名称 选取图片遮盖源图
  //
  // @作用
  // ImageOcclusion 模式下"选择图片 / 更换图片"按钮的点击处理：
  //   调 从图库选取图片（与牌组定制面板同款 PhotoViewPicker），
  //   用户取消或失败时静默返回；成功时把 URI 写入 图片遮盖_源图Uri 并重置遮罩列表。
  //
  // @输入
  // 无（从 取能力上下文 取 context 传给选择器）
  //
  // @输出
  // 成功 → 更新 图片遮盖_源图Uri / 图片遮盖_遮罩列表；
  // 失败 / 取消 → 静默返回，不打错误提示。
  //
  // @业务规则
  // 选图后必须清空遮罩列表——遮罩基于原图坐标，换图后旧遮罩无意义。
  //
  // @副作用
  // 调起系统图库选择 UI。
  // ========================================================
  private async 选取图片遮盖源图(): Promise<void> {
    if (this.处理中) {
      return;
    }
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return;
    }
    const uri: string | null = await 从图库选取图片(上下文);
    if (uri === null || uri === '') {
      // 用户取消或选图失败：静默返回（cancel 是正常流程，与牌组定制面板一致）
      return;
    }
    this.图片遮盖_源图Uri = uri;
    this.图片遮盖_遮罩列表 = [];
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-IMG-OCC-READ-BYTES
  // @名称 读取图片字节
  //
  // @作用
  // 把 PhotoViewPicker 返回的 URI 流式读为 Uint8Array，
  // 供 写入临时图片文件 落到沙箱临时文件后交后端 AddImageOcclusionNote 读取。
  //
  // @输入
  // URI: PhotoViewPicker / 沙箱路径皆可（fs.openSync 直接消费 picker URI 的临时 provider 权限）
  //
  // @输出
  // Uint8Array：图片全部字节
  //
  // @业务规则
  // 不使用 fs.copyFileSync 中转落盘——copyFileSync 无法安全消费 Harmony picker 返回的临时权限，
  //   必须用 openSync + readSync 流式读（参考 数据迁移服务.按描述符复制文件）。
  // 缓冲区 64KB；读到 0 字节即结束。块拼接到一个大 Uint8Array 返回。
  //
  // @副作用
  // 打开 / 关闭文件描述符。
  // ========================================================
  private 读取图片字节(URI: string): Uint8Array {
    const 文件: fs.File = fs.openSync(URI, fs.OpenMode.READ_ONLY);
    try {
      const 缓冲大小: number = 64 * 1024;
      const 块列表: Uint8Array[] = [];
      let 总长度: number = 0;
      while (true) {
        const 缓冲: ArrayBuffer = new ArrayBuffer(缓冲大小);
        const 读取大小: number = fs.readSync(文件.fd, 缓冲, { length: 缓冲大小 });
        if (读取大小 <= 0) {
          break;
        }
        const 块: Uint8Array = new Uint8Array(缓冲.slice(0, 读取大小));
        块列表.push(块);
        总长度 += 读取大小;
        if (读取大小 < 缓冲大小) {
          break;
        }
      }
      const 结果: Uint8Array = new Uint8Array(总长度);
      let 偏移: number = 0;
      for (const 块 of 块列表) {
        结果.set(块, 偏移);
        偏移 += 块.length;
      }
      return 结果;
    } finally {
      fs.closeSync(文件);
    }
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-IMG-OCC-SUBMIT
  // @名称 图片遮盖提交
  //
  // @作用
  // ImageOcclusion 模式下的提交流程：
  //   1. 校验已选图、至少 1 个遮罩
  //   2. 读 URI 字节 → 按魔数识别扩展名 → 写入沙箱临时文件（cacheDir）
  //   3. 图片遮罩服务.添加图片遮罩笔记 传临时文件绝对路径，后端读取字节、
  //      以临时文件名为期望名写入 collection.media、登记媒体库、建笔记（image_path 指向临时文件）
  //   4. pop 返回牌组详情（与既有 Basic / Cloze 流程一致）
  //
  // @输入
  // 无（读 图片遮盖_源图Uri / 图片遮盖_遮罩列表 / 图片遮盖_标题 / 图片遮盖_额外 / 已选笔记类型ID / 牌组ID）
  //
  // @输出
  // 成功 → pop 页面栈；失败 → 在 错误信息 显示友好提示
  //
  // @业务规则
  // 防重入：处理中 / 牌组ID=0 / 已选笔记类型ID=0 时直接返回（与 提交 同守卫）。
  // image_path 必须是磁盘上真实存在的文件绝对路径（Anki 桌面端同样传临时文件路径）——
  //   后端第一步 read_file(image_path)，传 media 文件名会因相对路径解析失败报
  //   "Failed to read 'xxx': No such file or directory"（2026-08-27 修复的建卡失败根因）。
  // 扩展名用魔数嗅探的真实图片格式：Anki is_image_file 只认 jpg/png/gif/webp 等，
  //   伪扩展名（如 .img）会让遮罩编辑器无法回读图片。
  // 牌组ID 由后端按当前选中牌组写入（AddImageOcclusionNote 不接受 deckId 参数，
  //   使用 collection 的 current deck；用户在牌组详情页点「加卡」进入时 current deck 已切到该牌组）。
  // 临时文件在 finally 中删除；后端已把字节写入 collection.media，删除不影响已建笔记。
  //
  // @副作用
  // 写 / 删沙箱临时文件；调后端 添加图片遮罩笔记；读写 处理中 状态；成功后 pop 页面栈。
  // ========================================================
  private async 图片遮盖_提交(): Promise<void> {
    if (this.处理中 || this.牌组ID === 0 || this.已选笔记类型ID === 0) {
      return;
    }
    // T3.7：未选图 / 未画至少 1 个遮罩时禁用保存按钮，此处做兜底校验。
    if (this.图片遮盖_源图Uri === '') {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_image_occlusion_no_image'));
      return;
    }
    if (this.图片遮盖_遮罩列表.length === 0) {
      this.错误信息 = this.取本地化文案($r('app.string.add_note_image_occlusion_need_mask'));
      return;
    }
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return;
    }
    this.错误信息 = '';
    this.处理中 = true;
    let 临时路径: string = '';
    try {
      // 1-2. 读 URI 字节，按魔数定扩展名，写入沙箱临时文件
      const 字节: Uint8Array = this.读取图片字节(this.图片遮盖_源图Uri);
      临时路径 = `${上下文.cacheDir}/image-occlusion-${Date.now()}.${识别图片扩展名(字节)}`;
      this.写入临时图片文件(临时路径, 字节);
      // 3. 调添加图片遮罩笔记 RPC 落库（后端自行读临时文件并写入 collection.media + 建笔记）
      await this.图片遮罩服务实例.添加图片遮罩笔记({
        imagePath: 临时路径,
        occlusions: 生成Occlusions字符串(this.图片遮盖_遮罩列表),
        header: this.图片遮盖_标题,
        backExtra: this.图片遮盖_额外,
        tags: this.解析标签(),
        notetypeId: this.已选笔记类型ID
      });
      // 笔记添加成功：写 AppStorage 标志位通知首页/牌组详情面板立即刷新统计计数。
      // 不依赖 NavPathStack.onPop 回调（不同设备/API 版本偶发不触发），用 @StorageLink + @Watch 兜底。
      AppStorage.setOrCreate<number>('noteAddedTick', Date.now());
      // 4. pop 返回牌组详情
      this.pathStack.pop();
    } catch (错误) {
      this.错误信息 = 错误 instanceof Error ? 错误.message : `${错误}`;
    } finally {
      if (临时路径 !== '') {
        try {
          fs.unlinkSync(临时路径);
        } catch (清理错误) {
          // 临时文件清理失败不影响主流程；cacheDir 由系统回收
        }
      }
      this.处理中 = false;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-ADDNOTE-IMG-OCC-WRITE-TEMP
  // @名称 写入临时图片文件
  //
  // @作用
  // 把图片字节写入沙箱临时文件，供后端 AddImageOcclusionNote 按文件路径读取。
  //
  // @输入
  // 路径: cacheDir 下的绝对路径；字节: 图片全部字节
  //
  // @输出
  // 无（失败抛异常，由 图片遮盖_提交 统一显示错误）
  //
  // @业务规则
  // TRUNC 确保重名时清空旧内容；写入失败时关闭描述符后异常上抛。
  //
  // @副作用
  // 创建 / 写入 / 关闭沙箱文件。
  // ========================================================
  private 写入临时图片文件(路径: string, 字节: Uint8Array): void {
    const 文件: fs.File = fs.openSync(
      路径, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
    try {
      // Uint8Array.buffer 的类型是 ArrayBufferLike，writeSync 需要 ArrayBuffer，显式收窄
      const 缓冲: ArrayBuffer = 字节.buffer as ArrayBuffer;
      fs.writeSync(文件.fd, 缓冲);
    } finally {
      fs.closeSync(文件);
    }
  }

  private 打开帮助(标题: Resource, 正文: Resource): void {
    this.帮助标题 = 标题;
    this.帮助正文 = 正文;
    this.显示帮助 = true;
  }

  private 已选笔记类型索引(): number {
    const 索引 = this.笔记类型选项.findIndex(
      (笔记类型: 添加笔记笔记类型选项): boolean => 笔记类型.id === this.已选笔记类型ID);
    return 索引 < 0 ? 0 : 索引;
  }

  private 已选笔记类型名(): string {
    for (const 笔记类型 of this.笔记类型选项) {
      if (笔记类型.id === this.已选笔记类型ID) {
        return 笔记类型.name;
      }
    }
    return '';
  }

  private 笔记类型下拉选项(): 添加笔记下拉选项[] {
    const 选项列表: 添加笔记下拉选项[] = [];
    for (const 笔记类型 of this.笔记类型选项) {
      选项列表.push({ value: 笔记类型.name });
    }
    return 选项列表;
  }

  @Builder
  private 带帮助的标签(标签文案: Resource, 取帮助: () => Resource) {
    Row() {
      Text(标签文案)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .layoutWeight(1)
      // 注：帮助文案用回调 取帮助: () => Resource 而非直接传 Resource。
      // 直接传 Resource 时 @Builder 在调用时求值快照，后续 @State 笔记类型帮助 变化不会更新到弹层；
      // 回调在点击时执行，读取的是 this.笔记类型帮助 的最新值，确保切换笔记类型后 i 弹出对应说明。
      Button() {
        Text() { ThemeTextSpans($r('app.string.field_help_button'), this.themeAccentColors, this.getUIContext()) }.fontColor(this.动作主色)
      }
        .type(ButtonType.Normal)
        .backgroundColor(Color.Transparent)
        .fontColor(this.动作主色)
        .enabled(!this.处理中)
        .onClick((): void => {
          this.打开帮助(标签文案, 取帮助());
        })
    }
    .width('100%')
  }

  // 标签字段块：ImageOcclusion 模式与其他笔记类型共用，统一放在「高级设置」折叠区里。
  // 抽 @Builder 消除两个分支的 Tags 代码重复（BUG-004 修复）。
  @Builder
  private 标签字段块() {
    Column({ space: 应用尺寸.间距_5 }) {
      this.带帮助的标签($r('app.string.add_note_tags'), (): Resource => $r('app.string.add_note_tags_help'))
      TextInput({ placeholder: $r('app.string.add_note_tags_placeholder'), text: this.标签 })
        .width('100%')
        .height(应用尺寸.按钮高度)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .placeholderColor($r('app.color.text_tertiary'))
        .backgroundColor($r('app.color.surface_card'))
        .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
        .borderRadius(应用尺寸.圆角_面板)
        .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
        .enabled(!this.处理中)
        .onChange((值: string): void => {
          this.标签 = 值;
        })
      Text($r('app.string.add_note_duplicate_rejected'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_tertiary'))
        .width('100%')
    }
    .width('100%')
  }

  // 高级设置按钮 + 折叠区：ImageOcclusion 模式与其他笔记类型共用。
  // 抽 @Builder 消除两个分支的高级设置代码重复（BUG-004 修复）。
  @Builder
  private 高级设置折叠区() {
    Button() {
      Row({ space: 应用尺寸.间距_8 }) {
        Text($r('app.string.add_note_tags'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_secondary'))
        Text(this.高级已展开 ? '⌃' : '⌄')
          .fontColor($r('app.color.text_tertiary'))
      }
    }
      .height(应用尺寸.紧凑控件高度)
      .flexShrink(0)
      .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12 })
      .backgroundColor(Color.Transparent)
      .borderRadius(应用尺寸.圆角_面板)
      .enabled(!this.处理中)
      .onClick((): void => {
        this.高级已展开 = !this.高级已展开;
      })

    if (this.高级已展开) {
      this.标签字段块()
    }
  }

  @Builder
  private 顶部条() {
    // 页面标题独立居中，牌组选择保留在表单内。
    Stack({ alignContent: Alignment.Center }) {
      Text($r('app.string.add_note_title'))
        .fontSize(应用尺寸.字号_标题)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .textAlign(TextAlign.Center)
        .width('44%').hitTestBehavior(HitTestMode.None)
        .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12 })

      Row() {
        按下态按钮({
          文案: $r('app.string.study_back'),
          字色: $r('app.color.text_primary'),
          是否启用: !this.处理中,
          点击回调: (): void => {
            if (!this.处理中) {
              this.pathStack.pop();
            }
          }
        })
        Blank()
        Button(this.处理中 ? $r('app.string.add_note_saving') : $r('app.string.add_note_save'))
          .height(应用尺寸.紧凑控件高度)
          .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
          .fontSize(应用尺寸.字号_按钮)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.action_on_primary'))
          .backgroundColor(this.主色按钮背景色)
          .borderRadius(应用尺寸.圆角_面板)
          .enabled(this.保存按钮可用())
          .onClick((): void => { this.提交(); })
      }
      .width('100%')
      .height('100%')
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .height(应用尺寸.工具栏高度 + this.状态栏高度)
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
      bottom: 应用尺寸.toolbarVerticalInset
    })
    .backgroundColor(Color.Transparent)
  }

  @Builder
  private 填空按钮行() {
    Row({ space: 应用尺寸.间距_8 }) {
      ForEach(this.填空编号列表(), (编号: number) => {
        Button(`c${编号}`)
          .height(应用尺寸.紧凑控件高度)
          .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12 })
          .fontSize(应用尺寸.字号_正文)
          .fontColor(this.动作主色)
          .backgroundColor($r('app.color.surface_page'))
          .borderRadius(应用尺寸.圆角_面板)
          .enabled(!this.处理中)
          .onClick((): void => {
            this.应用填空(编号);
          })
      }, (编号: number): string => `cloze-btn-${编号}`)
    }
    .width('100%')
  }

  @Builder
  private fieldImagePreviews(fieldIndex: number) {
    ForEach(this.imagesForField(fieldIndex), (attachment: NoteFieldImage) => {
      Stack({ alignContent: Alignment.TopEnd }) {
        Image(attachment.uri)
          .width('100%')
          .height(应用尺寸.卡片高度)
          .objectFit(ImageFit.Contain)
          .borderRadius(应用尺寸.圆角_面板)
          .backgroundColor($r('app.color.surface_page'))
          .accessibilityText(
            $r('app.string.add_note_image_preview'))
        Button($r('app.string.add_note_image_remove'))
          .height(应用尺寸.紧凑控件高度)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .backgroundColor($r('app.color.surface_card'))
          .borderRadius(应用尺寸.圆角_面板)
          .margin(应用尺寸.间距_5)
          .enabled(!this.处理中)
          .onClick((): void => {
            this.fieldImages = this.fieldImages.filter((item: NoteFieldImage): boolean => item.id !== attachment.id);
          })
      }
      .width('100%')
    }, (attachment: NoteFieldImage): string => `${attachment.id}`)
  }

  build() {
    NavDestination() {
      Stack() {
      Column() {
        this.顶部条()
        // 保存位于顶栏，滚动区优先留给正反面内容。
        Scroll() {
          Column({ space: 应用尺寸.间距_14 }) {
            // 2026-07-28：对齐舒尔特05 settingSelectRow 形态——标签在左、Select 在右，
            // 帮助按钮 ⓘ 紧贴 Select 右侧；Select 不再 100% 宽，改为内容自适应。
            // onClick 直接读 this.笔记类型帮助（与原 带帮助的标签 回调等价：点击时取最新值）。
            Row() {
              Text($r('app.string.add_note_notetype'))
                .fontSize(应用尺寸.字号_按钮)
                .fontColor($r('app.color.text_secondary'))
                .layoutWeight(1)
              Select(this.笔记类型下拉选项())
                .selected(this.已选笔记类型索引())
                .value(this.已选笔记类型名())
                .enabled(!this.处理中 && this.笔记类型选项.length > 0)
                .attributeModifier(new SelectStyle($r('app.color.surface_card')))
                .font(SelectStyle.controlFont)
                .borderRadius(SelectStyle.controlRadius)
                .onSelect((索引: number): void => {
                  this.加载笔记类型(this.笔记类型选项[索引].id);
                })
              Button() {
                Text() { ThemeTextSpans($r('app.string.field_help_button'), this.themeAccentColors, this.getUIContext()) }.fontColor(this.动作主色)
              }
                .type(ButtonType.Normal)
                .backgroundColor(Color.Transparent)
                .fontColor(this.动作主色)
                .enabled(!this.处理中)
                .onClick((): void => {
                  this.打开帮助($r('app.string.add_note_notetype'), this.笔记类型帮助);
                })
            }
            .width('100%')

            // 遮盖使用专属布局；普通字段支持文字与独立图片附件。
            if (this.是否图片遮盖模式) {
              Row({ space: 应用尺寸.间距_8 }) {
                Button(this.图片遮盖_源图Uri === ''
                  ? $r('app.string.add_note_image_occlusion_pick_image')
                  : $r('app.string.add_note_image_occlusion_change_image'))
                  .height(应用尺寸.紧凑控件高度)
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor(this.动作主色)
                  .backgroundColor($r('app.color.surface_card'))
                  .borderRadius(应用尺寸.圆角_面板)
                  .enabled(!this.处理中)
                  .onClick((): void => { this.选取图片遮盖源图(); })
                if (this.图片遮盖_源图Uri !== '') {
                  Button($r('app.string.add_note_image_occlusion_edit_masks'))
                    .height(应用尺寸.紧凑控件高度)
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor(this.动作主色)
                    .backgroundColor($r('app.color.surface_card'))
                    .borderRadius(应用尺寸.圆角_面板)
                    .enabled(!this.处理中)
                    .onClick((): void => { this.图片遮盖_显示编辑器 = true; })
                }
              }
              .width('100%')

              // ② 图片预览 + 编辑遮罩入口
              if (this.图片遮盖_源图Uri !== '') {
                Image(this.图片遮盖_源图Uri)
                  .width('100%')
                  .height(应用尺寸.卡片高度)
                  .objectFit(ImageFit.Contain)
                  .borderRadius(应用尺寸.圆角_面板)
                  .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
              }

              // ③ Header / Back Extra 输入（用 字段名列表 中查到的字段名做 placeholder 变量）
              if (this.图片遮盖_标题字段索引() >= 0) {
                Column({ space: 应用尺寸.间距_5 }) {
                  Text(this.字段名列表[this.图片遮盖_标题字段索引()])
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_secondary'))
                    .width('100%')
                  TextArea({
                    placeholder: this.字段名列表[this.图片遮盖_标题字段索引()],
                    text: this.图片遮盖_标题
                  })
                    .width('100%')
                    .height(56)
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary'))
                    .placeholderColor($r('app.color.text_tertiary'))
                    .backgroundColor($r('app.color.surface_card'))
                    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                    .borderRadius(应用尺寸.圆角_面板)
                    .padding(应用尺寸.间距_10)
                    .enabled(!this.处理中)
                    .onChange((值: string): void => {
                      this.图片遮盖_标题 = 值;
                    })
                }
                .width('100%')
              }
              if (this.图片遮盖_额外字段索引() >= 0) {
                Column({ space: 应用尺寸.间距_5 }) {
                  Text(this.字段名列表[this.图片遮盖_额外字段索引()])
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_secondary'))
                    .width('100%')
                  TextArea({
                    placeholder: this.字段名列表[this.图片遮盖_额外字段索引()],
                    text: this.图片遮盖_额外
                  })
                    .width('100%')
                    .height(56)
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary'))
                    .placeholderColor($r('app.color.text_tertiary'))
                    .backgroundColor($r('app.color.surface_card'))
                    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                    .borderRadius(应用尺寸.圆角_面板)
                    .padding(应用尺寸.间距_10)
                    .enabled(!this.处理中)
                    .onChange((值: string): void => {
                      this.图片遮盖_额外 = 值;
                    })
                }
                .width('100%')
              }

              // ④ Tags 折叠在「高级设置」里，与其他笔记类型保持一致（BUG-004 修复）
              this.高级设置折叠区()
            } else {
              Text($r('app.string.add_note_images_hint'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_tertiary'))
                .width('100%')
              ForEach(this.字段名列表, (字段名: string, 索引: number) => {
                Column({ space: 应用尺寸.间距_8 }) {
                  Row({ space: 应用尺寸.间距_8 }) {
                    Text(字段名)
                      .fontSize(应用尺寸.字号_正文)
                      .fontWeight(FontWeight.Medium)
                      .fontColor($r('app.color.text_primary'))
                      .layoutWeight(1)
                    Button($r('app.string.add_note_image_add'))
                      .height(应用尺寸.紧凑控件高度)
                      .fontSize(应用尺寸.字号_正文_小)
                      .fontColor(this.动作主色)
                      .backgroundColor(Color.Transparent)
                      .borderRadius(应用尺寸.圆角_面板)
                      .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
                      .enabled(!this.处理中 && !this.pickingFieldImage)
                      .onClick((): void => { this.pickFieldImage(索引); })
                  }
                  .width('100%')
                  if (this.是填空笔记类型() && 索引 === this.填空字段索引()) {
                    TextArea({
                      placeholder: $r('app.string.add_note_cloze_placeholder'),
                      text: this.字段值列表[索引],
                      controller: this.填空字段控制器
                    })
                      .width('100%')
                      .height(56)
                      .fontSize(应用尺寸.字号_正文)
                      .fontColor($r('app.color.text_primary'))
                      .placeholderColor($r('app.color.text_tertiary'))
                      .backgroundColor($r('app.color.surface_card'))
                      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                      .borderRadius(应用尺寸.圆角_面板)
                      .padding(应用尺寸.间距_10)
                      .enabled(!this.处理中)
                      .onChange((值: string): void => {
                        this.更新字段(索引, 值);
                      })
                      .onTextSelectionChange((选区起: number, 选区止: number): void => {
                        this.填空选区起 = 选区起;
                        this.填空选区止 = 选区止;
                      })
                    // 2026-07-28：c1-c5 按钮行移到 Text 输入框下方、Back Extra 输入框上方
                    // （原位置在 Text(字段名) 上方，与文字输入框分离，用户不便操作）
                    this.填空按钮行()
                  } else {
                    TextArea({
                      placeholder: $r('app.string.add_note_field_placeholder'),
                      text: this.字段值列表[索引]
                    })
                      .width('100%')
                      .height(56)
                      .fontSize(应用尺寸.字号_正文)
                      .fontColor($r('app.color.text_primary'))
                      .placeholderColor($r('app.color.text_tertiary'))
                      .backgroundColor($r('app.color.surface_card'))
                      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                      .borderRadius(应用尺寸.圆角_面板)
                      .padding(应用尺寸.间距_10)
                      .enabled(!this.处理中)
                      .onChange((值: string): void => {
                        this.更新字段(索引, 值);
                      })
                  }
                  this.fieldImagePreviews(索引)
                }
                .width('100%')
                .padding(应用尺寸.间距_12)
                .backgroundColor($r('app.color.surface_card'))
                .borderRadius(应用尺寸.圆角_卡片)
              }, (字段名: string, 索引: number): string => `${索引}-${字段名}`)

              this.高级设置折叠区()
            }
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
        .align(Alignment.TopStart)
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.pageContentTopInset
        })

        // 错误固定显示，避免字段较多时被滚出屏幕。
        if (this.错误信息 !== '') {
          Text(this.错误信息)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
            .padding({
              left: 应用尺寸.页面内边距_水平,
              right: 应用尺寸.页面内边距_水平
            })
        }

        Column().height(应用尺寸.间距_8 + this.导航条高度).flexShrink(0)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.pageSurface)

      if (this.显示帮助) {
        字段帮助面板({
          标题: this.帮助标题,
          正文: this.帮助正文,
          onClose: (): void => {
            this.显示帮助 = false;
          }
        })
      }

      // T3 遮罩编辑器全屏弹层：覆盖在主内容之上，由 图片遮盖_显示编辑器 控制。
      // 用 Stack + if 实现（与 字段帮助面板 同机制）；编辑器内部自带 c1-c5 按钮 / 撤销 / 清空 / 确定 / 取消。
      if (this.图片遮盖_显示编辑器) {
        Column() {
          图片遮罩编辑器({
            源图Uri: this.图片遮盖_源图Uri,
            是否深色: this.是否深色(),
            onConfirm: (遮罩列表: 遮罩描述[]): void => {
              this.图片遮盖_遮罩列表 = 遮罩列表;
              this.图片遮盖_显示编辑器 = false;
            },
            onCancel: (): void => {
              this.图片遮盖_显示编辑器 = false;
            }
          })
        }
        .width('100%')
        .height('100%')
        .backgroundColor($r('app.color.surface_page'))
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
          bottom: 应用尺寸.toolbarVerticalInset + this.导航条高度
        })
      }
    }
    .width('100%')
    .height('100%')
    }
    .hideTitleBar(true)
    .backgroundColor(Color.Transparent)
    .opacity(this.转场透明度)
  }

  /** T3.7：保存按钮可用条件——ImageOcclusion 模式要求已选图 + 至少 1 个遮罩；其他模式与原逻辑一致。 */
  private 保存按钮可用(): boolean {
    if (this.处理中 || this.pickingFieldImage) {
      return false;
    }
    if (this.字段名列表.length === 0) {
      return false;
    }
    if (this.是否图片遮盖模式) {
      return this.图片遮盖_源图Uri !== '' && this.图片遮盖_遮罩列表.length > 0;
    }
    return true;
  }

  /** ImageOcclusion 模式 Header 字段在 字段名列表 中的索引；找不到返回 -1。 */
  // 注意：字段名也是本地化的（中文环境下为「标题」），用 是Header字段 识别。
  private 图片遮盖_标题字段索引(): number {
    for (let i: number = 0; i < this.字段名列表.length; i++) {
      if (this.是Header字段(this.字段名列表[i])) {
        return i;
      }
    }
    return -1;
  }

  /** ImageOcclusion 模式 Back Extra 字段在 字段名列表 中的索引；找不到返回 -1。 */
  // 注意：字段名也是本地化的（中文环境下为「背面额外」），用 是BackExtra字段 识别。
  private 图片遮盖_额外字段索引(): number {
    for (let i: number = 0; i < this.字段名列表.length; i++) {
      if (this.是BackExtra字段(this.字段名列表[i])) {
        return i;
      }
    }
    return -1;
  }
}
