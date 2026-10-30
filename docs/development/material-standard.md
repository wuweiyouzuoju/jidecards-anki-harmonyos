# 原生表面、轮廓与分隔线规范

这是当前材质规则的唯一规范入口。[主题与原生界面](appearance.md)负责主题、布局与其他组件规则，其中按版本记录的材质参数只作历史验收记录；新增或调整材质以本页和以下代码为准。

## 规则与实现入口

| 职责 | 唯一入口 | 当前规则 |
| --- | --- | --- |
| 材质偏好 | `model/SurfaceMaterial.ts`、`utils/SurfaceMaterialStore.ets` | 默认扁平，玻璃为可选外观；保存失败不广播 |
| 外轮廓 | `utils/SurfaceBorder.ets` 的 `materialOptions` | 玻璃浅色1vp/#506B7C96，深色0.8vp/#22FFFFFF；搜索、模块、工具按钮、菜单与对话框为同一等级。扁平使用资源轮廓；浅色内容卡片保留原#E5E5E5 |
| 页面模块 | `utils/SeriesVisual.ets` | 普通玻璃浅色65%、深色68%底层，普通模块比按钮更实；无大面积斜向反光；浅色仅低强度阴影，深色无阴影 |
| 嵌套模块 | `SeriesVisual.insetSurface` | 玻璃只画轮廓，不再叠底色、高光或阴影；扁平恢复实底 |
| 主题染色 | `model/GlassTheme.ts` | alpha不变，浅/深色混入当前主题主色10%/12%；灰色仍中性；幻彩纹理由原背景拥有 |
| 搜索框 | `utils/SearchFieldSurface.ets`、`common/LiveSearchField.ets` | 背景浅40%/深50%，边框委托materialOptions；不得独立用白色边框削弱轮廓 |
| 弹层 | `common/GlassPanel.ets`、`PopupSurface.ets`、`PopupAppearance.ts` | 保留本体有限透明与原有弱反光；采样、失败降级与动画仍由GlassPanel拥有，不借模块样式绕过生命周期 |
| 列表分隔线 | `SurfaceBorder.separatorWidth`、资源surface_border | 1vp，布局高度同为1vp，flexShrink(0)；每个ForEach条目只有一个布局根，线与该条目同属根；只在相邻条目之间绘制 |
| 编辑框操作行 | `common/NoteFieldEditor.ets` | 输入视口完整112/336vp；放大按钮行在输入框边界外，不叠加到正文，不绘制独立白底 |

边框必须先设置，再恢复最终圆角。不得对整个模块降低opacity；文字和图标保留完整不透明度。语义色（选中、错误、评分、旗标）仍由原领域拥有。扁平不添加玻璃反光、模糊或阴影；材质不改变主题、动态背景或幻彩权限。

## 接入和检查

新页面复用上表入口，禁止复制轮廓颜色、临时白底或另一份透明度。UI宿主显式订阅材质、明暗和主题主色并传入modifier，确保打开界面时切换主题也会更新。Web卡片、媒体预览和编辑正文的内容背景不视为普通模块。

聚焦验证：`surface-material.test.mjs`覆盖材质切换、主题染色、搜索与模块边框一致性；`ui-surface-border.test.mjs`覆盖轮廓顺序；设置目录在手机/宽屏、浅/深色、扁平/玻璃及大字体下检查相邻分隔线。修改组件后构建增量HAP。测试和构建通过不能替代实际截图观感检查。

## 玻璃采样边界

GlassSource只采正文，GlassPanel应作为采样源外的兄弟节点。若业务组件必须内嵌弹层（首页牌组详情预览菜单、浏览页内嵌编辑器），对应GlassSource必须传freezeDuringPanels=true。GlassPanel按源引用计数，首个弹层出现即停采，沿用打开前的帧，最后一个关闭才恢复；其他源不受影响。基础库对异步截图及模糊完成均再次检查许可，拒绝迟到的递归帧。不得用更浅填色或缩短动画掩盖采样反馈。回归入口shared-glass-integration.test.mjs。

## 锚点菜单定位

AnchoredMenu的contentLeft/contentMaxWidth描述可定位区域，不能把该区域缩为menuWidth后继续套alignEnd。左触发（首页更多）对齐区域左缘；右触发（新建、详情预览、JIDE更多）对齐区域右缘。anchorRight是窗口坐标的独立精确右缘入口；行上下文菜单传完整最终面板区域，不再偏移。图文居中只影响条目，不改变弹窗所在侧。手机与宽屏分别检查左/右触发，不能只验宽屏。

普通枚举选择弹窗按内容自然增高，不设置320vp固定上限或屏幕比例上限。SelectionMenuLayout只扣窗口安全区及32vp边距作为最后安全上限，原生Popup负责上下避让；长列表超出可用屏幕时才滚动，8个颜色主题包括末项幻彩不应因人为高度阈值被隐藏。

详情开始学习按钮与显示答案使用相同52vp高度、18vp圆角、16fp中等字体和左右4vp内边距，宿主操作区共用应用尺寸的上下安全间距。开始学习保留独立可用性守卫，表面走SeriesVisual.control，边框与上方模块同源；不使用26vp胶囊轮廓。

四项评分玻璃单独由StudyRatingSurface绘制：忘记/困难/良好/简单保留红橙绿蓝语义底色和文字，浅色62%/深色80%色层，1vp柔白边缘，无方向性高光，浅色轻阴影。底部横排与浮动竖排共用；两行文字仍显示Core提供的间隔，点击、禁用与评分回调不变。它是语义轮廓例外，不能被全局主题染色替代；扁平及显示答案保持原材质。
