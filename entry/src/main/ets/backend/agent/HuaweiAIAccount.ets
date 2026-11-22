// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { OfficialAIService } from './OfficialAIService';
import { showToastSafely } from '../../utils/UiFeedback';

let pendingLogin: Promise<boolean> | null = null;
/** Every AI entry shares this account boundary. Cancelling never opens AI or writes cards. */
export async function ensureHuaweiAIAccount(ui: UIContext): Promise<boolean> {
  if (pendingLogin !== null) return pendingLogin;
  const attempt: Promise<boolean> = authenticate(ui);
  pendingLogin = attempt;
  try { return await attempt; } finally { if (pendingLogin === attempt) pendingLogin = null; }
}
async function authenticate(ui: UIContext): Promise<boolean> {
  const service: OfficialAIService = new OfficialAIService();
  try {
    const token: string = await service.token();
    if (token !== '') {
      try { await service.request('/session', '{}', token); return true; }
      catch (error) {
        if ((error as Error).message !== 'login_required') throw new Error((error as Error).message);
      }
    }
    await service.login(ui.getHostContext() as common.UIAbilityContext, false);
    return true;
  } catch (error) {
    showToastSafely(ui, { message: $r('app.string.official_ai_account_gate_failed') });
    return false;
  }
}
