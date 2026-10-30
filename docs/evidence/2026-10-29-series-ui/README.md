# 2026-10-29 系列视觉设备证据

手机模拟器（1280×2832）覆盖安装本次签名 HAP 后截取。安装前应用与集合保留，未卸载、未清数据。

| 文件 | 场景 | 观察 |
| --- | --- | --- |
| `home-light.jpeg` | 浅色首页 | 系列静态背景、玻璃工具栏、22vp 卡片、16vp 页面留白 |
| `home-dark.jpeg` | 深色首页 | 深色背景、表面描边、工具栏对比度 |
| `deck-detail-light.jpeg` | 手机牌组详情 | 详情主卡、指标卡、底部 `SharedActionButton` |
| `settings-light.jpeg` / `settings-dark.jpeg` | 设置目录与外观（深/浅） | 搜索框、分组卡、动态类型与主题切换后的表面 |
| `stats-light.jpeg` | 统计页 | 指标/图表卡统一圆角、描边和阴影 |
| `browser-light.jpeg` | 浏览页 | 搜索行、筛选项和空态；当前集合 0 条，未进入多选 |
| `home-toolbar-morph.jpeg` / `home-toolbar-morph-end.jpeg` / `home-toolbar-morph-back.jpeg` | 首页 ↔ 手机牌组详情 | 顶部右侧动作组进入、结束和返回时的共享轮廓；真实按钮在会话结束后恢复。抓帧来自实际点击牌组和返回 |
| `wheel-open.jpeg` / `wheel-closed.jpeg` | 添加卡片编辑页的编辑工具轮盘 | 点击把手收起/展开；真实工具按钮、表面和文字在橄榄油会话结束后恢复 |
| `help-dialog-light.jpeg` | 字号帮助弹窗 | 公共 `DialogFrame` 玻璃表面、标题操作和正文滚动 |

当前集合为 0 张卡，因此学习页“显示答案 ↔ 评分”和浏览多选计数没有真实数据可操作，未以截图声称这两个场景已设备验收。编辑轮盘通过“添加卡片”页实际开合验证，未保存卡片或修改集合。相关逻辑、锚点几何和生命周期由 `study-olive-actions.test.mjs`、`browser-selection-morph.test.mjs`、`note-editor-wheel.test.mjs` 及 HAP 编译覆盖。
