# 自绘弹窗玻璃接入

本页只记录当前交互契约、实现责任和验收边界。材质参数见[原生表面规范](material-standard.md)，光学实现见[系列弹窗玻璃](../../../记得系列基础/docs/弹窗玻璃.md)。逐次试验及失败证据已移入[历史记录](dialog-glass-history-2026-10-31.md)，不能把历史方案当成当前要求。

## 用户确认的交互契约

- 材质不决定布局：玻璃模式保持扁平模式原有位置、尺寸、内容及提交规则。浏览「卡片／全部／默认」保留居中选择框、草稿及确认操作，箭头保持向下；不能改成按钮旁菜单。
- 原有按钮菜单保留锚点定位，玻璃从真实按钮展开，统一200ms，不按高度或距离改变时长；同一按钮、外部点击和返回都交给同一关闭所有者，融合完成后才能卸载。
- 可取消弹窗点击外部空白取消，内部空白不误关；忙碌、未保存草稿等业务守卫由原宿主决定，不能绕过。
- 牌组详情更多在宽屏也居中显示整组菜单及牌组预览；列表长按仍按原行定位。牌组预览保留，色条菜单属于同一上下文菜单。
- 玻璃层不能裁掉角、错开正文、闪烁按钮或遮住真实操作。减少动态效果时直接到终态，业务行为不变。

## 唯一责任入口

| 责任 | 代码入口 | 调用方只提供 |
| --- | --- | --- |
| 光学与球形中段、纹理、帧回调、采样资源 | 基础HAR SharedGlassBackdrop / SharedGlassFusion | 源、窗口矩形、明暗、播放状态与完成回调 |
| 产品背景源与采样冻结 | utils/GlassBackdrop、common/GlassSource | 真实页面正文及生命周期 |
| 材质壳、纹理准备、正文边界 | common/GlassPanel | 尺寸、角色、内容；绝对玻璃不参与测量 |
| 居中表单、遮罩、限高、安全区、取消守卫 | common/DialogFrame | 内容、回调、canDismiss；居中选择框传buttonFusion=false |
| 按钮菜单定位、融合与收回、外部点击 | common/AnchoredMenu | 真实按钮锚点、内容、closeRequest；不得在定位留白上吞点击 |
| 多列主菜单与分支、精确尖角 | common/CardActionMenu / GlassBubblePanel / MenuBubble | 原业务动作树；CardActionMenu把主面板矩形交给AnchoredMenu |
| 原生自定义窗口身份和关闭 | common/NativeDialogHost | 原业务关闭及草稿守卫，不清数据、不重建窗口身份 |
| 业务写入及JIDE认知 | 原页面、领域控制器、AppInterface | 仍调用原业务服务；视觉层不写卡库 |

PopupTrigger是一次性实测窗口坐标交接，800ms过期；显式锚点优先。透明内容壳不能抢走真正绘制者的按钮起点。按钮来源与目标矩形都用窗口vp，绘制包围区与局部位移只转换一次。SharedGlassFusion由原生Stack承接position，避免NodeContainer的渲染frame覆盖定位。

居中选择框通过buttonFusion=false丢弃按钮起点，source=target，只替换轻玻璃。其关闭沿用原居中弹窗流程，不能把按钮菜单的反向路径强加给它。

## 同类检查入口

从实际语义查找，不能仅搜已经复用的组件：

```sh
rg -n 'SelectionOptions\(|DialogFrame\(|GlassPanel\(|AnchoredMenu\(|CardActionMenu\(|CustomDialogController|bindPopup\(|bindMenu\(' entry/src/main/ets
rg -n 'rememberPopupTrigger|takePopupTrigger|closeRequest|onClose|onDismiss' entry/src/main/ets/components/common
```

SelectionOptions当前有四个拥有者：BrowserViewMenu保留居中；SelectionDialog按是否提供anchor保留原显示方式；SurfaceSelect沿用原生避让；设置模式菜单沿用按钮锚点。它们不能仅因共用选项列表就互换外壳。系统文件、图片、分享和颜色选择器保留系统窗口，不属于自绘玻璃接入。

## 回归与验收

- 逻辑：glass-popup-motion、shared-glass-integration、browser-presentation、browser-more-menu、browser-batch-menu、home-deck-menu、custom-study-dialog、native-dialog-host。
- 材质与主题：study-rating-glass、surface-material、dark-glass-controls；文档导航用documentation-contract。
- 真机：居中框三入口；更多打开/同按钮收回/外部关闭/分支；详情名称/数字/更多；反复开关；宽窄与深浅色。不能用源码引用、测试或单张静态截图冒充完整视觉验收。
- 基础HAR改动才需build:harmony后通过tools/consumers.mjs同步jidecards；产品调用改动只构建产品。安装只用hdc install -r，保留签名与用户数据。

## 当前确认与未验收范围

用户在3.8.29上反馈：除主题切换后开始学习颜色残留、深色默认牌组描边不一致外，其余上述验收项目没有问题。记录为用户验证，不能写成代理逐项独立验证。

这两项在3.8.30由公共主题输入与模块轮廓修正，需复验：不点击按钮连续切换主题色；深色牌组名、计数、历史和设置模块轮廓一致。空卡库不支持真实评分、有卡批量操作的完整真机验收。先前扩大测试暴露的历史UI对话框源码形状断言，不属于本轮已通过集合，未声称全库回归通过。


## 深色轮廓与角部连续性

统一参数由SurfaceBorder拥有；GlassPanel、AnchoredMenu及GlassBubblePanel负责把深色0.8vp/#22FFFFFF传给实际光学或尖角绘制者。浅色关闭附加轮廓，不能只保留上一状态的边。

基础HAR0.2.12修正两类问题：旧mesh.edge遗漏完全在轮廓内三角形的直边，造成只描四角；自适应三角形的T形接点造成角部纹理插值不连续。动画中继续球形融合并补齐直边，静止端点使用连续规则纹理网格与精确原生圆角裁切，完整边框用一条向内偏移半线宽的圆角矩形绘制。不得连接不相邻边界端点，也不得用固定矩形干扰动画中段。

3.8.31的平板截图显示四角局部线与上角斜接缝，属于失败证据，不能列为视觉通过。3.8.32与HAR0.2.12为修正版本；几何闭合、无未配对内边、绘制顺序和主题切换清线由回归覆盖，代理已在MatePad 7JDUN26418G04789重新打开同一自定义学习弹窗，3.8.32静止截图确认完整直边与圆角连续、旧左上角斜接缝消失；只覆盖该弹窗的当前宽屏深色终态，不能外推为所有弹窗和动画帧均已真机验收。

牌组行显式清零边框的旧覆盖已移除，模块共用SurfaceBorder.contentOptions；浅色/内嵌状态清除旧线。HomeIntroPanel的borderRadius→border错误顺序已修正。主题背景参数由宿主响应式传入，不能等按压才刷新。
