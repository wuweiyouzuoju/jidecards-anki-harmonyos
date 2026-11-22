// SPDX-License-Identifier: AGPL-3.0-or-later
import { socket } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { linkRandom } from '../device-link/LanCrypto';
import { LocalHttpFrame, LocalHttpRequest, LocalHttpReply, LocalMcpHost, LocalMcpProtocol,
  LOCAL_MCP_PORT, localMcpGuard } from '../../model/external-agent/LocalMcpProtocol';

/** 应用拥有监听生命周期；令牌不得写入日志或 AppInterface。 */
export class LocalMcpServer {
  private server: socket.TCPSocketServer | null = null;
  private clients: socket.TCPSocketConnection[] = [];
  private generation: number = 0;
  private secret: string = '';
  private readonly protocol: LocalMcpProtocol;
  private readonly onStopped: () => void;
  private readonly port: number;
  constructor(host: LocalMcpHost, onStopped: () => void = (): void => {}, port: number = LOCAL_MCP_PORT) {
    this.protocol = new LocalMcpProtocol(host); this.onStopped = onStopped; this.port = port;
  }
  /** @throws {Error} 随机源或监听失败由开启入口展示。 */
  async start(savedToken: string = ''): Promise<string> {
    if (this.server !== null) throw new Error('mcp_already_running');
    const generation: number = ++this.generation;
    const token: string = savedToken === '' ? await linkRandom(32) : savedToken;
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('invalid_mcp_token');
    if (generation !== this.generation) throw new Error('mcp_start_cancelled');
    const server: socket.TCPSocketServer = socket.constructTCPSocketServerInstance();
    this.server = server; this.secret = token;
    server.on('connect', (client: socket.TCPSocketConnection): void => {
      if (generation !== this.generation || this.clients.length >= 8) { client.close().catch((): void => {}); return; }
      this.accept(client, generation);
    });
    server.on('error', (): void => { this.stop(); });
    try {
      await server.listen({ address: '127.0.0.1', family: 1, port: this.port });
      if (generation !== this.generation) throw new Error('mcp_start_cancelled');
      return token;
    } catch (error) { this.stop(); throw error instanceof Error ? error : new Error('mcp_listen_failed'); }
  }
  stop(): void {
    this.generation++; this.secret = ''; this.onStopped();
    const server: socket.TCPSocketServer | null = this.server; this.server = null;
    for (const client of this.clients) client.close().catch((): void => {});
    this.clients = [];
    server?.close().catch((): void => {});
  }
  private accept(client: socket.TCPSocketConnection, generation: number): void {
    this.clients.push(client);
    const frame: LocalHttpFrame = new LocalHttpFrame();
    let submitted: boolean = false;
    const finish = (): void => {
      clearTimeout(timeout);
      this.clients = this.clients.filter((item: socket.TCPSocketConnection): boolean => item !== client);
      client.close().catch((): void => {});
    };
    const timeout: number = setTimeout(finish, 120000);
    client.on('close', (): void => { clearTimeout(timeout); this.clients = this.clients.filter((item): boolean => item !== client); });
    client.on('error', finish);
    client.on('message', (info: socket.SocketMessageInfo): void => {
      if (submitted || generation !== this.generation) return;
      try {
        const request: LocalHttpRequest | null = frame.push(new Uint8Array(info.message));
        if (request === null) return;
        submitted = true;
        this.respond(client, request, generation).catch((): void => {}).finally(finish);
      } catch (_error) {
        submitted = true;
        this.send(client, { status: 400, body: '' }).catch((): void => {}).finally(finish);
      }
    });
  }
  /** @throws {Error} 协议或发送失败，由连接入口 catch 后释放资源。 */
  private async respond(client: socket.TCPSocketConnection, request: LocalHttpRequest, generation: number): Promise<void> {
    const status: number = localMcpGuard(request, this.secret, this.port);
    if (status !== 200) { await this.send(client, { status: status, body: '' }); return; }
    let text: string;
    try { text = util.TextDecoder.create('utf-8', { fatal: true }).decodeToString(request.body); }
    catch (_error) { await this.send(client, { status: 400, body: '' }); return; }
    if (generation !== this.generation) return;
    const reply: LocalHttpReply = await this.protocol.handle(text);
    if (generation === this.generation) {
      await this.send(client, reply);
      // 页面导航可能销毁服务器，必须先把真实工具结果送给调用方。
      await reply.afterSend?.();
    }
  }
  /** @throws {Error} 连接已关闭，由 respond 调用边界释放连接。 */
  private async send(client: socket.TCPSocketConnection, reply: LocalHttpReply): Promise<void> {
    const encoder: util.TextEncoder = new util.TextEncoder();
    const body: Uint8Array = encoder.encodeInto(reply.body);
    const auth: string = reply.status === 401 ? 'WWW-Authenticate: Bearer realm="jidecards-local"\r\n' : '';
    const method: string = reply.status === 405 ? 'Allow: POST\r\n' : '';
    const header: Uint8Array = encoder.encodeInto(`HTTP/1.1 ${reply.status} Response\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${body.length}\r\nCache-Control: no-store\r\nConnection: close\r\n${auth}${method}\r\n`);
    const bytes: Uint8Array = new Uint8Array(header.length + body.length); bytes.set(header); bytes.set(body, header.length);
    await client.send({ data: bytes.buffer });
  }
}
