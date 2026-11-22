// SPDX-License-Identifier: AGPL-3.0-or-later
import { hilog } from '@kit.PerformanceAnalysisKit';
import type { ProviderTurnRequest } from '../../model/agent/ProviderProtocol';
import { buildResponsesPayload } from '../../model/agent/ProviderProtocol';
import { AgentStreamObserver, AgentStreamRequest, AgentTransportSession, AgentTransportError } from './AgentTransport';
import { OFFICIAL_AI_BASE } from './OfficialAIService';
import { prepareOfficialRequest, completeOfficialRequest } from './OfficialAIRequestStore';

class OfficialTransportSession extends AgentTransportSession {
  private originalPayload: string;
  private officialRequest: AgentStreamRequest;
  constructor(officialRequest: AgentStreamRequest, observer: AgentStreamObserver) {
    super(officialRequest, observer); this.officialRequest = officialRequest; this.originalPayload = officialRequest.body;
  }
  /** @throws {Error} 付费请求前先落盘幂等 ID，网络失败或重启后重试复用。 */
  async start(): Promise<void> {
    const identity = await prepareOfficialRequest(this.officialRequest.apiKey, this.originalPayload);
    this.officialRequest.body = this.originalPayload.slice(0, -1) + ',"request_id":"' + identity.id + '"}';
    let discard: boolean = false;
    try { await super.start(); discard = true; }
    catch (error) {
      discard = error instanceof AgentTransportError && error.kind === 'http' && error.statusCode !== 409;
      throw error as Error;
    } finally {
      if (discard) {
        try { await completeOfficialRequest(identity); }
        catch (error) { hilog.warn(0x4342, 'jidecards', 'Completed official AI request ID retained for safe replay'); }
      }
    }
  }
}
export class OfficialAIAdapter {
  /** @throws {Error} 编码失败由会话层显示。 */
  createSession(request: ProviderTurnRequest, observer: AgentStreamObserver): AgentTransportSession {
    const streamRequest: AgentStreamRequest = { url: OFFICIAL_AI_BASE + '/responses', apiKey: request.apiKey,
      body: buildResponsesPayload(request) };
    return new OfficialTransportSession(streamRequest, observer);
  }
}
