// SPDX-License-Identifier: AGPL-3.0-or-later

import { asset } from '@kit.AssetStoreKit';
import { BusinessError } from '@kit.BasicServicesKit';
import type { ProviderId } from '../../model/agent/AgentTypes';
import type { AgentSearchProvider } from '../../model/agent/AgentSearchProvider';
import { UTF8编码, UTF8解码 } from '../../proto/core/utf8';

const ALIAS_PREFIX: string = 'jidecards.ai.provider.';

function aliasBytes(providerId: string): Uint8Array {
  return UTF8编码(`${ALIAS_PREFIX}${providerId}`);
}

function aliasQuery(providerId: string): asset.AssetMap {
  const query: asset.AssetMap = new Map<asset.Tag, asset.Value>();
  query.set(asset.Tag.ALIAS, aliasBytes(providerId));
  return query;
}

async function loadSecret(providerId: string, strict: boolean = false): Promise<string> {
  const query: asset.AssetMap = aliasQuery(providerId);
  query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
  query.set(asset.Tag.RETURN_LIMIT, 1);
  try {
    const results: asset.AssetMap[] = await asset.query(query);
    if (results.length === 0) {
      return '';
    }
    const value: asset.Value | undefined = results[0].get(asset.Tag.SECRET);
    return value instanceof Uint8Array ? UTF8解码(value) : '';
  } catch (error) {
    if (strict && (error as BusinessError).code !== 24000002) { throw new Error('agent_secret_unavailable'); }
    return '';
  }
}

/** @throws {Error} 系统安全存储写入失败，不得报告密钥保存成功。 */
async function saveSecret(providerId: string, secret: string, strict: boolean = false): Promise<void> {
  const normalized: string = secret.trim();
  if (normalized.length === 0) {
    await removeSecret(providerId, strict);
    return;
  }
  const query: asset.AssetMap = aliasQuery(providerId);
  const existing: string = await loadSecret(providerId, strict);
  if (existing.length > 0) {
    const updateValues: asset.AssetMap = new Map<asset.Tag, asset.Value>();
    updateValues.set(asset.Tag.SECRET, UTF8编码(normalized));
    await asset.update(query, updateValues);
    return;
  }
  const attributes: asset.AssetMap = aliasQuery(providerId);
  attributes.set(asset.Tag.SECRET, UTF8编码(normalized));
  attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
  await asset.add(attributes);
}

async function removeSecret(providerId: string, strict: boolean = false): Promise<void> {
  try {
    await asset.remove(aliasQuery(providerId));
  } catch (error) {
    if (strict && (error as BusinessError).code !== 24000002) { throw new Error('agent_secret_unavailable'); }
    // 不存在等同于已经清除；不得记录密钥或别名查询结果。
  }
}

export async function loadAgentSecret(providerId: ProviderId): Promise<string> { return loadSecret(providerId); }
/** @throws {Error} 系统安全存储写入失败。 */
export async function saveAgentSecret(providerId: ProviderId, secret: string): Promise<void> {
  await saveSecret(providerId, secret);
}
export async function removeAgentSecret(providerId: ProviderId): Promise<void> { await removeSecret(providerId); }
/** @throws {Error} 搜索凭据读取失败。 */
export async function loadAgentSearchSecret(provider: AgentSearchProvider = 'doubao'): Promise<string> {
  return loadSecret(`web.${provider}`, true);
}
/** @throws {Error} 搜索密钥保存失败，不能报告成功。 */
export async function saveAgentSearchSecret(secret: string, provider: AgentSearchProvider = 'doubao'): Promise<void> {
  await saveSecret(`web.${provider}`, secret, true);
}
