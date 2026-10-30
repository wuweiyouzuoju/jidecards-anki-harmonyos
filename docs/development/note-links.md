# 电脑与鸿蒙的笔记引用

[返回任务入口](../../PROJECT_CONTEXT.md)

## 所有者与入口

| 职责 | 唯一入口 |
| --- | --- |
| v1关系数据、反向推导、旧镜像兼容 | [NoteLinks.ts](../../entry/src/main/ets/model/NoteLinks.ts)、电脑 [domain.py](../../desktop/anki-note-links/domain.py) |
| 正文引用URL、逐处文字、草稿关系准备 | [NoteReferences.ts](../../entry/src/main/ets/model/NoteReferences.ts)；只处理字段，不读写集合 |
| GUID查询、保存前目标校验、即时兼容操作 | [NoteLinksService.ts](../../entry/src/main/ets/backend/NoteLinksService.ts)；读取库存经 [note_links.rs](../../native/rsharmony/src/note_links.rs) |
| 外圈工具、选区/光标与窗口身份 | [NoteFieldEditing.ts](../../entry/src/main/ets/model/NoteFieldEditing.ts)、[NoteFieldEditor.ets](../../entry/src/main/ets/components/common/NoteFieldEditor.ets)；内圈保持原六项，外圈增加“引用卡片”，与网址“链接”区分 |
| 搜索、选择、确认及只读目标预览 | [NoteReferencePicker.ets](../../entry/src/main/ets/components/links/NoteReferencePicker.ets)；原生窗口使用NativeDialogHost字段工厂和DialogFrame |
| 新建/编辑草稿的引用管理 | [NoteLinksDraftPanel.ets](../../entry/src/main/ets/components/links/NoteLinksDraftPanel.ets)；只回传字段草稿，绝不调用关联写入服务 |
| 正文与隐藏管理块隔离 | [NoteLinkEditor.ts](../../entry/src/main/ets/model/NoteLinkEditor.ts)；富文本只接收用户内容，保存/预览恢复管理块 |
| 接受保存与同一次Core落盘 | [AnkiNoteCreation.ets](../../entry/src/main/ets/backend/AnkiNoteCreation.ets)、[AnkiNoteUpdate.ets](../../entry/src/main/ets/backend/AnkiNoteUpdate.ets)；沿用原保存会话、集合占用、冲突校验及UpdateNotes/AddNote |
| 学习/预览点击及运行时关系块 | [NoteLinkBridge.ts](../../entry/src/main/ets/model/NoteLinkBridge.ts)、[NoteLinksProxy.ts](../../entry/src/main/ets/model/NoteLinksProxy.ts)；宿主核对文档代次/前台/阻塞 |
| 电脑持久化、编辑保存钩子、迁移 | [repository.py](../../desktop/anki-note-links/repository.py)、[host.py](../../desktop/anki-note-links/host.py)；安装和模块图见 [电脑README](../../desktop/anki-note-links/README.md) |

## 数据约定

正文引用使用标准HTML：`<a href="#jide-note:<encodeURIComponent(目标GUID)>">本处显示文字</a>`。可视编辑保留地址和样式，源码编辑拒绝半标签/实体/代理对和嵌套链接。选中文字作为默认显示文字；未选中则使用目标标题，确认前可以修改。显示文字存于这一处锚点，不修改目标笔记的全局别名；管理面板按每次出现分别编辑/移除，移除锚点保留原文字。重复引用同一目标只产生一条笔记关系；删掉最后一处才移除对应的正文关系。

完整关系仍保存为兼容v1的隐藏注释：

```html
<!--jide-links:v1:<encodeURIComponent(JSON)>-->
```

JSON为 `{ "v": 1, "guid": "当前笔记GUID", "targets": ["目标笔记GUID"], "alias": "旧版全局显示文本" }`。显式旧关系与当前正文目标取并集；编辑时依据原笔记正文移除已删除的正文目标，保留无关手动关系。跨语言UTF-8转义与校验一致。未知版本、损坏/重复管理块及自引用拒绝覆盖；旧版只有截断镜像时仍要求先迁移完整data.json。

现有管理块原位保留；普通笔记没有管理字段时保存到末字段的隐藏注释，**不新增字段、不修改笔记类型或模板**。这是鸿蒙首次准备流程，无需电脑初始化，也不触发额外笔记类型结构变更。新笔记取得Core生成的真实GUID后，才准备其关系数据。字段、媒体、标签、完整关系通过同一次原Core保存提交；选择/取消/预览不产生集合写入。准备失败没有“先保存笔记、后补引用”的半成品。

`targets`是完整的正向关系，反向关系本地推导。旧 `alias` 兼容字段仍由目标笔记拥有，旧即时管理入口的全局别名操作与新正文的逐处文字是不同能力。`<!--ml-mirror:start-->…<!--ml-mirror:end-->`是可重建的旧展示块，30条上限只影响展示。鸿蒙学习答案面及真实卡片预览依当前图生成运行时镜像，电脑card_will_show同样从当前图生成；正文普通锚点和旧镜像行都由受限GUID桥处理。没有独立引用服务器或私人JSON同步。

只导入单牌组时，其他牌组的目标可能不在本机，保留引用并提示缺失，不按同名内容替代。新增引用保存前校验目标存在；已有失联引用可保留/移除。离线同笔记并发遵循原Anki同步规则，没有逐边CRDT合并。

## 编辑流程与生命周期

手动新增页、独立编辑页及宽屏BrowserEditorPane共用字段编辑器。NoteFieldCard显式开启正文引用，拥有选择器构建和源笔记GUID，向公共NoteFieldEditor注入窗口工厂；公共编辑器只管理选区、窗口生命周期和URL结果应用，不导入引用业务UI。别名/其他普通富文本输入默认不显示此工具。选中目标后的当前引用文字编辑区由DialogFrame固定footer承载，结果列表独立滚动；预览图标与输入同排。固定内圈、外圈旋转和点击规则不变；新增按钮复用原图标/文字/触摸热区。点击只打开选择器，先冻结正文、模式、光标、选区和窗口代次；确认时再次验证前台、字段存活、可编辑及原草稿未变化，旧窗口不能改新字段。取消恢复原编辑位置。

标签下方保留“关联卡片 · 数量”，**新建未保存时同样可用**。草稿面板显示本处引用、旧手动关系和已保存的反向关系；新建笔记的反向列表为空。无正文光标的管理入口添加时附在末字段，精确选区插入由外圈负责。原标签折叠仍沿用新增页的高级设置；管理入口独立可见。

编辑页管理、显示文字修改和移除全部暂存，正文/标签/附件/引用一起由原保存按钮提交。返回放弃时一并丢弃，关闭引用面板不会刷新或接受外部笔记作为新保存基线，外部正文/标签/类型变化仍由原AnkiNoteUpdate冲突检查拒绝。目标预览及预览内的引用关系只读，不在取消草稿后留下隐式写入；返回优先关闭最上层，再回选择器/草稿。预览不评分、不推进正式学习队列；正式学习计时和自动前进沿原覆盖守卫暂停。预览循环最多32层。

学习菜单和真实卡片预览的原“关联卡片”即时管理入口继续兼容已有关系；其写入仍由NoteLinksService串行持有AutoSyncScheduler/SyncActivity占用、重读基线并批量更新。已接受写入不随UI销毁取消，读取核对代次。普通未准备类型也可以使用，此入口不再强制要求电脑添加字段。

电脑通过已安装Anki的`note_will_flush`钩子，在原Note序列化/Core提交前同步正文与元数据；普通无引用笔记走快速路径。字段编辑器若丢弃隐藏注释，从数据库原笔记基线恢复无关手动关系与旧别名，同时删除已移除的正文关系。渲染读取不写库，缓存仍在原operation/sync/profile钩子失效。电脑取消关联会同时去掉相应正文锚点并保留文字。

## 界面与JIDE

正文引用在可视编辑及卡面使用当前主题的主色容器底色和小圆角，不新增下划线；样式只在运行时提供，不把色值或标记符写进笔记。原有正文格式和每处引用文字保留。

选择器、草稿管理及即时管理均复用搜索牌组提取的LiveSearchField：标题下同款输入与清空按钮，DialogSearchHeader独占分隔线至搜索框12vp间距；输入停顿200ms自动查询，Enter立即查询，输入不被读取忙碌状态锁住。新输入立刻作废旧查询，空输入清结果，销毁取消定时及迟到结果；不再显示手动搜索按钮。同一组件用于首页牌组（本地即时筛选）和JIDE历史记录。

所有入口组合公共组件：SettingsActionRow拥有行内文字、箭头和最小点击高度；页面Scroll独占左右各12vp，标签至引用入口的组间距归父Column（窄版8vp、普通12vp），不叠加外边距或安全区。DialogFrame独占选择器/管理弹窗的卡片内边距、键盘避让与安全区，正文只贡献8vp组间距，目标预览复用既有全屏组件；深浅色消费原主题。没有自定义窗口尺寸、复制箭头、颜色或阴影。

共同声明为NOTE_FIELD_EDITING_SUPPORT/NOTE_LINK_SUPPORT和AppInterface。JIDE可发现外圈引用选择器、新增/编辑草稿管理、实际忙碌/数量/保存语义；不发布正文、搜索内容、目标GUID或标签草稿，不新增助手写入工具。只读目标预览的即时编辑控件明确禁用。

## 验证与打包

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/note-references.test.mjs tools/tests/note-links-editor.test.mjs tools/tests/note-links.test.mjs tools/tests/note-rich-editor.test.mjs
python -m unittest discover -s desktop/anki-note-links/tests -v
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-note-links-browser.mjs <输出目录>
python tools/test-note-links-anki.py --anki <Anki.exe> --output <输出目录>
python tools/package-note-links.py --output <输出目录>
npm run verify -- repo
npm run build:app -- -SkipRust
```

此轮不改原生/RPC或锁定Core；已有真实Core元数据/GUID查询回归入口仍为 `cargo test -p jidecards_core --features anki-core --locked --test note_links`。电脑验收使用独立临时收藏库，覆盖未准备的普通类型、保存钩子、正文引用、反向显示、移除、旧数据迁移及真实UI，输出合成演示APKG。浏览器覆盖生产卡片中的正文点击、运行时镜像、迟到代次及宽窄/深浅色/文字缩放；不是ArkUI/ArkWeb设备截图。

本轮实际结果与未覆盖范围见[2026-10-23/24记录](note-links-verification-2026-10-24.md)，历史首次验收与编辑页增量范围见[2026-10-21/22记录](note-links-verification-2026-10-21.md)。最终安装及界面检查以交付包receipt为准。
