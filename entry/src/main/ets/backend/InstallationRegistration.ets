// SPDX-License-Identifier: AGPL-3.0-or-later

import { RemoteEnvelope, RemoteReport, RemoteDiagnostics } from '../model/RemoteControlProtocol';
import { restoreRemoteControl, remoteControlReport, applyRemoteControl, remoteHeartbeatMs, remoteSnapshotPending, completeRemoteSnapshot, remoteAnnouncementsEnabled, completeRemoteAnnouncementRefresh } from './RemoteControl';
import { 读取已接收公告, 保存已接收公告, 读取已确认官方公告ID列表 } from '../model/官方公告存储';
import { 原始官方公告, 解析可展示官方公告 } from '../model/官方公告模型';
import { OFFICIAL_ANNOUNCEMENTS_ENABLED } from '../model/官方公告配置';
import { RemoteGrant, appliedRemoteGrants, applyRemoteGrants } from './RemoteEntitlements';
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { util } from '@kit.ArkTS';
import { bundleManager } from '@kit.AbilityKit';
import { deviceInfo, systemDateTime } from '@kit.BasicServicesKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { http } from '@kit.NetworkKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { loadAiAgentChannelsEnabled } from '../model/ReleaseFeatures';
import { IRIDESCENT_CONTENT } from '../model/Redemption';
import { THEME_CATALOG, ThemeDefinition, UNLOCKED_CONTENTS_KEY } from '../model/ThemeCatalog';
import { SURFACE_MATERIAL_KEY, isSurfaceMaterial } from '../model/SurfaceMaterial';
import { getApplicationFingerprint } from '../utils/RedemptionStore';
import { 后端会话 } from './后端会话';
import { 牌组服务 } from './牌组服务';

interface AnalyticsEvent {
  event_id: string;
  session_id: string;
  type: string;
  occurred_at: string;
  started_at: string;
  duration_ms: number;
  version: string;
  source: string;
}
interface AnalyticsProperties {
  ai_enabled: boolean;
  iridescent_unlocked: boolean;
  deck_names: string[] | null;
  app_version: string;
  device_model: string;
  os_version: string;
  source: string;
  state_at: string;
  foreground: boolean;
  applied_grants: string[];
  heartbeat_seconds: number;
  surface_material?: string;
  accent_theme?: string;
  ai_opened_at?: string;
  ai_used_at?: string;
}
interface AnalyticsBatch {
  schema_version: number;
  user_id: string;
  properties: AnalyticsProperties;
  events: AnalyticsEvent[];
  control: RemoteReport;
  announcement_inbox?: AnnouncementInboxReport;
}
interface AnnouncementInboxReport {
  version: string;
  enabled: boolean;
  read_ids: string[];
  received_ids: string[];
}
interface AnalyticsAcknowledgment {
  accepted_event_ids: string[];
  grants?: RemoteGrant[];
  control?: RemoteEnvelope;
  announcement?: 原始官方公告 | null;
  appearance_snapshot_version?: number;
  ai_activity_version?: number;
}
interface AnalyticsQueue { events: AnalyticsEvent[]; deck_signature: string; state_signature?: string; }
const CHECKPOINT_MS: number = 10000;
const REPORT_MS: number = 10000;
const MAX_EVENTS: number = 50;
const MAX_QUEUED_EVENTS: number = 2000;
let foregroundSince: number = -1;
let sessionId: string = '';
let sessionStarted: string = '';
let sessionDuration: number = 0;
let checkpointTimer: number = -1;
let lastReport: number = -REPORT_MS;
let sending: boolean = false;
let acceptsAppearanceSnapshot: boolean = false;
let acceptsAiActivity: boolean = false;
let aiActivityWrites: Promise<void> = Promise.resolve();

export function recordAiActivity(context: common.UIAbilityContext, used: boolean): void {
  const observedAt = new Date().toISOString();
  aiActivityWrites = aiActivityWrites.then(async (): Promise<void> => {
    const store = await preferences.getPreferences(context, { name: 'jidecards_analytics_v2' });
    const key = used ? 'ai_used_at' : 'ai_opened_at';
    if (await store.get(key, '') !== '') return;
    await store.put(key, observedAt);
    try {
      await store.flush();
    } catch (_error) {
      await store.delete(key);
    }
  }).catch((): void => {});
}
let failures: number = 0;
let nextAttempt: number = 0;
let workTail: Promise<void> = Promise.resolve();
const SNAPSHOT_URL: string = 'https://8.145.41.24/v1/installation-snapshot';

async function readDeviceKey(): Promise<string> {
  try {
    const identifier = deviceInfo.ODID.trim().toLowerCase();
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(identifier) ||
      identifier === '00000000-0000-0000-0000-000000000000') return '';
    const hash = cryptoFramework.createMd('SHA256');
    await hash.update({ data: new util.TextEncoder().encodeInto('com.jide.kapian:device:v1:' + identifier) });
    const digest = await hash.digest();
    let key: string = '';
    for (const byte of digest.data) key += byte.toString(16).padStart(2, '0');
    return key;
  } catch (_error) {
    return '';
  }
}

export async function getUploadSecret(context: common.UIAbilityContext): Promise<string | undefined> {
  try {
    const store = await preferences.getPreferences(context, { name: 'jidecards_installation_transport' });
    const saved = await store.get('upload_secret', '');
    if (typeof saved === 'string' && /^[0-9a-f]{64}$/.test(saved)) return saved;
    const secret = (util.generateRandomUUID(false) + util.generateRandomUUID(false)).replace(/-/g, '');
    await store.put('upload_secret', secret);
    await store.flush();
    return secret;
  } catch (_error) {
    return undefined;
  }
}

async function storeAndSend(context: common.UIAbilityContext, event: AnalyticsEvent, force: boolean): Promise<void> {
  try {
    const store = await preferences.getPreferences(context, { name: 'jidecards_analytics_v2' });
    const saved = await store.get('queue', '');
    const queue: AnalyticsQueue = typeof saved === 'string' && saved !== '' ? JSON.parse(saved) as AnalyticsQueue :
      { events: [], deck_signature: '' };
    // A newer checkpoint replaces only a locally unsent checkpoint from the same session.
    if (event.type === 'session_update' || event.type === 'session_end') {
      queue.events = queue.events.filter((item: AnalyticsEvent): boolean =>
        item.session_id !== event.session_id || item.type !== 'session_update');
    }
    if (queue.events.length < MAX_QUEUED_EVENTS) queue.events.push(event);
    else hilog.warn(0x4342, 'JideInstallation', 'Analytics queue full; retrying retained batch');
    await store.put('queue', JSON.stringify(queue));
    await store.flush();
    const now = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
    if (sending || now < nextAttempt || (!force && now - lastReport < remoteHeartbeatMs() && queue.events.length < MAX_EVENTS)) return;
    sending = true;
    lastReport = now;
    let client: http.HttpRequest | undefined;
    try {
      const fingerprint = await getApplicationFingerprint();
      await restoreRemoteControl(context, fingerprint);
      const secret = await getUploadSecret(context);
      if (secret === undefined) throw new Error('Installation credential unavailable');
      const deviceKey = await readDeviceKey();
      const aiEnabled = await loadAiAgentChannelsEnabled();
      await 后端会话.获取实例().确保已打开(context.filesDir);
      const deckNames = await new 牌组服务().获取完整牌组名称();
      const signature = JSON.stringify(deckNames);
      const unlocked = AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [];
      const properties: AnalyticsProperties = {
        ai_enabled: aiEnabled,
        iridescent_unlocked: unlocked.includes(IRIDESCENT_CONTENT),
        deck_names: !remoteSnapshotPending() && signature === queue.deck_signature ? null : deckNames,
        app_version: event.version,
        device_model: deviceInfo.marketName || deviceInfo.productModel || 'unknown',
        os_version: deviceInfo.osFullName || 'unknown',
        source: event.source,
        state_at: new Date().toISOString(),
        foreground: foregroundSince >= 0,
        applied_grants: appliedRemoteGrants(),
        heartbeat_seconds: remoteHeartbeatMs() / 1000
      };
      if (acceptsAiActivity) {
        await aiActivityWrites;
        const opened = await store.get('ai_opened_at', '');
        const used = await store.get('ai_used_at', '');
        properties.ai_opened_at = typeof opened === 'string' ? opened : '';
        properties.ai_used_at = typeof used === 'string' ? used : '';
      }
      if (acceptsAppearanceSnapshot) {
        const material = AppStorage.get<string>(SURFACE_MATERIAL_KEY);
        if (material !== undefined && isSurfaceMaterial(material)) properties.surface_material = material;
        const accent = AppStorage.get<string>('colorTheme');
        if (THEME_CATALOG.some((theme: ThemeDefinition): boolean => theme.id === accent)) {
          properties.accent_theme = accent;
        }
      }
      const stateSignature = JSON.stringify([aiEnabled, properties.iridescent_unlocked, signature]);
      if (queue.state_signature !== undefined && queue.state_signature !== stateSignature &&
        queue.events.length < MAX_QUEUED_EVENTS) {
        const changed: AnalyticsEvent = {
          event_id: util.generateRandomUUID(false), session_id: event.session_id, type: 'state_changed',
          occurred_at: properties.state_at, started_at: event.started_at, duration_ms: event.duration_ms,
          version: event.version, source: event.source
        };
        queue.events.push(changed);
      }
      queue.state_signature = stateSignature;
      await store.put('queue', JSON.stringify(queue));
      await store.flush();
      const batch: AnalyticsBatch = {
        schema_version: 2, user_id: fingerprint, properties: properties, events: queue.events.slice(0, MAX_EVENTS), control: remoteControlReport()
      };
      if (/^\d+(?:\.\d+){1,3}$/.test(event.version)) {
        const cached = await 读取已接收公告();
        const readIds = await 读取已确认官方公告ID列表();
        batch.announcement_inbox = {
          version: event.version, enabled: OFFICIAL_ANNOUNCEMENTS_ENABLED && remoteAnnouncementsEnabled(),
          read_ids: readIds, received_ids: cached?.id ? [cached.id] : []
        };
      }
      // Limit UTF-8 request bytes, including an unusually large set of deck names.
      const encoder = new util.TextEncoder();
      let body = JSON.stringify(batch);
      while (encoder.encodeInto(body).length > 250000 && batch.events.length > 1) {
        batch.events.pop();
        body = JSON.stringify(batch);
      }
      if (encoder.encodeInto(body).length > 250000) throw new Error('Analytics batch too large');
      client = http.createHttp();
      const response = await client.request(SNAPSHOT_URL, {
        method: http.RequestMethod.PUT,
        header: { 'Content-Type': 'application/json; charset=utf-8',
          'X-Jide-Device-Key': deviceKey, 'Authorization': 'Bearer ' + secret },
        extraData: body, expectDataType: http.HttpDataType.STRING,
        usingCache: false, usingProxy: false, connectTimeout: 5000, readTimeout: 5000
      });
      if (response.responseCode === 400) {
        acceptsAppearanceSnapshot = false;
        acceptsAiActivity = false;
      }
      if (response.responseCode !== 200 || typeof response.result !== 'string') throw new Error('Batch rejected');
      const acknowledgment = JSON.parse(response.result) as AnalyticsAcknowledgment;
      if (!Array.isArray(acknowledgment.accepted_event_ids) ||
        !batch.events.every((item: AnalyticsEvent): boolean => acknowledgment.accepted_event_ids.includes(item.event_id))) {
        throw new Error('Batch acknowledgment incomplete');
      }
      acceptsAppearanceSnapshot = acknowledgment.appearance_snapshot_version === 1;
      acceptsAiActivity = acknowledgment.ai_activity_version === 1;
      queue.events = queue.events.filter((item: AnalyticsEvent): boolean =>
        !batch.events.some((sent: AnalyticsEvent): boolean => sent.event_id === item.event_id));
      queue.deck_signature = signature;
      await store.put('queue', JSON.stringify(queue));
      await store.flush();
      try {
        if (remoteSnapshotPending()) await completeRemoteSnapshot();
        if (acknowledgment.control !== undefined) {
          const diagnostics: RemoteDiagnostics = { queued_events: queue.events.length, foreground: foregroundSince >= 0,
            heartbeat_seconds: remoteHeartbeatMs() / 1000, configuration_revision: remoteControlReport().configuration_revision };
          await applyRemoteControl(acknowledgment.control, diagnostics);
        }
      } catch (_error) { /* Durable command state is retried on the next heartbeat. */ }
      try {
        const item = acknowledgment.announcement;
        if (item && OFFICIAL_ANNOUNCEMENTS_ENABLED && remoteAnnouncementsEnabled() &&
          解析可展示官方公告(JSON.stringify({ schemaVersion: 1, announcement: item }), event.version, Date.now(), 'zh-Hans') !== null) {
          await 保存已接收公告(context, item);
        }
        if (item !== undefined) await completeRemoteAnnouncementRefresh();
      } catch (_error) { /* The next heartbeat can retry a message that did not persist. */ }
      if (Array.isArray(acknowledgment.grants)) {
        try { await applyRemoteGrants(context, fingerprint, acknowledgment.grants); }
        catch (_error) { /* Verified grants will be retried by the next normal heartbeat. */ }
      }
      failures = 0;
      nextAttempt = 0;
      hilog.info(0x4342, 'JideInstallation', 'Analytics batch accepted: %{public}d events', batch.events.length);
    } finally {
      client?.destroy();
      sending = false;
    }
  } catch (_error) {
    failures = Math.min(failures + 1, 6);
    nextAttempt = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE) +
      Math.min(300000, REPORT_MS * Math.pow(2, failures - 1));
    hilog.warn(0x4342, 'JideInstallation', 'Analytics batch retained for retry');
  }
}

function checkpoint(context: common.UIAbilityContext, type: string, force: boolean): void {
  const now = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
  sessionDuration += Math.max(0, now - foregroundSince);
  foregroundSince = now;
  let version: string = 'unknown';
  try { version = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT).versionName; }
  catch (_error) { /* Keep the event even if package metadata is temporarily unavailable. */ }
  const event: AnalyticsEvent = {
    event_id: util.generateRandomUUID(false), session_id: sessionId, type: type,
    started_at: sessionStarted, occurred_at: new Date().toISOString(),
    duration_ms: Math.floor(sessionDuration), version: version,
    source: AppStorage.get<boolean>('analyticsTestSource') === true ? 'test' :
      context.applicationInfo.debug ? 'debug' : 'release'
  };
  workTail = workTail.then(async (): Promise<void> => { await storeAndSend(context, event, force); });
}

export function startInstallationUsage(context: common.UIAbilityContext): void {
  if (foregroundSince >= 0) return;
  sessionId = util.generateRandomUUID(false);
  sessionStarted = new Date().toISOString();
  sessionDuration = 0;
  foregroundSince = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
  checkpoint(context, 'app_open', lastReport < 0);
  checkpointTimer = setInterval((): void => { checkpoint(context, 'session_update', false); }, CHECKPOINT_MS);
}

export function stopInstallationUsage(context: common.UIAbilityContext): void {
  if (foregroundSince < 0) return;
  if (checkpointTimer >= 0) { clearInterval(checkpointTimer); checkpointTimer = -1; }
  checkpoint(context, 'session_end', true);
  foregroundSince = -1;
}
