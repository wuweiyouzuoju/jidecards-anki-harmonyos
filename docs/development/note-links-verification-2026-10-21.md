# 双端笔记引用验收记录（2026-10-21）

入口与协议：[note-links.md](note-links.md)。本记录针对当日共享工作树；保留进入任务前已有的其他未提交修改，没有提交、发布或安装用户设备。

## 已执行

- 仓库完整 `npm run verify -- repo`：3497 项中 3492 通过、5 项失败，失败分类见下文；本次新增引用、协议生成和改动涉及的预览/学习回归通过。
- 跨语言协议与生产服务专项通过：中文及特殊 GUID、65 条完整关系与30条展示限制、别名、反向引用、删除、缺失目标、过期草稿、旧字段迁移保护、面板读取过期和计时暂停。
- `python -m unittest discover -s desktop/anki-note-links/tests -v`：无 Qt 的迁移/字段保留/版本校验，以及24000节点反向索引缓存回归通过。
- `cargo test -p jidecards_core --features anki-core --locked --test note_links` 与对应 `cargo clippy ... -- -D warnings` 通过；真实临时 Core 收藏库验证参数绑定、GUID定位、本机卡片列表、错误请求及笔记/卡片无写入。
- Windows安装版Anki的独立临时配置离屏启动通过：旧HTML字段与完整JSON迁移、字段原文保留、实际富文本界面、反向引用、删除、浏览器入口及关闭悬浮按钮后仍注入点击处理。已导出只含合成笔记的演示 APKG 和实际窗口截图。
- `tools/test-note-links-browser.mjs` 12组通过：320/390/1200宽度，深浅色，1/1.5文字字号；无横向溢出，长文字换行，关联行44px以上点击高度，GUID点击只触发一次。使用生产卡面构建与会话，截图为浏览器卡面，不是ArkUI设备截图。
- 完整双架构原生构建后，最终增量 ArkTS/资源构建与签名 HAP 通过；构建警告 accepted=268、unexpected=0。没有修改警告基线。
- 生成协议核对、文档链接及 `git diff --check` 通过。

沙箱内系统protoc遇到Windows DLL重定位错误；版本检查证明同一protoc在沙箱外正常，实际原生构建与相关检查在沙箱外执行，没有更换工具链或SDK。

## 其他工作树失败

以下源码在任务进入时已有未提交变更，本任务没有修改这些失败对应的源码，也没有为使测试通过而改动其断言：

| 测试 | 失败 |
| --- | --- |
| `ai-agent-high-risk-ui-contract` | 供应商设置的旧 onSelect 源码形状断言与现有组件不符 |
| `deck-preview-session` | 首页测试替身未提供现有 `closeSyncChoice` |
| `official-announcement-flow-contract` | 首页新增操作改变 onPageHide 源码形状，旧公告断言不符 |
| `portfolio-site` 两项 | 网站下载/发布说明仍为3.0.20，本地应用元数据已为3.0.28 |

因此不将完整仓库验证报告为全绿，也没有在共享工作树覆盖这些任务的改动。

## 未验证与交付边界

没有可用的hdc目标：未做HarmonyOS真机安装、原生弹窗实际布局/系统字号/键盘矩阵、真实账号在线同步或两端同时离线编辑冲突验收。
同笔记的离线并发仍遵循原Anki同步语义；新协议没有声称能逐边自动合并。
签名包基于当前本地3.0.28工作树，是待设备验收的测试包，不是已发布版本。
原始用户ZIP不改写；电脑安装包、合成演示牌组、源码、迁移说明及本记录进入新的交付ZIP，鸿蒙HAP单独交付。

## 2026-10-22：编辑页增量

独立编辑页和宽屏 BrowserEditorPane 共用表单均增加标签下方的“关联卡片 · 数量”。入口复用 SettingsActionRow，弹层复用现有 NoteLinksPanel/DialogFrame；未增加自定义颜色、圆角、描边、箭头、窗口或安全区实现。用户正文与管理块隔离，引用即时保存，正文保留原保存/放弃流程。标签外缘至操作行点击区外缘由 Column 独占8vp（窄版）/12vp（普通），操作行内部另有8vp顶部文字留白；水平外缘由 Scroll 独占12vp，底部安全区不向此入口重复叠加。

此次只改前端，不改引用协议、电脑插件或原生输入，复用当前已构建的双架构 debug Core 档案。

- `note-links-editor / note-links / editor-page / browser-editor-component / browser-desktop-ui / note-editing-basics / note-draft-preview / note-audio / note-editor-session`：102项通过，包含真实生产表单方法、NoteEditorSession 与字段投影/恢复；覆盖未保存正文/标签/附件保留、最新管理块保存、显示文本/引用预览返回、刷新重试、外部正文/标签/类型冲突、迟到读取、宽屏宿主忙碌和仅引用提交后的列表刷新。
- `ai-agent-app-structure / ai-agent-page-awareness / architecture-boundaries / arkts-component-fields / i18n-contract / ui-settings-components / ui-shell-contract / ui-surface-border / ui-dialog-layout / ui-locale-refresh / documentation-contract`：166项通过。JIDE 直接读取共同入口、实际数量/禁用/刷新待完成状态；不提供新的助手写入工具。
- `npm run build:app -- -SkipRust -ArtifactDirectory D:/Projects/output/jide-note-links-editor-20261022/harmony`：最终增量签名 HAP 通过，警告 accepted=162、unexpected=0；未改警告基线。最终包269277611字节。
- 本次变更的 `git diff --check` 通过。

此次没有重新运行全仓 verify、Rust或电脑GUI验收；上文2026-10-21的完整检查结果及失败分类仅属于当日输入。没有可用hdc目标，仍未安装/操作用户设备；原生实际布局、深浅色/宽窄屏/大字号/键盘矩阵与在线同步不能由上述源码/行为检查和编译替代。
