# 主题与原生界面

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：EntryAbility 配置 → 主题管理器 → AppStorage → 组件响应式刷新。
- 快速反馈：`npm test -- ui`；完整验收见 [验证说明](verification.md)。

## 应用主题刷新

EntryAbility 的配置更新及返回前台通过 `refreshThemeColors()` 使用应用最终深浅色（显式 light/dark 优先于系统），统一刷新色板、玻璃表面和系统栏。未指定颜色模式的配置通知不覆盖已知深浅色，临时读取配置失败保留旧值。

`按下态按钮` 与 `DialogHeader` 在组件 build 内直接消费 `themeLabelGlyphs()`，避免按值 Builder 缓存旧的标签或颜色；字形标识包含文字和颜色。保持共用渐变算法、资源参数与危险操作单色，不为每个按钮分别修正。主题回调组合测试见 `tools/tests/theme-configuration.test.mjs`；实际设备切换效果仍需人工验证。


## 专属内容与幻彩

安装指纹和离线兑换入口位于“设置 → 应用指纹与兑换”独立分类，简洁版与实验版均可访问，由 `components/settings/RedemptionPanel.ets` 直接展示识别码、复制及主题兑换入口；底层指纹协议不变。`model/Redemption.ts` 固定 JCR1 单内容签名协议；`utils/RedemptionStore.ets` 负责随机指纹落盘、Ed25519 验签、凭证持久化与权益派生。应用只包含 `RedemptionPublicKey.ts` 公钥，私钥由用户目录外置发行工具保管。新增内容在协议白名单、凭证权益派生和工具内容选项中分别增加独立编号；使用流程见 `docs/REDEMPTION.md`。

幻彩只在有效权益下进入主题选择；ⓘ 明示其赠送给 3.0.0 之前使用的老用户，并复用关于页 QQ 群号。`ThemeCatalog.ts` 统一主题种子色、装饰、背景、权益与发行工具选项，新增主题只登记配置和中英文名称（专属主题另外更新赠送说明）。`ThemeBackground.ets` 在 `Navigation` 外仅创建一次，三张透明纹理每 6 秒向系统合成动画提交平移/缩放/透明度目标，不使用逐帧 ArkTS 更新或运行时色相滤镜；切页不重建、不改变亮度；首页通过 transitionActive 在导航转场期间冻结当前构图，onTransitionEnd 解除暂停，转场代次阻止旧结束事件提前恢复。前后台与根可见性控制暂停，轮次号阻止旧完成回调复活动画。页面订阅 `PAGE_SURFACE_KEY`，导航容器透明。`ThemeBackgroundMotion.ts` 提供运动目标，`ThemeVisuals.ets` 转换渐变，牌组色条由长按菜单中的原生 Select 选择六色或无色条；None 在包括幻彩在内的所有主题下保持透明占位，刷新沿用已保存选择，不自动补渐变色条，不改变学习计数语义色。`ThemeText.ets` 的共享 Span 构建器统一主题强调文字，订阅 `THEME_TEXT_COLORS_KEY`，保留普通/禁用/危险文字语义。`GlassSurface.ets` 统一轻操作和评分按钮按下态，与选中牌组共用加厚的深浅玻璃配色；以半透明材料呈现已有柔化背景，不使用实时 backdropBlur。开始学习和两种显示答案改用 PrimaryGlassSurface 常驻主题玻璃，颜色由 themePrimaryGlass 根据种子色/幻彩色派生，文字按当前主题着色；文字节点key包含色值，新建牌组组件内直接绘制Span。导航透明度使用 EaseOut，背景请求 30fps（15–30fps 范围），导航独立请求 60fps；首页与设置共用 pageContentTopInset=8vp，使按钮到首卡的间距均为16vp。扩展步骤见 `docs/REDEMPTION.md`。

页面间距共用 `toolbarVerticalInset`（8vp）、`pageContentTopInset`（8vp）、`pageSectionGap`（12vp）、`pageBottomInset`（12vp）；页面左右12vp，工具栏按钮下缘到首内容块16vp。首页、设置、统计、浏览、学习、添加笔记、提醒及Agent页面和顶部菜单已接入；提醒页亦注册统一导航淡入淡出。新增页面与检查范围见 `docs/UI_SPACING.md`。表单、聊天气泡和闪卡HTML内部间距按用途保留。

首页顶部工具栏将左右操作区设置为相同 `layoutWeight`，中间状态组按内容宽度排列、两侧各留 8vp；单个图标对准屏幕中线，组内多个元素以整体中心对齐。不可用两个 Blank 夹住状态或绝对定位覆盖操作区，否则左右按钮标签长度不同会导致偏移或重叠。工具栏按钮启用 `按下态按钮.singleLine`，宽度不超过侧栏，长标签单行省略并保留完整无障碍名称；其他按钮维持原多行行为。同步圆圈固定为 24vp，点击区为 44vp；只在实际同步中显示，其余状态隐藏。当前只渲染一个同步圆圈。


