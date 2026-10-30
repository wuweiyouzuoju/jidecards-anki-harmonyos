// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @名称 统计分箱
//
// @意图
// 复刻 Anki 26.05 统计图表依赖的 d3-scale 核心数值算法：
// ticks（美观刻度 1/2/5×10^k）、nice（域端点取整）、按刻度分箱、
// 加权分位数与计数分布分位数。供预测/复习/间隔/难度/新增等直方图使用。
//
// @Invariants
// - 纯函数无副作用，不 import 任何 HarmonyOS Kit（node test runner 可直接加载）
// - 入参为空/退化（空 Map、零宽域）时返回空数组或 0，不抛错
//
// @ExtensionPoints
// - 新图表分箱策略：加导出函数并在对应组件调用
//
// @来源
// d3-scale ticks/nice、d3-array quantile/bin；
// Anki ts/routes/graphs/{future-due,added,reviews,intervals,difficulty,retrievability}.ts
// ========================================================

/** 一段数据的边界与聚合量 */
export interface 分箱 {
  下界: number;
  上界: number;
  总量: number;
}

/** d3 tickIncrement 的步长选择阈值（√2 / √10 / √50） */
function 取步长系数(相对误差: number): number {
  const 阈值_10: number = Math.sqrt(50);
  const 阈值_5: number = Math.sqrt(10);
  const 阈值_2: number = Math.sqrt(2);
  if (相对误差 >= 阈值_10) {
    return 10;
  }
  if (相对误差 >= 阈值_5) {
    return 5;
  }
  if (相对误差 >= 阈值_2) {
    return 2;
  }
  return 1;
}

/**
 * d3 ticks：在 [起始, 结束] 内生成不超过 期望数 个的"美观"刻度。
 * 步长取 1/2/5 × 10^k（阈值 √2/√10/√50，与 d3-array 一致），起点对齐到步长的整数倍。
 */
export function 取刻度(起始: number, 结束: number, 期望数: number): number[] {
  const 数量: number = Math.max(1, Math.floor(期望数));
  if (结束 <= 起始) {
    return [起始];
  }
  const 跨度: number = 结束 - 起始;
  const 原始步长: number = 跨度 / 数量;
  const 幂: number = Math.floor(Math.log10(原始步长));
  const 底数: number = Math.pow(10, 幂);
  const 步长: number = 取步长系数(原始步长 / 底数) * 底数;
  const 刻度: number[] = [];
  const 起点: number = Math.ceil(起始 / 步长) * 步长;
  // 浮点累积误差防护：用整数步进
  for (let i = 0; ; i++) {
    const 值: number = 起点 + i * 步长;
    if (值 > 结束 + 步长 * 1e-9) {
      break;
    }
    刻度.push(Math.abs(值) < 步长 * 1e-9 ? 0 : 值);
    if (刻度.length > 数量 + 5) {
      break; // 防御：异常输入不无限循环
    }
  }
  return 刻度;
}

/** d3 nice：把域端点向外扩展到步长（1/2/5×10^k）的整数倍（返回 [新下界, 新上界]）。
 *  与 d3-scale nice 一致：步长按 期望数 个刻度估算（默认 10）。 */
export function 取美观域(下界: number, 上界: number, 期望数: number = 10): number[] {
  if (上界 <= 下界) {
    return [下界, 上界];
  }
  const 数量: number = Math.max(1, Math.floor(期望数));
  const 原始步长: number = (上界 - 下界) / 数量;
  const 幂: number = Math.floor(Math.log10(原始步长));
  const 底数: number = Math.pow(10, 幂);
  const 步长: number = 取步长系数(原始步长 / 底数) * 底数;
  const 新下界: number = Math.floor(下界 / 步长) * 步长;
  const 新上界: number = Math.ceil(上界 / 步长) * 步长;
  return [新下界, 新上界];
}

/**
 * 按刻度边界把 Map<键, 量> 分箱：[刻度0, 刻度1), [刻度1, 刻度2), …
 * 小于首刻度的键落入首箱（下界用 起始 补齐），大于末刻度的键丢弃。
 * 与 d3 bin().thresholds(刻度) 语义一致（首箱额外覆盖域下界）。
 */
export function 按刻度分箱(数据: Map<number, number>, 刻度: number[], 起始: number): 分箱[] {
  const 箱: 分箱[] = [];
  if (刻度.length === 0) {
    return 箱;
  }
  const 边界: number[] = [起始, ...刻度];
  for (let i = 0; i < 边界.length - 1; i++) {
    箱.push({ 下界: 边界[i], 上界: 边界[i + 1], 总量: 0 });
  }
  数据.forEach((量: number, 键: number) => {
    for (let i = 0; i < 箱.length; i++) {
      if (键 >= 箱[i].下界 && (键 < 箱[i].上界 || (i === 箱.length - 1 && 键 <= 箱[i].上界))) {
        箱[i].总量 += 量;
        return;
      }
    }
  });
  return 箱;
}

/** 轴域：上限与刻度绑定生成（一次计算内产出，保证对位）。 */
export interface 轴域 {
  上限: number;
  /** 等差刻度 [0, 步长, 2×步长, …, 上限]，端点必为 0 与 上限 */
  刻度: number[];
}

/** 纵轴轴域：步长与 d3 ticks 同算法（1/2/5×10^k），上限取整到步长倍数，
 *  刻度与上限在同一次计算内绑定产出。
 *  不能先 取美观域 再 取刻度 分开算：两者各自估步长，特定峰值下会跳档不一致
 *  （反例：峰值 126 → 上限 130，但 取刻度(0,130) 步长 50，130 不整除 →
 *  刻度列表缺顶值 → SpaceBetween 均布错位）。
 *  柱高归一化必须除以返回的 上限，刻度才与柱高精确对位。 */
export function 取轴域(峰值: number, 期望刻度数: number = 4): 轴域 {
  if (峰值 <= 0) {
    return { 上限: 1, 刻度: [0, 1] };
  }
  const 数量: number = Math.max(1, Math.floor(期望刻度数));
  const 原始步长: number = 峰值 / 数量;
  const 幂: number = Math.floor(Math.log10(原始步长));
  const 底数: number = Math.pow(10, 幂);
  const 步长: number = 取步长系数(原始步长 / 底数) * 底数;
  const 段数: number = Math.max(1, Math.ceil(峰值 / 步长));
  const 上限: number = 段数 * 步长;
  const 刻度: number[] = [];
  for (let i = 0; i <= 段数; i++) {
    const 值: number = i * 步长;
    刻度.push(Math.abs(值) < 步长 * 1e-9 ? 0 : 值);
  }
  return { 上限, 刻度 };
}

/** 按卡数加权的分位数（Anki difficulty/retrievability 的 easeQuantile）。
 *  累计遍历升序键，首次达到 总量×分位 时返回该键。 */
export function 加权分位(数据: Map<number, number>, 分位: number): number {
  if (数据.size === 0) {
    return 0;
  }
  let 总量: number = 0;
  数据.forEach((量: number) => {
    总量 += 量;
  });
  if (总量 === 0) {
    return 0;
  }
  const 目标: number = 总量 * 分位;
  const 键列表: number[] = [];
  数据.forEach((量: number, 键: number) => {
    if (量 > 0) {
      键列表.push(键);
    }
  });
  键列表.sort((a: number, b: number) => a - b);
  let 累计: number = 0;
  for (let i = 0; i < 键列表.length; i++) {
    累计 += 数据.get(键列表[i]) as number;
    if (累计 >= 目标) {
      return 键列表[i];
    }
  }
  return 键列表[键列表.length - 1];
}

/** 在计数桶上求 (n-1)×分位的线性插值；与展开后 d3 quantile 等价，内存只随桶数增长。 */
export function 取分布分位(数据: Map<number, number>, 分位: number): number {
  const 键列表: number[] = [];
  let 总量: number = 0;
  数据.forEach((次数: number, 键: number): void => {
    if (Number.isFinite(键) && Number.isSafeInteger(次数) && 次数 > 0) {
      键列表.push(键);
      总量 += 次数;
    }
  });
  if (总量 === 0 || !Number.isFinite(分位)) return 0;
  键列表.sort((a: number, b: number): number => a - b);
  const 位置: number = (总量 - 1) * Math.min(1, Math.max(0, 分位));
  const 下标: number = Math.floor(位置);
  let 累计: number = 0;
  let 下值: number = 0;
  let 已取下值: boolean = false;
  for (let i: number = 0; i < 键列表.length; i++) {
    累计 += 数据.get(键列表[i]) as number;
    if (!已取下值 && 累计 > 下标) {
      下值 = 键列表[i];
      已取下值 = true;
    }
    if (累计 > Math.ceil(位置)) {
      return 下值 + (键列表[i] - 下值) * (位置 - 下标);
    }
  }
  return 键列表[键列表.length - 1];
}

/** Map 键的最小值（空 Map 返回 兜底值） */
export function 取最小键(数据: Map<number, number>, 兜底值: number): number {
  if (数据.size === 0) {
    return 兜底值;
  }
  let 最小: number = Number.MAX_SAFE_INTEGER;
  数据.forEach((量: number, 键: number) => {
    if (量 > 0 && 键 < 最小) {
      最小 = 键;
    }
  });
  return 最小 === Number.MAX_SAFE_INTEGER ? 兜底值 : 最小;
}

/** Map 键的最大值（空 Map 返回 兜底值） */
export function 取最大键(数据: Map<number, number>, 兜底值: number): number {
  if (数据.size === 0) {
    return 兜底值;
  }
  let 最大: number = Number.MIN_SAFE_INTEGER;
  数据.forEach((量: number, 键: number) => {
    if (量 > 0 && 键 > 最大) {
      最大 = 键;
    }
  });
  return 最大 === Number.MIN_SAFE_INTEGER ? 兜底值 : 最大;
}
