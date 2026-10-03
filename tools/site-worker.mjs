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
    return env.ASSETS.fetch(request);
  }
};
