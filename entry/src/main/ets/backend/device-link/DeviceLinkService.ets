// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { mdns, socket } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { DevicePairingStore } from './DevicePairingStore';
import { LanChannel } from './LanChannel';
import { LanCrypto, LanSealedMessage, linkRandom } from './LanCrypto';
import { DEVICE_LINK_VERSION, DEVICE_LINK_SERVICE, DeviceIdentity, PairedDevice, PairingInvitation,
  DeviceLinkCredential, DiscoveredDevice, discoveryDevice, pairingInvitation, invitationText, parsePairingInvitation, isDeviceId, isPairingKey } from '../../model/device-link/DevicePairing';
import { LinkChallenge, LinkProof, LinkProofReply, verifyLinkProof, verifyLinkReply } from '../../model/device-link/LanWire';
import { ProgressConnection, ProgressStore, ProgressMergeResult, PROGRESS_REQUEST,
  mergeProgressClient, mergeProgressServer, progressError } from '../../model/device-link/ProgressSync';

export interface DevicePeerView { id: string; name: string; online: boolean; allowProgress: boolean; }
export interface DeviceProgressView { id: string; phase: string; error: string; addedReviews: number; updatedCards: number; }
export interface DeviceLinkSnapshot { ready: boolean; peers: DevicePeerView[]; invitation: string; connectedId: string;
  progressBusy: boolean; progress: DeviceProgressView[]; }
interface FoundService { peer: DiscoveredDevice; service: mdns.LocalServiceInfo; }
interface AuthenticationResult { connection: TrustedLanConnection; key: string; }
interface ProgressFailure { kind: string; error: string; }

/** 认证会话有独立的双向顺序号；配对密钥不进入发现信息或普通状态快照。 */
export class TrustedLanConnection implements ProgressConnection {
  peerId: string;
  private ownId: string;
  private channel: LanChannel;
  private crypto: LanCrypto;
  private context: string;
  private sent: number = 0;
  private received: number = 0;
  private encoder: util.TextEncoder = new util.TextEncoder();
  private decoder: util.TextDecoder = util.TextDecoder.create('utf-8', { fatal: true });
  constructor(channel: LanChannel, crypto: LanCrypto, ownId: string, peerId: string, context: string) {
    this.channel = channel; this.crypto = crypto; this.ownId = ownId; this.peerId = peerId; this.context = context;
  }
  /** @throws {Error} 传输或认证加密失败。 */
  async send(text: string): Promise<void> {
    await this.sendData(this.encoder.encodeInto(text));
  }
  /** @throws {Error} 每个二进制块直接认证加密，不另作文本内容编码。 */
  async sendData(bytes: Uint8Array): Promise<void> {
    const aad = `${this.context}:${this.ownId}:${this.sent}`;
    const envelope = await this.crypto.seal(bytes, aad, this.ownId, false);
    await this.channel.send(JSON.stringify(envelope)); this.sent++;
  }
  /** @throws {Error} 超时、乱序或内容认证失败。 */
  async read(): Promise<string> {
    return this.decoder.decodeToString(await this.readData(), { stream: false });
  }
  /** @throws {Error} 有限等待允许 Core 导出和文件哈希，断连仍立即结束。 */
  async readData(): Promise<Uint8Array> {
    const envelope = JSON.parse(await this.channel.read(120000)) as LanSealedMessage;
    if (envelope.id !== this.peerId || envelope.pairing !== false) throw new Error('device_link_auth_failed');
    const bytes = await this.crypto.open(envelope, `${this.context}:${this.peerId}:${this.received}`);
    this.received++;
    return bytes;
  }
  async close(): Promise<void> { await this.channel.close(); }
}

/** 设备连接宿主，页面只订阅状态和提交动作。 */
export class DeviceLinkService {
  private context: common.UIAbilityContext;
  private store: DevicePairingStore;
  private identity: DeviceIdentity | null = null;
  private server: socket.TCPSocketServer | null = null;
  private advertised: mdns.LocalServiceInfo | null = null;
  private discovery: mdns.DiscoveryService | null = null;
  private found: FoundService[] = [];
  private invitation: PairingInvitation | null = null;
  private invitationUsed: boolean = false;
  private observers: Array<(snapshot: DeviceLinkSnapshot) => void> = [];
  private peers: DevicePeerView[] = [];
  private connectedId: string = '';
  private generation: number = 0;
  private starting: Promise<void> | null = null;
  private channels: LanChannel[] = [];
  private progressFactory: (() => ProgressStore) | null;
  private progress: DeviceProgressView[] = [];
  private progressBusy: boolean = false;
  private activeProgress: TrustedLanConnection | null = null;
  private batchCancelled: boolean = false;
  private encoder: util.TextEncoder = new util.TextEncoder();
  private decoder: util.TextDecoder = util.TextDecoder.create('utf-8', { fatal: true });

  constructor(context: common.UIAbilityContext, progressFactory: (() => ProgressStore) | null = null) {
    this.context = context; this.store = new DevicePairingStore(context); this.progressFactory = progressFactory;
  }

  subscribe(observer: (snapshot: DeviceLinkSnapshot) => void): () => void {
    this.observers.push(observer); observer(this.snapshot());
    return (): void => { this.observers = this.observers.filter((item): boolean => item !== observer); };
  }

  snapshot(): DeviceLinkSnapshot {
    return { ready: this.advertised !== null, peers: this.peers.map((peer: DevicePeerView): DevicePeerView =>
      ({ id: peer.id, name: peer.name, online: peer.online, allowProgress: peer.allowProgress })),
      invitation: this.invitation === null || this.invitation.expiresAt <= Date.now() ? '' : invitationText(this.invitation),
      connectedId: this.connectedId, progressBusy: this.progressBusy,
      progress: this.progress.map((item: DeviceProgressView): DeviceProgressView => ({ id: item.id, phase: item.phase,
        error: item.error, addedReviews: item.addedReviews, updatedCards: item.updatedCards })) };
  }

  private publish(): void { const state = this.snapshot(); for (const observer of this.observers) observer(state); }

  /** @throws {Error} 发现或监听启动失败交给动作宿主。 */
  async start(): Promise<void> {
    if (this.advertised !== null) return;
    if (this.starting !== null) return this.starting;
    const generation = ++this.generation;
    this.starting = this.open(generation).finally((): void => { this.starting = null; });
    return this.starting;
  }

  /** @throws {Error} 启动失败时释放本次监听与发现资源。 */
  private async open(generation: number): Promise<void> {
    const state = await this.store.read();
    if (generation !== this.generation) throw new Error('device_link_cancelled');
    this.identity = state.identity;
    await this.refreshPeers();
    const server = socket.constructTCPSocketServerInstance();
    this.server = server;
    server.on('connect', (connection: socket.TCPSocketConnection): void => {
      if (generation !== this.generation || this.channels.length >= 8) { connection.close().catch((): void => {}); return; }
      const channel = LanChannel.accepted(connection); this.channels.push(channel);
      this.accept(channel).catch((): void => {}).finally((): void => {
        this.channels = this.channels.filter((item: LanChannel): boolean => item !== channel);
        channel.close().catch((): void => {});
      });
    });
    server.on('error', (): void => { this.stop().catch((): void => {}); });
    try {
      await server.listen({ address: '0.0.0.0', family: 1, port: 0 });
      const address = await server.getLocalAddress();
      if (generation !== this.generation) throw new Error('device_link_cancelled');
      const service: mdns.LocalServiceInfo = { serviceType: DEVICE_LINK_SERVICE,
        serviceName: 'jide-' + state.identity.id, port: address.port,
        serviceAttribute: [{ key: 'name', value: Array.from(this.encoder.encodeInto(state.identity.name)) }] };
      const advertised = await mdns.addLocalService(this.context, service);
      if (generation !== this.generation) { await mdns.removeLocalService(this.context, advertised); throw new Error('device_link_cancelled'); }
      this.advertised = advertised;
      const discovery = mdns.createDiscoveryService(this.context, DEVICE_LINK_SERVICE);
      this.discovery = discovery;
      discovery.on('serviceFound', (service: mdns.LocalServiceInfo): void => {
        this.resolve(service, generation).catch((): void => {});
      });
      discovery.on('serviceLost', (service: mdns.LocalServiceInfo): void => {
        if (generation !== this.generation) return;
        this.found = this.found.filter((item: FoundService): boolean => item.service.serviceName !== service.serviceName);
        this.refreshPeers().catch((): void => {});
      });
      discovery.startSearchingMDNS(); this.publish();
    } catch (error) { await this.stop(); throw error instanceof Error ? error : new Error('device_link_start_failed'); }
  }

  /** @throws {Error} 单次发现解析失败不产生可信记录。 */
  private async resolve(service: mdns.LocalServiceInfo, generation: number): Promise<void> {
    const resolved = await mdns.resolveLocalService(this.context, service);
    if (generation !== this.generation || resolved.host === undefined) return;
    const peer = discoveryDevice(resolved.serviceName, resolved.host.address, resolved.port);
    if (peer === null || peer.id === this.identity?.id) return;
    const name = resolved.serviceAttribute?.find((attribute: mdns.ServiceAttribute): boolean => attribute.key === 'name');
    if (name !== undefined && name.value.length <= 240) {
      const text = this.decoder.decodeToString(new Uint8Array(name.value), { stream: false });
      if (text.length > 0 && text.length <= 80) peer.name = text;
    }
    this.found = this.found.filter((item: FoundService): boolean => item.peer.id !== peer.id);
    this.found.push({ peer, service: resolved }); await this.refreshPeers();
  }

  /** @throws {Error} 配对存储失败不得发布空的替代记录。 */
  private async refreshPeers(): Promise<void> {
    const state = await this.store.read();
    this.peers = state.devices.map((peer: PairedDevice): DevicePeerView =>
      ({ id: peer.id, name: peer.name, online: this.found.some((item: FoundService): boolean => item.peer.id === peer.id),
        allowProgress: peer.allowProgress === true }));
    this.publish();
  }

  /** @throws {Error} 监听与随机密钥准备失败时不显示二维码。 */
  async createInvitation(): Promise<void> {
    await this.start();
    if (this.identity === null) throw new Error('device_link_start_failed');
    this.invitation = pairingInvitation(this.identity, await linkRandom(32), Date.now());
    this.invitationUsed = false; this.publish();
  }

  /** @throws {Error} 持久配对撤销失败。 */
  async forget(id: string): Promise<void> {
    await this.store.forget(id); if (this.connectedId === id) this.connectedId = '';
    await this.refreshPeers();
  }

  /** @throws {Error} 写入授权只在持久化成功后发布。 */
  async allowProgress(id: string, allowed: boolean): Promise<void> {
    if (this.progressBusy) throw new Error('device_progress_busy');
    await this.store.allowProgress(id, allowed); await this.refreshPeers();
  }

  private progressState(id: string, phase: string, error: string = '', result: ProgressMergeResult | null = null): void {
    this.progress = this.progress.filter((item: DeviceProgressView): boolean => item.id !== id);
    this.progress.push({ id, phase, error, addedReviews: result?.addedReviews ?? 0, updatedCards: result?.updatedCards ?? 0 });
    this.publish();
  }

  /** @throws {Error} 两端实际提交和确认后才报告学习记录合并完成。 */
  async mergeProgress(id: string): Promise<void> {
    if (this.progressBusy) throw new Error('device_progress_busy');
    this.progressBusy = true; this.batchCancelled = false; this.publish();
    try { await this.mergeOne(id); } finally { this.progressBusy = false; this.publish(); }
  }

  /** @throws {Error} 补拉直到整轮两端均无变化，最多五轮；每台结果独立。 */
  async mergeAllProgress(): Promise<void> {
    if (this.progressBusy) throw new Error('device_progress_busy');
    const peers = this.peers.filter((peer: DevicePeerView): boolean => peer.allowProgress && peer.online);
    if (peers.length === 0) throw new Error('device_progress_not_allowed');
    this.progressBusy = true; this.batchCancelled = false; this.publish();
    const failed: string[] = [];
    try {
      for (let round = 0; round < 5; round++) {
        let changes: number = 0;
        for (const peer of peers) {
          if (this.batchCancelled) throw new Error('device_progress_cancelled');
          if (failed.includes(peer.id)) continue;
          try { changes += await this.mergeOne(peer.id, round > 0); }
          catch (error) {
            if (this.batchCancelled) throw new Error('device_progress_cancelled');
            failed.push(peer.id);
          }
        }
        if (changes === 0) {
          if (failed.length > 0) throw new Error('device_progress_some_failed');
          return;
        }
      }
      if (failed.length > 0) throw new Error('device_progress_some_failed');
      throw new Error('device_progress_not_converged');
    } finally { this.progressBusy = false; this.publish(); }
  }

  /** @throws {Error} 取消网络等待；已进入 Core 的事务完成后才释放集合。 */
  async cancelProgress(): Promise<void> {
    this.batchCancelled = true;
    await this.activeProgress?.close();
  }

  /** @throws {Error} 认证、文件校验或 Core 冲突失败保留每台设备的结果。 */
  private async mergeOne(id: string, accumulate: boolean = false): Promise<number> {
    const state = await this.store.read();
    const peer = state.devices.find((item: PairedDevice): boolean => item.id === id);
    if (peer?.allowProgress !== true || this.progressFactory === null) throw new Error('device_progress_not_allowed');
    const previous = accumulate ? this.progress.find((item: DeviceProgressView): boolean => item.id === id) : undefined;
    this.progressState(id, 'running');
    let connection: TrustedLanConnection | null = null;
    try {
      connection = await this.connect(id); this.activeProgress = connection;
      if (this.batchCancelled) throw new Error('device_progress_cancelled');
      const result = await mergeProgressClient(connection, this.progressFactory());
      const total: ProgressMergeResult = { addedReviews: result.addedReviews + (previous?.addedReviews ?? 0),
        updatedCards: result.updatedCards + (previous?.updatedCards ?? 0) };
      this.connectedId = id; this.progressState(id, 'done', '', total);
      return result.addedReviews + result.updatedCards + result.remoteAddedReviews + result.remoteUpdatedCards;
    } catch (error) {
      const key = this.batchCancelled ? 'device_progress_cancelled' : progressError(error instanceof Error ? error : new Error('device_progress_failed'));
      this.progressState(id, 'failed', key); throw new Error(key);
    } finally { await connection?.close(); this.activeProgress = null; }
  }

  /** @throws {Error} 未找到、解析失败或已停止的连接请求。 */
  private async findPeer(id: string): Promise<DiscoveredDevice> {
    const generation = this.generation;
    for (let attempt = 0; attempt < 20; attempt++) {
      const item = this.found.find((entry: FoundService): boolean => entry.peer.id === id);
      if (item !== undefined) {
        const service = await mdns.resolveLocalService(this.context, item.service);
        if (service.host !== undefined) {
          const current = discoveryDevice(service.serviceName, service.host.address, service.port);
          if (current !== null && current.id === id) return current;
        }
      }
      if (generation !== this.generation) throw new Error('device_link_cancelled');
      await new Promise<void>((resolve: () => void): void => { setTimeout(resolve, 500); });
    }
    throw new Error('device_link_not_found');
  }

  /** @throws {Error} 扫码验证、对端认证或持久记录提交失败。 */
  async pair(input: string): Promise<void> {
    await this.start();
    if (this.identity === null) throw new Error('device_link_start_failed');
    const invitation = parsePairingInvitation(input, this.identity.id, Date.now());
    const result = await this.authenticate(invitation, true);
    const connection = result.connection;
    try {
      await this.store.remember({ id: invitation.id, name: invitation.name, key: result.key, pairedAt: Date.now() });
      await connection.send('ping');
      if (await connection.read() !== 'pong') throw new Error('device_link_auth_failed');
      await this.refreshPeers();
    } finally { await connection.close(); }
  }

  /** @throws {Error} 缺少配对记录或本次连接无法认证。 */
  async connect(id: string): Promise<TrustedLanConnection> {
    await this.start();
    const state = await this.store.read();
    const peer = state.devices.find((item: PairedDevice): boolean => item.id === id);
    if (peer === undefined) throw new Error('device_link_not_paired');
    return (await this.authenticate(peer, false)).connection;
  }

  /** @throws {Error} 真实往返失败时不得显示验证成功。 */
  async checkConnection(id: string): Promise<void> {
    const connection = await this.connect(id);
    try {
      await connection.send('ping');
      if (await connection.read() !== 'pong') throw new Error('device_link_auth_failed');
      this.connectedId = id; this.publish();
    } finally { await connection.close(); }
  }

  /** @throws {Error} 任何证明失败都会关闭连接。 */
  private async authenticate(peer: DeviceLinkCredential, pairing: boolean): Promise<AuthenticationResult> {
    if (this.identity === null) throw new Error('device_link_start_failed');
    const own = this.identity;
    const found = await this.findPeer(peer.id);
    const channel = await LanChannel.connect(found.address, found.port);
    try {
      const challenge = JSON.parse(await channel.read()) as LinkChallenge;
      if (challenge.version !== DEVICE_LINK_VERSION || challenge.id !== peer.id ||
        typeof challenge.challenge !== 'string' || challenge.challenge.length !== 64) throw new Error('device_link_auth_failed');
      const crypto = await LanCrypto.create(peer.key);
      const nonce = await linkRandom(16);
      const proof: LinkProof = { id: own.id, name: own.name, recipient: peer.id, challenge: challenge.challenge, nonce, pairing };
      const envelope = await crypto.seal(this.encoder.encodeInto(JSON.stringify(proof)), 'proof:' + peer.id + ':' + challenge.challenge, own.id, pairing);
      await channel.send(JSON.stringify(envelope));
      const replyEnvelope = JSON.parse(await channel.read()) as LanSealedMessage;
      if (replyEnvelope.id !== peer.id) throw new Error('device_link_auth_failed');
      const replyBytes = await crypto.open(replyEnvelope, 'reply:' + own.id + ':' + challenge.challenge);
      const reply = JSON.parse(this.decoder.decodeToString(replyBytes, { stream: false })) as LinkProofReply;
      verifyLinkReply(reply, peer.id, own.id, challenge.challenge, nonce);
      if (pairing && !isPairingKey(reply.key ?? '')) throw new Error('device_link_auth_failed');
      return { connection: new TrustedLanConnection(channel, crypto, own.id, peer.id, challenge.challenge + ':' + nonce),
        key: pairing ? reply.key! : peer.key };
    } catch (error) { await channel.close(); throw new Error('device_link_auth_failed'); }
  }

  /** @throws {Error} 未获配对授权或密钥验证失败时拒绝会话。 */
  private async accept(channel: LanChannel): Promise<void> {
    if (this.identity === null) throw new Error('device_link_start_failed');
    const own = this.identity;
    const challenge = await linkRandom(32);
    const greeting: LinkChallenge = { version: DEVICE_LINK_VERSION, id: own.id, challenge };
    await channel.send(JSON.stringify(greeting));
    const envelope = JSON.parse(await channel.read()) as LanSealedMessage;
    if (!isDeviceId(envelope.id) || typeof envelope.pairing !== 'boolean') throw new Error('device_link_auth_failed');
    const state = await this.store.read();
    const invitation = this.invitation;
    const peer = state.devices.find((item: PairedDevice): boolean => item.id === envelope.id);
    const key = envelope.pairing ? (invitation !== null && !this.invitationUsed && invitation.expiresAt > Date.now() ? invitation.key : '') : (peer?.key ?? '');
    const crypto = await LanCrypto.create(key);
    const bytes = await crypto.open(envelope, 'proof:' + own.id + ':' + challenge);
    const proof = JSON.parse(this.decoder.decodeToString(bytes, { stream: false })) as LinkProof;
    verifyLinkProof(proof, own.id, challenge);
    if (proof.id !== envelope.id || proof.pairing !== envelope.pairing) throw new Error('device_link_auth_failed');
    let persistentKey: string = '';
    if (proof.pairing) {
      if (this.invitationUsed || invitation !== this.invitation) throw new Error('device_link_auth_failed');
      this.invitationUsed = true;
      try {
        persistentKey = await linkRandom(32);
        await this.store.remember({ id: proof.id, name: proof.name, key: persistentKey, pairedAt: Date.now() });
      }
      catch (error) { this.invitationUsed = false; throw error instanceof Error ? error : new Error('device_link_save_failed'); }
      this.invitation = null; await this.refreshPeers();
    }
    const reply: LinkProofReply = { id: own.id, recipient: proof.id, challenge, nonce: proof.nonce, key: persistentKey };
    await channel.send(JSON.stringify(await crypto.seal(this.encoder.encodeInto(JSON.stringify(reply)),
      'reply:' + proof.id + ':' + challenge, own.id, false)));
    const connection = new TrustedLanConnection(channel, crypto, own.id, proof.id, challenge + ':' + proof.nonce);
    const request = await connection.read();
    if (request === 'ping') { await connection.send('pong'); return; }
    if (request !== PROGRESS_REQUEST) throw new Error('device_link_request_invalid');
    const current = await this.store.read();
    const allowed = current.devices.find((item: PairedDevice): boolean => item.id === proof.id)?.allowProgress === true;
    if (!allowed || this.progressFactory === null || this.progressBusy) {
      const failure: ProgressFailure = { kind: 'error', error: allowed ? 'device_progress_busy' : 'device_progress_not_allowed' };
      await connection.send(JSON.stringify(failure));
      return;
    }
    this.progressBusy = true; this.activeProgress = connection; this.batchCancelled = false;
    this.progressState(proof.id, 'running');
    try {
      const result = await mergeProgressServer(connection, this.progressFactory());
      this.progressState(proof.id, 'done', '', result);
    } catch (error) {
      this.progressState(proof.id, 'failed', progressError(error instanceof Error ? error : new Error('device_progress_failed')));
    } finally { this.activeProgress = null; this.progressBusy = false; this.publish(); }
  }

  /** @throws {Error} 等待网络取消后关闭发现和监听；调用者持有清理错误边界。 */
  async stop(): Promise<void> {
    await this.cancelProgress();
    this.generation++; this.invitation = null; this.invitationUsed = false; this.connectedId = ''; this.found = [];
    const discovery = this.discovery; this.discovery = null;
    if (discovery !== null) { try { discovery.stopSearchingMDNS(); } catch (error) {} }
    const advertised = this.advertised; this.advertised = null;
    if (advertised !== null) { try { await mdns.removeLocalService(this.context, advertised); } catch (error) {} }
    const channels = this.channels; this.channels = [];
    for (const channel of channels) await channel.close();
    const server = this.server; this.server = null;
    if (server !== null) { try { await server.close(); } catch (error) {} }
    this.publish();
  }
}
