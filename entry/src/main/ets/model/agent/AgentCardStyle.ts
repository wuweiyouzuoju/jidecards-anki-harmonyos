// SPDX-License-Identifier: AGPL-3.0-or-later

/** Only explicit appearance properties cross this boundary; templates remain application-owned. */
export interface AgentCardStyle {
  backgroundColor?: string;
  textColor?: string;
  darkBackgroundColor?: string;
  darkTextColor?: string;
  fontSize?: number;
  lineHeight?: number;
  textAlign?: string;
}

export const AGENT_CARD_STYLE_SCHEMA: string = '{"type":"object","minProperties":1,"additionalProperties":false,"properties":{' +
  '"backgroundColor":{"type":"string","pattern":"^#[0-9a-fA-F]{6}$"},' +
  '"textColor":{"type":"string","pattern":"^#[0-9a-fA-F]{6}$"},' +
  '"darkBackgroundColor":{"type":"string","pattern":"^#[0-9a-fA-F]{6}$"},' +
  '"darkTextColor":{"type":"string","pattern":"^#[0-9a-fA-F]{6}$"},' +
  '"fontSize":{"type":"number","minimum":8,"maximum":96},' +
  '"lineHeight":{"type":"number","minimum":1,"maximum":3},' +
  '"textAlign":{"type":"string","enum":["left","center","right"]}}}';

const STYLE_START: string = '/* jidecards-agent-style:start */';
const STYLE_END: string = '/* jidecards-agent-style:end */';
const STYLE_KEYS: string[] = ['backgroundColor', 'textColor', 'darkBackgroundColor', 'darkTextColor',
  'fontSize', 'lineHeight', 'textAlign'];

export function validateAgentCardStyle(value: AgentCardStyle): AgentCardStyle {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_card_style');
  }
  const keys: string[] = Object.keys(value);
  if (keys.length === 0 || keys.some((key: string): boolean => STYLE_KEYS.indexOf(key) < 0)) {
    throw new Error('invalid_card_style_property');
  }
  for (const color of [value.backgroundColor, value.textColor, value.darkBackgroundColor, value.darkTextColor]) {
    if (color !== undefined && (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) {
      throw new Error('invalid_card_style_color');
    }
  }
  if (value.fontSize !== undefined && (typeof value.fontSize !== 'number' ||
    !Number.isFinite(value.fontSize) || value.fontSize < 8 || value.fontSize > 96)) {
    throw new Error('invalid_card_style_font_size');
  }
  if (value.lineHeight !== undefined && (typeof value.lineHeight !== 'number' ||
    !Number.isFinite(value.lineHeight) || value.lineHeight < 1 || value.lineHeight > 3)) {
    throw new Error('invalid_card_style_line_height');
  }
  if (value.textAlign !== undefined && ['left', 'center', 'right'].indexOf(value.textAlign) < 0) {
    throw new Error('invalid_card_style_alignment');
  }
  return value;
}

/** Replace only our own generated block; preserve imported CSS, scripts and template metadata. */
export function applyAgentCardStyle(css: string, patch: AgentCardStyle): string {
  validateAgentCardStyle(patch);
  let previous: AgentCardStyle = {};
  let base: string = css;
  const start: number = css.lastIndexOf(STYLE_START);
  const end: number = start < 0 ? -1 : css.indexOf(STYLE_END, start);
  if (start >= 0 && end >= 0) {
    const headerEnd: number = css.indexOf(' */', start + STYLE_START.length);
    const header: string = css.slice(start + STYLE_START.length, headerEnd).trim();
    try {
      previous = validateAgentCardStyle(JSON.parse(header.replace(/^\/\* /, '')) as AgentCardStyle);
      base = css.slice(0, start) + css.slice(end + STYLE_END.length);
    } catch (error) { previous = {}; }
  }
  const style: AgentCardStyle = {
    backgroundColor: patch.backgroundColor ?? previous.backgroundColor,
    textColor: patch.textColor ?? previous.textColor,
    darkBackgroundColor: patch.darkBackgroundColor ?? previous.darkBackgroundColor,
    darkTextColor: patch.darkTextColor ?? previous.darkTextColor,
    fontSize: patch.fontSize ?? previous.fontSize,
    lineHeight: patch.lineHeight ?? previous.lineHeight,
    textAlign: patch.textAlign ?? previous.textAlign
  };
  const normal: string[] = [];
  const dark: string[] = [];
  if (style.backgroundColor !== undefined) { normal.push(`background: ${style.backgroundColor} !important;`); }
  if (style.textColor !== undefined) { normal.push(`color: ${style.textColor} !important;`); }
  if (style.fontSize !== undefined) { normal.push(`font-size: ${style.fontSize}px !important;`); }
  if (style.lineHeight !== undefined) { normal.push(`line-height: ${style.lineHeight} !important;`); }
  if (style.textAlign !== undefined) { normal.push(`text-align: ${style.textAlign} !important;`); }
  if (style.darkBackgroundColor !== undefined) { dark.push(`background: ${style.darkBackgroundColor} !important;`); }
  if (style.darkTextColor !== undefined) { dark.push(`color: ${style.darkTextColor} !important;`); }
  return base.trimEnd() + '\n' + STYLE_START + '\n/* ' + JSON.stringify(style) + ' */\n' +
    `html, body.card { ${normal.join(' ')} }\nbody.card.nightMode { ${dark.join(' ')} }\n` + STYLE_END;
}
