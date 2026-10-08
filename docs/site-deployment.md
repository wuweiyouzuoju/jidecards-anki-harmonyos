# jidecards.com 网站

官网以 AI 读取与爬虫抓取为首要目标。正文、导航、功能边界和更新说明直接输出完整 HTML，同时提供 Markdown、JSON 和完整纯文本；阅读不依赖客户端 JavaScript。架构取舍见 [官网静态内容与机器读取](decisions/2026-10-07-website-static-content.md)。

Cloudflare Worker：`wispy-glade-db0d`。静态目录：`hosting/`。主域名：`https://jidecards.com`。

## 内容与构建

产品、作者、SEO、正式版本、功能、宣传词和图片元数据统一维护在 `hosting/data/works.json`。指南事实来源是 `hosting/data/harmonyos-anki-guide.json`。正式版本由作者确认并记录 `releaseVersionSource`；源码版本由生成器读取 `AppScope/app.json5`，分别输出 `sourceVersion` / `sourceVersionCode`，不能相互推断。作者本次指定官网正式版为 2.9.22。

`tools/build-site.mjs` 只负责构建编排。修改入口按责任划分：

| 入口 | 责任 |
| --- | --- |
| `tools/site/content.mjs` | 读取事实、派生源码版本、检查素材版本与 SHA-256、生成样式、Logo 和图片脚本缓存键 |
| `tools/site/layout.mjs` | 共享导航、页脚、下载入口、页面元数据、JSON-LD |
| `tools/site/pages.mjs` | 首页、功能、指南、开发、更新、关于与 404 页面 |
| `tools/site/feeds.mjs` | 逐页 Markdown、llms、页面索引、sitemap、robots、Atom |
| `hosting/styles.css` | 响应式视觉；首页 Logo 在左、宣传词在右；手机导航使用原生 details |
| `hosting/assets/site-media.mjs` | 首次绘制后，按视口接近程度加载原图；下载失败恢复内嵌预览 |

执行 `node tools/build-site.mjs` 同时更新所有输出，避免逐页手改 HTML。样式、Logo 和图片脚本地址使用内容摘要缓存键。应用的 `announcement.json` 和 `cloud-decks.json` 独立维护，网站重构不改变其协议。

源码主仓库和镜像统一维护 `repository` / `repositoryMirrors`，生成器同步导航、正文、结构化数据和文本链接。官网可单独发布，不把尚未推送的本地发布文档作为远端已存在的链接。

## 图片与 Logo

当前采用作者提供的七张新版宣传图：主视觉、卡片学习、卡片编辑、卡片浏览、学习操作、复习统计、学习提醒。原始 PNG 字节存入 `hosting/assets/jidecards-2.9.22-*.png`；`screenshots` 记录公开路径、来源说明、版本、宽高和 SHA-256。每张图片提供正文说明、alt、figcaption 和完整原图链接，文字事实同时进入 Markdown、产品 JSON 和完整文本。

替换图片时检查实际内容，复制作者提供的原始字节，然后更新所有元数据；生成器发现版本或摘要不匹配即失败。过时 `assets/app-*.png` 已加入 `.assetsignore`，不再进入线上资产清单。

Logo 原图由生成器从 `AppScope/resources/base/media/app_icon.png` 原样复制。页面先内嵌已有图标：导航与页脚用 32 像素 PNG，主体用 180 像素 Apple 图标，正文首次绘制无需等待 1024 像素原图。宣传图先使用同尺寸内嵌 SVG 占位；图片脚本等待两次 animation frame，确保正文先绘制一次，再用 IntersectionObserver 在图片距离视口 200 像素时赋予原图地址，配合原生 lazy 与低优先级下载。预留真实宽高避免下载后布局跳动；下载失败恢复内嵌预览。不支持观察器的浏览器在首次绘制后交给原生 lazy。

脚本只增强图片显示，正文、导航、alt、figcaption、原图链接和 JSON-LD 已在静态 HTML 中。禁用 JavaScript 时 Logo 仍可见，宣传图通过 noscript 使用原生 lazy；Markdown、JSON 和 llms 保持完整原图地址与说明。

标签页图标仍提供 ico、16/32 像素 PNG 和 180 像素 Apple 图标。更换应用图标时重新生成这些图标并运行构建（需要 Python 与 Pillow）：

```powershell
python -c 'from PIL import Image; from pathlib import Path; icon = Image.open("AppScope/resources/base/media/app_icon.png").convert("RGBA"); target = Path("hosting"); icon.save(target / "favicon.ico", sizes=[(16,16), (32,32), (48,48)]); [icon.resize((size,size), Image.Resampling.LANCZOS).save(target / filename, optimize=True) for size, filename in [(16,"favicon-16x16.png"), (32,"favicon-32x32.png"), (180,"apple-touch-icon.png")]]'
```

## 页面与抓取入口

| 页面 | 作用 |
| --- | --- |
| `/` | 品牌、下载、核心功能、学习用途、更新与开源入口 |
| `/works/jidecards/` | 完整功能、七张新版图、下载、版本和能力边界 |
| `/guides/harmonyos-anki/` | 安装、迁移、制卡、FSRS、同步、统计与备份的完整指南 |
| `/releases/` | 当前版本的全部编号更新说明 |
| `/developers/` | 编程 Agent 的源码、责任和验证入口 |
| `/about/` | 项目、作者与反馈 |

六个可索引页面各有 `/content/*.md`，HTML alternate 链接和 `/data/site-index.json` 提供对应地址。`/llms.txt` 是文档索引；`/llms-full.txt` 包含完整产品、指南、版本和开发资料；`/data/works.json` 与 `/data/harmonyos-anki-guide.json` 提供事实数据。`/sitemap.xml` 只列主域名页面，`/robots.txt` 允许抓取，`/releases.xml` 提供 Atom 更新订阅。静态服务通过 `assets.not_found_handling=404-page` 为缺失链接返回自定义 404 正文与 404 状态，页面标记 noindex。

独立开发声明统一维护在 `hosting/data/works.json` 的 `developmentStatement`，同步生成首页、产品页、开发页、关于页、Markdown 与 llms；README 保留同一声明。当前声明明确作者为可塑性天赋（wuweiyouzuoju），截至目前全程由本人独立开发与维护，不存在团队开发或他人带领团队完成开发的情况。

页面使用真实 Person、CreativeWork、SoftwareApplication、SoftwareSourceCode、BreadcrumbList、FAQPage 与文章元数据。作者与发布者均指向独立开发者 Person；项目作为 CreativeWork 标识，不虚构团队或组织。功能可见状态与正式版本必须在 HTML、Markdown、JSON 和 llms 中一致，不虚构评分或评论。

所有页面通过公共布局生成同一套项目身份图谱：作者 `/#author`、项目 `/#project`、应用 `/#app`、源码 `/#source` 和网站 `/#website` 使用主域名下的稳定 `@id`。各 WebPage 对应当前 canonical，并通过 `isPartOf` 关联网站、`about` 关联应用。应用的 `sameAs` 指向真实应用市场页面，`subjectOf` 关联源码；源码的 `targetProduct` 回指应用，`codeRepository` 来自既有仓库清单，镜像进入源码 `sameAs`。项目 `sameAs` 使用该项目的仓库，作者身份链接仍属于 Person。不要把文章、作者主页或不同产品混入应用身份，也不要为这些关联增加另一份手工维护的数据源。网站测试检查各页身份唯一、引用可解析及应用与源码的双向关系。

## 验证与部署

先构建并执行对应专项：

```powershell
node tools/build-site.mjs
node --test tools/tests/portfolio-site.test.mjs tools/tests/site-worker.test.mjs tools/tests/documentation-contract.test.mjs
python -m http.server 8771 --bind 127.0.0.1 --directory hosting
```

测试检查静态正文、版本、素材摘要、有效链接、旧锚点、全部更新条目、机器格式完整性、应用数据端点和域名路由；图片行为测试覆盖首次绘制前不发起原图请求、仅接近视口时加载、重复通知、下载失败与观察器缺失。浏览器检查桌面与手机实际布局、图片显示、导航、横向溢出，以及阻断图片时正文仍可读、下载入口仍可用。纯网站修改不要求重新构建手机 HAP，也不替代原生引擎或设备测试。

本地发布不依赖 Git 推送：

```powershell
$env:HTTP_PROXY = 'http://127.0.0.1:7897'
$env:HTTPS_PROXY = 'http://127.0.0.1:7897'
npx --yes wrangler@4.141.0 deploy --config hosting/wrangler.jsonc
```

代理只在本机提供该端口时设置。Wrangler 使用已登录账户；首次使用按官方流程登录。发布后读回主域名页面、数据、文本、XML 和所有新图片，与本地摘要比对，并核对 MIME、旧图片 404 与旧域名 301。不能仅凭部署命令成功认定线上内容正确。

GPT 读取验收必须使用真实网页读取工具，确认当前版本与正文；本机 curl 使用 GPTBot / ChatGPT-User 的 User-Agent 得到 200，只证明该请求线路成功，不能证明 OpenAI 的真实出口 IP 可访问。搜索工具返回旧版本也不能当作当前线上验收通过。失败时同时检查实际读取结果、Worker 日志和 Cloudflare Security 的 AI Search / Agent 策略及安全事件。日志中没有请求时，应继续检查网络、边缘设置和读取工具；模板或图片加载修改不能作为读取恢复的证据。安全事件存在采样，筛选结果为空不能证明从未发生拦截。安全设置读取需要对应权限，当前 Wrangler 发布凭证不含该权限，可通过已登录的后台核对。

自动部署入口是 `.github/workflows/site-deploy.yml`：安装锁定依赖、构建、网站测试，再部署。需要 GitHub Actions 的 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`；当前发布仍使用本地登录账户。推送源码与发布网站是两项独立动作。

## 域名与收录

四个自定义域名声明在 `hosting/wrangler.jsonc`。`tools/site-worker.mjs` 在静态资源匹配前处理域名跳转；`assets.run_worker_first=true` 使旧域名已有页面也执行 301。`jideyanggeqi.cn`、`www.jideyanggeqi.cn`、`www.jidecards.com` 以及主域名 HTTP 请求保留路径与查询参数跳转至 `https://jidecards.com`。主域名 HTTPS 请求交给 ASSETS，保留资源、JSON 与 404 行为。

旧域名应长期保留对应跳转。Search Console 需要站点所有者验证权限并提交 `https://jidecards.com/sitemap.xml`；外部仓库简介、社区文章和应用市场官网链接需要在对应平台更新。发布网站不等于这些外部入口已更新，也不能推定搜索排名或 AI 推荐结果。

新站采用 Search Console 提供的 HTML 文件验证。根目录 `hosting/googlef6dc96ac7f0bd137.html` 保留下载原始内容，随静态资源发布，不由页面生成器覆盖。Worker 在域名 301 之后，为根目录 `google<十六进制>.html` 文件内部改写为 ASSETS 的无扩展名路径，避免默认 HTML 处理对指定验证地址产生 307；正文、查询参数、方法、请求头和真实 404 仍由静态服务负责。文件发布后核对原始指定地址直接返回 200，内容与 Google 下载文件相同；不能因为发布了文件就宣布所有权验证、sitemap 提交或域名迁移已成功。成功验证后也需保留文件。

2026-10-07 已在作者确认后完成 `https://jidecards.com/` 网址前缀资源的所有权验证，提交 `sitemap.xml`；Search Console 显示“成功”、发现 6 个网页。旧域名的网域资源迁移检查最初报告无法获取 `http://jideyanggeqi.cn/`，但本机代理及直连请求均返回指向新站的 301。随后添加 `https://jideyanggeqi.cn/` 网址前缀资源，通过既有网域 DNS 验证自动取得同一所有者权限；从该资源重新检查时，Google 的首页 301 与双方所有权测试均通过，并已点击“确认迁移”。后台显示“此网站当前正在迁移”，目标 `jidecards.com`，请求日期为 2026-10-07；同步 Worker 日志记录该次 Googlebot 请求在旧站收到 301、在新站收到 200。这里完成的是迁移请求提交，搜索索引迁移仍由 Google 处理，不能宣布收录迁移已全部完成。

Google [地址更改工具](https://support.google.com/webmasters/answer/9370220)支持根级网址前缀资源，并说明请求会涉及源网站的所有协议。仍应保留旧域名 HTTP、HTTPS 和 www 的既有 301。Google 的迁移检查通过不代表 OpenAI 的网页读取已经恢复；真实 GPT 读取仍需单独验收。

外部版本核对必须区分远端源码与官网正式版。未推送的本地 README 或应用配置不能当作远端仓库已经更新的证据；明确“不上传 Git”时只维护本地源码资料，记录远端差异，不通过网页编辑仓库绕过该要求。

参考 [Cloudflare Wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/#deploy)、[Cloudflare 静态资源](https://developers.cloudflare.com/workers/static-assets/)和 [Google 域名迁移说明](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)。
