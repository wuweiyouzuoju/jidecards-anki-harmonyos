# 过期知识与断言检查（2026-10-10）

本页记录本轮工作树的核查与修复，不作为以后任务的当前测试结果或功能清单。当前事实仍沿 [PROJECT_CONTEXT](../../PROJECT_CONTEXT.md)、[功能状态](../FEATURE_STATUS.md)和所属领域定位。

## 范围与方法

- 保留开始前已有的未提交实现、规则、文档和测试修改；以当前工作树为准核对入口、调用者、配置和测试，不从旧报告反推功能。
- 完整发现并执行 `tools/tests/*.test.mjs`，核对根入口、`.agents/`、`docs/` 和组件说明的链接、配置、发布开关及历史边界；额外扫描内部章节锚点与旧路径引用。
- 对“未实现”“无调用者”“仅底层”“后续待办”沿真实 Service、UI/JIDE 调用链与生成清单复查。保留设备待验与历史证据，不用主机测试替代设备结论。

## 已修复

| 问题 | 根因与修复 |
| --- | --- |
| 首页学习历史的源码断言失败 | 断言要求快照赋值和刷新 token 自增相邻；中间新增失效菜单清理后发生误报。保留详情布局接线检查，改由真实首页刷新方法断言成功提交、菜单保留/关闭、失败、代次失效、离页和迟到统计的 token 行为。 |
| 官网源码版本落后 | 重跑 `tools/build-site.mjs`，从 `AppScope/app.json5` 同步 2.9.88 / 3069 到 HTML、JSON、Markdown、结构化数据及 llms。作者确认的正式版 2.9.22 独立保留；没有部署线上。 |
| 协议清单过期 | 重跑 `npm run protocol:generate`，刷新当前调用者及直接测试线索；保持描述、协议定义和生成客户端语义。 |
| 文档测试绑定配置写法与固定提交 | 使用 JSON5 读取应用/SDK 配置，Anki checkout 断言由 `UPSTREAM.lock` 派生；同步核对源码版本、构建号、Rust 和 Core 文档值。 |
| 当前待办包含已完成项 | 开发状态改为扩充已有 Core 互通/协议对照；入口决策纠正真实改名和浏览列设置状态，JIDE 工具状态转回当前领域。 |
| README 宣称可配置 CA 证书 | `同步服务.设置自定义证书` 只有底层封装，UI/JIDE 无调用者；README 纠正功能范围，[同步领域](sync-data.md#自定义同步端点与证书边界)记录选择、存储、恢复和移除均未接通。 |
| 旧审计冒充当前缺口 | Core/RPC 盘点正文、表头、实施顺序和交接改为明确的当日快照；当前导航转向生成清单与领域拥有者。弹窗失败记录与旧编辑交接指向后续核查，历史数据不伪造为当时通过。 |
| 验证与联网口径漂移 | 核心互通说明避免重复执行 repo/native 全量测试；同步领域链接已有独立在线记录，Agent 设计按应用端搜索/网页工具验收，不以 Provider 内置搜索判断联网能力。 |
| Agent 历史与观察范围过期 | 稳定设计区分脱敏限长的可见历史和完整 Provider 协议检查点，保留原始思考、签名/加密字段的真实续接边界；移除媒体弹层整体尚未接入的旧说法，按当前发布者与未登记控件描述。 |
| 版本说明冒充当前源码 | 2.9.22 说明明确为 2026-10-07 的源码变更与提交快照，当前版本回指配置和后续版本说明，不改变已确认的官网正式版本。 |
| 章节链接缺少持续校验 | 文档契约增加本地 Markdown 章节锚点门禁，覆盖重复标题、Unicode、格式、Setext 与 HTML 锚点，排除围栏代码；规则参照 [GitHub 章节链接](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#section-links)，工具范围同步进验证文档。 |

## 验证

- 首轮 `npm run verify -- repo`：3,243 项中 3,240 通过、3 失败，分别为上表的首页源码形状、官网版本和生成清单。
- 修复后的首页/历史、官网和协议专项：254 项通过。后续完整回归包含这些专项。
- 首次完整收尾 `npm run verify -- repo`：3,245 项全部通过。继续核查新增章节锚点门禁后，文档契约与 Agent 思考续接、页面观察和展示专项 49 项全部通过。
- 最后一次 `npm run verify -- repo`：3,246 项中 3,244 通过、2 失败；本轮文档、首页、官网及协议检查通过。两项失败来自收尾期间共享工作树新增的按压实现，见下节，不能继续沿用此前全绿结论。
- `npm run test:cards:browser`：真实 Edge 共 253 个场景通过（显示上下文 17、配色 144、模板 88、翻面 4），无模板脚本错误或额外资源错误。继续核查未修改这些检查的输入，复用该结果；它不代表 ArkWeb 或设备验收。

任务日志保存在仓库外 `D:/Projects/jidecards-stale-audit-*-2026-10-10.log`，便于本机查证；可移植交接以源码、上述入口和命令为准，不要求其他 checkout 拥有这些临时日志。

## 收尾时的共享工作树失败

| 检查 | 实际错误与未就绪依赖 |
| --- | --- |
| [按压反馈回归](../../tools/tests/ui-press-feedback.test.mjs) | 加载真实 `PressFeedback.ets` 时发生 `ReferenceError: AttributeUpdater is not defined`；测试仍直接调用已移除的 `applyPressedAttribute`。 |
| [玻璃按压回归](../../tools/tests/theme-text.test.mjs) | 同样在加载 `PressFeedback.ets` 时失败；后续测试仍依赖旧的直接按压方法。 |

发生于独立检查已通过之后：共享改动将 [PressFeedback](../../entry/src/main/ets/utils/PressFeedback.ets) 改为继承 `@kit.ArkUI.AttributeUpdater` 并通过真实 touch 回调更新属性，[GlassSurface](../../entry/src/main/ets/utils/GlassSurface.ets) 与 [PrimaryGlassSurface](../../entry/src/main/ets/utils/PrimaryGlassSurface.ets) 随之调整；原测试的注入依赖与调用方式尚未配套。由该改动的拥有者补齐平台隔离契约和真实事件回归后再做联合验收，不能只补空类或删除失败断言。本轮按[共享工作树归因规则](coding-agent.md#多-agent-协作)保留其编辑现场，没有代改生产代码或扩大替身来凑绿。

本轮只修改文档、测试和派生内容，没有重建 Rust/HAP、安装设备、修改真实集合或主动提交、发布。其他对话在本轮期间的提交不属于本任务执行。线上官网本轮读回的源码元数据仍为 2.9.22 / 3003；本地生成完成不等于线上发布成功。
