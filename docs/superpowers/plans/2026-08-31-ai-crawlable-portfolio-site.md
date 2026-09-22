# AI-Crawlable Portfolio Site Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Build a deployable static portfolio for 无谓又左 at `jideyanggeqi.cn`, initially documenting 记得闪卡 with complete crawler and AI-readable metadata.

**Architecture:** Publish the existing `hosting/` directory as the web root. Core pages are hand-authored semantic HTML with one shared stylesheet and no required JavaScript; machine-readable files mirror the visible content. Existing `announcement.json` and `cloud-decks.json` remain at their current paths.

**Tech Stack:** HTML5, CSS, JSON-LD, static JSON/XML/text files, Node.js built-in test runner, Nginx or any static hosting provider.

## Global Constraints

- Core content must be present in server-returned HTML without JavaScript.
- The author name is “无谓又左”.
- The initial and only work is “记得闪卡 / jidecards”.
- The shortest definition must include HarmonyOS NEXT native, open source, Anki compatibility, and powerful flashcard learning.
- The AppGallery release is 2.0.0; the source development version is 3.0.0.
- Development-only AI features must not be presented as released AppGallery functionality.
- Keep the disclaimer that the project is unaffiliated with Ankitects, AnkiWeb, and AnkiDroid.
- Preserve `hosting/announcement.json` and `hosting/cloud-decks.json` names and schemas.
- Do not modify HarmonyOS package names, signing, application code, or release configuration.

---

### Task 1: Static Site Contract and Shared Shell

**Files:**
- Create: `tools/tests/portfolio-site.test.mjs`
- Create: `hosting/index.html`
- Create: `hosting/styles.css`
- Create: `hosting/assets/app-preview-01.png`
- Create: `hosting/assets/app-preview-02.png`
- Create: `hosting/assets/app-preview-03.png`
- Create: `hosting/assets/app-preview-04.png`
- Source assets: `screenshots/app-preview-01.png` through `screenshots/app-preview-04.png`

**Interfaces:**
- Consumes: existing `hosting/` web root and `screenshots/` product images.
- Produces: stable home route `/`, shared `/styles.css`, and `/assets/app-preview-*.png` URLs.

- [ ] **Step 1: Write the failing homepage contract test**

Create `tools/tests/portfolio-site.test.mjs` with Node built-ins. Resolve the repository root from `import.meta.url`, read UTF-8 files, and assert that `hosting/index.html` contains one `<h1>`, the exact author and product names, `HarmonyOS NEXT`, `开源`, `Anki`, canonical `https://jideyanggeqi.cn/`, a plain link to `/works/jidecards/`, and JSON-LD containing `Person` and `WebSite`.

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readHosting = (relativePath) => readFile(path.join(repoRoot, 'hosting', relativePath), 'utf8');

test('homepage exposes the portfolio identity without JavaScript', async () => {
  const html = await readHosting('index.html');
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  for (const text of ['无谓又左', '记得闪卡', 'HarmonyOS NEXT', '开源', 'Anki']) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /<link rel="canonical" href="https:\/\/jideyanggeqi\.cn\/">/);
  assert.match(html, /href="\/works\/jidecards\/"/);
  assert.match(html, /"@type":\s*"Person"/);
  assert.match(html, /"@type":\s*"WebSite"/);
});
```

- [ ] **Step 2: Run the contract test and confirm it fails**

Run: `node --test tools/tests/portfolio-site.test.mjs`  
Expected: FAIL with `ENOENT` for `hosting/index.html`.

- [ ] **Step 3: Implement the homepage and shared stylesheet**

Create semantic `hosting/index.html` with `<header>`, `<nav>`, `<main>`, one `<h1>`, a concise hero definition, one `article` for 记得闪卡, version badges, feature keywords, GitHub and product-detail links, an author section, and footer. Include complete title, description, canonical, Open Graph tags, favicon-independent metadata, `Person` and `WebSite` JSON-LD. Use no script other than `application/ld+json`.

Create `hosting/styles.css` with CSS custom properties, readable 68rem page width, 42rem text measure, responsive one/two-column layouts, visible keyboard focus, dark color-scheme support, reduced-motion support, and no external font dependency.

Copy the four existing PNG screenshots into `hosting/assets/` without recompression.

- [ ] **Step 4: Run the homepage contract test**

Run: `node --test tools/tests/portfolio-site.test.mjs`  
Expected: PASS for `homepage exposes the portfolio identity without JavaScript`.

- [ ] **Step 5: Commit the shell**

```bash
git add tools/tests/portfolio-site.test.mjs hosting/index.html hosting/styles.css hosting/assets/app-preview-01.png hosting/assets/app-preview-02.png hosting/assets/app-preview-03.png hosting/assets/app-preview-04.png
git commit -m "feat: add crawler-readable portfolio homepage"
```

### Task 2: Authoritative Jidecards Work Page

**Files:**
- Modify: `tools/tests/portfolio-site.test.mjs`
- Create: `hosting/works/jidecards/index.html`

**Interfaces:**
- Consumes: `/styles.css`, `/assets/app-preview-*.png`, README facts, release version facts.
- Produces: canonical work record at `/works/jidecards/` and visible fact text mirrored by later machine files.

- [ ] **Step 1: Add failing product-page contract tests**

Append a test that reads `works/jidecards/index.html` and asserts the canonical URL, one `<h1>`, official version `2.0.0`, development version `3.0.0`, all major feature phrases (`AI 制卡`, `AI 改卡`, `FSRS`, `AnkiWeb`, `导入与导出`, `桌面服务卡片`, `ArkUI`), all four screenshot URLs with non-empty alt text, GitHub URL, AGPL identifier, disclaimer, and `SoftwareApplication` plus `SoftwareSourceCode` JSON-LD.

- [ ] **Step 2: Run the product-page test and confirm it fails**

Run: `node --test tools/tests/portfolio-site.test.mjs`  
Expected: FAIL with `ENOENT` for `hosting/works/jidecards/index.html`.

- [ ] **Step 3: Implement the product page**

Write a semantic standalone page in the sequence defined by the design spec. Put the shortest product definition before the first screenshot. Mark 2.0.0 as AppGallery release and 3.0.0 as source development version; label the AI Agent section as development functionality requiring release validation. Include explicit text for target users, native ArkUI implementation, Anki Rust backend, FSRS, review flow, note types, statistics, deck/browser operations, AnkiWeb synchronization, APKG/COLPKG data movement, media maintenance, themes, reminders, bilingual interface, and the non-affiliation statement.

- [ ] **Step 4: Run the product contract test**

Run: `node --test tools/tests/portfolio-site.test.mjs`  
Expected: both homepage and product tests PASS.

- [ ] **Step 5: Commit the work page**

```bash
git add tools/tests/portfolio-site.test.mjs hosting/works/jidecards/index.html
git commit -m "feat: publish jidecards work profile"
```

### Task 3: Machine-Readable Discovery Endpoints and About Page

**Files:**
- Modify: `tools/tests/portfolio-site.test.mjs`
- Create: `hosting/about/index.html`
- Create: `hosting/robots.txt`
- Create: `hosting/sitemap.xml`
- Create: `hosting/llms.txt`
- Create: `hosting/llms-full.txt`
- Create: `hosting/data/works.json`
- Create: `hosting/404.html`

**Interfaces:**
- Consumes: visible facts from `/` and `/works/jidecards/`.
- Produces: crawler discovery endpoints and a stable JSON work record.

- [ ] **Step 1: Add failing discovery and consistency tests**

Append tests that parse `data/works.json`, assert `author.name === '无谓又左'`, one work with slug `jidecards`, platform `HarmonyOS NEXT`, license `AGPL-3.0-or-later`, release version `2.0.0`, development version `3.0.0`, and the GitHub URL. Assert `robots.txt` contains `User-agent: *`, `Allow: /`, and the absolute Sitemap URL. Assert `sitemap.xml` contains exactly the three canonical public page URLs. Assert both LLM text files contain author, product, native/open-source/Anki positioning, versions, and authoritative URLs. Assert `about/index.html` and `404.html` contain no required JavaScript.

- [ ] **Step 2: Run discovery tests and confirm they fail**

Run: `node --test tools/tests/portfolio-site.test.mjs`  
Expected: FAIL with `ENOENT` for the first missing discovery file.

- [ ] **Step 3: Implement the discovery files and about page**

Create valid UTF-8 plain text, XML, JSON, and HTML. Keep machine copy consistent with visible page copy. Use stable absolute URLs under `https://jideyanggeqi.cn/`. The about page identifies 无谓又左 as an independent developer and links to `https://github.com/wuweiyouzuoju`; it does not invent biography or contact details. The 404 page links back to `/` and uses `<meta name="robots" content="noindex">`.

- [ ] **Step 4: Run discovery tests**

Run: `node --test tools/tests/portfolio-site.test.mjs`  
Expected: all portfolio tests PASS.

- [ ] **Step 5: Commit discovery endpoints**

```bash
git add tools/tests/portfolio-site.test.mjs hosting/about/index.html hosting/robots.txt hosting/sitemap.xml hosting/llms.txt hosting/llms-full.txt hosting/data/works.json hosting/404.html
git commit -m "feat: add AI and crawler discovery files"
```

### Task 4: Deployment Documentation and Release Verification

**Files:**
- Modify: `tools/tests/portfolio-site.test.mjs`
- Create: `docs/site-deployment.md`

**Interfaces:**
- Consumes: complete `hosting/` directory.
- Produces: repeatable Nginx deployment procedure and final release checks.

- [ ] **Step 1: Add a failing internal-link and JSON preservation test**

Append a recursive HTML test that collects root-relative `href` and `src` values, maps directory URLs to `index.html`, and asserts every referenced local file exists. Parse both pre-existing `announcement.json` and `cloud-decks.json`; assert `schemaVersion === 1` to ensure the web work did not break application resources.

- [ ] **Step 2: Run the release test and confirm the documentation check fails**

Add an assertion that `docs/site-deployment.md` contains `jideyanggeqi.cn`, `nginx -t`, `certbot`, `robots.txt`, and `curl`. Run `node --test tools/tests/portfolio-site.test.mjs`; expected FAIL with `ENOENT` for the deployment document.

- [ ] **Step 3: Write the deployment guide**

Document this concrete production path:

1. Point the domain A/AAAA record to the server IP.
2. Upload the contents of `hosting/` to `/var/www/jideyanggeqi.cn/` without nesting an extra `hosting` directory.
3. Configure Nginx with `root /var/www/jideyanggeqi.cn;`, `index index.html;`, `try_files $uri $uri/ =404;`, UTF-8, explicit JSON/XML/text MIME types, and caching for `/assets/` only.
4. Validate with `sudo nginx -t` and reload.
5. Issue and install a certificate with `sudo certbot --nginx -d jideyanggeqi.cn -d www.jideyanggeqi.cn`.
6. Verify HTTPS and key endpoints using `curl -I` and `curl`.
7. Submit `https://jideyanggeqi.cn/sitemap.xml` to search consoles after DNS and TLS stabilize.

Include an alternative static-host path: publish `hosting/` as the provider root, attach the custom domain, enable HTTPS, and run the same endpoint verification.

- [ ] **Step 4: Run full automated verification**

Run: `npm test`  
Expected: all existing and portfolio tests PASS.

Run a local static server from `hosting/`, then request `/`, `/works/jidecards/`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, `/data/works.json`, `/announcement.json`, and `/cloud-decks.json`; expected: HTTP 200 for each.

- [ ] **Step 5: Perform visual and source-order QA**

Render the homepage and work page at 390×844 and 1440×1000. Confirm no horizontal scrolling, readable contrast, visible focus states, correct screenshots, and that disabling JavaScript changes no core content. View HTML source and confirm the shortest definition appears before decorative or screenshot content.

- [ ] **Step 6: Commit deployment documentation**

```bash
git add tools/tests/portfolio-site.test.mjs docs/site-deployment.md
git commit -m "docs: add portfolio deployment guide"
```

- [ ] **Step 7: Final status check**

Run: `git status --short`  
Expected: only unrelated pre-existing user changes and temporary files remain; no planned site file is uncommitted.
