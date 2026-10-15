// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { deviceInfo } from '@kit.BasicServicesKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { DEVICE_LINK_VERSION, DevicePairingState, PairedDevice, bytesHex,
  parsePairingState, rememberDevice, forgetDevice } from '../../model/device-link/DevicePairing';

/** 持久身份与配对密钥只有这个存储入口写入，不进入 JIDE 的状态快照。 */
export class DevicePairingStore {
  private context: common.UIAbilityContext;
  private static tail: Promise<void> = Promise.resolve();
  constructor(context: common.UIAbilityContext) { this.context = context; }

  /** @throws 存储失败或损坏需显示错误，禁止悄悄生成另一个设备身份。 */
  async read(): Promise<DevicePairingState> {
    const task = DevicePairingStore.tail.then(async (): Promise<DevicePairingState> => this.readCurrent());
    DevicePairingStore.tail = task.then((): void => {}, (): void => {});
    return task;
  }

  /** @throws {Error} 偏好读取、首次身份保存或随机源失败。 */
  private async readCurrent(): Promise<DevicePairingState> {
    const store = await preferences.getPreferences(this.context, { name: 'jidecards_device_link' });
    const saved = await store.get('pairings_v1', '');
    if (typeof saved !== 'string') throw new Error('device_link_storage_invalid');
    if (saved !== '') return parsePairingState(saved);
    const random = await cryptoFramework.createRandom().generateRandom(16);
    const name = (deviceInfo.marketName || deviceInfo.deviceType || 'JideCards').slice(0, 80);
    const state: DevicePairingState = { version: DEVICE_LINK_VERSION, identity: { id: bytesHex(random.data), name }, devices: [] };
    try {
      await store.put('pairings_v1', JSON.stringify(state));
      await store.flush();
    } catch (error) {
      await store.delete('pairings_v1');
      throw error instanceof Error ? error : new Error('device_link_save_failed');
    }
    return state;
  }

  /** @throws {Error} 保存失败由配对动作展示。 */
  remember(peer: PairedDevice): Promise<void> {
    return this.change((state: DevicePairingState): DevicePairingState => rememberDevice(state, peer));
  }

  /** @throws {Error} 撤销记录失败不得报告已取消配对。 */
  forget(id: string): Promise<void> {
    return this.change((state: DevicePairingState): DevicePairingState => forgetDevice(state, id));
  }

  /** @throws {Error} 个人设备写入授权必须持久保存成功才生效。 */
  allowProgress(id: string, allowed: boolean): Promise<void> {
    return this.change((state: DevicePairingState): DevicePairingState => {
      const peer = state.devices.find((item: PairedDevice): boolean => item.id === id);
      if (peer === undefined) throw new Error('device_link_not_paired');
      return rememberDevice(state, { id: peer.id, name: peer.name, key: peer.key, pairedAt: peer.pairedAt,
        allowProgress: allowed });
    });
  }

  /** @throws {Error} 串行提交失败返回调用者，后续任务仍可执行。 */
  private change(update: (state: DevicePairingState) => DevicePairingState): Promise<void> {
    const task = DevicePairingStore.tail.then(async (): Promise<void> => {
      const previous = await this.readCurrent();
      const next = update(previous);
      const store = await preferences.getPreferences(this.context, { name: 'jidecards_device_link' });
      try {
        await store.put('pairings_v1', JSON.stringify(next));
        await store.flush();
        if (await store.get('pairings_v1', '') !== JSON.stringify(next)) throw new Error('device_link_save_failed');
      } catch (error) {
        await store.put('pairings_v1', JSON.stringify(previous));
        throw error instanceof Error ? error : new Error('device_link_save_failed');
      }
    });
    DevicePairingStore.tail = task.catch((): void => {});
    return task;
  }
}
