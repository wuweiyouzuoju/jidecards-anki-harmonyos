# 鸿蒙真机验收

[返回验证入口](verification.md) · [项目入口](../../PROJECT_CONTEXT.md)

## 执行与记录

此表汇总设备验收任务，不重复维护功能实现状态。实现、历史验证及限制以链接的领域文档为准。2026-11-21 盘点搜索了 `docs/development/`、`docs/decisions/` 中的真机、设备验收、未验证、尚未、仍需和待验记录；历史阶段的未验收结论先与后续记录核对，再映射到下面的场景。

每次验收记录包版本、实际安装包 SHA-256、设备型号/API、用例步骤、预期与实际结果、截图/日志、数据回读和缺陷编号。状态使用未执行、通过、失败、受阻；通过必须写明具体子场景，不能用打开页面或构建成功覆盖整行。

真机首次全量按下表展开执行；后续变更按影响复测，共享组件变化覆盖调用页面。相关输入变化后，旧结果只保留为历史证据。使用测试牌组/附件/账号，覆盖安装保留数据，禁止卸载清数据。整库恢复及故障注入在专用测试集合/设备实施，先验证备份可以恢复；不得在用户集合上试验。

## 真机验收摘要

HUAWEI MatePad 11.5S 灵动款（HarmonyOS API 26）已完成测试包安装和冷启动，并实测牌组新建、重命名、移动、删除确认与取消，Basic/Cloze 制卡保存和预览，学习翻面、四档评分、撤销及重启后统计回读。进阶场景覆盖富文本和公式回读、卡片双向引用、浏览搜索及预览、两条笔记的批量标签写入、主题和材质切换、弹窗关闭及朗读附件生成与试听。各子场景的测试包 SHA-256、截图、日志或数据回读记录见下文。

浏览搜索曾复现 ArkUI 焦点错误，修复后通过覆盖安装复测了命中、无结果、连续重查及离页返回。华为云整库往返在另一轮 MatePad 实测中完成，恢复后回读 **17,304 张卡片、12,408 条笔记、14 个牌组**。 [云备份与恢复](sync-data.md)

锁屏提醒送达、异机冷恢复和最低 API 21 设备矩阵仍待专项验收。

## 场景清单

下表提供完整测试矩阵。实机结果在本页按设备、安装包及子场景记录，正常、取消和失败分支分别核验。

| 编号 | 领域与依据 | 必跑场景及断言 | 设备/外部前提 |
| --- | --- | --- | --- |
| D01 | [首页](home.md) | 首次启动、公告/引导顺序、冷启动、热启动、离页后无迟到弹窗 | 当前平板 |
| D02 | [签名](signing.md) | 核对产物身份；同签名旧版升级后卡库/媒体/设置保留 | 有测试数据的旧版本 |
| D03 | [首页](home.md) | 新建/重命名/子牌组/移动/删除确认及取消；重启回读 | 测试牌组 |
| D04 | [浏览与编辑](browser-stats.md) | Basic/Cloze/遮罩制卡；中文/标点/emoji；保存继续、取消、重复及空字段反馈 | 测试牌组 |
| D05 | [浏览与编辑](browser-stats.md) | 富文本/HTML/公式/化学/引用/标签/字段固定；保存后重开核对 | 固定测试笔记 |
| D06 | [学习](study-media.md) | 翻面、四档评分、撤销、埋藏/暂停、完成判定、重启历史回读 | 含新卡/学习卡/复习卡 |
| D07 | [学习](study-media.md) | 两按钮/四按钮、四方向、自定义点按/滑动、多指、摇动、拼写、自动前进 | 多指/传感器；键盘另验 |
| D08 | [学习](study-media.md) | 学习中编辑/删除/切后台/离页；恢复只评分一次、不显示旧卡内容 | 测试笔记 |
| D09 | [浏览](browser-stats.md) | 搜索、标签树、排序、列表/表格、滚动分页、快速切卡与预览 | 小库及大库 |
| D10 | [浏览](browser-stats.md) | 多选、范围选取、批量写入、切换选择、忙碌时离页、错误重试 | 测试笔记；鼠标另验 |
| D11 | [媒体](study-media.md) | 系统选图/视频/文件、插入/替换/删除、保存重开、播放/拖动/离线 | 测试图片/音视频 |
| D12 | [媒体](study-media.md) | 录音允许/拒绝/重新授权、暂停/继续/取消/保存、来电或音频打断与输出路由 | 麦克风/耳机；打断来源 |
| D13 | [媒体](study-media.md) | 书画/遮罩创建、修改、取消、重新编辑；原图/源数据保持 | 测试图；手写笔另验 |
| D14 | [导入](import-data.md) | APKG/COLPKG/CSV/TSV/TXT；系统文件入口及外部打开；忙碌排队/取消/错误包 | 固定样本 |
| D15 | [导入](import-data.md) | 导出后重导；卡片/笔记/牌组/复习历史/媒体逐项回读 | 隔离测试集合 |
| D16 | [导入](import-data.md) | 导入中断、进程结束、空间不足、数据库检查、备份恢复 | 专用集合及可恢复备份 |
| D17 | [同步](sync-data.md) | AnkiWeb/自建服务器登录、无变化/双向/冲突/全量上传下载、媒体断网重试 | 测试账号及另一端 |
| D18 | [同步](sync-data.md) | 华为云上传、异机冷下载、非零复习历史与媒体回读、旧格式、断网/取消恢复 | 同账号第二台真机 |
| D19 | [同步](sync-data.md) | 设备直连配对/过期/取消、收发/合并/恢复、断线、旧回调隔离 | 第二台设备 |
| D20 | [接续](study-media.md) | 手机与平板/电脑系统发现、题目/答案/拼写恢复、数据缺失/忙碌拒绝、失败源端保留 | 支持接续的第二台真机 |
| D21 | [设置与统计](browser-stats.md) | 牌组选项/FSRS/限额/过滤牌组保存及取消；统计筛选及真实复习数据一致 | 有复习历史的集合 |
| D22 | [界面](appearance.md) | 主题/材质/颜色实时预览、取消/重启保持、真实壁纸选图裁剪 | 测试图 |
| D23 | [界面](appearance.md) | 全部业务弹窗的确认/关闭/返回/遮罩/忙碌守卫；连续开合无残窗或崩溃 | 逐页面展开 |
| D24 | [界面](appearance.md) | 横竖屏、分屏/浮窗尺寸变化、最小化/恢复、焦点、安全区和软键盘 | 平板；PC窗口另验 |
| D25 | [本地化](localization.md) | 支持语言、长名称、RTL、系统大字体、深浅色、读屏与减弱动态 | 真机及人工视觉/读屏核对 |
| D26 | [Agent](agent.md) | Provider真实请求、流式/取消/断网、附件PDF/OCR、代码沙箱 | 测试账号/合成资料 |
| D27 | [Agent](agent.md) | 普通写入、高风险确认/拒绝、批量保存中离页、连续请求、历史恢复 | 测试牌组 |
| D28 | [官方AI](../decisions/2026-11-20-official-ai.md) | 登录、额度扣减、取消/失败/重试不重复扣点、会话环境隔离 | 测试账号及服务端账本 |
| D29 | [官方AI](../decisions/2026-11-20-official-ai.md) | 单份/多份沙盒购买、取消、到账、断网补单、恢复购买、重复通知与退款冲正 | 沙盒账号；本人支付验证；通知域名 |
| D30 | [外部Agent](external-agent.md) | WorkBuddy连接、列牌组、创建/确认/回读、拒绝鉴权、重启/最小化/锁屏 | 鸿蒙PC真机及WorkBuddy |
| D31 | [媒体](study-media.md) | 提醒授权/拒绝、锁屏通知到达、点击返回；TTS离线音色与听感 | 系统权限/音色 |
| D32 | [验证](verification.md) | 大库冷启动、设置/浏览/切卡/导入耗时、连续学习内存/温升/耗电；记录数据规模和测量边界 | 固定大库与持续运行 |
| D33 | [验证](verification.md) | 最低支持API21核心链；当前系统手机/平板/2in1分别执行适用项 | 对应系统与真实设备 |
| D34 | [验证](verification.md) | 外接键盘快捷键/中文输入法/焦点、鼠标右键范围选择、滚轮/触控板 | 键盘、鼠标/触控板 |

## 2026-11-21 当前轮次

- 设备：HUAWEI MatePad 11.5S 灵动款，`devecocli device view` 报告 API26，1840×2800。连接成功。
- 安装前 `bm dump -a` 未列出 `com.jide.kapian`，`bm dump -n` 与启动均返回未安装；不能把本次安装作为旧版升级保留数据通过的证据，也不能直接复用旧设备的账号/卡库验收。
- 使用 `hdc -t <connect-key> install -r <signed-hap>` 安装成功，未卸载清数据。实际安装元数据为 `26.11.21.18` / `3158`。
- 安装包 SHA-256：`228ea8aae2decb6cff9cfa1be734dab0f30ced9c40fa838afd684dc94dd457d0`。这是现有本机签名产物，不声称整个当前共享工作树已联合验收或商店发布包已验证。
- `aa start` 成功，UI树与截图观察到首页、默认牌组和首次引导相关界面；随后观察到首页无模态遮挡。仅安装/启动基线通过，不据此将 D01 的所有分支标为通过。
- 启动补验（MatePad/API26，包 `26.11.21.18`/3158，SHA-256 `228ea8aae2decb6cff9cfa1be734dab0f30ced9c40fa838afd684dc94dd457d0`）：`aa force-stop` 后重新 `aa start` 成功，首页布局可读且没有模态层；截图见 [d01-cold.png](../evidence/2026-11-21-device-acceptance/d01-cold.png)。进程已在前台时再次发送 `aa start` 成功且首页仍可读，见 [d01-hot.png](../evidence/2026-11-21-device-acceptance/d01-hot.png)，但没有把应用切后台再恢复，因此不记作热恢复通过。冷启动观察只覆盖本次短时窗口，离页后迟到公告/引导、首次启动顺序仍待逐分支复验。
- D03 局部：目标为独立测试牌组「真机验收-20261121」。改名对话框关闭取消后强停重启，原名仍在；截图见 [d03-test-deck.png](../evidence/2026-11-21-device-acceptance/d03-test-deck.png)、[d03-cancel-restart.png](../evidence/2026-11-21-device-acceptance/d03-cancel-restart.png)。随后实际确认改名为临时名称，再恢复原名并强停重启回读；证据见 [d03-after-rename-confirm.png](../evidence/2026-11-21-device-acceptance/d03-after-rename-confirm.png)、[d03-rename-restored-restart.png](../evidence/2026-11-21-device-acceptance/d03-rename-restored-restart.png)。创建子牌组「子牌组验收」时界面提示“牌组已创建”；在首页滚动到对应位置后实际观察到子牌组行缩进显示，重启后仍在，计数 0 新/0 学/0 复；此前“未观察到”是未滚动到该行造成的误判，撤销该疑点。创建和重启截图见 [d03-child-created.png](../evidence/2026-11-21-device-acceptance/d03-child-created.png)、[d03-child-after-restart.png](../evidence/2026-11-21-device-acceptance/d03-child-after-restart.png)。创建空目标「真机验收-移动目标-20261121」后，实际将测试牌组及其子牌组整体移入该目标；首页层级与卡片计数显示测试牌组仍有 2 张新卡、子牌组仍存在，截图在工作区 `work/d03-move-applied.png`、`work/d03-after-move-tree.png`。随后打开调整层级的目标选择器，搜索“顶级牌组”时没有可选结果（只剩“新建一个父牌组”）；未提交任何更改，现有层级保持在测试目标下。恢复顶层的 UI 路径待澄清，避免误移入真实牌组。对含测试卡的父牌组打开删除确认，核对警示覆盖本牌组及子牌组后点取消；父牌组仍存在，证据 [d03-delete-confirm-parent.png](../evidence/2026-11-21-device-acceptance/d03-delete-confirm-parent.png)、[d03-delete-cancelled.png](../evidence/2026-11-21-device-acceptance/d03-delete-cancelled.png)。只验证删除取消分支，未确认删除，因目标中仍有需保留的验收卡；对子牌组单独删除确认分支未测。
- D04 Basic 卡局部：目标下拉框确认指向测试牌组，正面 `D04验收：中文，标点？！🙂`、背面 `D04答案：验收回读`。点击系统键盘右上角向下箭头收起键盘后，使用“保存并返回”提交；首页测试牌组计数由 0 增至 1。浏览列表显示正面，答案预览显示背面，编辑入口回读两字段一致，预览明确不计入学习记录。证据：[d04-after-save.png](../evidence/2026-11-21-device-acceptance/d04-after-save.png)、[d04-browser.png](../evidence/2026-11-21-device-acceptance/d04-browser.png)、[d04-note-back-preview.png](../evidence/2026-11-21-device-acceptance/d04-note-back-preview.png)、[d04-edit-entry.png](../evidence/2026-11-21-device-acceptance/d04-edit-entry.png)。另在同一测试牌组创建填空题，编辑器选中文字“地球”后用“新挖空”生成 `{{c1::地球}}`，保存后浏览列表显示 `D04填空：[...]，绕太阳运行。`，点开预览后答案面显示“地球”；验证了填空标记生成、保存及题面/答案面预览。证据：[d04-cloze-marked.png](../evidence/2026-11-21-device-acceptance/d04-cloze-marked.png)、[d04-cloze-browser.png](../evidence/2026-11-21-device-acceptance/d04-cloze-browser.png)、[d04-cloze-preview.png](../evidence/2026-11-21-device-acceptance/d04-cloze-preview.png)、[d04-cloze-answer-preview.png](../evidence/2026-11-21-device-acceptance/d04-cloze-answer-preview.png)。本轮仍未覆盖富文本、HTML、公式、引用、标签及图片遮罩。图片遮罩页面已打开系统图库选择器，但图库列表仅显示设备原有的个人照片/截图；未选取或归档这些用户媒体。尝试将本地合成测试图写入系统图库目录被系统拒绝（permission denied），故该子场景等待可用的非个人测试图片导入条件。
- D04/D05 补验：按恢复草稿中的测试卡先查看当前安装元数据为 `26.11.21.18`/3158（版本代码3158），设备仍是 MatePad 11.5S/API26。系统键盘右上角向下箭头在本页面先切换到输入法选项条，再次点击后切换为语音输入条，键盘仍占据视口；本轮因此没有声称已再次收起键盘。通过浏览器预览确认已保存卡正面为 `D04验收：中文，标点？！🙂`，答案面为 `D04答案：验收回读`；预览标注不计学习记录。证据补存于 [d04-current-preview.png](../evidence/2026-11-21-device-acceptance/d04-current-preview.png)。D05富文本、HTML、公式、化学、引用、标签、字段固定仍未实机执行。
- D10 局部（同包、同设备）：浏览器限定到 `真机验收-移动目标-20261121::真机验收-20261121` 后长按正面为 `D04验收：中文，标点？！🙂`、状态“新卡片 #1”的行，打开多选操作 → 编辑标签；输入并创建层级标签 `验收::D05标签`，确认后在筛选侧栏搜索该层级并点击末级。浏览器搜索条件转为 `tag:验收::D05标签`，结果为 1 张卡且正面、目标子牌组及新卡状态均正确，证明批量标签编辑写入与标签搜索读取一致。证据：[d10-tag-filter.png](../evidence/2026-11-21-device-acceptance/d10-tag-filter.png)。只验证单笔记创建/筛选标签，不代表多选差异更新、取消、标签管理或全部 D10 场景通过。
- D05/D04 局部（同包、同设备）：从上述过滤结果打开同一测试卡编辑，长按正面标点选中 `？`，点富文本“粗体”并保存。重开编辑后切换源码，字段显示 `D04验收：中文，标点<b>？</b>！🙂`，表明格式操作和HTML标记保存后可回读；截图：[d05-bold-source-readback.png](../evidence/2026-11-21-device-acceptance/d05-bold-source-readback.png)。公式和引用已完成下述实机局部验证。字段固定、化学、其他格式及复杂HTML预览重开仍未验证。标签在编辑页重开可见 `验收::D05标签`。
- D05 公式局部（同包、同设备）：重开测试卡后在正面字段光标处点一次公式工具，插入 `\\(\\)`，输入 `x^2` 得 `\\(x^2\\)`，收起键盘后保存；浏览器预览布局显示 `mathMLIdentifier x` 和上标位置的 `mathMLNumber 2`。随后重开编辑器，源码读回 `D04验收：中文，标点<b>？</b>！🙂\\(x^2\\)`，粗体HTML与数学公式均保留。证据：[d05-inline-math-preview.png](../evidence/2026-11-21-device-acceptance/d05-inline-math-preview.png) 和本页后续存档截图。第一次点公式后多出帮助弹层，本次草稿含空公式占位符，已选择放弃修改并确认退出；之后在新编辑会话中单击一次成功插入。只验证行内数学公式，不代表独立成行、化学、复杂HTML或公式导入通过。
- D05 引用局部（同包、同设备）：在正面选中文字 `D`，使用引用工具搜索并选择同一测试牌组内的 `D04填空：{{c1::地球}}，绕太阳运行。`，确认生成 GUID 引用锚点；保存后浏览器预览显示可点击的“D04”链接。点击链接后进入目标填空卡，答案面预览显示“关联卡片 · 1 / 引用我”及反向来源链接，验证引用创建、保存、目标打开和反向关系读取。证据：[d05-note-reference-preview.png](../evidence/2026-11-21-device-acceptance/d05-note-reference-preview.png)、[d05-reference-backlink.png](../evidence/2026-11-21-device-acceptance/d05-reference-backlink.png)。只覆盖一个测试笔记对，冲突、删除目标、同步往返未测。
- D09 搜索续验：在浏览器搜索框聚焦后点系统输入法“全选”，输入唯一字符串 `x^2`，再点输入法右下“完成”提交，结果数由2502收窄为1；唯一结果正面显示含 `\\(x^2\\)` 的测试卡，牌组和新卡状态正确。第一次加载时同时显示“The component doesn't exist, is currently invisible, or has been disabled.”及“重试”按钮；截图 [d09-search-result-retry.png](../evidence/2026-11-21-device-acceptance/d09-search-result-retry.png)。点“重试”后错误区消失，唯一卡片行正常显示，搜索仍为1；未复现第二次错误，尚无堆栈/日志，作为待查瞬时异常保留，不据单次自动恢复判定缺陷已修复。切换浏览视图到“笔记”后计数为1条笔记，再切回“卡片”仍为1张卡；“笔记”模式截图：[d09-note-view-x2.png](../evidence/2026-11-21-device-acceptance/d09-note-view-x2.png)。用筛选侧栏搜索层级标签 `验收::D05标签` 后点击末级，浏览器查询变为 `tag:验收::D05标签`，结果1张卡且牌组、测试正面和新卡状态均匹配；截图：[d09-tag-filter-readback.png](../evidence/2026-11-21-device-acceptance/d09-tag-filter-readback.png)。从结果行打开预览显示1/1，题面含格式、emoji和公式，点击翻面后读到答案 `D04答案：验收回读` 及该笔记引用的填空卡反向链接；未计入学习记录。结果只有1项，未据此声称快速切卡或分页通过。
- D09 长结果集：查询 `宪法` 得到206张卡片，列表纵向滑动后可见行内容变化、计数保持206；此前首次加载显示的组件错误在重试后清除。初始长结果截图：[d09-search-206cards-scroll.png](../evidence/2026-11-21-device-acceptance/d09-search-206cards-scroll.png)。该步骤只确认滚动浏览，不声称全部206张已加载，也未证明末页/翻页行为。
- D09 缺陷修复与换包复测：连续两次搜索提交后出现与搜索本身无关的 `The component doesn't exist, is currently invisible, or has been disabled.`。设备错误日志同秒记录 ArkUI `150003`；代码定位为搜索完成后立即 `requestFocus('browser-result-list')`，新结果列表尚未挂载时抛错，并被错误地显示为搜索错误。当时的修复包把焦点请求延后 80 毫秒，并把焦点失败移出搜索错误提示。使用本机 ceshi 测试签名覆盖安装（未卸载、未清数据），应用仍报 `26.11.21.18`/3158；HAP SHA-256 `8b38fa53f4add0ea66eaac4514c65c74f94db5b6308de901dc5f314f82d63255`，`hap-sign-tool verify-app` 显示 `verify-app success`、profile type `debug`，提取 profile 与项目 ceshi IAP debug profile 完全一致。第一次调用 DevEco 自动安装选用了 release 身份并被系统拒绝，未替换已安装版；随后用 ceshi 签名手动覆盖成功，包名/签名身份、牌组数据仍保留。新包启动后按原步骤重测 `x^2` 唯一搜索（2502→1）和 `宪法` 长列表（206条并滚动），均不再显示错误或“重试”条；最近3分钟错误日志无 `150003`/该组件错误匹配。长列表复测截图：[d09-search-206cards-fixed.png](../evidence/2026-11-21-device-acceptance/d09-search-206cards-fixed.png)。这两条实测只确认搜索结果和错误提示恢复正常。列表是否实际获焦、空结果、快速重查和离页均未在该包上验证。列表/表格传统布局、分页末端和多卡预览切换仍未验证。
- D08 局部：保存前系统键盘打开时用 Escape 离开应用到桌面，再通过 `aa start` 返回同一添加卡片页，正反面草稿仍显示；证据 [d08-draft-restored.png](../evidence/2026-11-21-device-acceptance/d08-draft-restored.png)。随后该草稿已按 D04 保存。此操作只证明当前进程/Ability保留编辑草稿后返回；未验证进程死亡恢复、学习中的编辑/删除、切后台后的学习页恢复、评分去重或旧卡内容隔离。
- 新测试包：`26.11.21.18`/3158，SHA-256 `8b38fa53f4add0ea66eaac4514c65c74f94db5b6308de901dc5f314f82d63255`，MatePad 11.5S/API26；以上 D09 搜索与滚动复测使用此包。包变化后，旧哈希下的验收证据仅作历史记录；后续需按影响复测 D09/D10 浏览焦点、搜索和多选路径，其他领域按各自变更影响确认。设备未卸载或清理数据；父牌组、子牌组及两张测试卡仍在。暂停前最后确认的界面是 `D04` 两条搜索结果的第 1 张预览，最后一次切卡操作中断，未读回页码。此前 `x^2` 与父测试牌组组合条件返回唯一测试卡，见 [d09-cross-deck-query.png](../evidence/2026-11-21-device-acceptance/d09-cross-deck-query.png)。标签追加到已有查询未验证。
- D09 焦点修订（本地）：移除固定延时，仅在当前查询有结果且列表完成布局时尝试接管焦点。离页、弹层和重新操作搜索框均有保护，Ctrl+F 直接聚焦搜索框。浏览回归 738 项通过，ArkTS 编译和签名 HAP 生成成功。构建命令最终被工作树中 `AgentSecretStore.ets` 的额外 SDK 警告拦下。真机验收保持暂停，新代码未安装。恢复时先用相同签名构建测试包并覆盖安装，复测 D09 单条、空结果、长列表、快速重查与离页，以及 D34 外接键盘 Ctrl+F、提交后列表实际获焦和方向键选卡。随后接续分页末端、多卡预览及剩余子场景。

- 继续验收（MatePad 11.5S/API26，安装包 `26.11.21.18` / `3158`，HAP SHA-256 `3d3cb9c4c94cb004f61afe2367bb9233a7b98a6a4138b7d643e409b1aaa5dde8`）：为修复 `AgentSecretStore.ets` 中 `saveExternalMcpToken` 对严格安全存储写入上抛但未声明 `@throws` 的新 SDK 告警，补充异常契约；外部 MCP 服务 `change()` 已有 `catch`，失败时关闭服务并设为 `error`/`disable_error`，不吞成成功。`ai-agent-external-mcp.test.mjs` 17 项通过；`JIDECARDS_SIGNING_CONFIG=.local/sandbox-device-signing.json npm run build:app -- --skip-rust` 返回 0，ArkTS 编译、HAP 警告核验成功；覆盖安装被 MatePad 接受，未卸载/清数据，随后强停重启成功。不要将这次包等同于发布签名或正式发布验证。
- D09 搜索复测（上方本包）：重启后浏览器搜索框输入 `x^2` 并点输入法右下“完成”，计数从 2502 变为 1；唯一结果是测试 Basic 卡，保留层级牌组、新卡状态及包含数学公式的题面。布局没有组件错误/重试提示；截图：[d09-x2-after-search-fix.png](../evidence/2026-11-21-device-acceptance/d09-x2-after-search-fix.png)。这只覆盖该查询下的提交与结果读取，空结果、快连查、离页和结果列表真实键盘焦点尚待执行。
- D09 空结果、快速重查与离页局部（同设备/包）：输入唯一不存在的 `query-no-hit-20261121` 并提交，计数显示 `0 张卡片`、列表显示空态，没有重试条；截图：[d09-zero-results.png](../evidence/2026-11-21-device-acceptance/d09-zero-results.png)。随即将查询完整替换为 `x^2` 得 1 张，再替换为 `D04填空` 得 1 张对应 Cloze 测试卡；最终 UI 树没有组件错误/重试提示，截图：[d09-fast-requery-one-result.png](../evidence/2026-11-21-device-acceptance/d09-fast-requery-one-result.png)。随后从浏览返回首页，再进入浏览，列表回到全部 2502 张，搜索框为空、IME 收起且无残留弹窗；截图：[d09-leave-return-all.png](../evidence/2026-11-21-device-acceptance/d09-leave-return-all.png)。离页后错误级日志未发现 `150003` 或组件不存在错误；有若干无关的 WidgetData formId 配置错误，需在 D31/桌面组件范围单独判断。键盘提交后结果列表实际获焦未能从系统无障碍树确认，仍需外接键盘做 D34 验证。
- D06 隔离牌组局部（同设备/包）：测试前选中「真机验收-20261121」，确认本牌组 `2 新 · 0 学 · 0 复`，仅含上述两张 D04 测试卡。依次实际展示答案；Basic 评分“忘记”，Cloze 评分“困难”，从“更多 → 撤销操作”撤销后 Cloze 重新出现且计数回到 `1 新 · 1 学 · 0 复`；随后 Cloze 评分“良好”、Basic 评分“简单”、再次出现的 Cloze 评分“良好”。学习页显示“今天的学习完成了”、`0 新 · 0 学 · 0 复`。回首页强停重启，统计仍显示今日完成 4、待学习 20，证明撤销的困难评分没有计入净完成数，另外四次评分已持久化到会话统计；截图：[d06-answer-four-ratings.png](../evidence/2026-11-21-device-acceptance/d06-answer-four-ratings.png)、[d06-complete.png](../evidence/2026-11-21-device-acceptance/d06-complete.png)、[d06-home-after-restart.png](../evidence/2026-11-21-device-acceptance/d06-home-after-restart.png)。四种评分按钮均实触，其中“困难”已撤销；未单独回读复习历史详情、各卡数据库队列/间隔或埋藏/暂停/撤销评分历史，不据此宣称 D06 全项通过。

- D03 删除流程局部（同设备/当前包）：在首页定位空测试子牌组「子牌组验收」并长按 → 删除牌组，确认弹窗明示目标名、影响范围及取消/确认操作。先点“取消”，子牌组仍显示；再次进入确认并点“删除牌组”，界面报告删除完成且没有未引用媒体待回收；随后在独立测试父牌组下重建同名子牌组，界面提示创建成功。截图：[d03-delete-confirm.png](../evidence/2026-11-21-device-acceptance/d03-delete-confirm.png)、[d03-delete-recreated.png](../evidence/2026-11-21-device-acceptance/d03-delete-recreated.png)。只覆盖空子牌组删除确认、取消及重建；含卡牌/媒体的父子删除影响和媒体回收仍未验证。
- D09 双卡预览切换（同包）：在过滤到两张测试卡后打开第1张预览，题面点击能翻到答案；在卡片区域下方空白处以约 `1350px` 横移切换到 `2/2`，反向滑动回 `1/2`，列表仍是两张原卡。先前在卡片正文和较上方 y 坐标滑动没有切换；确认可用手势区域是预览卡片的下方空白。截图：[d09-preview-2of2.png](../evidence/2026-11-21-device-acceptance/d09-preview-2of2.png)。该结果证明本次双卡前后切换，不替代更多行快速连切、翻面期间切换、分页和焦点测试。
- D10 多选与批量标签局部（当前包）：按精确牌组查询得到两张测试卡，长按首条、勾选第二条，顶部明确显示“已选 2 项”。批量标签编辑追加 `验收::D10批量标签`；确认并退出后，在筛选侧栏点该标签末级，查询变为 `tag:验收::D10批量标签`、结果为两张测试卡。再以 `验收::D05标签` 过滤，结果仍仅为原 Basic 卡 1 张，证明批量新增标签写入两条目标笔记且保留了原有差异标签。截图：[d10-batch-tag-two-results.png](../evidence/2026-11-21-device-acceptance/d10-batch-tag-two-results.png)。此处只覆盖双笔记追加、原差异保留及搜索回读，范围选择、多选切换、忙碌离页、失败重试、批量删除/改牌组等仍待验。


- D01 重装补验（同一 MatePad/API26）：用户自行卸载后，包管理器查询确认应用不存在。重新安装 `26.11.21.18`/3158，HAP SHA-256 `3d96a33c673e9cddcadc4008d1e9c1bda99049948f7b7cba78b6ba6c24862a79`。实测首次启动显示隐私声明，点同意后进入牌组获取引导，下载完成后首页显示 5 个牌组、60 张待学习。该次覆盖首次同意与进入首页。公告、拒绝与离页分支仍待实测。卸载前的验收集合仍须重建。证据见 [隐私声明](../evidence/2026-11-21-device-acceptance/d01-reinstall-privacy.png) 和 [引导后首页](../evidence/2026-11-21-device-acceptance/d01-reinstall-home.png)。
- D22/D23 玻璃菜单局部（同设备）：`26.11.21.18`/3158，HAP SHA-256 `9b4239df85d645867961c5c157972b9ab45f98088f49f206cc2a62bad6167c15` 的玻璃菜单固定叠加 90% 底色，浅色近白，判定失败。撤掉静态和采样层的固定叠色后，以相同测试签名覆盖安装，验签成功，设备回读 `26.11.21.18`/3158。新 HAP SHA-256 `d092e6f5935cae2fe69dfc43102f85a15540e01e41e652166c1360325bbed463`。预期玻璃小菜单显示当前背景的采样、模糊和轮廓。浅色绿主题下实测首页更多、设置 → 外观 → 颜色主题、界面材质 → 调整对象三个菜单均重新显示各自背景，旧包选中的绿主题仍在。证据见 [白底缺陷](../evidence/2026-11-21-device-acceptance/d22-color-menu-90pct-regression.png)、[颜色主题](../evidence/2026-11-21-device-acceptance/d22-color-menu-glass-restored.png)、[首页更多](../evidence/2026-11-21-device-acceptance/d22-home-menu-glass.png)、[调整对象](../evidence/2026-11-21-device-acceptance/d22-material-section-menu-glass.png)。本轮仅确认这三个入口的浅色玻璃恢复。背景文字或控件仍会按现场模糊度透出。玻璃小菜单不受弹窗面板底色滑杆调整。模糊度、深色和扁平材质后续已单独记录；当前接续点为真实壁纸安全图片裁剪，以及其他业务弹窗入口。


- 音频编辑包覆盖安装（MatePad 11.5S 灵动款 / API26）：`26.11.21.18`/3158，实际签名 HAP SHA-256 `e2d37544e198147e4059f30ad661c2327bc47f1108427d9b0d4a4d406f5d733a`，SDK 验签成功，内嵌 profile 与现有 ceshi 调试 profile 一致。执行 `hdc install -r` 返回 `install bundle successfully`，设备 `updateTime` 从 `1795248804535` 更新为 `1795252189495`，包名、appIdentifier 和证书指纹一致。启动后 UI 回读首页及原有牌组。此次只验安装、启动和牌组列表可见；新包需复测编辑音频导入/录音、生成朗读、附件试听/取消/保存回读，以及离线音色。旧包结果保留各自哈希。


- 同窗朗读编辑包覆盖安装（同 MatePad/API26，`26.11.21.18`/3158）：HAP SHA-256 `c205250d74f16fc582585c0c1dbf92460c0431f5ca3d69ba7826f189a12e9eee`。验签成功，内嵌 ceshi profile、签名证书与原设备身份一致；`install -r` 成功，`updateTime` 从 `1795252189495` 更新为 `1795252620635`。启动保留原有牌组。新包的同窗输入、生成、试听、应用、卡片保存回读及离线音色仍待实测。


- D31 编辑器朗读合成修复复测（MatePad 11.5S/API26，`26.11.21.18`/3158，SDK 验签、ceshi 同签名覆盖；已安装 HAP SHA-256 `c2f9364a649a269654e6ac2440d0617bb55fdd5a2b198b5d596abb8c2cc2acd3`，`updateTime=1795253418210`）。在「音频测试」牌组添加卡片 → 正面音频 → 生成朗读，输入「你好」。旧包两种中文音色都返回 16kHz/16bit PCM，但通道字段为 3，原代码按声道数处理导致 WAV 校验失败；新包对该返回值使用单声道，生成 27750 字节 WAV，`AVPlayer` 回调 playing 和 completed。点击应用后返回添加卡片，附件和播放入口仅显示在正面。证据：[生成](../evidence/2026-11-21-device-acceptance/d31-note-speech-generated.png)、[应用后草稿](../evidence/2026-11-21-device-acceptance/d31-note-speech-applied-draft.png)。前后日志在本机验收归档中。未保存测试卡、未改变网络设置；保存后回读、严格断网和听感仍待验。


- 朗读窗口图标包覆盖安装（同 MatePad/API26，`26.11.21.18`/3158）：实际安装 HAP SHA-256 `840a2342b85a550dcd3f146ff979a12abf9610bb887c6e8b81ab8cb5a55429c0`。SDK 验签成功、内嵌 ceshi profile 一致，`install -r` 成功，`updateTime=1795253939395`、设备证书指纹一致。应用启动后回读首页和「音频测试」牌组。播放图标、确认勾及朗读流程在此包上的真机复测待执行。


- D31 朗读附件图标复测（MatePad/API26，26.11.21.18/3158，ceshi 覆盖安装 SHA-256 `83f08d896e94df99119cf65c67225ef641687a2906548ec6a896e71e42f7fab8`，updateTime `1795254253627`）：在「音频测试」牌组正面输入「你好」并生成，朗读窗口显示播放图标和确认勾。点勾回到卡片草稿，附件行也显示播放图标，无可见「播放」文字。见[附件草稿截图](../evidence/2026-11-21-device-acceptance/d31-note-speech-attachment-icon.png)。本条仅覆盖朗读窗口和回填附件，测试卡未保存。

## 收尾标准

- D22 玻璃模糊度低/高值及重启回读（MatePad 11.5S/API26，包管理器回读 `26.11.21.18`/3158；对应此前已安装包 SHA-256 `d092e6f5935cae2fe69dfc43102f85a15540e01e41e652166c1360325bbed463`）：进入设置 → 外观 → 外观自定义 → 界面材质，先读到玻璃模糊度 `80%`，模块底色不透明度 `32%`、按钮底色不透明度 `79%`、弹窗面板底色不透明度 `0%`。只调整玻璃模糊度滑杆，在同一「颜色主题」菜单入口观察 `1%` 与 `100%`；低值时菜单透出更多可辨认的背景文字，高值时背景内容更模糊，玻璃小菜单仍透出当前主题背景。三个底色滑杆未操作、数值保持原样。随后把模糊度恢复为原值 `80%`，强停并重启应用，重新打开设置回读仍为 `80%`。证据：[1% 菜单](../evidence/2026-11-21-device-acceptance/d22-blur-1-percent-color-menu.png)、[100% 菜单](../evidence/2026-11-21-device-acceptance/d22-blur-100-percent-color-menu.png)、[重启后 80% 与未改底色滑杆](../evidence/2026-11-21-device-acceptance/d22-blur-80-percent-after-restart.png)。玻璃模糊度子场景通过。
- D22 深色及扁平材质菜单对照（同 MatePad/3158/已安装包哈希）：同一设置 → 外观 → 颜色主题菜单入口切换外观主题为深色，玻璃材质下实测菜单随深色根背景显示深色透射面、轮廓和绿主题选中态；临时切换界面材质为扁平，菜单显示扁平深色面板。切换材质时材质面板显示相应模式值（扁平：模块/按钮/弹窗面板 `100%/100%/94%`；切回玻璃：深色对应 `35%/79%/0%`）；三个不透明度滑杆未手动拖动。随后将主题恢复为跟随系统；强停并重启应用后回读为跟随系统、绿色主题、玻璃材质、模糊度 `80%`，浅色对应底色读数 `32%/79%/0%`。证据：[深色玻璃菜单](../evidence/2026-11-21-device-acceptance/d22-dark-theme-glass-color-menu.png)、[深色扁平菜单](../evidence/2026-11-21-device-acceptance/d22-dark-flat-color-menu.png)、[深色扁平设置读数](../evidence/2026-11-21-device-acceptance/d22-dark-flat-material-settings.png)、[切回深色玻璃后的读数](../evidence/2026-11-21-device-acceptance/d22-dark-glass-settings-restored.png)、[重启后的原始浅色设置](../evidence/2026-11-21-device-acceptance/d22-blur-80-percent-after-restart.png)。此路径完成；牌组、编辑、学习等其他业务入口和真实壁纸裁剪仍待验。

- D23 提醒新建弹窗关闭路径局部（MatePad 11.5S/API26，包管理器回读 `26.11.21.18`/3158；当时安装包哈希沿用本记录 D22 覆盖安装证据 `d092e6f5935cae2fe69dfc43102f85a15540e01e41e652166c1360325bbed463`）：提醒列表为空时打开“新建提醒”，实测左上角取消可关闭且不新增记录；重新打开后点击弹窗外遮罩也可关闭，列表仍显示“暂无提醒”。截图：[新建提醒弹窗](../evidence/2026-11-21-device-acceptance/d23-reminder-add-dialog.png)、[取消及遮罩回退后的空列表](../evidence/2026-11-21-device-acceptance/d23-reminder-cancel-and-mask.png)。随后连续通过系统返回键重复开合两轮，均回到空列表且布局树无残留 Dialog；合计验证左上取消、点遮罩和系统返回三种关闭路径，未发现崩溃或残窗。证据：[反复关闭后的提醒空列表](../evidence/2026-11-21-device-acceptance/d23-reminder-list-after-dismissal-cycles.png)。未点击确认；忙碌守卫及其余业务弹窗仍未验证。
- D31 通知授权与计划投递（MatePad 11.5S/API26，`26.11.21.18`/3158，安装记录 HAP SHA-256 `d092e6f5935cae2fe69dfc43102f85a15540e01e41e652166c1360325bbed463`）：首次保存启用的 16:48 默认提醒时出现系统“允许通知”提示；选择允许后进入系统通知管理，确认后允许通知为开启，锁屏通知样式可选。应用提醒列表回读 16:48 项目且开关开启。设备于 16:46:54 进入息屏锁定状态，16:48:21 仍为息屏；唤醒后未见应用通知，约 16:50 手动打开通知中心也未见“记得闪卡”通知。锁屏到达/点击返回因此未通过，未发现通知事件证据；息屏截图为全黑，不作为送达证据保存。为避免留下测试项，随后从提醒编辑页删除 16:48 测试提醒，列表回读“暂无提醒”。当前只能证明授权提示、系统允许状态和提醒配置保存；拒绝/重授权及真实锁屏送达仍待定位并复测。授权页证据：[应用通知授权提示](../evidence/2026-11-21-device-acceptance/d31-notification-permission-prompt.png)、[16:48 提醒草稿](../evidence/2026-11-21-device-acceptance/d31-reminder-1648-draft.png)；删除后空列表证据：[提醒空列表](../evidence/2026-11-21-device-acceptance/d23-reminder-empty-after-test-delete.png)。
- D22 壁纸选择器取消回退（MatePad 11.5S/API26，`26.11.21.18`/3158）：从外观自定义打开“自定义壁纸”，点击“选择壁纸”进入系统图库选择器，再点取消；系统返回应用的“自定义壁纸”弹窗，外观页主题仍为跟随系统/绿色，未选择或写入壁纸。证据：[取消后回到自定义壁纸弹窗](../evidence/2026-11-21-device-acceptance/d22-wallpaper-picker-cancel-return.png)。系统图库当时显示含个人资料的缩略图，未选取、未保存图库截图；因此只确认选择器打开及取消回退，图片选取、裁剪、应用后回读及移除恢复仍未验证，需提供安全测试图再测。

本机适用项逐分支完成，发现缺陷修复后复跑原失败路径和同类调用点。需要第二设备、最低版本、PC、外设或本人登录/支付的项目必须保留具体受阻原因，不能算本机通过或从清单删除。

下一次发布评审应核对本次实际包及适用设备的结果；当前构建/CI尚未自动读取本表，不声称已有自动发布拦截。自动门禁后续应消费结构化报告、校验包哈希及必填用例状态，拒绝缺失/失败或拿其他包结果认证本包；人工视觉与真实支付步骤仍须明确证据。
