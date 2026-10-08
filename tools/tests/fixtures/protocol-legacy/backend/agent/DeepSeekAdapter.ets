// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ProviderTurnRequest } from '../../model/agent/ProviderProtocol';
import { buildResponsesPayload, buildResponsesUrl } from '../../model/agent/ProviderProtocol';
import { AgentStreamObserver, AgentStreamRequest, AgentTransportSession } from './AgentTransport';

const DEEPSEEK_BASE_URL: string = 'https://api.deepseek.com';

/** DeepSeek 内置适配器固定走其原生 Responses API，不接受设置页覆盖域名。 */
export class DeepSeekAdapter {
  /** @throws {Error} 请求编码失败交给会话层报告。 */
  /** @throws {Error} 请求校验失败上抛 Runner/页面，不发送无效载荷。 */
  createSession(request: ProviderTurnRequest, observer: AgentStreamObserver): AgentTransportSession {
    const streamRequest: AgentStreamRequest = {
      url: buildResponsesUrl(DEEPSEEK_BASE_URL),
      apiKey: request.apiKey,
      body: buildResponsesPayload(request)
    };
    return new AgentTransportSession(streamRequest, observer);
  }
}
