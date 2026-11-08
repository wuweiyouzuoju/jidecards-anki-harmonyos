// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { OFFICIAL_QQ_GROUP } from '../model/OfficialCommunity';
import { namedResourceText, showToastSafely } from './UiFeedback';

async function copyText(text: string): Promise<void> {
  await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text));
}

export async function copyOfficialQQGroup(ui: UIContext): Promise<void> {
  try {
    await copyText(OFFICIAL_QQ_GROUP);
    showToastSafely(ui, { message: $r('app.string.about_qq_group_copied') });
  } catch {
    showToastSafely(ui, { message: namedResourceText(ui, 'cloud_deck_qq_copy_failed').replace('%s', OFFICIAL_QQ_GROUP) });
  }
}

export async function openOfficialHelpLink(ui: UIContext, url: string): Promise<void> {
  const context = ui.getHostContext() as common.UIAbilityContext;
  try {
    await context.startAbility({ action: 'ohos.want.action.viewData', uri: url });
  } catch {
    try {
      await copyText(url);
      showToastSafely(ui, { message: $r('app.string.about_ankiweb_open_failed') });
    } catch {
      showToastSafely(ui, { message: url });
    }
  }
}
