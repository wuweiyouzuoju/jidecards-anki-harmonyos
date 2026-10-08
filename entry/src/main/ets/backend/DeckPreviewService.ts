// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckPreviewRpc } from '../proto/generated/PrivateRpc';
import { 后端会话 } from './后端会话';
import { DeckPreviewBackend, DeckPreviewScope } from '../model/DeckPreviewSession';
import { DECK_PREVIEW_SERVICE, encodeDeckPreviewRequest, decodeDeckPreviewIds } from '../proto/messages/DeckPreviewMessages';
import { syncActivity } from '../model/SyncSettings';
import { autoSyncScheduler } from '../model/AutoSyncScheduler';
/** 原生层隔离正式集合；本服务不选择牌组、不评分、不推进学习队列。 */
export class DeckPreviewService implements DeckPreviewBackend {
    /** @throws {Error} 集合重开、快照或解析失败交给首页显示；失败仍释放本次占用。 */
    async cardIds(deckId: string, scope: DeckPreviewScope, filesDir: string): Promise<number[]> {
        const request: Uint8Array = encodeDeckPreviewRequest(deckId, scope);
        // 页面取消只废弃显示结果，后台快照真实结束前仍阻止下一次自动同步。
        const operation: Object = {};
        autoSyncScheduler.beginOperation(operation);
        let stage: string = 'wait';
        try {
            await syncActivity.waitForCollection();
            stage = 'open';
            await 后端会话.获取实例().确保已打开(filesDir);
            stage = 'snapshot';
            const bytes: Uint8Array = await new DeckPreviewRpc(后端会话.获取实例()).ids(request);
            stage = 'decode';
            return decodeDeckPreviewIds(bytes);
        }
        catch (error) {
            console.info(`DeckPreview: deck=${deckId} scope=${scope} stage=${stage} error=${error}`);
            throw error;
        }
        finally {
            autoSyncScheduler.endOperation(operation);
        }
    }
}
