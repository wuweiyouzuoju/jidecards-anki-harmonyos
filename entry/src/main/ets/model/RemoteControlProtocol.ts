// SPDX-License-Identifier: AGPL-3.0-or-later
export interface RemoteSettings { heartbeat_seconds: number; announcements_enabled: boolean; }
export interface RemoteDiagnostics { queued_events: number; foreground: boolean; heartbeat_seconds: number; configuration_revision: number; }
export interface RemoteReceipt { id: string; status: string; code: string; executed_at: string; diagnostics: RemoteDiagnostics | null; }
export interface RemoteReport { protocol_version: number; capabilities: string[]; configuration_revision: number; receipts: RemoteReceipt[]; }
export interface RemoteEnvelope { protocol_version: number; configuration: string | null; commands: string[]; acknowledged_receipt_ids: string[]; }
export interface RemotePayload {
  kind: string; protocol_version: number; platform: string; user_id: string;
  revision?: number; settings?: RemoteSettings; id?: string; action?: string; expires_at?: string;
}
export interface RemoteState { configuration: string; receipts: RemoteReceipt[]; seen: string[]; announcement_pending: boolean; snapshot_pending: boolean; }
export const REMOTE_CAPABILITIES: string[] = ['configuration.v1', 'configuration.heartbeat_seconds',
  'configuration.announcements_enabled', 'command.refresh_snapshot', 'command.refresh_announcements', 'command.report_diagnostics'];
export function defaultRemoteSettings(): RemoteSettings { return { heartbeat_seconds: 10, announcements_enabled: true }; }
export function validRemoteSettings(value: RemoteSettings | undefined): boolean {
  return value !== undefined && value !== null && Number.isInteger(value.heartbeat_seconds) &&
    value.heartbeat_seconds % 10 === 0 && value.heartbeat_seconds >= 10 && value.heartbeat_seconds <= 300 && typeof value.announcements_enabled === 'boolean';
}
export function validCommandId(value: string | undefined): boolean {
  return typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}
/** Only predeclared local handlers can run. Unknown actions never become dynamic code. */
export function commandReceipt(payload: RemotePayload, settings: RemoteSettings, diagnostics: RemoteDiagnostics, now: number): RemoteReceipt {
  let status: string = 'applied'; let code: string = 'completed';
  if (!['refresh_snapshot', 'refresh_announcements', 'report_diagnostics'].includes(payload.action ?? '')) {
    status = 'rejected'; code = 'unsupported_action';
  } else if (typeof payload.expires_at !== 'string' || !Number.isFinite(Date.parse(payload.expires_at)) || Date.parse(payload.expires_at) <= now) {
    status = 'expired'; code = 'expired';
  } else if (payload.action === 'refresh_announcements' && !settings.announcements_enabled) {
    status = 'rejected'; code = 'announcements_disabled';
  } else if (payload.action !== 'report_diagnostics') code = 'scheduled';
  return { id: payload.id ?? '', status: status, code: code, executed_at: new Date(now).toISOString(),
    diagnostics: status === 'applied' && payload.action === 'report_diagnostics' ? diagnostics : null };
}
