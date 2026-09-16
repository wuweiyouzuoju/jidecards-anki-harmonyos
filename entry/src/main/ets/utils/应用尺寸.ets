// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UTIL-APP-DIMENS-001
// @名称 应用尺寸常量集
//
// @作用
// 集中托管首页视觉尺寸 token：字号、圆角、卡片尺寸、页面骨架、
// 宽屏限宽、日历、卡组列表、进度条、堆叠间距等。
// 与颜色、字符串资源同级管理；页面与组件不再出现魔法数字。
//
// @输入
// 无（纯常量定义）。
//
// @输出
// 应用尺寸 类，提供 60+ static readonly 数值字段。
//
// @业务规则
// 调整设计或适配新形态时只改这里；调用方通过 应用尺寸.字段名 引用。
// 所有数值均为 vp 单位（HarmonyOS 默认）。
//
// @副作用
// 无。
//
// @注意
// 字段名按语义中文命名；卡片高度等带业务约束的字段见行尾注释。
// 修改数值前请先阅读对应行尾注释，避免破坏视觉一致性。
// ========================================================

export class 应用尺寸 {
  // ---- 字号 ----
  static readonly 字号_说明_小: number = 10; // 星期表头
  static readonly 字号_说明: number = 11; // 日历格数字、辅助提示
  static readonly 字号_正文_小: number = 12; // 指标标签、卡组分项计数、月份副标题
  static readonly 字号_正文_中: number = 13; // 次级说明文字
  static readonly 字号_正文: number = 14; // 描述、详情指标标签、空态提示
  static readonly 字号_按钮: number = 15; // 顶部工具栏按钮
  static readonly 字号_强调: number = 16; // 待学数量
  static readonly 字号_标题: number = 17; // 卡组名、空态标题、开始学习
  static readonly 字号_卡片标题: number = 18; // 卡片内标题、详情指标数值
  static readonly 字号_摘要标题: number = 19; // 今日进度标题
  static readonly 字号_分区标题: number = 20; // 分区标题
  static readonly 字号_指标: number = 21; // 今日指标数值
  static readonly 字号_牌组标题: number = 25; // 详情页卡组名
  static readonly 字号_面板标题: number = 22; // 弹层面板标题
  static readonly 字号_彩蛋文案: number = 32; // 彩蛋弹窗主文案（居中粗体大字）
  static readonly 字号_主视觉: number = 42; // 记忆状态百分比

  // ---- 圆角 ----
  static readonly 圆角_色条: number = 3; // 卡组色条
  static readonly 圆角_进度条: number = 4; // 进度条
  static readonly 圆角_单元格: number = 6; // 日历格
  static readonly 圆角_牌组行: number = 15; // 卡组行
  static readonly 圆角_指标卡: number = 16; // 详情指标卡
  static readonly 圆角_卡片: number = 18; // 摘要卡
  static readonly 圆角_面板: number = 12; // 弹层面板
  static readonly 面板内边距: number = 20; // 居中浮卡内边距（纵向呼吸感）
  static readonly 父牌组候选项缩进: number = 16; // 父牌组候选行每层缩进（整张选择卡向右偏移）
  static readonly 圆角_胶囊: number = 22; // 工具栏按钮
  static readonly 圆角_行动按钮: number = 26; // 开始学习按钮

  // ---- 卡片 ----
  // 卡片高度 用于今日摘要卡（内容较紧凑 ~150px）。
  // 月份日历卡 不再用此常量，改用 卡片高度() 按 周数 动态算（220-261px）。
  static readonly 卡片高度: number = 204;
  static readonly 卡片内边距: number = 16;
  static readonly 卡片边框: number = 1;
  // 滑动器高度 必须容下最高的 月份日历卡（6 行 + hasActivity=false 时 ≈261），
  // 故从 220 提到 272；今日摘要卡 高度 204 仍顶对齐渲染，
  // 下方空隙由 Swiper 容器吸收（背景同 surface_page，视觉无突兀）。
  static readonly 滑动器高度: number = 272;

  // ---- 页面骨架 ----
  static readonly 页面内边距_水平: number = 12;
  static readonly 工具栏高度: number = 60;
  /** 顶部工具栏与首张内容卡片之间的共用留白。 */
  static readonly pageContentTopInset: number = 8;
  static readonly toolbarVerticalInset: number = 8;
  static readonly pageSectionGap: number = 12;
  static readonly pageBottomInset: number = 12;
  static readonly 紧凑控件高度: number = 36;
  static readonly 按钮高度: number = 44;
  static readonly 行动按钮高度: number = 52;
  // 下拉菜单与长按菜单共用紧凑尺寸，长文案入口使用较宽档。
  static readonly compactMenuWidth: number = 112;
  static readonly extendedMenuWidth: number = 160;
  static readonly contextMenuWidth: number = 144;
  static readonly menuItemHeight: number = 44;
  static readonly menuHorizontalPadding: number = 12;

  // ---- 宽屏限宽 ----
  static readonly 内容最大宽度: number = 1200; // 首页超宽屏内容限宽，超出居中留白
  static readonly 复习页内容最大宽度: number = 840; // 复习页内容限宽，保持卡片可读宽度

  // ---- 日历 ----
  static readonly 日历_单元格高度: number = 21;
  static readonly 日历_网格高度: number = 138;
  static readonly 日历_列间距: number = 5;
  static readonly 日历_行间距: number = 4;

  // ---- 卡组列表 ----
  static readonly 色条宽度: number = 6;
  static readonly 色条高度: number = 50;
  static readonly 箭头槽位宽度: number = 36; // 父牌组展开箭头槽位宽（视觉+热区，无子牌组的行也占位对齐）
  static readonly 箭头槽位高度: number = 48; // 父牌组展开箭头热区高
  static readonly 空态垂直内边距: number = 28;
  static readonly 加载指示器尺寸: number = 36; // 列表加载指示器
  // 牌组行实机高度：padding(13+13) + 计数 Column(字号_强调+间距_5+字号_正文_小+间距_5+Row 字号_正文_小 ≈ 66)
  // 用于 牌组定制面板 预览框，保证用户裁剪选区与实际渲染一致
  static readonly 牌组行高度: number = 92;

  // ---- 进度条 ----
  static readonly 进度条高度: number = 7;

  // ---- 堆叠间距 ----
  static readonly 间距_2: number = 2;
  static readonly 间距_3: number = 3;
  static readonly 间距_4: number = 4;
  static readonly 间距_5: number = 5;
  static readonly 间距_6: number = 6;
  static readonly 间距_7: number = 7;
  static readonly 间距_8: number = 8;
  static readonly 间距_10: number = 10;
  static readonly 间距_12: number = 12;
  static readonly 间距_13: number = 13;
  static readonly 间距_14: number = 14;
  static readonly 间距_15: number = 15;
  static readonly 间距_16: number = 16;
  static readonly 间距_17: number = 17;
}
