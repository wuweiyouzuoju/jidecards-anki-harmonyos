// SPDX-License-Identifier: AGPL-3.0-or-later
import { generateKeyPairSync, createPublicKey, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { THEME_CATALOG } from '../entry/src/main/ets/model/ThemeCatalog.ts';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const issuerDirectory = join(homedir(), '.jidecards-issuer');
const keyPath = join(issuerDirectory, 'issuer-ed25519-private.pem');
const publicPath = join(workspace, 'entry/src/main/ets/model/RedemptionPublicKey.ts');
const labels = new Map(JSON.parse(readFileSync(join(workspace, 'entry/src/main/resources/base/element/string.json'), 'utf8')).string.map(item => [item.name, item.value]));
export const contents = THEME_CATALOG.filter(theme => theme.requiredContent !== '').map(theme => ({
  id: theme.requiredContent,
  name: `${labels.get('theme_color_' + theme.id) ?? theme.id}主题${theme.backgroundTextures.length > 0 ? '（含动态背景）' : ''}`
}));

/** 发行秘密只存用户目录，初始化绝不覆盖既有密钥。 */
function initializeIssuer() {
  mkdirSync(issuerDirectory, { recursive: true });
  if (!existsSync(keyPath)) {
    if (existsSync(publicPath)) throw new Error('应用已有公钥；请恢复原私钥，不能自动更换。');
    const keys = generateKeyPairSync('ed25519');
    writeFileSync(keyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
  }
  const publicDer = createPublicKey(readFileSync(keyPath)).export({ type: 'spki', format: 'der' }).toString('base64');
  if (existsSync(publicPath) && !readFileSync(publicPath, 'utf8').includes(publicDer)) {
    throw new Error('发行私钥与应用公钥不匹配。');
  }
  if (!existsSync(publicPath)) {
    writeFileSync(publicPath, `// SPDX-License-Identifier: AGPL-3.0-or-later\n\n/** 只包含发行公钥；私钥由外置发行工具保管。 */\nexport const REDEMPTION_PUBLIC_KEY: string = '${publicDer}';\n`);
  }
  console.log(`发行工具已就绪。请安全备份私钥目录：${issuerDirectory}`);
}

/** Ed25519 确定性签名使同一指纹与内容始终得到同一兑换码。 */
export function issueCode(fingerprint, contentId, privateKey) {
  const normalized = fingerprint.trim().toUpperCase().replace(/^JCF1-/, '').replace(/[-\s]/g, '');
  if (!/^[0-9A-F]{32}$/.test(normalized)) throw new Error('应用指纹格式不正确。');
  if (!contents.some(content => content.id === contentId)) throw new Error('不支持的兑换内容。');
  const message = `JCR1.${normalized}.${contentId}`;
  return `${message}.${sign(null, Buffer.from(message, 'ascii'), privateKey).toString('base64url')}`;
}

async function main() {
  if (process.argv[2] === 'init') { initializeIssuer(); return; }
  if (!existsSync(keyPath)) throw new Error('发行私钥不存在，请先恢复密钥目录。');
  const privateKey = readFileSync(keyPath);
  const publicDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
  if (!readFileSync(publicPath, 'utf8').includes(publicDer)) throw new Error('发行私钥与应用公钥不匹配。');
  let fingerprint = process.argv[2];
  let contentId = process.argv[3];
  if (!fingerprint) {
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try {
      fingerprint = await input.question('粘贴用户的应用指纹：');
      contents.forEach((content, index) => console.log(`${index + 1}. ${content.name}`));
      const choice = (await input.question('选择兑换内容（回车默认 1）：')).trim() || '1';
      contentId = contents[Number(choice) - 1]?.id;
    } finally { input.close(); }
  }
  console.log(issueCode(fingerprint, contentId ?? '', privateKey));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
