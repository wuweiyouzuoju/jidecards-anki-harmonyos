// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { arkuiClickTargets } from '../arkui-click-targets.mjs';
import { DIALOG_ACTION_PRESENTATION } from '../../entry/src/main/ets/model/InteractionFeedback.ts';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
const resource = key => key;

test('primary actions and switches block disabled callbacks without owning business state', () => {
  const Button = loadComponentLogic('components/common/PrimaryActionButton.ets', 'PrimaryActionButton', { $r: resource });
  const Row = loadComponentLogic('components/common/SettingsToggleRow.ets', 'SettingsToggleRow', { $r: resource });
  const button = new Button(), row = new Row();
  for (const themeColor of ['#733BCD', '#14B8A6']) {
    button.primaryBackground = themeColor;
    assert.equal(button.resolvedTint(), themeColor, 'default primary action follows the current theme');
  }
  button.tint = '#C2410C';
  button.primaryBackground = '#733BCD';
  assert.equal(button.resolvedTint(), '#C2410C', 'explicit action color remains owned by the host');
  button.tint = undefined;
  assert.equal(button.resolvedTint(), '#733BCD', 'removing the override restores the current theme');
  let actions = 0; const changes = [];
  button.onAction = () => actions++;
  row.onChange = value => changes.push(value);
  row.isOn = false;
  for (const available of [false, true, false, true]) {
    button.isInteractive = row.isInteractive = available;
    button.activate(); row.change(true);
    assert.equal(row.isOn, false, 'confirmed preference remains owned by the host');
  }
  assert.equal(actions, 2); assert.deepEqual(changes, [true, true]);
});

test('shared secondary buttons retain ordinary colors and stable selection borders', () => {
  const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
    应用尺寸: dimensions, $r: resource
  });
  const Button = loadComponentLogic('components/common/按下态按钮.ets', '按下态按钮', {
    应用尺寸: dimensions, $r: resource, SurfaceBorder, GLASS_HIGHLIGHT_COLORS: []
  });
  const button = new Button();
  button.selectable = true; button.selected = true;
  for (const themeColor of ['#733BCD', '#14B8A6']) {
    button.actionColor = themeColor;
    assert.equal(button.labelColor(), themeColor, 'selected tool follows theme changes on the same instance');
    assert.deepEqual(button.buttonBorder(), { width: 2, color: themeColor });
  }
  button.selectable = false;
  button.字色 = 'danger'; button.selectionColor = 'cyan';
  button.selected = true;
  assert.equal(button.labelColor(), 'danger', 'ordinary actions ignore selection state');
  assert.deepEqual(button.buttonBorder(), { width: dimensions.卡片边框, color: 'app.color.surface_border' });
  button.selectable = true;
  assert.equal(button.labelColor(), 'cyan');
  assert.deepEqual(button.buttonBorder(), { width: 2, color: 'cyan' });
  button.selected = false;
  assert.equal(button.labelColor(), 'danger');
  assert.deepEqual(button.buttonBorder(), { width: 2, color: 'app.color.surface_border' });
  let clicks = 0; button.点击回调 = () => clicks++;
  button.是否启用 = false; button.activate();
  button.是否启用 = true; button.activate();
  assert.equal(clicks, 1);
});

test('dialog title reserves actual icon geometry symmetrically without truncating its label', () => {
  const Header = loadComponentLogic('components/common/DialogHeader.ets', 'DialogHeader', {
    $r: resource, 应用尺寸: dimensions
  });
  const Label = loadComponentLogic('components/common/HelpLabel.ets', 'HelpLabel', {
    $r: resource, FontWeight: { Normal: 'normal' }
  });
  const header = new Header();
  const binding = read('components/common/DialogHeader.ets').match(/HelpLabel\((\{[\s\S]*?\})\)/)[1];
  const options = new Function('FontWeight', 'return (' + binding + ');').call(header, { Bold: 'bold' });
  const label = Object.assign(new Label(), options);
  assert.equal(new Label().limitTitleLines, true, 'ordinary form labels retain their two-line policy');
  assert.equal(label.limitTitleLines, false, 'the header opts into full title rendering');
  assert.equal(label.centered, true);
  for (const showClose of [false, true]) for (const showAction of [false, true]) {
    for (const showCloseLabel of [false, true]) for (const showActionLabel of [false, true]) {
      for (const destructive of [false, true]) {
        Object.assign(header, { showClose, showAction, showCloseLabel, showActionLabel, destructive });
        const hasIcon = (showClose && !showCloseLabel) || (showAction && !showActionLabel && !destructive);
        const inset = header.titleInset();
        assert.equal(inset, hasIcon ? dimensions.按钮高度 + dimensions.间距_16 : 0);
        for (const viewport of [320, 840]) for (const safeInset of [0, 24]) {
          const content = viewport - safeInset * 2;
          const titleWidth = content - inset * 2;
          assert.ok(titleWidth > 0);
          assert.equal(safeInset + inset + titleWidth / 2, viewport / 2);
        }
      }
    }
  }
});

test('dialog header icon and text actions preserve names, theme, danger and disabled callbacks', () => {
  const Header = loadComponentLogic('components/common/DialogHeader.ets', 'DialogHeader', { $r: resource });
  const Button = loadComponentLogic('components/common/按下态按钮.ets', '按下态按钮', {
    应用尺寸: dimensions, $r: resource, GLASS_HIGHLIGHT_COLORS: []
  });
  const IconButton = loadComponentLogic('components/common/IconActionButton.ets', 'IconActionButton', {
    应用尺寸: dimensions, $r: resource, Color: { Transparent: 'transparent' }
  });
  // 执行生产渲染传入的配置，再执行公共按钮的真实禁用守卫。
  const bindings = [...read('components/common/DialogHeader.ets').matchAll(/按下态按钮\((\{[\s\S]*?\})\)/g)]
    .map(match => new Function('$r', 'return (' + match[1] + ');'));
  assert.equal(bindings.length, 2);
  const header = new Header();
  assert.equal(header.actionUsesIcon(), true, 'ordinary confirmation defaults to the shared check icon');
  const iconBindings = [...read('components/common/DialogHeader.ets').matchAll(/IconActionButton\((\{[\s\S]*?\})\)/g)]
    .map(match => new Function('$r', 'DIALOG_ACTION_PRESENTATION', 'return (' + match[1] + ');'));
  assert.equal(iconBindings.length, 2);
  let actions = 0, closes = 0;
  header.onAction = () => actions++; header.onClose = () => closes++;
  for (const themeColor of ['#733BCD', '#14B8A6']) {
    header.actionColor = themeColor;
    for (const destructive of [false, true]) {
      header.destructive = destructive;
      header.showActionLabel = false;
      assert.equal(header.actionUsesIcon(), !destructive, 'destructive confirmation retains its visible label');
      header.showActionLabel = true;
      assert.equal(header.actionUsesIcon(), false, 'explicit result and busy labels remain visible');
      for (const available of [false, true]) {
        header.actionEnabled = header.closeEnabled = available;
        const [close, action] = bindings.map(binding => Object.assign(new Button(), binding.call(header, resource)));
        assert.equal(action.文案, header.actionLabel); assert.equal(close.文案, header.closeLabel);
        assert.equal(action.themeText, !destructive);
        assert.equal(action.labelColor(), destructive ? 'app.color.error_text' : themeColor);
        assert.equal(close.labelColor(), 'app.color.text_secondary');
        assert.equal(action.singleLine, false); assert.equal(close.singleLine, false);
        assert.equal(action.fillWidth, true); assert.equal(close.fillWidth, true);
        assert.equal(action.autoHeight, true); assert.equal(close.autoHeight, true);
        assert.equal(header.usesTextRow(), true, 'visible text actions get room below the centered title');
        const previous = [actions, closes];
        action.activate(); close.activate();
        assert.deepEqual([actions, closes], previous.map(count => count + Number(available)));
      }
    }
    header.destructive = false; header.showActionLabel = false;
    for (const available of [false, true]) {
      header.actionEnabled = header.closeEnabled = available;
      const [close, action] = iconBindings.map(binding => Object.assign(new IconButton(),
        binding.call(header, resource, DIALOG_ACTION_PRESENTATION)));
      assert.equal(action.label, header.actionLabel); assert.equal(close.label, header.closeLabel);
      assert.equal(action.source, 'app.media.' + DIALOG_ACTION_PRESENTATION.confirmIconKey);
      assert.equal(close.source, header.closeIcon);
      for (const button of [close, action]) {
        button.actionColor = themeColor;
        assert.equal(button.toolbarStyle, true);
        assert.equal(button.controlSize, dimensions.按钮高度);
        assert.equal(button.resolvedGlyphColor(), themeColor);
        assert.equal(button.resolvedSurface(), 'app.color.surface_card');
      }
      const previous = [actions, closes];
      action.activate(); close.activate();
      assert.deepEqual([actions, closes], previous.map(count => count + Number(available)));
    }
  }
  header.actionIcon = 'app.media.ic_home_new';
  header.actionEnabled = false;
  const customAction = Object.assign(new IconButton(), iconBindings[1].call(header, resource, DIALOG_ACTION_PRESENTATION));
  assert.equal(customAction.source, header.actionIcon);
  assert.equal(customAction.label, header.actionLabel);
  const before = actions;
  customAction.activate();
  assert.equal(actions, before, 'custom creation icons retain the existing disabled guard');
});

test('form input style applies real geometry/resources while leaving input behavior untouched', () => {
  let theme = 'light';
  const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
    应用尺寸: dimensions, $r: key => `${theme}:${key}`
  });
  const Style = loadPlatformModule('utils/FormInputStyle.ets', 'FormInputStyle', {
    应用尺寸: dimensions, $r: key => `${theme}:${key}`, SurfaceBorder
  });
  for (const padding of [undefined, dimensions.卡片内边距]) {
    const attributes = { type: 'password', text: 'draft', inputFilter: 'filter', enabled: false, onSubmit: 'handler' };
    const node = {};
    for (const name of ['width', 'height', 'fontSize', 'fontColor', 'placeholderColor', 'backgroundColor', 'border', 'borderRadius', 'padding']) {
      node[name] = value => { attributes[name] = value; return node; };
    }
    const style = padding === undefined ? new Style() : new Style(padding);
    for (theme of ['light', 'dark']) {
      style.applyNormalAttribute(node);
      assert.equal(attributes.width, '100%'); assert.equal(attributes.height, dimensions.按钮高度);
      assert.equal(attributes.fontSize, dimensions.字号_正文);
      assert.equal(attributes.borderRadius, dimensions.圆角_面板);
      assert.deepEqual(attributes.padding, { left: padding ?? dimensions.间距_10, right: padding ?? dimensions.间距_10 });
      assert.deepEqual(attributes.border, { width: dimensions.卡片边框, color: `${theme}:app.color.surface_border` });
      assert.equal(attributes.backgroundColor, `${theme}:app.color.surface_card`);
      assert.equal(attributes.fontColor, `${theme}:app.color.text_primary`);
      assert.equal(attributes.placeholderColor, `${theme}:app.color.text_tertiary`);
      assert.deepEqual([attributes.type, attributes.text, attributes.inputFilter, attributes.enabled, attributes.onSubmit],
        ['password', 'draft', 'filter', false, 'handler']);
    }
  }
});

test('image surfaces share theme resources without changing image or gesture geometry', () => {
  const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
    应用尺寸: dimensions, $r: resource
  });
  const Style = loadPlatformModule('utils/ImageSurfaceStyle.ets', 'ImageSurfaceStyle', {
    应用尺寸: dimensions, $r: resource, SurfaceBorder
  });
  const attributes = { width: 320, height: 210, padding: 0, onTouch: 'image-handler' }, node = {};
  for (const key of ['backgroundColor', 'border', 'borderRadius', 'clip']) {
    node[key] = value => { attributes[key] = value; return node; };
  }
  new Style().applyNormalAttribute(node);
  assert.equal(attributes.backgroundColor, 'app.color.surface_image');
  assert.deepEqual(attributes.border, { width: dimensions.卡片边框, color: 'app.color.border_image' });
  assert.equal(attributes.clip, true);
  assert.deepEqual([attributes.width, attributes.height, attributes.padding, attributes.onTouch], [320,210,0,'image-handler']);
  for (const file of ['components/common/NoteImagePreview.ets', 'components/图片遮罩编辑器.ets']) {
    assert.match(read(file), /attributeModifier\(new ImageSurfaceStyle\(\)\)/);
  }
  assert.match(read('pages/添加笔记页.ets'), /NoteImagePreview\(\{ source: this\.图片遮盖_源图Uri \}\)/);
  for (const theme of ['base', 'dark']) {
    const colors = JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${theme}/element/color.json`, import.meta.url), 'utf8')).color;
    const color = key => colors.find(item => item.name === key)?.value;
    assert.ok(color('surface_image')); assert.ok(color('border_image'));
    assert.notEqual(color('surface_image'), color('surface_page'));
    assert.notEqual(color('border_image'), color('border_subtle'));
  }
});

test('primary button callers preserve login readiness, secret validation and saving guards', () => {
  const sync = read('components/settings/同步分组.ets');
  assert.match(sync, /PrimaryActionButton\(\{[\s\S]*?isInteractive: this.serverLoaded && !this.登录中 && !this.settingsSaving && this.serverInput === this.savedServer/);
  assert.match(sync, /onAction:.*this.点击登录\(\)/);
  const developer = read('components/settings/开发者调试分组.ets');
  assert.match(developer, /isInteractive: !this.正在启用 && this.开发者密钥.trim\(\) !== ''/);
  assert.match(developer, /onAction:.*this.启用开发者功能\(\)/);
  const agent = read('components/settings/AIAgent设置分组.ets');
  assert.match(agent, /PrimaryActionButton\(\{[\s\S]*?isInteractive: this.canEdit\(\)/);
  assert.match(agent, /onAction:.*this.save\(\)/);
  for (const source of [agent, developer]) assert.match(source, /\.type\(InputType.Password\)/);
});

test('settings switches share geometry; help, hint and host failure states remain distinct', () => {
  for (const file of readdirSync(new URL('components/settings/', root)).filter(f => f.endsWith('.ets'))) {
    assert.doesNotMatch(read('components/settings/' + file), /Toggle\(\{ type: ToggleType.Switch/,
      `${file}: setting switches must use SettingsToggleRow`);
  }
  const row = read('components/common/SettingsToggleRow.ets');
  assert.match(row, /Row\(\{ space: 应用尺寸.间距_16 \}\)/);
  assert.match(row, /\.width\(40\)\s*\.height\(24\)\s*\.flexShrink\(0\)/);
  assert.match(row, /minHeight: 48/);
  assert.match(row, /this.hint === '' \? 0 : 应用尺寸.间距_12/g);
  assert.match(row, /if \(this.hint !== ''\)/);
  assert.match(row, /HelpLabel\(\{[\s\S]*?isHelpEnabled: this.isHelpEnabled, onHelp: this.onHelp/);
  assert.doesNotMatch(row.replace(/@StorageProp\('系统语言'\)[^;]*;/, ''), /@State|@Storage|margin\(|offset\(/);
  const scheduler = read('components/settings/调度器分组.ets');
  assert.match(scheduler, /if \(this.是否启用FSRS === null\)[\s\S]*settings_fsrs_loading[\s\S]*else \{\s*SettingsToggleRow/);
  assert.match(read('components/settings/外观分组.ets'), /ThemeMotionControl\(\{ isDark: this.是否深色 \}\)/);
});

test('all matching primary buttons and bordered single-line inputs have one style owner', () => {
  let primaryCalls = 0, inputCalls = 0;
  for (const path of readdirSync(root, { recursive: true }).filter(f => f.endsWith('.ets'))) {
    const file = path.replaceAll('\\', '/'), source = read(file);
    primaryCalls += (source.match(/PrimaryActionButton\(\{/g) ?? []).length;
    inputCalls += (source.match(/new FormInputStyle\(/g) ?? []).length;
    for (const target of arkuiClickTargets(source)) {
      if (target.kind !== 'Button') continue;
      assert.ok(!(target.modifiers.includes(".fontColor('#FFFFFF')") && target.modifiers.includes('.height(44)') &&
        target.modifiers.includes('.borderRadius(22)')), `${file}:${target.line}: copied primary action button`);
    }
    // 完整单行表单样式的散写；多行编辑和嵌入式/无边框搜索保留各自语义。
    assert.doesNotMatch(source,
      /\.height\(应用尺寸.按钮高度\)\s*\.fontSize\(应用尺寸.字号_正文\)\s*\.fontColor\(\$r\('app.color.text_primary'\)\)\s*(?:\.placeholderColor\(\$r\('app.color.text_tertiary'\)\)\s*)?\.backgroundColor\(\$r\('app.color.surface_card'\)\)\s*\.border\(\{ width: 应用尺寸.卡片边框, color: \$r\('app.color.border_input'\) \}\)\s*\.borderRadius\(应用尺寸.圆角_面板\)\s*\.padding\(\{ left: (?:应用尺寸\.(?:间距_10|卡片内边距)|10), right:/,
      `${file}: copied single-line form input style`);
  }
  assert.ok(primaryCalls >= 3); assert.ok(inputCalls >= 10);
});
