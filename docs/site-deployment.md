# jidecards.com 网站部署

网站文件位于 `hosting/`，由 Cloudflare Worker `wispy-glade-db0d` 提供服务。域名、HTTPS、缓存和旧域名跳转在 Cloudflare 控制台管理；页面内容通过 GitHub Actions 自动发布。

## 一次性配置

1. 在 Cloudflare 创建一个只允许部署 Workers 的 API Token。
2. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 添加：
   - `CLOUDFLARE_API_TOKEN`：上一步的 Token；
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。
3. 确认 Worker 名称仍为 `wispy-glade-db0d`，配置文件为 `hosting/wrangler.jsonc`。
4. 在 Cloudflare Worker 的 **Domains & Routes** 中保留：
   - `jidecards.com`；
   - `www.jidecards.com`。
5. 在 Cloudflare **Rules → Redirect Rules** 创建旧域名跳转：
   - 匹配 `jideyanggeqi.cn/*` 和 `www.jideyanggeqi.cn/*`；
   - 目标为 `https://jidecards.com/$1`；
   - 状态码使用 `301`，保留路径和查询参数。

## 之后如何更新

修改 `hosting/` 下的 HTML、CSS、图片或 JSON，提交并推送到 `main`：

```powershell
git add hosting
git commit -m "content: update website"
git push origin main
```

GitHub Actions 会执行 `wrangler deploy --config hosting/wrangler.jsonc`，把整个静态站点发布到同一个 Worker。日常更新不需要在 Cloudflare 控制台重新上传 HTML，也不需要充值；只需提交文件即可。

## 本地检查

```powershell
npm test -- portfolio-site
python -m http.server 8080 --directory hosting
```

打开 `http://127.0.0.1:8080/` 检查页面。发布后可检查：

```powershell
curl.exe -I https://jidecards.com/
curl.exe -I https://jidecards.com/works/jidecards/
curl.exe https://jidecards.com/robots.txt
curl.exe https://jidecards.com/sitemap.xml
curl.exe https://jidecards.com/llms.txt
curl.exe -I https://jideyanggeqi.cn/
```

主页、作品页和作者页使用语义 HTML、JSON-LD、`data/works.json`、`robots.txt`、`sitemap.xml` 与 `llms.txt`，方便搜索引擎和 AI 工具读取。`www.jidecards.com` 统一跳转到裸域名，旧域名统一跳转到新域名。
