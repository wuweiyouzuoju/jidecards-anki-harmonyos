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

独立长文的事实来源是 `hosting/data/harmonyos-anki-guide.json`，生成到 `/guides/harmonyos-anki/`。文章涵盖安装、牌组迁移、背单词与知识点制卡、FSRS、AnkiWeb、媒体兼容、统计和备份。首页只保留导航入口，文章正文留在指南页；功能页提供相关入口。修改正文后执行同一生成命令，HTML 和 `llms-full.txt` 同时更新。更新日期只随实质内容变更调整。

`tools/site-worker.mjs` 负责域名 301，`hosting/wrangler.jsonc` 的 `assets.run_worker_first=true` 确保重定向先于已有静态文件匹配。新域名 HTTPS 请求直接交给 `ASSETS`，保留静态资源、JSON 与 404 行为。脚本位于资产目录外，不作为网页文件公开。不要改为只在资源不存在时才运行 Worker，否则旧域名已有页面会继续返回 200。

浏览器标签页图标复用 `AppScope/resources/base/media/app_icon.png`。`hosting/favicon.ico` 包含 16、32、48 像素尺寸，另提供 `favicon-16x16.png`、`favicon-32x32.png` 和 180 像素的 `apple-touch-icon.png`；所有页面由生成器的公共 `<head>` 引用。更换应用图标后，用以下命令在仓库根目录重新转换（需 Python 和 Pillow），更新生成器中的图标版本参数，再生成和发布：

```powershell
python -c 'from PIL import Image; from pathlib import Path; icon = Image.open("AppScope/resources/base/media/app_icon.png").convert("RGBA"); target = Path("hosting"); icon.save(target / "favicon.ico", sizes=[(16,16), (32,32), (48,48)]); [icon.resize((size,size), Image.Resampling.LANCZOS).save(target / filename, optimize=True) for size, filename in [(16,"favicon-16x16.png"), (32,"favicon-32x32.png"), (180,"apple-touch-icon.png")]]'
```

搜索文案也由 `hosting/data/works.json` 管理：`seo.homeTitle` 和 `seo.productTitle` 分别用于首页与功能页的 `<title>` / `og:title`，`summary` 同步用于正文、搜索摘要、分享摘要和应用结构化数据，`useCases` 输出学习用途及完整纯文本资料。标题使用品牌、平台和核心用途组成自然语句，其余搜索词在对应的实际内容中说明，避免逐页重复堆词。搜索引擎会自行生成搜索结果标题，网页更新后仍需重新抓取。

上线版本由作者确认后写入 `releaseVersion`，不从源码版本推断商店版本。当前确认日期与版本见 `hosting/data/works.json` 的 `releaseVersionSource` 和 `releaseVersion`。

## 自动部署

工作流：`.github/workflows/site-deploy.yml`，修改网站或生成器后推送 `main` 可触发。

**启用前提**：在 GitHub Actions Secrets 配置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。当前尚未配置，实际发布使用上面的本地命令。推送成功不代表 Cloudflare 已发布成功。

## 页面与来源

- `/`：应用下载、功能、源码、开发文档入口。
- `/works/jidecards/`：功能、截图、正式版本和主题活动。
- `/guides/harmonyos-anki/`：独立完整使用指南，包含目录、操作步骤、对照表、迁移场景与问答。
- `/developers/`：编程 Agent 开发入口；首页不放开发优先级声明。
- `/about/`：作者与反馈入口。
- `/data/works.json`：网站事实来源，同时作为公开 JSON。
- `/robots.txt`、`/sitemap.xml`、`/llms.txt`、`/llms-full.txt`：抓取入口。正文直接输出 HTML，不依赖浏览器脚本。

入口组织参考 [Anki 官方站](https://apps.ankiweb.net/)：下载优先，文档与开源贡献分开。保留记得闪卡自己的文案与视觉。

## 可选验证

```powershell
node --test tools/tests/portfolio-site.test.mjs tools/tests/site-worker.test.mjs
npm run verify -- repo
python -m http.server 8080 --directory hosting
curl.exe -I https://jidecards.com/
curl.exe -I https://jideyanggeqi.cn/works/jidecards/
```

站点测试覆盖静态可读性、结构化数据、入口与资源链接、版本一致性、应用数据端点契约，以及域名跳转保留路径与查询参数。`npm run verify -- repo` 包含全部 Node 回归；此次仅修改网站与网站工具，不要求手机 HAP 构建。Python 静态预览不执行域名跳转，需要验证真实 Worker 时用 `npx --yes wrangler@4.141.0 dev --config hosting/wrangler.jsonc --local`。页面外观由发布者验收。

## 域名

四个自定义域名统一声明在 `hosting/wrangler.jsonc` 的 `routes`，由 Wrangler 发布到同一 Worker，Cloudflare 管理对应 DNS 与证书。`jideyanggeqi.cn`、`www.jideyanggeqi.cn` 和 `www.jidecards.com` 由网站 Worker 按原路径与查询参数 301 到 `https://jidecards.com`；`http://jidecards.com` 也直接转到 HTTPS。新接入域名可能需要等待 DNS 与证书生效，发布后逐个域名读回检查。`hosting/.assetsignore` 阻止 Wrangler 配置与本地缓存作为网页发布。

迁站后应保留旧域名和重定向至少一年，条件允许时长期保留。不要把所有旧页面统一跳首页，详情、图片与 JSON 链接应到新站的对应路径。参考 [Google 域名迁移说明](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)。

## 搜索收录与外部链接

- Search Console 中验证新旧域名所有权，提交 `https://jidecards.com/sitemap.xml`；新站 sitemap 只包含新域名的 canonical 页面。
- 用 URL 检查核对首页、功能页和指南页，必要时申请重新抓取。迁站工具的 Change of Address 在旧站属性中提交，是否可提交取决于账号权限与迁移检查。
- GitHub 仓库 Website、公开 README、CSDN/HarmonyOS 社区文章和应用市场介绍中的官网应统一为 `https://jidecards.com/`；外部账号编辑需要在相应平台完成，修改本地 README 不等于远端已更新。
- 在 Performance 按指南 URL 查看实际查询、曝光和点击，再根据真实问题增补正文。不能从文章字数、结构化数据或代码发布推定排名提升。

网站使用真实 `Person`、`SoftwareApplication`、`BreadcrumbList` 和指南 `TechArticle`。下载价格来自 `works.json` 的 marketplace，正文同步展示免费下载；没有可核实且公开的评分时不填写 `aggregateRating` 或虚构评论。软件应用结构化数据有助于表达事实，但当前未提供评分/评论，不代表已满足 Google 软件富媒体结果的全部条件。
