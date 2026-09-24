# 编辑、计时与首页表单的职责边界

状态：有效。范围是本轮对首页、学习页和浏览页的局部拆分，不以页面行数作为拆分指标。

## 决策

- 笔记编辑的读取代次、可见性、忙碌态、错误态和写入输入快照由 `NoteEditorSession` 拥有。浏览页和学习页只提供各自已有的写入边界与刷新回调。
- 学习普通计时和自动推进由 `StudyTimerController` 拥有。卡片身份、音频状态、编辑/引导阻塞和评分提交仍由学习页/学习会话拥有，因此不新增通用状态框架或计时服务层。
- 首页创建牌组与牌组定制由两个局部 Feature 拥有表单状态；`HomeDeckCommands` 仍是唯一写入适配，首页负责弹层槽、刷新和导航。
- 已接受写入不因组件销毁而取消；迟到结果只能完成后台写入，不能回写旧 UI 或关闭后续实例。写入成功后的刷新失败单独提示，不诱导重复提交。

## 取舍与验证

这些边界沿现有数据流切分：UI → 局部 Feature/Session → 既有服务/操作控制器。没有新增仓储、事件总线、依赖注入容器或页面间共享状态。行为由 `note-editor-session.test.mjs`、`study-timer-controller.test.mjs`、`home-deck-features.test.mjs`、`browser-editor-component.test.mjs` 覆盖，最终仍以 ArkTS 编译和完整 `verify` 为准。
