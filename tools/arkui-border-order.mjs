// SPDX-License-Identifier: AGPL-3.0-or-later
/** Audit only: a radius-less border must precede the final explicit radius on the same ArkUI node. */
export function arkuiBorderOrderViolations(source) {
  const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\p{L}_$][\p{L}\p{N}_$]*|[^\s]/gu)]
    .filter(match => !match[0].startsWith('//') && !match[0].startsWith('/*'));
  const pairs = new Map(), stack = [], found = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (['(', '{', '['].includes(tokens[i][0])) stack.push(i);
    else if ([')', '}', ']'].includes(tokens[i][0])) {
      const start = stack.pop();
      if (start !== undefined) pairs.set(start, i);
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i][0] !== '.' || tokens[i + 1]?.[0] !== 'borderRadius') continue;
    let radius, border, cursor = i;
    while (tokens[cursor]?.[0] === '.' && tokens[cursor + 2]?.[0] === '(') {
      const close = pairs.get(cursor + 2);
      if (close === undefined) break;
      const start = tokens[cursor].index, end = tokens[close].index + 1;
      const modifier = { start, end, text: source.slice(start, end) };
      if (tokens[cursor + 1][0] === 'borderRadius') radius = modifier;
      if (tokens[cursor + 1][0] === 'border') border = modifier;
      cursor = close + 1;
    }
    if (radius && border && border.start > radius.start && !/\bradius\s*:/.test(border.text)) {
      found.set(border.start, { radius, border, line: source.slice(0, radius.start).split('\n').length });
    }
  }
  return [...found.values()];
}
