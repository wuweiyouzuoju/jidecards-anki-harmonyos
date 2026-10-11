# 学习快捷键自由配置

采用 AnkiDroid 2.25.1 的按动作多绑定和 CardSide 思路，使用本项目 ArkUI 表单、设置入口与弹窗外壳。参考源码是该版本的 [ViewerCommand](https://github.com/ankidroid/Anki-Android/blob/v2.25.1/AnkiDroid/src/main/java/com/ichi2/anki/cardviewer/ViewerCommand.kt) 与 [Binding](https://github.com/ankidroid/Anki-Android/blob/v2.25.1/AnkiDroid/src/main/java/com/ichi2/anki/reviewer/Binding.kt)；Android KeyEvent 与偏好序列化不能直接用于 HarmonyOS。

`StudyKeyboard.ts` 唯一声明已接通的动作、默认绑定、组合键校验、卡面匹配及持有键去重。Kit 键码与 Ctrl/Shift/Alt 状态归 `StudyKeyAdapter.ets`，按物理键匹配，未知设备键可以录制成 `code:N`；系统返回与单独修饰键保留平台行为。新增配置保存完整绑定，空列表明确禁用；旧九键覆盖通过 `StudyControls.effectiveStudyKeyboard` 在内存中兼容，不读取即改写存储。

手动配置与 JIDE 读取、提案、确认预览和执行共用模型及 `StudyControlsService`，保持串行保存与旧值检查。手动面板拥有草稿与读取代次，已接受保存独立于 UI 生命周期。设置和实时观察共用动作/控件目录，名称与资源同步。编辑、拼写输入、模板可编辑元素、弹窗和手写保留输入；选择题维持原判题，评分只能发生在答案面。这里只配置学习，浏览列表仍由其原快捷键策略负责；未接通的 AnkiDroid 动作不发布为可用项。

领域说明与设备边界见[学习与媒体](../development/study-media.md#jide-专用学习操作配置2026-10-04)。验证入口：`npm test -- study`，以及 `study-keyboard.test.mjs`、`ai-agent-maintenance.test.mjs`、`ai-agent-app-structure.test.mjs`、`i18n-contract.test.mjs`、`native-dialog-host.test.mjs`、`architecture-boundaries.test.mjs` 和增量 HAP。实体键盘、录制焦点、深浅色、宽窄屏与大字体仍需独立设备验收。

2026-10-11 实施验证：学习领域回归、上述相关行为/界面/资源/架构检查通过；`npm run build:app -- -SkipRust` 生成签名 HAP，新增警告为 0。复用现有 Core 原生库，未改调度或协议；本次未安装或操作设备。
