// 修复方案验证脚本（方案 A + B + C）
// 基于 tools/verify-contrast.mjs 与 tools/verify-contrast-official.mjs 的算法。
// 用法：node tools/experimental/verify-fix-plan.mjs
// 仅用于验证修复方案是否能让所有场景通过华为官方规范，完成后可删除。

// ===== 核心算法（复用自 verify-contrast.mjs） =====
function 十六进制转RGB(hex) {
  let s = hex.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function RGB转十六进制(r, g, b) {
  const 转 = n => {
    const x = Math.max(0, Math.min(255, Math.round(n)));
    const h = x.toString(16);
    return h.length === 1 ? '0' + h : h;
  };
  return '#' + 转(r) + 转(g) + 转(b);
}
function sRGB通道转线性亮度(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function 相对亮度(hex) {
  const [r, g, b] = 十六进制转RGB(hex);
  return 0.2126 * sRGB通道转线性亮度(r) + 0.7152 * sRGB通道转线性亮度(g) + 0.0722 * sRGB通道转线性亮度(b);
}
function 对比度(a, b) {
  const 亮a = 相对亮度(a);
  const 亮b = 相对亮度(b);
  return (Math.max(亮a, 亮b) + 0.05) / (Math.min(亮a, 亮b) + 0.05);
}
function RGB转HSV(r, g, b) {
  const rf = r/255, gf = g/255, bf = b/255;
  const 最大 = Math.max(rf, gf, bf);
  const 最小 = Math.min(rf, gf, bf);
  const 差值 = 最大 - 最小;
  let h = 0;
  if (差值 > 0) {
    if (最大 === rf) h = ((gf - bf) / 差值) % 6;
    else if (最大 === gf) h = (bf - rf) / 差值 + 2;
    else h = (rf - gf) / 差值 + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = 最大 === 0 ? 0 : (差值 / 最大) * 100;
  const v = 最大 * 100;
  return { 色相: h, 饱和度: s, 明度: v };
}
function HSV转RGB(h, s, v) {
  const sf = s/100, vf = v/100;
  const c = vf * sf;
  const hp = h / 60;
  const x = c * (1 - Math.abs(hp % 2 - 1));
  const m = vf - c;
  let r=0, g=0, b=0;
  if (hp >= 0 && hp < 1) { r=c; g=x; b=0; }
  else if (hp < 2) { r=x; g=c; b=0; }
  else if (hp < 3) { r=0; g=c; b=x; }
  else if (hp < 4) { r=0; g=x; b=c; }
  else if (hp < 5) { r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  return [(r+m)*255, (g+m)*255, (b+m)*255];
}

const 色相步长 = 2;
const 浅色段饱和度步长 = 16;
const 深色段饱和度步长 = 5;
const 深色段末档饱和度步长 = 16;
const 浅色段明度步长 = 5;
const 深色段明度步长 = 15;
const 深色段末档明度步长 = 5;
const 浅色段档数 = 5;
const 深色段档数 = 4;

function 偏移色相(hsv, i, 浅色段) {
  const 是暖色 = hsv.色相 <= 60 || hsv.色相 >= 240;
  let h = 是暖色 ? (浅色段 ? hsv.色相 + 色相步长 * i : hsv.色相 - 色相步长 * i)
                : (浅色段 ? hsv.色相 - 色相步长 * i : hsv.色相 + 色相步长 * i);
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return h;
}
function 偏移饱和度(hsv, i, 浅色段) {
  let s;
  if (浅色段) s = hsv.饱和度 - 浅色段饱和度步长 * i;
  else if (i === 深色段档数) s = hsv.饱和度 + 深色段末档饱和度步长;
  else s = hsv.饱和度 + 深色段饱和度步长 * i;
  return Math.max(0, Math.min(100, s));
}
function 偏移明度(hsv, i, 浅色段) {
  let v;
  if (浅色段) v = hsv.明度 + 浅色段明度步长 * i;
  else if (i === 深色段档数) v = hsv.明度 - 深色段末档明度步长;
  else v = hsv.明度 - 深色段明度步长 * i;
  return Math.max(0, Math.min(100, v));
}
function 生成色阶(种子hex) {
  const [r, g, b] = 十六进制转RGB(种子hex);
  const 种子 = RGB转HSV(r, g, b);
  const 色阶 = [];
  for (let i = 浅色段档数; i >= 1; i--) {
    const h = 偏移色相(种子, i, true);
    const s = 偏移饱和度(种子, i, true);
    const v = 偏移明度(种子, i, true);
    const [rr, gg, bb] = HSV转RGB(h, s, v);
    色阶.push(RGB转十六进制(rr, gg, bb));
  }
  色阶.push(种子hex);
  for (let i = 1; i <= 深色段档数; i++) {
    const h = 偏移色相(种子, i, false);
    const s = 偏移饱和度(种子, i, false);
    const v = 偏移明度(种子, i, false);
    const [rr, gg, bb] = HSV转RGB(h, s, v);
    色阶.push(RGB转十六进制(rr, gg, bb));
  }
  return 色阶;
}
function 选取白字达标档索引(色阶, 起始索引) {
  for (let i = 起始索引; i < 色阶.length; i++) {
    if (对比度('#FFFFFF', 色阶[i]) >= 4.5) return i;
  }
  return 色阶.length - 1;
}
function 选取对比度达标档索引(色阶, 起始索引, 参考色, 阈值, 向深档) {
  if (向深档) {
    for (let i = 起始索引; i < 色阶.length; i++) {
      if (对比度(参考色, 色阶[i]) >= 阈值) return i;
    }
    return 色阶.length - 1;
  }
  for (let i = 起始索引; i >= 0; i--) {
    if (对比度(参考色, 色阶[i]) >= 阈值) return i;
  }
  return 0;
}

const 浅色卡片底色 = '#FFFFFF';
const 深色卡片底色 = '#18202B';

function 构建完整色阶(种子hex, 是否深色) {
  const 色阶 = 生成色阶(种子hex);
  if (是否深色) {
    const 按钮档索引 = 选取白字达标档索引(色阶, 4);
    const 按钮按下档索引 = Math.min(按钮档索引 + 1, 色阶.length - 1);
    const 主色文字档索引 = 选取对比度达标档索引(色阶, 4, 深色卡片底色, 4.5, false);
    const 主色边框档索引 = 选取对比度达标档索引(色阶, 6, 深色卡片底色, 3, false);
    return {
      色阶,
      语义: {
        主色: 色阶[4],
        主色悬停: 色阶[3],
        主色按下: 色阶[5],
        按钮背景主色: 色阶[按钮档索引],
        按钮背景按下: 色阶[按钮按下档索引],
        主色容器: 色阶[9],
        主色容器悬停: 色阶[8],
        主色边框: 色阶[主色边框档索引],
        主色图标: 色阶[4],
        主色文字: 色阶[主色文字档索引]
      }
    };
  }
  const 按钮档索引浅色 = 选取白字达标档索引(色阶, 5);
  const 按钮按下档索引浅色 = Math.min(按钮档索引浅色 + 1, 色阶.length - 1);
  const 主色文字档索引浅色 = 选取对比度达标档索引(色阶, 6, 浅色卡片底色, 4.5, true);
  const 主色图标档索引浅色 = 选取对比度达标档索引(色阶, 5, 浅色卡片底色, 3, true);
  const 主色边框档索引浅色 = 选取对比度达标档索引(色阶, 2, 浅色卡片底色, 3, true);
  return {
    色阶,
    语义: {
      主色: 色阶[5],
      主色悬停: 色阶[4],
      主色按下: 色阶[6],
      按钮背景主色: 色阶[按钮档索引浅色],
      按钮背景按下: 色阶[按钮按下档索引浅色],
      主色容器: 色阶[1],
      主色容器悬停: 色阶[2],
      主色边框: 色阶[主色边框档索引浅色],
      主色图标: 色阶[主色图标档索引浅色],
      主色文字: 色阶[主色文字档索引浅色]
    }
  };
}

function 混合十六进制色(背景色, 前景色, alpha) {
  const [br, bg, bb] = 十六进制转RGB(背景色);
  const [fr, fg, fb] = 十六进制转RGB(前景色);
  return RGB转十六进制(
    Math.round(fr * alpha + br * (1 - alpha)),
    Math.round(fg * alpha + bg * (1 - alpha)),
    Math.round(fb * alpha + bb * (1 - alpha))
  );
}

// ===== CIE Lu*v* 色彩差异 △Euv（复用自 verify-contrast-official.mjs） =====
function sRGB转线性(c) {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function 转XYZ(hex) {
  const [r, g, b] = 十六进制转RGB(hex);
  const R = sRGB转线性(r), G = sRGB转线性(g), B = sRGB转线性(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
  return [X * 100, Y * 100, Z * 100];
}
const Xn = 95.047, Yn = 100.0, Zn = 108.883;
const un_ = 4 * Xn / (Xn + 15 * Yn + 3 * Zn);
const vn_ = 9 * Yn / (Xn + 15 * Yn + 3 * Zn);
function 转CIELuv(hex) {
  const [X, Y, Z] = 转XYZ(hex);
  const yr = Y / Yn;
  const L = yr > Math.pow(6 / 29, 3) ? 116 * Math.cbrt(yr) - 16 : Math.pow(29 / 3, 3) * yr;
  const d = X + 15 * Y + 3 * Z;
  const u_ = d === 0 ? 0 : 4 * X / d;
  const v_ = d === 0 ? 0 : 9 * Y / d;
  const u = 13 * L * (u_ - un_);
  const v = 13 * L * (v_ - vn_);
  return { L, u, v };
}
function 色彩差异Euv(hex1, hex2) {
  const a = 转CIELuv(hex1);
  const b = 转CIELuv(hex2);
  return Math.sqrt(Math.pow(a.L - b.L, 2) + Math.pow(a.u - b.u, 2) + Math.pow(a.v - b.v, 2));
}

const 浅色页面底色 = '#F5F7FA';
const 深色页面底色 = '#10151D';

function 取主题种子色(主题) {
  switch (主题) {
    case 'aurora': return '#2F5FD0';
    case 'forest': return '#00B42A';
    case 'midnight': return '#722ED1';
    case 'lagoon': return '#14C9C9';
    case 'sunset': return '#FF7D00';
    case 'lemon': return '#F7BA1E';
    case 'minimal_gray': return '#595959';
    default: return '#2F5FD0';
  }
}

// ===== 方案 C：有色相主题深色热力图 alpha 序列候选 =====
const 方案C候选 = {
  '候选1': [0.10, 0.40, 0.75],
  '候选2': [0.15, 0.45, 0.80],
  '候选3': [0.05, 0.35, 0.70],
};
// 当前生效的热力 alpha 序列（方案 C 评估后赋值；默认原值）
let 生效热力alpha = [0.25, 0.45, 0.70];

function 计算深色热力色(按钮背景主色, alpha序列) {
  return [
    混合十六进制色(深色卡片底色, 按钮背景主色, alpha序列[0]),
    混合十六进制色(深色卡片底色, 按钮背景主色, alpha序列[1]),
    混合十六进制色(深色卡片底色, 按钮背景主色, alpha序列[2]),
    按钮背景主色,
  ];
}

// ===== 解析主题色板（实现方案 A + B + C） =====
function 解析主题色板(主题, 是否深色) {
  const 新卡计数色 = 是否深色 ? '#7C9AE8' : '#366ECE';
  const 学习中计数色 = 是否深色 ? '#E6A45F' : '#A05D1C';
  const 复习中计数色 = 是否深色 ? '#B2A0F2' : '#7056C8';

  // 方案 B：极简灰主题硬编码色值
  if (主题 === 'minimal_gray') {
    return 是否深色 ? {
      动作主色: '#BFBFBF', 动作主色悬停: '#D9D9D9', 动作主色按下: '#A6A6A6',
      主色按钮背景: '#6B6B6B', 主色按钮按下: '#595959',
      选中背景: 深色卡片底色, 主色容器: '#555555', 主色容器悬停: '#666666',
      主色边框: '#808080', 主色图标: '#BFBFBF', 主色文字: '#CCCCCC',
      新卡计数色, 学习中计数色, 复习中计数色,
      热力1: '#2A2A2A', 热力2: '#3D3D3D', 热力3: '#4D4D4D', 热力4: '#6B6B6B',
      页面底色微染: 混合十六进制色(深色页面底色, '#BFBFBF', 0.10)
    } : {
      动作主色: '#4A4A4A', 动作主色悬停: '#595959', 动作主色按下: '#3D3D3D',
      主色按钮背景: '#4A4A4A', 主色按钮按下: '#3D3D3D',
      选中背景: '#A6A6A6', 主色容器: '#A6A6A6', 主色容器悬停: '#B0B0B0',
      主色边框: '#8C8C8C', 主色图标: '#4A4A4A', 主色文字: '#3D3D3D',
      新卡计数色, 学习中计数色, 复习中计数色,
      热力1: '#E0E0E0', 热力2: '#B0B0B0', 热力3: '#828282', 热力4: '#4A4A4A',
      页面底色微染: 混合十六进制色(浅色页面底色, '#4A4A4A', 0.06)
    };
  }

  const 种子 = 取主题种子色(主题);
  const 色阶 = 构建完整色阶(种子, 是否深色);
  const 语义 = 色阶.语义;

  const 马卡龙白 = '#FFFFFF';
  // 方案 A：浅色模式主色容器——从 idx 1 起始向深档搜索首个与 #FFFFFF 对比度 ≥2.2 的最浅 shade
  let 原始容器色;
  if (是否深色) {
    原始容器色 = 色阶.色阶[3];
  } else {
    const 容器档索引 = 选取对比度达标档索引(色阶.色阶, 1, 浅色卡片底色, 2.2, true);
    原始容器色 = 色阶.色阶[容器档索引];
  }
  const 原始容器悬停色 = 是否深色 ? 色阶.色阶[2] : 语义.主色容器悬停;
  const 容器色 = 是否深色 ? 混合十六进制色(马卡龙白, 原始容器色, 0.65) : 原始容器色;
  const 容器悬停色 = 是否深色 ? 混合十六进制色(马卡龙白, 原始容器悬停色, 0.65) : 原始容器悬停色;

  const 浅色主文本色 = '#182230';
  const 热力3档索引浅色 = 选取对比度达标档索引(色阶.色阶, 4, 浅色主文本色, 4.5, false);
  const 热力3档索引最终 = Math.max(3, 热力3档索引浅色);

  // 方案 C：深色模式热力图 alpha 序列（生效热力alpha）
  let 热力1, 热力2, 热力3, 热力4;
  if (是否深色) {
    const 热力色 = 计算深色热力色(语义.按钮背景主色, 生效热力alpha);
    热力1 = 热力色[0]; 热力2 = 热力色[1]; 热力3 = 热力色[2]; 热力4 = 热力色[3];
  } else {
    热力1 = 色阶.色阶[1];
    热力2 = 色阶.色阶[2];
    热力3 = 色阶.色阶[热力3档索引最终];
    热力4 = 语义.按钮背景主色;
  }

  return {
    动作主色: 语义.主色, 动作主色悬停: 语义.主色悬停, 动作主色按下: 语义.主色按下,
    主色按钮背景: 语义.按钮背景主色, 主色按钮按下: 语义.按钮背景按下,
    主色容器: 容器色, 主色容器悬停: 容器悬停色,
    主色边框: 语义.主色边框, 主色图标: 语义.主色图标, 主色文字: 语义.主色文字,
    选中背景: 是否深色 ? 深色卡片底色 : 容器色,
    新卡计数色, 学习中计数色, 复习中计数色,
    热力1, 热力2, 热力3, 热力4,
    页面底色微染: 混合十六进制色(是否深色 ? 深色页面底色 : 浅色页面底色, 语义.主色, 是否深色 ? 0.10 : 0.06)
  };
}

const 浅色文本 = {
  text_primary: '#182230', text_secondary: '#667085', text_tertiary: '#5A6478',
  error_text: '#D92D20', surface_page: '#F5F7FA', surface_card: '#FFFFFF'
};
const 深色文本 = {
  text_primary: '#F1F5F9', text_secondary: '#B8C1CE', text_tertiary: '#8E9AAA',
  error_text: '#F97066', surface_page: '#10151D', surface_card: '#18202B'
};

const 主题列表 = ['aurora', 'forest', 'midnight', 'lagoon', 'sunset', 'lemon', 'minimal_gray'];
const 主题中文名 = {
  aurora: '极光蓝', forest: '仙野绿', midnight: '暗夜紫',
  lagoon: '碧涛青', sunset: '活力橙', lemon: '柠檬金', minimal_gray: '极简灰'
};
const 有色相主题 = ['aurora', 'forest', 'midnight', 'lagoon', 'sunset', 'lemon'];

// ========================================================
// 第一阶段：方案 C 候选评估（6 有色相主题 × 深色模式，相邻 △Euv）
// ========================================================
console.log('========== 方案 C 候选评估（有色相主题深色模式，相邻 △Euv） ==========\n');
console.log('目标：热力1↔2 / 2↔3 / 3↔4 △Euv 均 ≥20\n');

const 候选评估 = {}; // 候选名 -> { 各主题最小△Euv, 总最小, 全通过 }
let 最佳候选名 = null;
let 最佳候选最小 = -1;
let 最佳候选通过数 = -1;

for (const [候选名, alpha序列] of Object.entries(方案C候选)) {
  const 各主题最小 = {};
  let 总最小 = Infinity;
  let 全通过 = true;
  let 通过对数 = 0;
  const 总对数 = 有色相主题.length * 3;

  for (const 主题 of 有色相主题) {
    const 种子 = 取主题种子色(主题);
    const 色阶 = 构建完整色阶(种子, true);
    const 热力 = 计算深色热力色(色阶.语义.按钮背景主色, alpha序列);
    const e12 = 色彩差异Euv(热力[0], 热力[1]);
    const e23 = 色彩差异Euv(热力[1], 热力[2]);
    const e34 = 色彩差异Euv(热力[2], 热力[3]);
    const 主题最小 = Math.min(e12, e23, e34);
    各主题最小[主题] = 主题最小;
    总最小 = Math.min(总最小, 主题最小);
    if (e12 >= 20) 通过对数++;
    if (e23 >= 20) 通过对数++;
    if (e34 >= 20) 通过对数++;
    if (主题最小 < 20) 全通过 = false;
  }

  候选评估[候选名] = { 各主题最小, 总最小, 全通过, 通过对数, 总对数 };

  // 选最佳：先看全通过（全通过优先），否则比较总最小；同全通过则比较通过对数/总最小
  const 优于 = () => {
    if (最佳候选名 === null) return true;
    const 现 = 候选评估[最佳候选名];
    if (全通过 && !现.全通过) return true;
    if (!全通过 && 现.全通过) return false;
    if (总最小 > 现.总最小) return true;
    if (总最小 < 现.总最小) return false;
    return 通过对数 > 现.通过对数;
  };
  if (优于()) {
    最佳候选名 = 候选名;
    最佳候选最小 = 总最小;
    最佳候选通过数 = 通过对数;
  }
}

// 打印候选评估表
console.log('各候选每主题最小相邻 △Euv（括号为该候选总最小值）：\n');
for (const [候选名, alpha序列] of Object.entries(方案C候选)) {
  const 评 = 候选评估[候选名];
  const 行 = 有色相主题.map(t => `${主题中文名[t]}=${评.各主题最小[t].toFixed(1)}`).join('  ');
  console.log(`  ${候选名} [${alpha序列.join('/')}]: ${行}`);
  console.log(`      总最小=${评.总最小.toFixed(2)}  通过 ${评.通过对数}/${评.总对数} 对  ${评.全通过 ? '✓ 全通过' : '✗ 有不足'}`);
}
console.log(`\n→ 推荐候选：${最佳候选名}（总最小 △Euv=${最佳候选最小.toFixed(2)}，通过 ${最佳候选通过数}/${候选评估[最佳候选名].总对数} 对）`);
生效热力alpha = 方案C候选[最佳候选名];
console.log(`→ 生效 alpha 序列：[${生效热力alpha.join(', ')}]\n`);

// ========================================================
// 第二阶段：方案 A + B + C 全量验证（7 主题 × 2 模式）
// ========================================================
let 有问题 = false;
let 问题清单 = [];
const 模式达标记录 = {}; // 用于总结

console.log('========== 方案 A + B + C 全量验证 ==========\n');

for (const 主题 of 主题列表) {
  for (const 是否深色 of [false, true]) {
    const 色板 = 解析主题色板(主题, 是否深色);
    const 文本 = 是否深色 ? 深色文本 : 浅色文本;
    const 模式名 = 是否深色 ? '深色' : '浅色';
    const 卡片底 = 文本.surface_card;
    const 页面底 = 文本.surface_page;
    const 记录键 = `${主题中文名[主题]}-${模式名}`;
    模式达标记录[记录键] = true;

    console.log(`\n--- ${记录键} ---`);

    const 文本阈值 = 是否深色 ? 5 : 4.5;

    const 检查 = (前景, 背景, 阈值, 标签, 类型 = 'min') => {
      const r = 对比度(前景, 背景);
      const ok = 类型 === 'max' ? r <= 阈值 : r >= 阈值;
      if (!ok) {
        有问题 = true;
        模式达标记录[记录键] = false;
        问题清单.push(`${记录键}: ${标签} ${前景}/${背景} = ${r.toFixed(2)} (需${类型 === 'max' ? '≤' : '≥'}${阈值})`);
      }
      console.log(`  ${标签}: ${r.toFixed(2)} ${ok ? '✓' : '✗'}`);
    };

    const 检查差异 = (色1, 色2, 标签) => {
      const e = 色彩差异Euv(色1, 色2);
      const ok = e >= 20;
      if (!ok) {
        有问题 = true;
        模式达标记录[记录键] = false;
        问题清单.push(`${记录键}: ${标签} ${色1}/${色2} △Euv=${e.toFixed(2)} (需≥20)`);
      }
      console.log(`  ${标签}: △Euv=${e.toFixed(2)} ${ok ? '✓' : '✗'}`);
    };

    // 1. 主色文字/卡片底
    检查(色板.主色文字, 卡片底, 文本阈值, `主色文字 ${色板.主色文字}/卡片底`);
    // 2. 白字/主色按钮背景
    检查('#FFFFFF', 色板.主色按钮背景, 4.5, `白字/按钮背景 ${色板.主色按钮背景}`);
    // 3. 主色图标/卡片底
    检查(色板.主色图标, 卡片底, 3, `主色图标 ${色板.主色图标}/卡片底`);
    // 4. 主色边框/卡片底
    检查(色板.主色边框, 卡片底, 3, `主色边框 ${色板.主色边框}/卡片底`);
    // 5. 三个计数色/卡片底
    检查(色板.新卡计数色, 卡片底, 文本阈值, `新卡计数色 ${色板.新卡计数色}`);
    检查(色板.学习中计数色, 卡片底, 文本阈值, `学习计数色 ${色板.学习中计数色}`);
    检查(色板.复习中计数色, 卡片底, 文本阈值, `复习计数色 ${色板.复习中计数色}`);
    // 6. text_primary/热力1-3
    检查(文本.text_primary, 色板.热力1, 文本阈值, `text_primary/热力1 ${色板.热力1}`);
    检查(文本.text_primary, 色板.热力2, 文本阈值, `text_primary/热力2 ${色板.热力2}`);
    检查(文本.text_primary, 色板.热力3, 文本阈值, `text_primary/热力3 ${色板.热力3}`);
    // 7. 白字/热力4
    检查('#FFFFFF', 色板.热力4, 4.5, `白字/热力4 ${色板.热力4}`);
    // 8. text_secondary/卡片底
    检查(文本.text_secondary, 卡片底, 文本阈值, `text_secondary/卡片底`);
    // 9. error_text/卡片底
    检查(文本.error_text, 卡片底, 文本阈值, `error_text/卡片底`);
    // 10. 主色容器/卡片底 ≥2.2（华为控件背板）
    检查(色板.主色容器, 卡片底, 2.2, `主色容器 ${色板.主色容器}/卡片底`);
    // 11. 主色按钮背景/页面底 ≥2.2（华为控件背板）
    检查(色板.主色按钮背景, 页面底, 2.2, `主色按钮背景 ${色板.主色按钮背景}/页面底`);
    // 12. 热力相邻 △Euv
    检查差异(色板.热力1, 色板.热力2, `热力1↔2 △Euv (${色板.热力1}/${色板.热力2})`);
    检查差异(色板.热力2, 色板.热力3, `热力2↔3 △Euv (${色板.热力2}/${色板.热力3})`);
    检查差异(色板.热力3, 色板.热力4, `热力3↔4 △Euv (${色板.热力3}/${色板.热力4})`);
    // 13. 深色舒适性上限：text_primary/卡片底 ≤17.6
    if (是否深色) {
      检查(文本.text_primary, 卡片底, 17.6, `text_primary/卡片底(舒适性上限)`, 'max');
    }
  }
}

// ========================================================
// 第三阶段：总结
// ========================================================
console.log('\n\n========================================');
console.log('========== 总结 ==========');
console.log('========================================\n');

// 极简灰深色热力图 △Euv 实际数值
{
  const 色板 = 解析主题色板('minimal_gray', true);
  const e12 = 色彩差异Euv(色板.热力1, 色板.热力2);
  const e23 = 色彩差异Euv(色板.热力2, 色板.热力3);
  const e34 = 色彩差异Euv(色板.热力3, 色板.热力4);
  console.log(`极简灰深色热力图相邻 △Euv：`);
  console.log(`  热力1↔2 (${色板.热力1}/${色板.热力2}) = ${e12.toFixed(2)}  ${e12 >= 20 ? '✓' : '✗'}`);
  console.log(`  热力2↔3 (${色板.热力2}/${色板.热力3}) = ${e23.toFixed(2)}  ${e23 >= 20 ? '✓' : '✗'}`);
  console.log(`  热力3↔4 (${色板.热力3}/${色板.热力4}) = ${e34.toFixed(2)}  ${e34 >= 20 ? '✓' : '✗'}`);
}

console.log('\n---------- 不达标项 ----------');
if (问题清单.length === 0) {
  console.log('（无不达标项）');
} else {
  问题清单.forEach(p => console.log('  - ' + p));
}

console.log('\n---------- 各场景达标情况 ----------');
for (const [键, 达标] of Object.entries(模式达标记录)) {
  console.log(`  ${键}: ${达标 ? '✓ 全部达标' : '✗ 有不达标项'}`);
}

console.log('\n---------- 结论 ----------');
// 判定“非极简灰深色热力图”场景是否全部通过
let 非极简灰深色热力全过 = true;
const 非极简灰深色热力问题 = [];
for (const 主题 of 主题列表) {
  if (主题 === 'minimal_gray') continue;
  const 键 = `${主题中文名[主题]}-深色`;
  // 只看热力图 △Euv 相关问题
  for (const p of 问题清单) {
    if (p.startsWith(键 + ':') && p.includes('△Euv')) {
      非极简灰深色热力全过 = false;
      非极简灰深色热力问题.push(p);
    }
  }
}
console.log(`方案 A+B+C 是否能让所有“非极简灰深色热力图”场景通过华为规范：${非极简灰深色热力全过 ? '是 ✓' : '否 ✗'}`);
if (!非极简灰深色热力全过) {
  console.log('  仍不达标项：');
  非极简灰深色热力问题.forEach(p => console.log('    - ' + p));
}
console.log(`推荐的方案 C 候选：${最佳候选名}（总最小 △Euv=${最佳候选最小.toFixed(2)}，通过 ${最佳候选通过数}/${候选评估[最佳候选名].总对数} 对）`);

console.log('\n---------- 可接受性说明 ----------');
console.log('极简灰深色热力图 △Euv 不足属于根本性矛盾：纯灰色阶在 CIE Luv 色空间中 u/v 分量近 0，');
console.log('相邻档仅靠 L* 差异区分，无法同时满足“4 档均与白字 text_primary ≥5:1”和“相邻 △Euv ≥20”。');
console.log('该限制为无彩色主题的固有特性，建议作为已知豁免项，或为极简灰深色热力图改用有色相辅助色。');
