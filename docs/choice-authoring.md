# 选择题制题路线已取消：历史工具说明

[旧格式兼容记录](choice-apkg-v1.md) · [旧 JSON Schema](schemas/choice-source-v1.schema.json) · [历史示例](examples/choice-demo.json)

2026-10-11 已按用户要求取消专属选择题制题开发路线。原“用 Agent 制作选择题 APKG”指南和生成题库提示词已撤下，不再作为当前开发计划或推荐使用流程。已有题型读取、判题、导入兼容和用户数据保留，具体范围见[取消与后续计划](decisions/2026-10-11-jide-history-stats-web-plan.md)。

## 保留范围

仓库中的旧 Schema、示例、校验器、打包器和回归测试保留供维护已有数据与复现历史行为。它们是编程工具，应用内 JIDE 没有执行这些命令的权限，也没有接通专属题库生成工具。不要因这些文件仍存在而恢复已取消的制题路线或宣传为 JIDE 能力。

## 维护与回归命令

仅在需要维护旧源文件或复现既有兼容行为时使用。源文件校验需要 Node.js 24；打包和验包另需 Python 3 及 `tools/choice-requirements.txt` 中的依赖。

```sh
npm run choice:validate -- docs/examples/choice-demo.json
npm run choice:build -- docs/examples/choice-demo.json choice-demo.apkg
npm run choice:inspect -- choice-demo.apkg
npm run choice:test
```

`build` 写包前验证源数据，写完读取实际 ZIP/SQLite、字段和模板再校验，成功才复制到目标路径；默认拒绝覆盖已存在文件。维护已有题库时先保留原文件，再输出新文件名。`inspect` 只针对旧工具生成的纯文本兼容 APKG，不是现代 Anki 导出包的通用校验器；应用仍使用原有 Anki 通用 APKG 导入器。

常见错误：`package_version_unsupported` 检查 format/version；`id_duplicate` 修复重复 ID；`answer_option_invalid` 修复答案引用或重复答案；`answer_count_invalid` 核对单多选数量；`unknown_field` 检查拼错的字段名。校验失败退出码非零，不应继续把文件交给用户。

## 兼容维护边界

维护旧题库需保留题库和题目 ID，不单独修改隐藏 JSON 或展示字段中的一份；先在临时数据中验证。旧格式的原生选择交互只在 jidecards 中实现，其他客户端按普通模板翻面和手动评分。历史回归不代表真实同步或设备交互已验收，具体见[同步边界](choice-apkg-v1.md)。
