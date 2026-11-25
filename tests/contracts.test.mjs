import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { motionProfile, pressVisual, activateAction } from '../src/core/Motion.ts';
import { themePalette, resolveDarkMode } from '../src/core/Theme.ts';
import { surfaceGeometry, surfaceBodyHeight } from '../src/core/SurfaceLayout.ts';
import { localDayKey, isCalendarDay, addCalendarDays, calendarDayDistance } from '../src/core/CalendarDay.ts';

test('按压恢复和禁用不遗留缩放，动效选择不修改业务时序', () => {
  assert.equal(pressVisual('lively', 'pressed').scale, 0.975);
  assert.deepEqual(pressVisual('lively', 'normal'), { opacity: 1, scale: 1 });
  assert.deepEqual(pressVisual('lively', 'disabled'), { opacity: 0.4, scale: 1 });
  assert.equal(pressVisual('restrained', 'pressed').scale, 1);
  assert.equal(pressVisual('lively', 'disabled', 0.2).opacity, 0.2);
  assert.throws(() => pressVisual('lively', 'pressed', NaN));
  assert.throws(() => pressVisual('typo', 'normal'));
  assert.throws(() => pressVisual('lively', 'cancelled'));
  const first = motionProfile('lively'); first.pressScale = 8;
  assert.equal(motionProfile('lively').pressScale, 0.975);
});

test('动作守卫拒绝禁用、忙碌和缺失回调，正常动作同步执行且异常不被吞掉', () => {
  let calls = 0;
  const action = () => { calls++; };
  assert.equal(activateAction(false, false, action), false);
  assert.equal(activateAction(true, true, action), false);
  assert.equal(activateAction(true, false, undefined), false);
  assert.equal(calls, 0);
  assert.equal(activateAction(true, false, action), true);
  assert.equal(calls, 1);
  assert.throws(() => activateAction(true, false, () => { throw new Error('save failed'); }), /save failed/);
});

test('强制主题不污染设备主题输入，返回颜色没有共享可变状态', () => {
  assert.equal(resolveDarkMode('light', true), false);
  assert.equal(resolveDarkMode('dark', false), true);
  assert.equal(resolveDarkMode('auto', true), true);
  assert.equal(resolveDarkMode('auto', false), false);
  assert.throws(() => resolveDarkMode('unknown', false));
  const light = themePalette(false); light.page = 'changed';
  assert.equal(themePalette(false).page, '#F5F7FA');
  assert.notEqual(themePalette(true).text, themePalette(false).text);
});

const viewport = { width: 400, height: 800, safeLeft: 0, safeRight: 0,
  safeTop: 32, safeBottom: 24, keyboardTop: 0 };

test('弹窗居中于实际可用矩形；键盘只减少底部预算', () => {
  const initial = surfaceGeometry(viewport);
  assert.deepEqual(initial, { left: 0, top: 32, width: 400, height: 744,
    panelWidth: 352, panelMaxHeight: 654.72 });
  const keyboard = surfaceGeometry({ ...viewport, keyboardTop: 430 });
  assert.equal(keyboard.height, 398);
  assert.equal(keyboard.top, initial.top);
  assert.equal(surfaceGeometry({ ...viewport, width: 1200 }).panelWidth, 480);
  assert.equal(surfaceBodyHeight(400, 44, 44), 256);
  assert.equal(surfaceBodyHeight(10, 44, 0), 0);
});

test('窄窗、过大挖孔和全遮挡不会产生负宽高；坏几何明确失败', () => {
  const covered = surfaceGeometry({ ...viewport, safeLeft: 700, safeTop: 1000, keyboardTop: 10 });
  assert.equal(covered.width, 0); assert.equal(covered.height, 0);
  assert.equal(covered.panelWidth, 0); assert.equal(covered.panelMaxHeight, 0);
  for (const invalid of [NaN, Infinity, -1]) {
    assert.throws(() => surfaceGeometry({ ...viewport, width: invalid }));
  }
  assert.throws(() => surfaceGeometry(viewport, 0));
  assert.throws(() => surfaceGeometry(viewport, 480, 1.1));
});

test('日历拒绝自动归一化的坏日期，支持闰年、跨年和低年份', () => {
  for (const invalid of ['2026-02-29', '2024-02-30', '2026-13-01', '2026-1-01', '0000-01-01']) {
    assert.equal(isCalendarDay(invalid), false, invalid);
  }
  assert.equal(isCalendarDay('2024-02-29'), true);
  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addCalendarDays('0001-01-01', 1), '0001-01-02');
  assert.equal(calendarDayDistance('2024-02-28', '2024-03-01'), 2);
  assert.equal(calendarDayDistance('2024-03-01', '2024-02-28'), -2);
  assert.throws(() => addCalendarDays('9999-12-31', 1));
  assert.throws(() => addCalendarDays('2026-01-01', 0.5));
  assert.throws(() => localDayKey(new Date(NaN)));
});

test('跨夏令时的日期运算不受进程时区影响，本地日期转换遵从宿主时区', () => {
  const moduleUrl = new URL('../src/core/CalendarDay.ts', import.meta.url).href;
  for (const zone of ['UTC', 'America/New_York', 'Asia/Shanghai']) {
    const code = `import { addCalendarDays, calendarDayDistance, localDayKey } from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify([addCalendarDays('2026-03-08', 1),
        calendarDayDistance('2026-03-08','2026-03-09'), localDayKey(new Date('2026-01-01T01:00:00Z'))]));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8', env: { ...process.env, TZ: zone }
    });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), ['2026-03-09', 1,
      zone === 'America/New_York' ? '2025-12-31' : '2026-01-01']);
  }
});
