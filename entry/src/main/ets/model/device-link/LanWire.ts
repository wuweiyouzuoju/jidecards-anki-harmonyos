// SPDX-License-Identifier: AGPL-3.0-or-later

export const LAN_FRAME_LIMIT: number = 256 * 1024;

/** TCP 不保留消息边界，先验证长度再分配接收缓冲区。 */
export class LanFrameReader {
  private header: Uint8Array = new Uint8Array(4);
  private headerSize: number = 0;
  private body: Uint8Array | null = null;
  private bodySize: number = 0;

  push(input: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    let offset = 0;
    while (offset < input.length) {
      if (this.body === null) {
        const count = Math.min(4 - this.headerSize, input.length - offset);
        this.header.set(input.subarray(offset, offset + count), this.headerSize);
        this.headerSize += count; offset += count;
        if (this.headerSize < 4) continue;
        const length = new DataView(this.header.buffer).getUint32(0, false);
        if (length === 0 || length > LAN_FRAME_LIMIT) throw new Error('device_link_frame_invalid');
        this.body = new Uint8Array(length); this.bodySize = 0;
      }
      const body = this.body;
      const count = Math.min(body.length - this.bodySize, input.length - offset);
      body.set(input.subarray(offset, offset + count), this.bodySize);
      this.bodySize += count; offset += count;
      if (this.bodySize === body.length) {
        frames.push(body); this.body = null; this.headerSize = 0;
      }
    }
    return frames;
  }

  hasPending(): boolean { return this.headerSize !== 0 || this.body !== null; }
}

export function lanFrame(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 0 || bytes.length > LAN_FRAME_LIMIT) throw new Error('device_link_frame_invalid');
  const result = new Uint8Array(bytes.length + 4);
  new DataView(result.buffer).setUint32(0, bytes.length, false);
  result.set(bytes, 4);
  return result;
}

export interface LinkChallenge { version: number; id: string; challenge: string; }
export interface LinkProof { id: string; name: string; recipient: string; challenge: string; nonce: string; pairing: boolean; }
export interface LinkProofReply { id: string; recipient: string; nonce: string; challenge: string; key?: string; }

export function verifyLinkProof(proof: LinkProof, recipient: string, challenge: string): void {
  if (proof === null || !/^[a-f0-9]{32}$/.test(proof.id) || proof.id === recipient ||
    typeof proof.name !== 'string' || proof.name.length < 1 || proof.name.length > 80 ||
    proof.recipient !== recipient || proof.challenge !== challenge ||
    !/^[a-f0-9]{32}$/.test(proof.nonce) || typeof proof.pairing !== 'boolean') {
    throw new Error('device_link_auth_failed');
  }
}

/** 对端需证明本次连接的新挑战，旧响应或其他设备响应不能完成再次连接。 */
export function verifyLinkReply(reply: LinkProofReply, peerId: string, ownId: string,
  challenge: string, nonce: string): void {
  if (reply === null || reply.id !== peerId || reply.recipient !== ownId ||
    reply.challenge !== challenge || reply.nonce !== nonce) throw new Error('device_link_auth_failed');
}
