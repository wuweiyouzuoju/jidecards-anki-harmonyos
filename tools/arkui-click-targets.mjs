// SPDX-License-Identifier: AGPL-3.0-or-later
/** Source audit only: skip comments/strings and walk balanced ArkUI modifier chains. */
export function arkuiClickTargets(source) {
  const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\p{L}_$][\p{L}\p{N}_$]*|[^\s]/gu)]
    .filter(m => !m[0].startsWith('//') && !m[0].startsWith('/*'));
  const pairs = new Map(), stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const value = tokens[i][0];
    if (['(', '{', '['].includes(value)) stack.push(i);
    if ([')', '}', ']'].includes(value)) {
      const start = stack.pop();
      if (start !== undefined) { pairs.set(start, i); pairs.set(i, start); }
    }
  }
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i][0] !== 'onClick' || tokens[i - 1]?.[0] !== '.' || tokens[i + 1]?.[0] !== '(') continue;
    let cursor = i - 2, kind = 'unknown', start = i - 1, bodyEnd;
    while (cursor >= 0) {
      if (tokens[cursor][0] === '}') { bodyEnd = cursor; cursor = (pairs.get(cursor) ?? 0) - 1; continue; }
      if (tokens[cursor][0] !== ')') break;
      const open = pairs.get(cursor);
      if (open === undefined) break;
      if (tokens[open - 2]?.[0] === '.') { cursor = open - 3; continue; }
      kind = tokens[open - 1]?.[0] ?? 'unknown'; start = open - 1; break;
    }
    const end = pairs.get(i + 1);
    const offset = tokens[i - 1].index;
    result.push({ kind, offset, line: source.slice(0, offset).split('\n').length,
      chain: source.slice(tokens[start].index, offset),
      modifiers: source.slice((tokens[bodyEnd ?? cursor]?.index ?? offset) + 1, offset),
      handler: source.slice(tokens[i].index, tokens[end ?? i].index + 1) });
  }
  return result;
}

/** Non-button semantics intentionally excluded from application press dimming. */
export function clickFeedbackExemption(file, target) {
  file = file.replaceAll('\\', '/');
  if (file.startsWith('widget/')) return 'system-hosted widget';
  if (target.kind === 'Span') return 'inline rich-text link, not a CommonAttribute node';
  if (target.kind === 'DialogBackdrop') return 'dismiss-only scrim';
  const handler = target.handler.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  if (/=>\s*\{\s*\}\s*\)$/.test(handler)) return 'event barrier without an action';
  if (target.kind === 'Column' && /this\.onClose\(\)/.test(handler) &&
      ['components/common/AnchoredMenu.ets', 'components/browser/浏览侧边栏.ets'].includes(file)) return 'dismiss-only scrim';
  return '';
}
