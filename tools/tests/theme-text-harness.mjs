// SPDX-License-Identifier: AGPL-3.0-or-later
import { stripTypeScriptTypes } from 'node:module';

// Read the actual owner expression so regressions exercise the state dependencies at each caller.
export function themeTextWrappers(source) {
  return [...source.matchAll(/ForEach\(\[themeTextKey\(([\s\S]*?)\)\], \(_textKey: string\) => \{ (Theme(?:Highlighted)?TextSpans)\(([\s\S]*?)\) \}, \(_textKey: string\): string => _textKey\)/g)];
}

export function themeTextArguments(text) {
  const args = [];
  let start = 0, depth = 0, quote = '';
  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    if (quote) {
      if (ch === '\\') index++;
      else if (ch === quote) quote = '';
    } else if ('\'"`'.includes(ch)) quote = ch;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { args.push(text.slice(start, index).trim()); start = index + 1; }
  }
  args.push(text.slice(start).trim());
  return args;
}

// ArkUI retains an item for the same key without calling its value-parameter builder again.
// This harness models that cache rule; HAP/device checks still verify real ArkUI observation.
export function cachedThemeText(wrapper, api, spans, $r, locals = {}) {
  let previousKey, children, builds = 0;
  const forEach = (items, build, keyFor) => {
    const key = keyFor(items[0]);
    if (key !== previousKey) {
      previousKey = key;
      spans.length = 0;
      build(items[0]);
      children = structuredClone(spans);
      builds++;
    }
  };
  const render = new Function('ForEach', 'ThemeTextSpans', 'ThemeHighlightedTextSpans', 'themeTextKey', '$r',
    ...Object.keys(locals), stripTypeScriptTypes(wrapper[0], { mode: 'transform' }));
  return {
    render(host) {
      render.call(host, forEach, api.ThemeTextSpans, api.ThemeHighlightedTextSpans, api.themeTextKey, $r, ...Object.values(locals));
      return children;
    },
    builds: () => builds
  };
}
