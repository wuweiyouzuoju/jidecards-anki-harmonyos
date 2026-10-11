// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { APP_INTERFACE_SURFACES, AppInterfaceItem } from '../model/AppInterface';
import { namedResourceText } from './UiFeedback';

export function interfaceItemTitleKey(surfaceId: string, itemId: string): string {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === surfaceId);
  const item = surface?.items.find((entry): boolean => entry.id === itemId);
  return item?.titleKey ?? '';
}

export function interfaceItemText(context: UIContext, surfaceId: string, itemId: string, _locale: string = ''): string {
  const key: string = interfaceItemTitleKey(surfaceId, itemId);
  return key === '' ? '[' + surfaceId + '/' + itemId + ']' : namedResourceText(context, key);
}

export function interfaceControlText(context: UIContext, items: AppInterfaceItem[], itemId: string, _locale: string = ''): string {
  const item = items.find((entry): boolean => entry.id === itemId);
  return item === undefined ? '[' + itemId + ']' : namedResourceText(context, item.titleKey);
}

/** ArkUI 资源必须显式引用；名称来源仍是共同界面声明。 */
export function interfaceIconResource(key: string): ResourceStr {
  switch (key) {
    case 'ic_common_arrow_left': return $r('app.media.ic_common_arrow_left');
    case 'ic_common_close': return $r('app.media.ic_common_close');
    case 'ic_home_more': return $r('app.media.ic_home_more');
    case 'ic_home_filtered_deck': return $r('app.media.ic_home_filtered_deck');
    case 'ic_home_new': return $r('app.media.ic_home_new');
    case 'ic_common_history': return $r('app.media.ic_common_history');
    case 'ic_mode_simple': return $r('app.media.ic_mode_simple');
    case 'ic_mode_experimental': return $r('app.media.ic_mode_experimental');
    default: return '';
  }
}

export function interfaceControlIcon(items: AppInterfaceItem[], itemId: string): ResourceStr {
  const item = items.find((entry): boolean => entry.id === itemId);
  return interfaceIconResource(item?.iconKey ?? '');
}
