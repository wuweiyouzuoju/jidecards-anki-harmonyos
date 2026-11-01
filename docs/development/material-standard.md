# 原生表面、轮廓与分隔线规范

这是当前材质规则的唯一规范入口。交互和关闭契约见[弹窗玻璃接入](dialog-glass.md)，[历史材质记录](material-standard-history-2026-10-31.md)只保留过程证据。

## 规则与实现入口

| 职责 | 唯一入口 | 当前规则 |
| --- | --- | --- |
| 材质偏好 | SurfaceMaterial / SurfaceMaterialStore | 默认扁平，玻璃为可选外观；保存失败不广播 |
| 页面模块 | SeriesVisual.ProductSurface | 中性底色不染主题；玻璃浅32%白、深35%炭灰；扁平浅白/深#1C1C1E；浅色无边框，深色模块统一公共轮廓；浅色轻阴影，深色无阴影 |
| 嵌套模块 | SeriesVisual.insetSurface | 不重复绘制轮廓、高光或阴影；玻璃底色透明，扁平恢复实底 |
| 深色轮廓 | SurfaceBorder.materialOptions / contentOptions | 玻璃0.8vp/#22FFFFFF；扁平使用surface_border资源。牌组列表、牌组标题、计数、历史、设置模块共用contentOptions；排序状态保留原主题强调边。切回浅色或内嵌状态显式清除旧轮廓 |
| 设置开关 | SettingsToggleRow | 未指定tint时跟随响应式动作主色；显式tint可覆盖，不能默认使用文字色代替主题色 |
| 操作按钮 | SeriesVisual.control / primaryAction | 浅色玻璃柔白0.9vp边；深色玻璃公共轮廓；动作文字保持不透明，不改变禁用守卫 |
| 开始学习、显示答案 | StudyRatingSurface非评分分支、PrimaryGlassSurface | 同一SeriesVisual.primaryAction；显式传主题主色与明暗，不能在modifier内部临时读AppStorage等到按压才刷新 |
| 四档评分 | StudyRatingSurface评分分支 | 保留红橙绿蓝语义色与独立评分边，不跟随主题色改变语义 |
| 搜索框 | SearchFieldSurface / LiveSearchField | 保留原轮廓和透明度；TextInput不重复设置背景、边框与圆角 |
| 弹层 | GlassPanel / AnchoredMenu / PopupSurface / SharedGlassFusion | 深色也使用同一0.8vp/#22FFFFFF描边；融合层沿真实边界线段描边，产品传入公共参数；浅色关闭该附加线；材质不改变业务布局 |
| 分隔线 | SurfaceBorder.separatorWidth | 固定1vp、flexShrink(0)，每条记录只拥有一条相邻分隔线 |

## 接入和检查

主题色、明暗和材质必须由UI宿主显式订阅并传入modifier；不能只改变文字颜色、让背景保留上次构造的参数。开始学习与横排显示答案共享52vp高度、18vp圆角和主操作表面；浮动显示答案使用同一主操作映射。深色轮廓由公共表面拥有，禁止在单个标题或页面临时叠加另一条线。

修改材质运行surface-material、study-rating-glass、dark-glass-controls；可机械识别的轮廓检查见ui-surface-border。新增组件或平台参数后补增量HAP。测试、构建与设备观察分别报告，不把它们相互替代。

## 玻璃采样边界

GlassSource只采正文；嵌套业务弹层的源使用freezeDuringPanels。首个弹层冻结原帧，最后一个关闭恢复；异步迟到帧仍检查许可。真实背景在根级唯一拥有，不能复制彩雾动画填充弹窗。采样和光学归系列基础HAR，产品不复制实现。

## 锚点菜单定位

由AnchoredMenu拥有按钮锚点、宿主坐标、安全区、限高和融合。居中选择框保持居中；玻璃模式不能改变扁平模式布局。具体入口、关闭流程与当前验收见[弹窗玻璃接入](dialog-glass.md)。

## 深浅色玻璃机制

明暗使用相同采样和折射；差异为色层、轮廓和阴影。内容浅色无边框，深色统一轻轮廓；内嵌模块不重复叠加。系统减少动态效果只改变动画，不改变提交或取消语义。

设置页玻璃模式：`设置面板` 的顶栏、列表与页面容器均透明，透出根背景；分组继续复用 `SeriesVisual.settingsSurface` 与主页同款32%浅色／35%深色中性底。不得在模块后叠加不透明页面底色；扁平模式保留原页面底色。

页面壳统一使用 `GlassMaterial.pageMaterialFill(flatFill, material)`，材质由宿主 `StorageProp` 实时传入。覆盖设置、主页顶栏、学习外围、添加／编辑笔记、浏览编辑、牌组选项及卡片／草稿预览外层。玻璃档透明，扁平档保留底色；不改变卡片模板真实底色、手写画布、输入边界与语义色。模块外观仍归 SeriesVisual，不叠加第二层材质。

本次页面壳审计：77项材质、边框、编辑及预览回归通过，增量签名HAP通过。首页摘要、统计分区、编辑字段与提醒模块的白底随后由 ProductSurface 覆盖，未重复调整；同步标签的状态色、Web卡片作者背景和手写画布是合理差异。此结果证明代码接线与构建，不代表全部页面、主题和窗口尺寸已逐项设备验收。
