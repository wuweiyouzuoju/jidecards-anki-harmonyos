// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.ets') ? [path] : [];
  });
}
function hasTextChevron(source) {
  const decoded = source.replace(/\\u(?:\{([0-9a-f]+)\}|([0-9a-f]{4}))/gi,
    (_match, brace, plain) => String.fromCodePoint(parseInt(brace || plain, 16)));
  return /\b(?:Text|Button)\s*\([^\n]*(['"])\s*[>›❯»⌃⌄▼▶◀]\s*\1/.test(decoded);
}

test('disclosure scan catches alternative glyphs and escaped copies', () => {
  for (const source of ["Text('›')", 'Text ("> ")',
    "Button('❯')", "Text(this.expanded ? '⌃' : '⌄')", "Text('⌄')", "Text('▼')", "Text('▶')", String.raw`Text('\u203a')`, String.raw`Text('\u{203a}')`]) {
    assert.ok(hasTextChevron(source), source);
  }
  assert.equal(hasTextChevron("Text('正文')"), false);
  assert.equal(hasTextChevron("DisclosureChevron()"), false);
});

test('all native disclosure arrows use the shared component rather than a font baseline', () => {
  let callers = 0;
  for (const path of files(root)) {
    const source = readFileSync(path, 'utf8');
    assert.equal(hasTextChevron(source), false, `${relative(root, path)}: use DisclosureChevron`);
    if (/DisclosureChevron\(/.test(source)) {
      assert.match(source, /import \{ DisclosureChevron \} from/, path);
      callers++;
    }
  }
  assert.ok(callers > 0, 'must scan actual callers');
});

test('shared chevron geometry is centered and cannot intercept the row action', () => {
  const source = readFileSync(join(root, 'components/common/DisclosureChevron.ets'), 'utf8');
  const points = JSON.parse(source.match(/\.points\((\[\[.*\]\])\)/)[1]);
  const width = Number(source.match(/\.width\((\d+)\)/)[1]);
  const height = Number(source.match(/\.height\((\d+)\)/)[1]);
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  assert.equal((Math.min(...xs) + Math.max(...xs)) / 2, width / 2);
  assert.equal((Math.min(...ys) + Math.max(...ys)) / 2, height / 2);
  assert.equal(width, 24); assert.equal(height, 24);
  assert.match(source, /stroke\(this.tint\)/);
  assert.match(source, /hitTestBehavior\(HitTestMode.None\)/);
  assert.match(source, /accessibilityLevel\('no'\)/);
  assert.doesNotMatch(source, /Text\(|onClick\(/);
});
