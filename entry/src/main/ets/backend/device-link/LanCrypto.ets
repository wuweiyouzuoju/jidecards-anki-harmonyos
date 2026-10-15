// SPDX-License-Identifier: AGPL-3.0-or-later
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';
import { bytesHex, hexBytes, isPairingKey } from '../../model/device-link/DevicePairing';

export interface LanSealedMessage { id: string; pairing: boolean; iv: string; tag: string; data: string; }

/** @throws {Error} 系统随机源不可用时停止配对。 */
export async function linkRandom(length: number): Promise<string> {
  return bytesHex((await cryptoFramework.createRandom().generateRandom(length)).data);
}

/** 每次加密使用随机 IV；认证完成前不解析或发布解密结果。 */
export class LanCrypto {
  private key: cryptoFramework.SymKey;
  private base64: util.Base64Helper = new util.Base64Helper();
  private constructor(key: cryptoFramework.SymKey) { this.key = key; }

  /** @throws {Error} 无效密钥或平台密钥导入失败。 */
  static async create(secret: string): Promise<LanCrypto> {
    if (!isPairingKey(secret)) throw new Error('device_link_auth_failed');
    const key = await cryptoFramework.createSymKeyGenerator('AES256').convertKey({ data: hexBytes(secret) });
    return new LanCrypto(key);
  }

  /** @throws {Error} 加密失败时不发送明文。 */
  async seal(data: Uint8Array, aad: string, id: string, pairing: boolean): Promise<LanSealedMessage> {
    const iv = await cryptoFramework.createRandom().generateRandom(12);
    const params: cryptoFramework.GcmParamsSpec = { algName: 'GcmParamsSpec', iv,
      aad: { data: new util.TextEncoder().encodeInto(aad) }, authTag: { data: new Uint8Array(16) } };
    const cipher = cryptoFramework.createCipher('AES256|GCM|NoPadding');
    await cipher.init(cryptoFramework.CryptoMode.ENCRYPT_MODE, this.key, params);
    const encrypted = await cipher.update({ data });
    const tag = await cipher.doFinal(null);
    if (encrypted === null || tag === null || tag.data.length !== 16) throw new Error('device_link_encrypt_failed');
    return { id, pairing, iv: bytesHex(iv.data), tag: bytesHex(tag.data), data: this.base64.encodeToStringSync(encrypted.data) };
  }

  /** @throws {Error} 认证失败时不返回解密内容。 */
  async open(message: LanSealedMessage, aad: string): Promise<Uint8Array> {
    if (message === null || typeof message.iv !== 'string' || message.iv.length !== 24 ||
      typeof message.tag !== 'string' || message.tag.length !== 32 || typeof message.data !== 'string') {
      throw new Error('device_link_auth_failed');
    }
    const params: cryptoFramework.GcmParamsSpec = { algName: 'GcmParamsSpec', iv: { data: hexBytes(message.iv) },
      aad: { data: new util.TextEncoder().encodeInto(aad) }, authTag: { data: hexBytes(message.tag) } };
    const cipher = cryptoFramework.createCipher('AES256|GCM|NoPadding');
    await cipher.init(cryptoFramework.CryptoMode.DECRYPT_MODE, this.key, params);
    const plaintext = await cipher.update({ data: this.base64.decodeSync(message.data) });
    await cipher.doFinal(null);
    if (plaintext === null) throw new Error('device_link_auth_failed');
    return plaintext.data;
  }
}
