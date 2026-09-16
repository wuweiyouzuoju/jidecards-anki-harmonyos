// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer } from 'node:http';
import { randomBytes, createPublicKey } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { issueCode, contents, issuerDirectory } from './redemption-issuer.mjs';

/** 本机发行界面；只监听回环地址，发行请求必须携带本次启动的随机令牌。 */
export function startIssuerUI() {
  const privateKey = readFileSync(join(issuerDirectory, 'issuer-ed25519-private.pem'));
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
  if (!readFileSync(new URL('../entry/src/main/ets/model/RedemptionPublicKey.ts', import.meta.url), 'utf8').includes(publicKey)) {
    throw new Error('发行私钥与应用公钥不匹配');
  }
  const page = readFileSync(new URL('./redemption-ui.html', import.meta.url));
  const token = randomBytes(32).toString('hex');
  const instance = randomBytes(16).toString('hex');
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const origin = `http://127.0.0.1:${server.address().port}`;
    const send = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(data));
    };
    if (request.headers.host !== new URL(origin).host) { send(403, { error: '地址无效' }); return; }
    if (request.method === 'GET' && request.url === '/') {
      response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:; frame-ancestors 'none'");
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(page); return;
    }
    if (request.method === 'GET' && request.url === '/health') { send(200, { instance }); return; }
    if (request.headers['x-issuer-token'] !== token || (request.headers.origin && request.headers.origin !== origin)) {
      send(403, { error: '请通过桌面快捷方式重新打开工具。' }); return;
    }
    if (request.method === 'GET' && request.url === '/contents') { send(200, { contents }); return; }
    if (request.method !== 'POST' || request.url !== '/issue') { send(404, { error: '未找到此操作' }); return; }
    let body = '';
    try {
      for await (const chunk of request) {
        body += chunk.toString();
        if (body.length > 4096) { send(413, { error: '输入过长' }); return; }
      }
      const input = JSON.parse(body);
      if (typeof input.fingerprint !== 'string' || typeof input.contentId !== 'string') throw new Error('请填写指纹并选择内容。');
      send(200, { code: issueCode(input.fingerprint, input.contentId, privateKey) });
    } catch (error) { send(400, { error: error.message || '生成失败，请检查输入。' }); }
  });
  server.listen(0, '127.0.0.1', () => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    writeFileSync(join(issuerDirectory, 'ui-session.json'), JSON.stringify({ origin, token, instance }), { mode: 0o600 });
  });
  return server;
}

startIssuerUI();
