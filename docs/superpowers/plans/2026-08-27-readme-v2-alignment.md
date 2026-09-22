# README 2.0.0 Alignment Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Rewrite the root README so it accurately describes the HarmonyOS AppGallery 2.0.0 release represented by the current `main` branch.

**Architecture:** This is a documentation-only change. The root README is rewritten around user-visible feature groups, while claims are checked against the current ArkTS call sites, version metadata, lock files, and contract tests.

**Tech Stack:** Markdown, ArkTS/ArkUI source inspection, Node.js contract tests, Git.

## Global Constraints

- The current AppGallery release is 2.0.0, as confirmed by the user and `AppScope/app.json5`.
- Only `README.md` and the design/plan records under `docs/superpowers/` may change.
- Do not describe unreferenced legacy components or internal implementation details as user-visible features.
- Preserve the existing screenshots, build entry points, disclaimer, and AGPL-3.0-or-later attribution.

---

### Task 1: Rewrite and verify the 2.0.0 README

**Files:**
- Modify: `README.md`
- Reference: `AppScope/app.json5`
- Reference: `entry/src/main/ets/model/颜色主题.ets`
- Reference: `entry/src/main/ets/components/home/主页摘要分页.ets`
- Reference: `entry/src/main/ets/pages/统计页.ets`
- Reference: `entry/src/main/ets/pages/学习页.ets`
- Reference: `entry/src/main/ets/widget/pages/统计卡片.ets`
- Test: `tools/tests/ui-shell-contract.test.mjs`

**Interfaces:**
- Consumes: Current user-visible behavior and build metadata from `main`.
- Produces: A single user-facing `README.md` aligned with release 2.0.0.

- [ ] **Step 1: Capture the source-of-truth values**

Run:

```powershell
rg -n "versionCode|versionName|aurora|forest|midnight|lagoon|sunset|lemon|minimal_gray|今日进度|未来到期预测|PUBLISH_AGENT_REMINDER|anki:tts" AppScope entry
```

Expected: version 2.0.0, seven theme IDs, the 8-page summary endpoints, reminder permission/use, and Anki TTS handling are present in current source.

- [ ] **Step 2: Replace the README feature description**

Rewrite `README.md` with these exact factual outcomes:

- AppGallery current formal version: 2.0.0; search name: “记得闪卡”.
- Home: 8-page learning summary; statistics: 13 sections with 2 FSRS-only sections and a year heatmap calendar.
- Themes: 7 palettes (blue, green, purple, teal, orange, gold, gray), with light/dark appearance support.
- TTS: automatic playback for card templates containing `[anki:tts]`, with replay/stop controls in study.
- Rendering: ArkUI app interface plus a Web component for Anki HTML card content.
- 2.0.0 additions: desktop 2×4 statistics service card, learning reminders, simple/experimental modes, deck hiding/reordering/aliases/backgrounds.
- Browser, media, tag, synchronization, import/export, and FSRS capabilities described only at the level verified by current source.

- [ ] **Step 3: Verify stale claims are absent**

Run:

```powershell
rg -n "6 种颜色主题|热力图月历|11 张图表|非 WebView|音色人物|语音版本号" README.md
```

Expected: no matches.

- [ ] **Step 4: Run documentation and contract checks**

Run:

```powershell
git diff --check
npm test
```

Expected: `git diff --check` exits 0 and the Node contract suite passes.

- [ ] **Step 5: Review the final change set**

Run:

```powershell
git status --short
git diff -- README.md docs/superpowers/specs/2026-08-27-readme-v2-alignment-design.md docs/superpowers/plans/2026-08-27-readme-v2-alignment.md
```

Expected: only the README and the two documentation records are changed, with no application-code modifications.

- [ ] **Step 6: Commit after approval to write the public repository**

Run:

```powershell
git add README.md docs/superpowers/specs/2026-08-27-readme-v2-alignment-design.md docs/superpowers/plans/2026-08-27-readme-v2-alignment.md
git commit -m "docs: align README with 2.0.0"
git push origin main
```

Expected: a new documentation commit is created on `main`; pushing is performed only after the user confirms the final public write.
