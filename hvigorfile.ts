// SPDX-License-Identifier: AGPL-3.0-or-later

import { appTasks, OhosAppContext, OhosPluginId } from '@ohos/hvigor-ohos-plugin';
import { hvigor } from '@ohos/hvigor';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyLocalSigning, parseLocalSigning } from './tools/signing-config';

// 本机与 CI 使用同一入口；缺省允许无签名构建，显式配置缺失则立即失败。
hvigor.getRootNode().afterNodeEvaluate(node => {
  const context = node.getContext(OhosPluginId.OHOS_APP_PLUGIN) as OhosAppContext;
  const configured = process.env.JIDECARDS_SIGNING_CONFIG;
  const path = resolve(context.getProjectPath(), configured || '.local/signing.json');
  if (!existsSync(path)) {
    if (configured) throw new Error('JIDECARDS_SIGNING_CONFIG file missing');
    return;
  }
  context.setBuildProfileOpt(applyLocalSigning(context.getBuildProfileOpt(), parseLocalSigning(readFileSync(path, 'utf8'))));
});

export default {
  system: appTasks,
  plugins: []
};
