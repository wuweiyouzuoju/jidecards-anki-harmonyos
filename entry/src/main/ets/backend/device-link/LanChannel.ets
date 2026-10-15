// SPDX-License-Identifier: AGPL-3.0-or-later
import { socket } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { LanFrameReader, lanFrame } from '../../model/device-link/LanWire';

interface LanSocketAdapter {
  send(data: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
  listen(message: (bytes: ArrayBuffer) => void, closed: () => void): void;
}

interface LanPendingRead {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: number;
}

class AcceptedLanSocket implements LanSocketAdapter {
  private connection: socket.TCPSocketConnection;
  constructor(connection: socket.TCPSocketConnection) { this.connection = connection; }
  /** @throws {Error} 发送失败由连接动作结束任务。 */
  async send(data: ArrayBuffer): Promise<void> {
    const options: socket.TCPSendOptions = { data }; await this.connection.send(options);
  }
  /** @throws {Error} 原生关闭错误由连接清理处理。 */
  async close(): Promise<void> { await this.connection.close(); }
  listen(message: (bytes: ArrayBuffer) => void, closed: () => void): void {
    this.connection.on('message', (info: socket.SocketMessageInfo): void => { message(info.message); });
    this.connection.on('close', closed); this.connection.on('error', closed);
  }
}

class ClientLanSocket implements LanSocketAdapter {
  private connection: socket.TCPSocket;
  constructor(connection: socket.TCPSocket) { this.connection = connection; }
  /** @throws {Error} 发送失败由连接动作结束任务。 */
  async send(data: ArrayBuffer): Promise<void> {
    const options: socket.TCPSendOptions = { data }; await this.connection.send(options);
  }
  /** @throws {Error} 原生关闭错误由连接清理处理。 */
  async close(): Promise<void> { await this.connection.close(); }
  listen(message: (bytes: ArrayBuffer) => void, closed: () => void): void {
    this.connection.on('message', (info: socket.SocketMessageInfo): void => { message(info.message); });
    this.connection.on('close', closed); this.connection.on('error', closed);
  }
}

/** 连接拥有帧缓冲和等待者；关闭、超时和错误都结束等待，避免悬挂任务。 */
export class LanChannel {
  private adapter: LanSocketAdapter;
  private reader: LanFrameReader = new LanFrameReader();
  private texts: string[] = [];
  private pending: LanPendingRead | null = null;
  private closed: boolean = false;
  private closing: Promise<void> | null = null;
  private encoder: util.TextEncoder = new util.TextEncoder();
  private decoder: util.TextDecoder = util.TextDecoder.create('utf-8', { fatal: true });

  private constructor(adapter: LanSocketAdapter) {
    this.adapter = adapter;
    adapter.listen((bytes: ArrayBuffer): void => {
      try {
        for (const frame of this.reader.push(new Uint8Array(bytes))) {
          const text = this.decoder.decodeToString(frame, { stream: false });
          if (this.pending !== null) {
            const pending = this.pending; this.pending = null;
            clearTimeout(pending.timer); pending.resolve(text);
          } else {
            if (this.texts.length >= 8) throw new Error('device_link_frame_invalid');
            this.texts.push(text);
          }
        }
      } catch (error) { this.fail(); }
    }, (): void => { this.fail(); });
  }

  static accepted(connection: socket.TCPSocketConnection): LanChannel {
    return new LanChannel(new AcceptedLanSocket(connection));
  }

  static async connect(address: string, port: number): Promise<LanChannel> {
    const client = socket.constructTCPSocketInstance();
    const channel = new LanChannel(new ClientLanSocket(client));
    try {
      await client.bind({ address: address.includes(':') ? '::' : '0.0.0.0', family: address.includes(':') ? 2 : 1, port: 0 });
      await client.connect({ address: { address, family: address.includes(':') ? 2 : 1, port }, timeout: 10000 });
      return channel;
    } catch (error) { await channel.close(); throw new Error('device_link_connect_failed'); }
  }

  async send(text: string): Promise<void> {
    if (this.closed) throw new Error('device_link_connect_failed');
    const bytes = lanFrame(this.encoder.encodeInto(text));
    await this.adapter.send(bytes.buffer as ArrayBuffer);
  }

  async read(timeout: number = 15000): Promise<string> {
    if (this.texts.length > 0) return this.texts.shift()!;
    if (this.closed || this.pending !== null) throw new Error('device_link_connect_failed');
    return new Promise<string>((resolve: (text: string) => void, reject: (error: Error) => void): void => {
      const timer = setTimeout((): void => { this.fail(); }, timeout);
      this.pending = { resolve, reject, timer };
    });
  }

  private fail(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.pending !== null) {
      const pending = this.pending; this.pending = null;
      clearTimeout(pending.timer); pending.reject(new Error('device_link_connect_failed'));
    }
    this.closing = this.adapter.close().catch((): void => {});
  }

  async close(): Promise<void> { this.fail(); if (this.closing !== null) await this.closing; }
}
