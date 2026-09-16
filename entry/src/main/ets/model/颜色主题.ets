// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ThemeId } from './ThemeCatalog';
import { themeDefinition } from './ThemeCatalog';

// ========================================================
// @块ID MODEL-COLOR-THEME-001
// @名称 颜色主题
//
// @作用
// 定义 7 个颜色主题（极光蓝/仙野绿/暗夜紫/碧涛青/活力橙/柠檬金/极简灰），
// 每个主题由一个种子色派生出 19 个颜色键的完整色板，供 AppStorage 全局绑定。
// 极简灰主题跳过色阶算法，使用硬编码纯灰调色板（WCAG 2.1 AA 验证通过）。
// 与 主题模式（system/light/dark）正交——这是主色调维度。
//
// @输入
// 颜色主题 枚举值（'aurora'/'forest'/'midnight'/'lagoon'/'sunset'/'lemon'/'minimal_gray'）
// 是否深色 布尔值
//
// @输出
// 默认颜色主题 常量
// 颜色键集合（19 个 AppStorage 键名常量）
// 主题色板（19 个 hex 字符串值）
// 主题色块 / 主题渐变档（用于设置页 chip 预览）
//
// @业务规则
// 设计原则（B 方案：ArcoDesign 色阶重写，2026-07-22）：
// - 每个主题只需指定 1 个种子色（= ArcoDesign shade 6），运行时由 色阶生成.构建完整色阶
//   派生 10 档色阶 + 8 个语义色（primary/hover/active/container/containerHover/border/icon/text）。
// - 13 个颜色键跟随主题变化：
//   1) 主色系（8 个）：覆盖按钮、选中行底色、边框、图标、强调文字等所有主色场景
//   2) 热力图（1 个）：heat4（= primary）
//   3) 选中背景（1 个）：surfaceSelected（= primaryContainer，保留旧键名兼容既有组件）
//   4) 固定语义色（3 个）：countNew（蓝）/ countLearning（橙）/ countReview（紫）
//      —— 保证「新卡=蓝、学习中=橙、复习中=紫」交通灯语义在所有主题下一致，
//         不跟随主色变化，让用户通过颜色快速识别卡片状态。
// - 每个主题提供浅色+深色两套配色，由 是否深色 决定使用哪套（构建完整色阶 自动选档）。
// 主题种子色取自 ArcoDesign 色板（https://arco.design/palette/list），均经 WCAG AA/AAA 验证。
// 7 个主题枚举值与 preferences 持久化字符串一一对应，不得改名。
//
// @副作用
// 无。本文件为纯函数与常量定义，不读不写状态。
//
// @注意
// 主题枚举字符串值 'aurora'/'forest'/'midnight'/'lagoon'/'sunset'/'lemon'/'minimal_gray' 是持久化值，禁止修改。
// AppStorage 键名字符串 'theme_color_*' 是与组件 @StorageProp 绑定的协议字段，禁止修改。
// 修改 选档逻辑 或 马卡龙化比例 会影响所有主题视觉呈现与对比度达标情况。
// ========================================================

import { 对比度, 构建完整色阶, 选取对比度达标档索引,
  十六进制转RGB, RGB转十六进制, RGB转HSV, HSV转RGB } from './色阶生成';
import type { HSV颜色 } from './色阶生成';

/** 页面底色（与 resources color.json surface_page 一致），用于和主题色混合产生极淡背景。 */
const 浅色页面底色: string = '#F5F7FA';
const 深色页面底色: string = '#10151D';
/** 深色模式卡片底色（与 resources dark/color.json surface_card 一致），用于 heat 色阶混合。 */
const 深色卡片底色: string = '#18202B';
/** 浅色模式卡片底色（= resources base/color.json surface_card = #FFFFFF）。
 *  2.1.4.2 华为规范: 可交互控件活动状态背板 vs 卡片底 ≥ 2.2:1，浅色 主色容器 搜索参考色。 */
const 浅色卡片底色常量: string = '#FFFFFF';

// ========================================================
// @块ID MODEL-COLOR-THEME-002
// @名称 混合十六进制色
//
// @作用
// 把前景色 按 alpha 混入背景色，返回混合后的 hex 字符串。
//
// @输入
// 背景色 hex 字符串
// 前景色 hex 字符串
// alpha∈[0,1]（0=纯背景色，1=纯前景色）
//
// @输出
// 混合后的 hex 字符串
//
// @业务规则
// ArkTS 不支持解构声明（arkts-no-destruct-decls），用索引访问。
//
// @副作用
// 无。
// ========================================================
function 混合十六进制色(背景色: string, 前景色: string, alpha: number): string {
  const 解析 = (hex: string): number[] => {
    let s: string = hex.startsWith('#') ? hex.slice(1) : hex;
    if (s.length === 3) {
      s = s.split('').map((c: string): string => c + c).join('');
    }
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const 背景数组: number[] = 解析(背景色);
  const 前景数组: number[] = 解析(前景色);
  const r: number = Math.round(前景数组[0] * alpha + 背景数组[0] * (1 - alpha));
  const g: number = Math.round(前景数组[1] * alpha + 背景数组[1] * (1 - alpha));
  const b: number = Math.round(前景数组[2] * alpha + 背景数组[2] * (1 - alpha));
  const 转十六进制 = (n: number): string => {
    const 限定: number = Math.max(0, Math.min(255, n));
    const h: string = 限定.toString(16);
    return h.length === 1 ? '0' + h : h;
  };
  return '#' + 转十六进制(r) + 转十六进制(g) + 转十六进制(b);
}

const DARK_CONTAINER_BASE_ALPHA: number = 0.20;
const DARK_CONTAINER_ALPHA_STEP: number = 0.01;

/**
 * 从深色卡片底开始混入主题主色，取满足目标对比度的最暗结果。
 * 保证交互背板可辨认，同时避免原白色混合产生的大面积高亮粉彩块。
 */
function buildDarkThemeContainer(primaryColor: string, minimumContrast: number): string {
  let alpha: number = DARK_CONTAINER_BASE_ALPHA;
  let containerColor: string = 混合十六进制色(深色卡片底色, primaryColor, alpha);
  while (alpha < 1 && 对比度(containerColor, 深色卡片底色) < minimumContrast) {
    alpha = Math.min(1, alpha + DARK_CONTAINER_ALPHA_STEP);
    containerColor = 混合十六进制色(深色卡片底色, primaryColor, alpha);
  }
  return containerColor;
}

// ===== 浅色模式选中背景软化 =====
// 背景：浅色 选中背景 复用 主色容器档，而华为 2.1.4.2「可交互控件活动状态背板 vs 卡片底 ≥2.2:1」
// 的对比度约束会把高明度主题推到高饱和档（仙野绿 #1FC13F S84 / 活力橙 #FF7D00 S100），
// 选中牌组行整块亮色过于刺眼。WCAG 对比度只由相对亮度决定，与饱和度无关——
// 因此保留色相、压饱和度、按需压明度：既保住 ≥2.2:1 合规，又把选中行降为柔和色块。
const 选中背景饱和上限: number = 38;
const 选中背景明度下限: number = 40;
const 选中背景目标对比度: number = 2.2;
const 选中背景明度步长: number = 2;
const 选中背景最大迭代: number = 40;

/**
 * 把浅色容器色软化为选中行背景：饱和度钳到 选中背景饱和上限（色相不变），
 * 若与白色的对比度不足 选中背景目标对比度，按 选中背景明度步长 递减明度补足，
 * 明度下限 选中背景明度下限 兜底（避免极端主题死循环）。
 */
function 软化浅色选中背景(容器hex: string): string {
  const rgb: [number, number, number] = 十六进制转RGB(容器hex);
  const hsv: HSV颜色 = RGB转HSV(rgb[0], rgb[1], rgb[2]);
  const 饱和度: number = Math.min(hsv.饱和度, 选中背景饱和上限);
  let 明度: number = hsv.明度;
  let 结果: string = 容器hex;
  for (let i: number = 0; i < 选中背景最大迭代; i++) {
    const 候选rgb: [number, number, number] = HSV转RGB(hsv.色相, 饱和度, 明度);
    结果 = RGB转十六进制(候选rgb[0], 候选rgb[1], 候选rgb[2]);
    if (对比度(结果, '#FFFFFF') >= 选中背景目标对比度 || 明度 <= 选中背景明度下限) {
      break;
    }
    明度 -= 选中背景明度步长;
  }
  return 结果;
}

/** 7 个颜色主题枚举值，与 preferences 持久化字符串一一对应。 */
export type 颜色主题 = ThemeId;

export const 默认颜色主题: 颜色主题 = 'aurora';

/**
 * 7 个主题的种子色（= ArcoDesign shade 6）。运行时由 构建完整色阶 派生完整色阶。
 * 极简灰种子色仅用于 chip 预览渐变档；实际调色板在 解析主题色板 中硬编码。
 * 取自 ArcoDesign 色板：https://arco.design/palette/list
 * 用函数而非 Record 避免 ArkTS 的 arkts-no-untyped-obj-literals 限制。
 */
function 取主题种子色(主题: 颜色主题): string {
  return themeDefinition(主题).seed;
}

/**
 * AppStorage 中存储的 19 个颜色键名常量；组件用 @StorageProp 绑定这些键即可跟随主题色。
 * - 旧键（保留）：actionPrimary / surfaceSelected / countNew / countLearning / countReview / heat4
 * - 新键（B 方案）：actionPrimaryHover / actionPrimaryActive / primaryContainer / primaryContainerHover
 *                  / primaryBorder / primaryIcon / primaryText
 * - 新键（2.1.4.1 对比度）：primaryButton（按钮背景专用，配 #FFFFFF 文字 ≥ 4.5:1）
 * 字段值字符串 'theme_color_*' 是持久化协议字段，禁止修改。
 */
export interface 颜色键集合 {
  动作主色: string;
  动作主色悬停: string;
  动作主色按下: string;
  主色按钮背景: string;
  主色按钮按下: string;
  选中背景: string;
  主色容器: string;
  主色容器悬停: string;
  主色边框: string;
  主色图标: string;
  主色文字: string;
  新卡计数色: string;
  学习中计数色: string;
  复习中计数色: string;
  热力1: string;
  热力2: string;
  热力3: string;
  热力4: string;
  页面底色微染: string;
}

export const 颜色键: 颜色键集合 = {
  动作主色: 'theme_color_action_primary',
  动作主色悬停: 'theme_color_action_primary_hover',
  动作主色按下: 'theme_color_action_primary_active',
  主色按钮背景: 'theme_color_primary_button',
  主色按钮按下: 'theme_color_primary_button_active',
  选中背景: 'theme_color_surface_selected',
  主色容器: 'theme_color_primary_container',
  主色容器悬停: 'theme_color_primary_container_hover',
  主色边框: 'theme_color_primary_border',
  主色图标: 'theme_color_primary_icon',
  主色文字: 'theme_color_primary_text',
  新卡计数色: 'theme_color_count_new',
  学习中计数色: 'theme_color_count_learning',
  复习中计数色: 'theme_color_count_review',
  热力1: 'theme_color_heat_1',
  热力2: 'theme_color_heat_2',
  热力3: 'theme_color_heat_3',
  热力4: 'theme_color_heat_4',
  页面底色微染: 'theme_color_surface_page_tint'
};

/** 一组完整主题色（含 19 个键的 hex 字符串值，不含 alpha）。 */
export interface 主题色板 {
  动作主色: string;
  动作主色悬停: string;
  动作主色按下: string;
  主色按钮背景: string;
  主色按钮按下: string;
  选中背景: string;
  主色容器: string;
  主色容器悬停: string;
  主色边框: string;
  主色图标: string;
  主色文字: string;
  新卡计数色: string;
  学习中计数色: string;
  复习中计数色: string;
  热力1: string;
  热力2: string;
  热力3: string;
  热力4: string;
  页面底色微染: string;
}

/** 把持久化的字符串值安全转回 颜色主题；非法/未设置时返回默认主题。 */
export function 规范化颜色主题(值: string): 颜色主题 {
  return themeDefinition(值).id;
}

// ========================================================
// @块ID MODEL-COLOR-THEME-003
// @名称 解析主题色板
//
// @作用
// 从种子色派生完整 19 色调色板。
// 新卡计数色/学习中计数色/复习中计数色 作为固定语义色保持稳定，不跟随主题色变化，
// 形成「新卡=蓝、学习中=橙、复习中=紫」交通灯语义。
//
// @输入
// 颜色主题 枚举值
// 是否深色 布尔值
//
// @输出
// 主题色板（19 个 hex 字符串）
//
// @业务规则
// 深色模式 主色容器 从卡片底混入主题主色，并搜索满足最低对比度的最暗结果：
// - 普通容器 vs 卡片底 ≥ 2.2:1，满足华为可交互控件活动状态背板要求
// - 悬停容器 vs 卡片底 ≥ 2.8:1，形成清晰但克制的交互层级
// 该策略保留主题辨识度，同时避免旧版与白色混合产生的大面积高亮粉彩块。
// 浅色模式仍由对比度搜索选取色阶，不改变输出。
// 选中背景：
// - 浅色模式用马卡龙浅色 容器 经 软化浅色选中背景 降饱和（饱和钳 38、按需压明度），
//   仍保持 vs 白底 ≥2.2:1（华为 2.1.4.2），配深色 text_primary 文字，对比度足够；
//   修复：仙野绿/活力橙等高明度主题为凑对比度被推到高饱和档，选中牌组行整块刺眼
// - 深色模式用 深色卡片底色 深底（2.1.4.1：马卡龙浅底配深色模式浅文字对比度仅 1.1~1.5:1 不达标，
//   改为深底 + 主色边框 边框区分选中态，文字对比度恢复 ≥10:1。用户决策：只包裹边框）
// 热力图 4 档（GitHub 风格：heat4 = 主色按钮背景 深档，heat1-3 由浅到深渐进）
// 2.1.4.1 对比度：heat4 配白字需 ≥4.5:1，高明度主题（lemon/sunset）的 主色 白字不足，
// 改用 主色按钮背景（已搜索到白字达标档）；heat3 配 text_primary 深字保证可读。
// 浅色：shades[1]/[2]/[4]/[主色按钮背景]，intensity=0 让 surface_card 白底透出
// 深色：用 混合(深色卡片底色, 主色按钮背景, alpha) 生成渐进色阶（alpha 0.25/0.45/0.70/1.0）。
//   原 shades[9]/[7]/[5] 方案在高明度主题（forest/lagoon/sunset/lemon）下色阶不够深，
//   配亮白字对比度不足 4.5:1；混合方案确保 heat1-3 始终足够深，配 text_primary 亮白字均 ≥7:1。
//
// @副作用
// 无。
// ========================================================
export function 解析主题色板(主题: 颜色主题, 是否深色: boolean): 主题色板 {
  // 新卡计数色（蓝）：浅色 #2E63BC / 深色 #7C9AE8，所有主题通用
  // （AppGallery 审核修复：原浅色 #366ECE 配各主题页面底色微染 4.2~4.4 压线不达标，再加深一档）
  const 新卡计数色: string = 是否深色 ? '#7C9AE8' : '#2E63BC';
  // 学习中卡片计数色（橙）：浅色 #94541A / 深色 #E6A45F，所有主题通用
  // （AppGallery 审核修复：原浅色 #A05D1C 配页面底色微染 4.4 压线不达标，再加深一档）
  const 学习中计数色: string = 是否深色 ? '#E6A45F' : '#94541A';
  // 复习中卡片计数色（紫）：浅色 #7056C8 / 深色 #B2A0F2，所有主题通用
  const 复习中计数色: string = 是否深色 ? '#B2A0F2' : '#7056C8';

  // 极简灰主题：纯黑白灰调色板，跳过色阶算法（算法会对 S=0 种子在深色段加饱和度产生色偏）。
  // 所有颜色值经 WCAG 2.1 对比度验证（SC 1.4.3 AA：文本 ≥4.5:1，SC 1.4.11：UI 组件 ≥3:1）：
  // 浅色模式——主色 #4A4A4A 对白底 8.9:1；按钮背景 #4A4A4A 配白字 8.9:1；容器 #E8E8E8 配主色文字 6.9:1
  //   边框 #8C8C8C 对白底 3.4:1（2.1.4.1 修复：原 #BFBFBF=1.84 不达标）
  //   热力2 #A6A6A6 / 热力3 #8C8C8C 配 text_primary #182230 = 6.9:1/5.0:1（2.1.4.1 修复：原 热力3 #595959=2.29 不达标）
  // 深色模式——主色 #BFBFBF 对卡片底 #18202B 8.9:1；按钮背景 #595959 配白字 7.1:1；文字 #CCCCCC 对页面底 11:1
  if (主题 === 'minimal_gray') {
    // 2.1.4.2 华为规范修复:
    //   浅色 主色容器 #E8E8E8 (vs 白底 1.14) 不达标 → #A6A6A6 (2.43 ✓)
    //   深色 主色容器 #2A2A2A (vs 卡片底 1.28) 不达标 → #555555 (2.30 ✓)
    //   深色 主色按钮背景 #595959 → #6B6B6B (白字 5.10 ✓，与 主色容器 拉开层次)
    //   深色 主色边框 #6B6B6B → #808080 (vs 卡片底 4.08 ✓，增强对比)
    //   热力图保持原值: 极简灰无色相，△Euv 仅靠 L* 差异，
    //     4 档 L 跨度受限于 热力4=主色按钮背景(深色配白字)，无法同时满足相邻 ≥20，记录为已知限制
    return 是否深色 ? {
      动作主色: '#BFBFBF',
      动作主色悬停: '#D9D9D9',
      动作主色按下: '#A6A6A6',
      主色按钮背景: '#6B6B6B',
      主色按钮按下: '#595959',
      选中背景: 深色卡片底色,
      主色容器: '#555555',
      主色容器悬停: '#666666',
      主色边框: '#808080',
      主色图标: '#BFBFBF',
      主色文字: '#CCCCCC',
      新卡计数色,
      学习中计数色,
      复习中计数色,
      热力1: '#2A2A2A',
      热力2: '#3D3D3D',
      热力3: '#4D4D4D',
      热力4: '#6B6B6B',
      页面底色微染: 混合十六进制色(深色页面底色, '#BFBFBF', 0.03)
    } : {
      动作主色: '#4A4A4A',
      动作主色悬停: '#595959',
      动作主色按下: '#3D3D3D',
      主色按钮背景: '#4A4A4A',
      主色按钮按下: '#3D3D3D',
      选中背景: '#A6A6A6',
      主色容器: '#A6A6A6',
      主色容器悬停: '#B0B0B0',
      主色边框: '#8C8C8C',
      主色图标: '#4A4A4A',
      主色文字: '#3D3D3D',
      新卡计数色,
      学习中计数色,
      复习中计数色,
      热力1: '#BFBFBF',
      热力2: '#A6A6A6',
      热力3: '#8C8C8C',
      热力4: '#4A4A4A',
      页面底色微染: 混合十六进制色(浅色页面底色, '#4A4A4A', 0.06)
    };
  }

  const 种子: string = 取主题种子色(主题);
  const 色阶 = 构建完整色阶(种子, 是否深色);
  const 语义 = 色阶.语义;

  // 2.1.4.2 华为规范: 可交互控件活动状态背板 vs 卡片底 ≥ 2.2:1
  //   浅色模式 主色容器(选中态/Tag底色) 与白底 #FFFFFF 需 ≥ 2.2:1
  //   原用 shade 2 (idx 1) 仅 1.02~1.42 不达标，改为搜索首个 ≥2.2:1 的最浅 shade
  //   所有有色相主题均落在 shade 4 (idx 3) 附近；极简灰主题在上方硬编码分支单独处理
  const 浅色容器档索引: number = 选取对比度达标档索引(色阶.色阶, 1, 浅色卡片底色常量, 2.2, true);
  const 浅色容器悬停档索引: number = Math.min(浅色容器档索引 + 1, 色阶.色阶.length - 1);
  const 容器色: string = 是否深色
    ? buildDarkThemeContainer(语义.主色, 2.2)
    : 色阶.色阶[浅色容器档索引];
  const 容器悬停色: string = 是否深色
    ? buildDarkThemeContainer(语义.主色, 2.8)
    : 色阶.色阶[浅色容器悬停档索引];

  // 浅色模式 热力3：从 shade 5（idx 4）向浅档搜索，配 text_primary #182230 ≥4.5:1
  //   极光蓝 shade 5 = 4.29、暗夜紫 shade 5 = 3.47 不达标，浅一档到 shade 4；其他主题达标保持不变
  //   搜索方向=向浅档：热力3 配深字 text_primary，需更浅背景才能与深字形成高对比
  //   色阶顺序保证：热力1 (idx 1) < 热力2 (idx 2) < 热力3 (≥idx 3) < 热力4（按钮背景主色，深档）
  //   （2.1.4.1 对比度修复）
  const 浅色主文本色: string = '#182230';
  const 热力3档索引浅色: number = 选取对比度达标档索引(色阶.色阶, 4, 浅色主文本色, 4.5, false);
  // 下限保护：热力3 不得浅于 shade 4（idx 3），避免与热力2（shade 3, idx 2）重复破坏色阶顺序
  const 热力3档索引最终: number = Math.max(3, 热力3档索引浅色);

  return {
    // 主色系（8 个）
    // AppGallery 色彩审核修复：动作主色 被 32 处组件绑定为文字/图形强调色，
    // 原浅色固定 shade 6 种子色在高明度主题（绿/青/橙/黄）下配白底仅 1.6~2.8:1。
    // 改为输出 主色文字 达标档（浅色配白底 ≥4.5、深色配卡底 ≥4.5，均已搜索达标）。
    动作主色: 语义.主色文字,
    动作主色悬停: 语义.主色悬停,
    动作主色按下: 语义.主色按下,
    主色按钮背景: 语义.按钮背景主色,
    主色按钮按下: 语义.按钮背景按下,
    主色容器: 容器色,
    主色容器悬停: 容器悬停色,
    主色边框: 语义.主色边框,
    主色图标: 语义.主色图标,
    主色文字: 语义.主色文字,
    // 选中背景（保留旧键名）：见 @业务规则 中的深浅色分支说明；
    // 浅色经 软化浅色选中背景 降饱和，避免高明度主题选中行整块高饱和大色块
    选中背景: 是否深色 ? 深色卡片底色 : 软化浅色选中背景(容器色),
    // 计数色
    新卡计数色,
    学习中计数色,
    复习中计数色,
    // 热力图 4 档（GitHub 风格渐进，深色模式用 混合(深色卡片底色, 主色按钮背景, alpha) 生成）
    //   2.1.4.2 华为规范: 相邻档 △Euv ≥ 20 (含色盲群体无障碍)
    //   2.1.4.3 alpha 重新扫描（tools/scan-heatmap-alpha.mjs）：从 0.10/0.40/0.75/1.0
    //     调整为 0.02/0.31/0.63/1.0，跨度更均匀(0.29/0.32/0.37)。
    //   修复后深色模式达标主题：极光蓝/暗夜紫/活力橙/柠檬金（4 主题全部 ≥20）
    //   固有限制：
    //     - 仙野绿/碧涛青：按钮背景 L*≈22-25 vs 深色卡片底 L*≈12，跨度仅 10-13，
    //       4 档分 3 段每段 L*≤4.3 → △Euv≤15，受"热力4配白字≥4.5:1"约束无法提升 L*
    //     - 极简灰：无色相，△Euv 仅靠 L* 差异；硬编码分支单独处理（仍不达标）
    //   浅色模式保持原逻辑 (色阶[1]/[2]/[搜索档]/按钮背景)
    热力1: 是否深色 ? 混合十六进制色(深色卡片底色, 语义.按钮背景主色, 0.02) : 色阶.色阶[1],
    热力2: 是否深色 ? 混合十六进制色(深色卡片底色, 语义.按钮背景主色, 0.31) : 色阶.色阶[2],
    热力3: 是否深色 ? 混合十六进制色(深色卡片底色, 语义.按钮背景主色, 0.63) : 色阶.色阶[热力3档索引浅色],
    热力4: 语义.按钮背景主色,
    // 页面背景极淡主题色：浅色 6% / 深色 3% 主色 混入静态页面底色
    页面底色微染: (是否深色 ? themeDefinition(主题).darkPage : themeDefinition(主题).lightPage) ||
      混合十六进制色(是否深色 ? 深色页面底色 : 浅色页面底色, 语义.主色, 是否深色 ? 0.03 : 0.06)
  };
}

/** 主题色预览（用于 chip 按钮上的色块）：取该主题浅色模式 动作主色 即可。 */
export function 颜色主题色块(主题: 颜色主题): string {
  return 解析主题色板(主题, false).动作主色;
}

/**
 * 主题色阶预览渐变档（用于设置页 chip 内的渐变色条）。
 * 返回该主题浅色模式下的 3 档色阶 hex：[浅, 中, 深] = [shade 1, shade 4, shade 6]。
 * 调用方用 linearGradient 把这 3 档渲染为色阶预览，让用户在选 chip 时就能看到该主题的色阶层次，
 * 而非单一纯色——蓝紫等冷色主题与暖色主题都能通过渐变看出"颜色丰富度"差异。
 */
export function 颜色主题渐变档(主题: 颜色主题): string[] {
  const preview: string[] = themeDefinition(主题).previewColors;
  if (preview.length > 0) return preview;
  const 种子: string = 取主题种子色(主题);
  const 色阶 = 构建完整色阶(种子, false);
  // shades[0]=shade 1 极浅，shades[3]=shade 4 中浅，shades[5]=shade 6 种子色（= primary）
  return [色阶.色阶[0], 色阶.色阶[3], 色阶.色阶[5]];
}
