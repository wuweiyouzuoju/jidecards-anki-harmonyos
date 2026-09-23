# 用 Agent 制作选择题 APKG

[完整规范](choice-apkg-v1.md) · [JSON Schema](schemas/choice-source-v1.schema.json) · [可用示例](examples/choice-demo.json)

Agent 先根据资料生成 UTF-8 JSON，工具负责校验与打包，最终只把 `.apkg` 交给学习者。JSON 保留作为以后修改的源文件。无需在 jidecards 中配置应用内 Agent；任何能读文件并执行命令的编程 Agent 均可制作。

## 一次准备

安装 Node.js 24 与 Python 3，然后在源码仓库根目录执行：

```sh
python -m pip install -r tools/choice-requirements.txt
```

macOS/Linux 可使用 `python3`。打包器默认 Windows 用 `python`，其他系统用 `python3`；如需虚拟环境，将 `JIDECARDS_CHOICE_PYTHON` 设为 Python 可执行文件的完整路径。校验源 JSON 只需 Node，无需 Python 或 genanki。工具不联网生成题目、不使用账号或 API 密钥。

## 可直接给 Agent 的提示词

> 阅读 `docs/choice-apkg-v1.md` 和 `docs/schemas/choice-source-v1.schema.json`。根据我提供的资料制作 20 道选择题，生成 `questions.json`，再使用仓库工具生成 `questions.apkg`。题库 ID 使用我指定的稳定命名空间，若未指定则为该题库选择唯一且可复用的 ID 并写入源文件。每题 2–10 个选项，单选只有一个正确答案，多选至少两个正确答案。题目及选项 ID 必须稳定、唯一，答案引用选项 ID，不使用 A/B 字母代替 ID。题干明确，干扰项合理，解析说明依据，不编造资料中没有的事实；对不确定内容先指出再制题。默认反馈时间 5 秒。不要生成 HTML 或脚本，不创建 `.jide` 文件。运行 `npm run choice:validate -- questions.json`，修复所有错误后运行 `npm run choice:build -- questions.json questions.apkg`，再运行 `npm run choice:inspect -- questions.apkg`。最后交付 APKG 和 JSON 源文件，报告题数、单多选分布及未验证范围；不要声称通过了未实际执行的设备或云同步测试。

如果需要 10 个选项，用示例的第三道题作为结构参考。选项顺序即展示顺序；A–E 在左，F–J 在右。文字尽量简短，长内容放题干或解析，不能用空选项凑数。

## 命令

```sh
npm run choice:validate -- docs/examples/choice-demo.json
npm run choice:build -- docs/examples/choice-demo.json choice-demo.apkg
npm run choice:inspect -- choice-demo.apkg
npm run choice:test
```

`build` 写包前验证源数据，写完读取实际 ZIP/SQLite、字段和模板再校验，成功才复制到目标路径；默认拒绝覆盖已存在文件。修改已有题库时先保留原文件，再输出新文件名。`inspect` 只针对该工具生成的纯文本旧版兼容 APKG，不是现代 Anki 导出包的通用校验器；应用仍使用原有 Anki 通用 APKG 导入器。

常见错误：`package_version_unsupported` 检查 format/version；`id_duplicate` 修复重复 ID；`answer_option_invalid` 修复答案引用或重复答案；`answer_count_invalid` 核对单多选数量；`unknown_field` 检查拼错的字段名。校验失败退出码非零，不应继续把文件交给用户。

## 更新与验收

保持题库和题目 ID，再修改文案和重新生成 APKG。不要手工修改隐藏 JSON 与展示字段中的其中一份。先导入临时牌组检查题目、答案、解析和题数，再确认正式导入方式。跨设备复习共用 Anki 进度；其他客户端只有普通翻面和手动评分，jidecards 才提供选择题交互。真实同步请依[规范中的同步边界](choice-apkg-v1.md)验收。
