// SPDX-License-Identifier: AGPL-3.0-or-later
const legacyHosts = new Set(['jideyanggeqi.cn', 'www.jideyanggeqi.cn', 'www.jidecards.com']);

export default {
  // 域名迁移先于静态资源匹配；保留路径和查询参数，让旧链接直接到对应页面。
  fetch(request, env) {
    const url = new URL(request.url);
    if (legacyHosts.has(url.hostname) || (url.hostname === 'jidecards.com' && url.protocol !== 'https:')) {
      url.protocol = 'https:';
      url.host = 'jidecards.com';
      return Response.redirect(url.href, 301);
    }
    // Google 验证文件必须保留公开的 .html 地址；内部使用静态服务的无扩展名路径。
    if (/^\/google[a-f0-9]+\.html$/.test(url.pathname)) {
      url.pathname = url.pathname.slice(0, -5);
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  }
};
