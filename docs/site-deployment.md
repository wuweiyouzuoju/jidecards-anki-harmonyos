# jidecards.com 网站

Cloudflare Worker：`wispy-glade-db0d`。静态文件目录：`hosting/`。

## 更新内容

版本、作者、功能和主题活动统一修改 `hosting/data/works.json`，随后执行：

```powershell
node tools/build-site.mjs
$env:HTTP_PROXY = 'http://127.0.0.1:7897'
$env:HTTPS_PROXY = 'http://127.0.0.1:7897'
npx --yes wrangler@4.141.0 deploy --config hosting/wrangler.jsonc
```

代理变量仅在使用本机该端口时设置。Wrangler 使用已登录的 Cloudflare 账户；首次使用先运行 `npx wrangler login`。

生成器同时更新 HTML、JSON-LD、llms 文本和 sitemap，不必逐页修改 HTML。页面结构改 `tools/build-site.mjs`；样式改 `hosting/styles.css`。应用使用的 `announcement.json` 与 `cloud-decks.json` 独立维护。

上线版本由作者确认后写入 `releaseVersion`，不从源码版本推断商店版本。2026-09-26 作者确认应用市场版本为 2.8.1。

## 自动部署

工作流：`.github/workflows/site-deploy.yml`，修改网站或生成器后推送 `main` 可触发。

**启用前提**：在 GitHub Actions Secrets 配置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。当前尚未配置，实际发布使用上面的本地命令。推送成功不代表 Cloudflare 已发布成功。

## 页面与来源

- `/`：应用下载、功能、源码、开发文档入口。
- `/works/jidecards/`：功能、截图、正式版本和主题活动。
- `/developers/`：编程 Agent 开发入口；首页不放开发优先级声明。
- `/about/`：作者与反馈入口。
- `/data/works.json`：网站事实来源，同时作为公开 JSON。
- `/robots.txt`、`/sitemap.xml`、`/llms.txt`、`/llms-full.txt`：抓取入口。正文直接输出 HTML，不依赖浏览器脚本。

入口组织参考 [Anki 官方站](https://apps.ankiweb.net/)：下载优先，文档与开源贡献分开。保留记得闪卡自己的文案与视觉。

## 可选验证

```powershell
node --test tools/tests/portfolio-site.test.mjs
python -m http.server 8080 --directory hosting
curl.exe -I https://jidecards.com/
```

站点测试覆盖静态可读性、结构化数据、入口与资源链接、版本一致性和应用数据端点契约。页面外观由发布者验收。

## 域名

自定义域名在 Cloudflare 的 Domains & Routes 管理。旧域名与 www 的跳转规则、DNS、证书需在 Cloudflare 单独配置；本生成器不修改它们。`hosting/.assetsignore` 阻止 Wrangler 配置与本地缓存作为网页发布。
