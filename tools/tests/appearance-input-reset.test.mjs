import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { materialHarness } from './surface-material-harness.mjs';
import * as elements from '../../entry/src/main/ets/model/AppearanceElements.ts';
import { validAccent } from '../../entry/src/main/ets/model/AppearanceCustomization.ts';

test('input modifiers change identity and repaint outlines when custom zero width is restored', () => {
  for (const material of ['flat', 'glass']) for (const dark of [false, true]) {
    const h = materialHarness(material, dark);
    const styles = [
      ['FormInputStyle', raw => [undefined, raw]],
      ['FormTextAreaStyle', raw => [raw]],
      ['SearchFieldSurface', raw => [material, dark, 12, '#123456', raw]],
      ['ImageSurfaceStyle', raw => [raw]]
    ];
    const hidden = JSON.stringify({...elements.defaultElementStyle(), width:0});
    const defaults = JSON.stringify(elements.defaultElementStyle());
    for (const [name, args] of styles) {
      const Style = loadPlatformModule('utils/' + name + '.ets', name, {...h, 应用尺寸:{间距_10:10,间距_8:8,卡片边框:1,圆角_面板:12}, insetMaterialFill:value=>value, themedGlassFill:value=>value});
      const state = {};
      const node = new Proxy({}, {get: (_, key) => value => {state[key] = value; return node;}});
      h.storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY, hidden);
      const before = new Style(...args(hidden));
      before.applyNormalAttribute(node);
      assert.equal(state.border.width, 0, name);
      h.storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY, defaults);
      const restored = new Style(...args(defaults));
      assert.notDeepEqual(restored, before, name + ' must invalidate the native modifier diff');
      restored.applyNormalAttribute(node);
      assert.ok(state.border.width > 0, name + ' restores a visible outline');
    }
  }
});

test('reset clears hidden line overrides and displays the actual mode and material defaults', () => {
  for (const material of ['flat', 'glass']) for (const dark of [false, true]) {
    for (const module of [false, true]) {
      const h = materialHarness(material, dark);
      h.AppStorage.delete = key => h.storage.delete(key);
      const custom = {...elements.defaultElementStyle(), width:0, moduleWidth:0, outline:'#123456', moduleOutline:'#234567'};
      h.storage.set(elements.APPEARANCE_ELEMENTS_KEY, elements.replaceElementStyle('', dark, custom));
      const Dialog = loadComponentLogic('components/settings/AppearanceElementDialog.ets', 'AppearanceElementDialog', {
        ...h, ...elements, validAccent, 应用颜色主题(){}, appInterface:{observe(){},leave(){}}
      });
      const dialog = new Dialog();
      dialog.mode = dark ? 'dark' : 'light';
      dialog.target = module ? 'appearance_module_outline' : 'appearance_outline';
      dialog.aboutToAppear();
      dialog.reset();
      assert.equal(dialog.draft[module ? 'moduleWidth' : 'width'], -1);
      assert.equal(dialog.draft[module ? 'moduleOutline' : 'outline'], '');
      assert.equal(dialog.widthDraft, module ? (dark ? (material === 'glass' ? 0.8 : 1) : 0) :
        material === 'glass' ? h.SurfaceBorder.glassOutlineWidth(dark) : 1);
      dialog.aboutToDisappear();
    }
  }
});

test('control thickness cycles never change module borders or enable borderless controls', () => {
  for (const material of ['glass','flat']) for (const dark of [false,true]) {
    const h = materialHarness(material,dark);
    const baseModule = h.SurfaceBorder.contentOptions(material,dark).width;
    const attrs = {};
    const node = new Proxy({}, {get: (_,key) => value => {attrs[key]=value;return node;}});
    for (const width of [0,3,1,-1]) {
      const raw = JSON.stringify({...elements.defaultElementStyle(),width,outline:'#604050'});
      h.storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,raw);
      assert.equal(h.SurfaceBorder.contentOptions(material,dark).width,baseModule);
      assert.equal(h.SurfaceBorder.options().width,width < 0 ? 1 : width);
      if (!dark) assert.equal(h.SurfaceBorder.controlOptions(material,dark).width,0);
      h.SeriesVisual.surfaceFor(material,dark,'#123456').applyNormalAttribute(node);
      assert.equal(attrs.border.width,baseModule);
    }
    h.storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,JSON.stringify({
      ...elements.defaultElementStyle(),width:0,moduleWidth:3,moduleOutline:'#234567'
    }));
    assert.equal(h.SurfaceBorder.options().width,0);
    h.SeriesVisual.surfaceFor(material,dark,'#123456').applyNormalAttribute(node);
    assert.equal(attrs.border.width,3,'an explicit module adjustment is independent from the input width');
    h.storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,JSON.stringify(elements.defaultElementStyle()));
    h.SeriesVisual.surfaceFor(material,dark,'#123456').applyNormalAttribute(node);
    assert.equal(attrs.border.width,baseModule,'restoring module defaults removes its custom outline');
  }
});

test('legacy input-only customization does not create module geometry', () => {
  const old = {...elements.defaultElementStyle(),width:3,radius:9};
  delete old.moduleWidth;
  delete old.moduleRadius;
  const restored = elements.parseElementStyle(JSON.stringify(old));
  assert.equal(restored.width,3);
  assert.equal(restored.moduleWidth,-1);
  assert.equal(restored.moduleRadius,-1);
});
