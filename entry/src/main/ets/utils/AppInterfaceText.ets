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
