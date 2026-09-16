// SPDX-License-Identifier: AGPL-3.0-or-later

export type ThemeId = 'aurora' | 'forest' | 'midnight' | 'lagoon' | 'sunset' | 'lemon' | 'minimal_gray' | 'iridescent';
export const THEME_VISUALS_KEY: string = 'themeVisuals';
export const THEME_TEXT_COLORS_KEY: string = 'themeTextColors';
export const PAGE_SURFACE_KEY: string = 'themePageSurface';
export const UNLOCKED_CONTENTS_KEY: string = 'unlockedContentIds';
export const GLASS_COLORS_KEY: string = 'glassSurfaceColors';
export const GLASS_HIGHLIGHT_COLORS: string[] = ['#B3FFFFFF', '#80FFFFFF', '#A6FFFFFF'];
export const GLASS_DARK_COLORS: string[] = ['#CC283345', '#A61B2433', '#BF243044'];
export const PRIMARY_GLASS_KEY: string = 'primaryGlass';

export interface PrimaryGlassStyle {
  colors: string[];
  pressedColors: string[];
  border: string;
}

/** 主题色只轻染玻璃材料；透明度保留厚度，不用高饱和实体按钮。 */
function glassTint(accent: string, dark: boolean, pressed: boolean): string {
  const base: string = dark ? '#18202B' : '#FFFFFF';
  const amount: number = pressed ? 0.16 : 0.08;
  let result: string = pressed ? '#E6' : '#D6';
  for (let offset: number = 1; offset < 7; offset += 2) {
    const channel: number = Math.round(parseInt(base.slice(offset, offset + 2), 16) * (1 - amount)
      + parseInt(accent.slice(offset, offset + 2), 16) * amount);
    result += channel.toString(16).padStart(2, '0');
  }
  return result;
}

export function themePrimaryGlass(theme: ThemeDefinition, dark: boolean): PrimaryGlassStyle {
  const accents: string[] = theme.lightActionColors.length > 0 ? theme.lightActionColors : [theme.seed, theme.seed];
  return {
    colors: accents.map((color: string): string => glassTint(color, dark, false)),
    pressedColors: accents.map((color: string): string => glassTint(color, dark, true)),
    border: dark ? '#668FA6C8' : '#CCFFFFFF'
  };
}

/**
 * 主题的唯一配置入口；页面只消费视觉配置，不判断某个主题的名字。
 * Extension Points: 新主题登记 ID、种子色、可选装饰与背景纹理，再补主题名称资源。
 * backgroundTextures 为空表示纯色；彩雾模式使用三张透明纹理，共用根层动画。
 */
export interface ThemeDefinition {
  id: ThemeId;
  seed: string;
  requiredContent: string;
  previewColors: string[];
  backgroundTextures: string[];
  backgroundCycleMs: number;
  lightPage: string;
  darkPage: string;
  progressColors: string[];
  lightActionColors: string[];
  darkActionColors: string[];
  selectedColors: string[];
  deckColors: string[][];
}

function solidTheme(id: ThemeId, seed: string): ThemeDefinition {
  return {
    id: id, seed: seed, requiredContent: '', previewColors: [], backgroundTextures: [], backgroundCycleMs: 6000,
    lightPage: '', darkPage: '', progressColors: [],
    lightActionColors: [], darkActionColors: [], selectedColors: [], deckColors: []
  };
}

function iridescentTheme(): ThemeDefinition {
  const theme: ThemeDefinition = solidTheme('iridescent', '#6355CE');
  theme.requiredContent = 'theme-iridescent';
  theme.previewColors = ['#3974E8', '#7951CF', '#B04491'];
  theme.backgroundTextures = ['themes/iridescent_cloud_0.png', 'themes/iridescent_cloud_1.png', 'themes/iridescent_cloud_2.png'];
  theme.lightPage = '#F7F8FE';
  theme.darkPage = '#10131F';
  theme.progressColors = ['#16B9DA', '#2978F2', '#8B51EC', '#E14ACD', '#FF9060', '#F3D448'];
  theme.lightActionColors = ['#365FC7', '#6743BC', '#A1368E', '#944709'];
  theme.darkActionColors = ['#96B8FF', '#C4A1FF', '#F19DDE', '#FFC18A'];
  theme.selectedColors = GLASS_HIGHLIGHT_COLORS;
  theme.deckColors = [
    ['#267EF0', '#A655F0'], ['#BF4CEB', '#FF8861'], ['#20B9EE', '#4DC7A0'],
    ['#F7C448', '#F165A2'], ['#79C653', '#22B8DC']
  ];
  return theme;
}

export const THEME_CATALOG: ThemeDefinition[] = [
  solidTheme('aurora', '#2F5FD0'), solidTheme('forest', '#00B42A'), solidTheme('midnight', '#722ED1'),
  solidTheme('lagoon', '#14C9C9'), solidTheme('sunset', '#FF7D00'), solidTheme('lemon', '#F7BA1E'),
  solidTheme('minimal_gray', '#595959'), iridescentTheme()
];

export function themeDefinition(id: string): ThemeDefinition {
  return THEME_CATALOG.find((theme: ThemeDefinition): boolean => theme.id === id) ?? THEME_CATALOG[0];
}

export function isThemeAvailable(id: string, contents: string[]): boolean {
  const required: string = themeDefinition(id).requiredContent;
  return required === '' || contents.includes(required);
}

export function availableThemes(contents: string[]): ThemeId[] {
  return THEME_CATALOG.filter((theme: ThemeDefinition): boolean => isThemeAvailable(theme.id, contents))
    .map((theme: ThemeDefinition): ThemeId => theme.id);
}

export function themeForContent(content: string): ThemeDefinition | undefined {
  return THEME_CATALOG.find((theme: ThemeDefinition): boolean => theme.requiredContent === content && content !== '');
}

/** 稳定选取牌组装饰，不随切页或背景随机运动改变。 */
export function themeDeckColors(theme: ThemeDefinition, id: string): string[] {
  if (theme.deckColors.length === 0) return [];
  let hash: number = 0;
  for (let index: number = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return theme.deckColors[hash % theme.deckColors.length];
}
