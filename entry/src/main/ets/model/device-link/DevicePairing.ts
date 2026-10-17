// SPDX-License-Identifier: AGPL-3.0-or-later

export const DEVICE_LINK_VERSION: number = 1;
export const DEVICE_LINK_SERVICE: string = '_jidecards._tcp';
export const PAIRING_PREFIX: string = 'jidecards:pair:';
export const PAIRING_LIFETIME: number = 5 * 60 * 1000;

export interface DeviceIdentity { id: string; name: string; }
export interface DeviceLinkCredential extends DeviceIdentity { key: string; }
export interface PairedDevice extends DeviceLinkCredential { pairedAt: number; allowProgress?: boolean; allowCollection?: boolean; }
export interface PairingInvitation extends DeviceLinkCredential { version: number; expiresAt: number; }
export interface DiscoveredDevice extends DeviceIdentity { address: string; port: number; }
export interface DevicePairingState { version: number; identity: DeviceIdentity; devices: PairedDevice[]; }

export function isDeviceId(value: string): boolean { return /^[a-f0-9]{32}$/.test(value); }
export function isPairingKey(value: string): boolean { return /^[a-f0-9]{64}$/.test(value); }

/** IP 是本次发现的连接位置；持久信任只绑定设备 ID 和配对密钥。 */
export function validDeviceIdentity(value: DeviceIdentity): boolean {
  return value !== null && typeof value.id === 'string' && isDeviceId(value.id) &&
    typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 80;
}

/** @throws 无效或过期的二维码不得创建信任记录。 */
export function parsePairingInvitation(input: string, selfId: string, now: number): PairingInvitation {
  if (!input.startsWith(PAIRING_PREFIX) || input.length > 2048) throw new Error('device_link_invalid_code');
  const value = JSON.parse(input.slice(PAIRING_PREFIX.length)) as PairingInvitation;
  if (value === null || value.version !== DEVICE_LINK_VERSION || !validDeviceIdentity(value) ||
    typeof value.key !== 'string' || !isPairingKey(value.key) ||
    !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now ||
    value.expiresAt > now + PAIRING_LIFETIME + 30000 || value.id === selfId) {
    throw new Error('device_link_invalid_code');
  }
  return { version: value.version, id: value.id, name: value.name, key: value.key, expiresAt: value.expiresAt };
}

export function pairingInvitation(identity: DeviceIdentity, key: string, now: number): PairingInvitation {
  if (!validDeviceIdentity(identity) || !isPairingKey(key)) throw new Error('device_link_invalid_identity');
  return { version: DEVICE_LINK_VERSION, id: identity.id, name: identity.name, key, expiresAt: now + PAIRING_LIFETIME };
}

export function invitationText(value: PairingInvitation): string { return PAIRING_PREFIX + JSON.stringify(value); }

/** @throws 损坏的持久记录必须报错，不能静默重建身份或丢弃已有配对。 */
export function parsePairingState(input: string): DevicePairingState {
  if (input.length > 256 * 1024) throw new Error('device_link_storage_invalid');
  const value = JSON.parse(input) as DevicePairingState;
  if (value === null || value.version !== DEVICE_LINK_VERSION || !validDeviceIdentity(value.identity) ||
    !Array.isArray(value.devices) || value.devices.length > 100) throw new Error('device_link_storage_invalid');
  const ids: string[] = [];
  for (const peer of value.devices) {
    if (!validDeviceIdentity(peer) || !isPairingKey(peer.key) || !Number.isSafeInteger(peer.pairedAt) ||
      peer.pairedAt < 0 || peer.id === value.identity.id || ids.includes(peer.id) ||
      (peer.allowProgress !== undefined && typeof peer.allowProgress !== 'boolean') ||
      (peer.allowCollection !== undefined && typeof peer.allowCollection !== 'boolean')) {
      throw new Error('device_link_storage_invalid');
    }
    ids.push(peer.id);
  }
  return value;
}

/** @throws {Error} 拒绝重复、损坏或超限的设备记录。 */
export function rememberDevice(state: DevicePairingState, peer: PairedDevice): DevicePairingState {
  const next: DevicePairingState = { version: DEVICE_LINK_VERSION, identity: state.identity,
    devices: state.devices.filter((item: PairedDevice): boolean => item.id !== peer.id).concat([peer]) };
  return parsePairingState(JSON.stringify(next));
}

export function forgetDevice(state: DevicePairingState, id: string): DevicePairingState {
  return { version: DEVICE_LINK_VERSION, identity: state.identity,
    devices: state.devices.filter((item: PairedDevice): boolean => item.id !== id) };
}

/** 发现名称不授予信任；连接后仍须以保存的密钥验证对端身份。 */
export function discoveryDevice(serviceName: string, address: string, port: number): DiscoveredDevice | null {
  const match = /^jide-([a-f0-9]{32})(?:[ (].*)?$/.exec(serviceName);
  if (match === null || typeof address !== 'string' || address.length === 0 || address.length > 128 ||
    !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { id: match[1], name: match[1].slice(0, 8), address, port };
}

export function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((value: number): string => value.toString(16).padStart(2, '0')).join('');
}

export function hexBytes(input: string): Uint8Array {
  if (input.length % 2 !== 0 || !/^[a-f0-9]*$/.test(input)) throw new Error('device_link_invalid_bytes');
  const result = new Uint8Array(input.length / 2);
  for (let index = 0; index < result.length; index++) result[index] = parseInt(input.slice(index * 2, index * 2 + 2), 16);
  return result;
}
