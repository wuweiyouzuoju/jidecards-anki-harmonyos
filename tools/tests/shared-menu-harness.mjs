// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { loadComponentLogic, loadPlatformSource } from './platform-module-harness.mjs';
import * as geometry from '../vendor/jide-foundation/src/core/MenuLayout.ts';
export const sharedSource = path => readFileSync(new URL('../vendor/jide-foundation/src/' + path, import.meta.url), 'utf8');
const {GLASS_POPUP_ENTER_MS,GLASS_MENU_ENTER_MS} = loadPlatformSource(sharedSource('core/GlassFusion.ts'), '({GLASS_POPUP_ENTER_MS,GLASS_MENU_ENTER_MS})', {});
export const menuTypes = loadPlatformSource(sharedSource('harmony/shared/MenuTypes.ets'),
  '({sharedMenuTheme,sharedMenuScope,SharedMenuTokens})', {});
export function loadSharedMenu(file, name, dependencies = {}) {
  return loadComponentLogic(new URL('../vendor/jide-foundation/src/harmony/shared/' + file, import.meta.url), name, {
    ...geometry, ...menuTypes, GLASS_POPUP_ENTER_MS,GLASS_MENU_ENTER_MS,
    Curve: {EaseOut: 'ease-out'}, TransitionEffect: {IDENTITY: {}},
    TextAlign: {Start:'start',Center:'center'}, ...dependencies
  });
}

/** Contract checks inspect both the product adapter and its actual shared rendering owner. */
export function menuPresentation(path, source) {
  const file = path.split('/').pop();
  const shared = {'AnchoredMenu.ets':'AnchoredMenu.ets','MenuItem.ets':'MenuItem.ets',
    'ActionMenuList.ets':'ActionMenuList.ets','GlassPanel.ets':'PopupPanel.ets','GlassBubblePanel.ets':'MenuBubble.ets'}[file];
  return shared === undefined ? source : source + '\n' + sharedSource('harmony/shared/' + shared);
}
