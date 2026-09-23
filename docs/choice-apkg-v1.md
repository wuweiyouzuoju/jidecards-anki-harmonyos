# jidecards 选择题 APKG 规范 v1

[返回项目](../README.md) · [Agent 制题指南](choice-authoring.md) · [JSON Schema](schemas/choice-source-v1.schema.json) · [源文件示例](examples/choice-demo.json) · [APKG 示例](examples/choice-demo.apkg)

选择题使用标准 **`.apkg`** 分发，应用不提供 `.jide` 或 JSON 导入入口。UTF-8 JSON 仅是制题工具的源文件。规范、打包器、校验器和示例随仓库一起开源，遵循仓库 [LICENSE](../LICENSE)，无需服务端或 AI API 密钥即可使用工具；自制题目内容的授权由内容提供者决定。

## 客户端行为

| 能力 | jidecards | 其他 Anki 客户端 |
| --- | --- | --- |
| 导入、分享 | 现有标准 APKG 导入 | 标准 APKG 导入 |
| 题面 | 题干和原生可选按钮 | 题干和带字母编号的选项 |
| 答案 | 提交后自动判分，显示答案与解析 | 翻面查看答案与解析 |
| 评分 | 答对 Good（良好），答错 Hard（困难），只提交一次 | 使用客户端原有评分按钮 |
| 后端 | 原有 Anki 调度、revlog、统计与同步 | 原有 Anki 调度、revlog、统计与同步 |
| 自动进入下一题 | 默认 5 秒；更多菜单修改；反馈时可右滑或点继续 | 客户端原有行为 |

v1 支持单选、多选，每题 2–10 个选项。多选必须选中全部且仅正确选项才算答对。底部左列显示前 `ceil(n/2)` 个，右列显示余下选项；10 个时左 A–E、右 F–J。长选项允许换行，选项区可滚动，题干和答案由上方 Web 区显示。

`feedbackSeconds` 为题库默认值，0 表示关闭自动跳转，允许整数 0–60。更多菜单提供 0、3、5、10、15、30 秒；在本次学习会话里改一次，后续题目继续使用该值，不在切题时恢复默认。选时间、编辑、引导等交互期间不自动切题。右滑只结束已提交答案的反馈，不额外评分。应用隐藏时不执行自动切题，返回后依既有学习生命周期重新读取 Anki 队列。

“答错映射 Hard”是本题型的产品规则。后端保存的是 Hard / Good 复习评分，不新增独立的选择题正确率统计或用户所选选项记录；不会把原有 Anki 的 Hard 统计重新解释为遗忘。

## 笔记类型与标记

官方打包器固定笔记类型名 `JideCards Choice v1`、模型 ID `1865040927`，每个笔记只生成一张普通卡。模型 ID 用于重复导入识别，不是应用识别题型的依据。题型识别根据字段名及 `JidePayload` 中的 `format`、`version`，因此重命名类型、导入时改名或字段顺序改变不影响识别。

| 字段名（区分大小写） | 内容 |
| --- | --- |
| `Prompt` | HTML 转义后的题干；换行转 `<br>` |
| `OptionsHTML` | 按源顺序编号 A–J，每行 `A. 选项文本`，用 `<br>` 连接 |
| `JidePayload` | 下述版本化 JSON；不放入任何展示模板 |
| `AnswerHTML` | 只列正确选项，沿用原字母编号，用 `<br>` 连接 |
| `Explanation` | HTML 转义后的解析；允许空字符串 |

官方打包器按表中顺序写字段。应用按字段名读取，允许额外字段，但所需字段不得重名或缺失。文本转义顺序为 `&`→`&amp;`、`<`→`&lt;`、`>`→`&gt;`、双引号→`&quot;`、单引号→`&#39;`、换行→`<br>`。规范 v1 只承载文本，不接受 HTML、图片或声音附件作为富媒体输入；输入中的 HTML 字符按普通文字展示。

`JidePayload` 是普通 Anki 字段中的原始 JSON（不是 HTML 实体编码、Base64 或独立媒体文件）：

```json
{
  "format": "jidecards.choice",
  "version": 1,
  "id": "even-001",
  "type": "single_choice",
  "prompt": "哪个数字是偶数？",
  "options": [{"id":"a","text":"1"},{"id":"b","text":"2"}],
  "answer": ["b"],
  "explanation": "2 能被 2 整除。",
  "feedbackSeconds": 5
}
```

打包器将 JSON 中的 `<`、`>`、`&` 写为 Unicode 转义，避免被字段编辑器误识别为 HTML。读取时用 JSON 解码还原。展示字段必须与 payload 的规范化结果一致，否则应用显示题型数据错误，禁止使用不一致答案判分。维护题目请修改源 JSON 并重新打包，不单独编辑答案字段或隐藏 payload。

没有标记或版本未被当前客户端支持时，按普通 Anki 卡片显示并手动评分。损坏的 v1 payload 不自动降级为可自动判分的题目。扩展题型不得复用 v1 标记改变它的含义。

## 普通 Anki 模板

正面模板：

```html
{{Prompt}}<div class="jide-choice-options">{{OptionsHTML}}</div>
```

背面模板：

```html
{{FrontSide}}
<hr id="answer">
{{AnswerHTML}}
{{#Explanation}}<hr>
{{Explanation}}{{/Explanation}}
```

模板不注入判题脚本，不检测客户端名称，也不调用调度器。jidecards 识别 v1 后在自己的 Web 副本中隐藏静态选项块，改用原生选项区；不会修改集合中存储的模板。

## 制题源 JSON

| 键 | 规则 |
| --- | --- |
| `format` / `version` | 固定 `jidecards.choice` / `1` |
| `id` | 题库稳定标识，非空，最多 200 个 UTF-16 单元；建议反向域名，如 `org.example.biology.chapter1` |
| `title` | Anki 牌组名称，非空，最多 200 个 UTF-16 单元 |
| `feedbackSeconds` | 可选，默认 5，整数 0–60，作用于本题库 |
| `questions` | 1–5000 道题，题目 `id` 在题库内唯一 |
| 题目 `id` / `type` | ID 非空且最多 120 个 UTF-16 单元；类型 `single_choice` 或 `multiple_choice` |
| `prompt` / `explanation` | 题干非空，解析可省略；各最多 20000 个 UTF-16 单元 |
| `options` | 2–10 项，每项只有 `id`、`text`；ID 非空且最多 80，文本非空且最多 10000；选项 ID 题内唯一 |
| `answer` | 无重复的选项 ID 数组；单选恰好 1 项，多选至少 2 项，全部 ID 必须存在 |

源文件不超过 2 MiB（UTF-8 字节）。除制表符、换行和回车外不允许 C0 控制字符，也不允许 DEL；尤其禁止 Anki 的字段分隔字符 U+001F。未知键被校验器拒绝，题目级 `feedbackSeconds` 不属于源格式。Schema 检查结构，命令行校验器还检查跨字段关系、ID 唯一性、控制字符和实际字节数；运行时字符串长度以 JS/ArkTS 的 UTF-16 单元为准。

## 稳定身份、更新与同步

牌组 ID 由源 `id` 的命名空间哈希生成；笔记 GUID 由 `jidecards.choice.v1`、题库 `id` 和题目 `id` 经 genanki `guid_for` 生成。修改文案、答案、解析或牌组标题时保留这些 ID；不要每次随机生成。独立题库必须用不同的题库 ID。

重新导入同 ID 内容走 Anki 的原有更新/冲突规则，不承诺强制覆盖手工修改或每种导入设置。标准包不携带学习历史；导入更新是否保留既有进度由 Anki 导入器负责。源文件中删除一道题不代表导入时删除用户已有卡片。

题型元数据随普通笔记字段同步，复习结果随原有复习日志同步；JSON 源文件和菜单里的会话设置不参与 AnkiWeb 同步。其他客户端正常复习不会删除隐藏字段；同步回 jidecards 后仍能识别。不能把本地打包/导入测试称为 AnkiWeb 实测。

Anki 的[同步说明](https://docs.ankiweb.net/syncing.html#conflicts)指出普通笔记与复习变更一般可合并，字段和卡片模板结构变更可能需要全量同步。v1 不修改其他笔记类型，后续不原地增删 v1 字段；结构不兼容升级使用新版本标记和新模型 ID，保留旧版读取与普通模板，另做迁移和同步验收。

## 实现与验证入口

- 规则和模板：`entry/src/main/ets/model/JideChoice.ts`；运行时适配：`backend/StudySessionBackend.ts`。
- 制作/校验工具：[choice-package.mjs](../tools/choice-package.mjs)；APKG 写入复用 [genanki](https://github.com/kerrickstaley/genanki)，不重建导入或同步协议。
- 模型与交互回归：`tools/tests/jide-choice.test.mjs`；工具回归：`tools/tests/choice-package.test.mjs`。
- 生成包集成验证：`npm run choice:test`，需要 [Python 依赖](../tools/choice-requirements.txt)。真机右滑、不同屏幕布局、真实账户跨客户端同步仍需单独验收。
- 真实 Anki 引擎验收：在独立 Python 环境安装 `anki==26.5`，运行 `python tools/choice-anki-roundtrip.py`；验证导入、正反面渲染、重复导入不增卡、Hard/Good 复习日志，以及现代 APKG 导出再导入后字段与复习记录完整保留。该测试只创建临时集合，不访问用户集合或 AnkiWeb。
