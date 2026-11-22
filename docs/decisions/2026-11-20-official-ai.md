# 官方 AI：华为身份、服务端额度与实际 Token 结算

[决策索引](README.md) · [应用内 Agent](../development/agent.md) · [服务端入口](../../server/official-ai/README.md)

## 选择

保留 DeepSeek 自带 Key、自定义接口和旧设置键。新增 `official` Provider，服务器保管开发者 Key，客户端安全存储仅保存应用登录会话。用户要求所有 AI 使用前先登录华为账号：首页制卡/助手、首页预览改卡、浏览改卡/预览改卡及学习改卡共用 `backend/agent/HuaweiAIAccount.ets`；发送入口再次校验会话。取消或失败不进入 AI，不改变牌组或学习进度。

新服务单独监听 18081，与已有安装统计进程和数据库分开，复用 ECS、现有服务用户与 Nginx。这样不将安装上传随机凭证当成付费身份，也不改旧版上报与远程权益协议。`backend/agent/OfficialAIService.ets` 负责账号、余额和 IAP；`OfficialAIRequestStore.ets` 负责付费请求的跨进程幂等 ID；`OfficialAIAdapter.ets` 接入原有 Responses 会话、草稿确认与写入边界。

服务器账本、订单、请求及 Token 结算由 `server/official-ai` 拥有。按用户后续要求移除额外的每用户并发/每日次数限制，取消官方模式固定输入输出截断；实际使用 DeepSeek 返回的最终 usage，规则版本、输入/缓存/输出 Token 与扣点共同落盘。没有客户端余额或模拟支付发放正式额度的入口。余额不足仍不能透支付费额度。

## 界面与认知

设置 → AI 智能体 → 提供商 → 官方 AI 服务，可查看服务器余额、独立沙盒余额、登录、刷新、购买及补单。保留原有公共选择器、设置行、主按钮、主题和表单间距；分组拥有外缘，行组件拥有内部间距，官方内容不再次添加页面安全区。页面正文滚动，宽窄模式均为单列。

`SettingsStructure` 与 `AppInterface` 同步声明官方服务入口与独立 `official_ai` 表面。观察发布登录、环境、真实余额/沙盒余额和购买按钮可用性；未读取为 unknown，不能当成 0。没有新增 JIDE 代替用户购买或修改余额的工具。

现有回复显式 AI 标识和 AI 内容来源记录继续使用。四种导出器仍阻止含 AI 生成/改写内容的文件导出，不能因此声称已经完成允许导出的隐式标识标准或全部 AI 上架资质。

## 2026-11-20 已取得证据与剩余外部条件

- 正确项目为 `/Users/chengrui/Developer/harmony/projects/jidecards`，原工作目录已迁移。包名、签名身份、用户牌组保留；仅操作 `PromoCapture_WidePhone_20261120` 手机模拟器（1320×2232、API 23）。此后用户明确授权通过无线调试 192.168.69.46:40025 向实机平板覆盖安装，并指定 ceshi 签名；HDC服务重连后使用新端口192.168.69.46:33021完成覆盖安装并启动，版本26.11.21.18／3158。未卸载或清数据。
- 华为应用级 OAuth 凭据已配置服务端，Client ID 与 APP ID 相同，不需额外客户端 metadata。用户亲自在模拟器登录后，真实 code 交换成功；服务端已创建绑定会话，AI 入口由登录页进入设置页。
- IAP 本轮新建的首个未使用密钥因浏览器未落盘一次性下载而撤销；替代密钥已安全保存与配置，密钥内容不进入源码。只保留一个本轮有效密钥，没有撤销既有其他密钥。信任根为文档链接的 Huawei CBG Root CA G2，公有证书 SHA256 `df21a3c09f7954579305f85c64f80cad86f79853ee3a887c1dec95d218df3a37`。
- 仅给已验证测试账户发放 SANDBOX 测试额度，正式余额未发放。初始 20 点，后以独立事件补足到1000点。模型测试环境由服务器设为 SANDBOX，独立于不可用的模拟器 IAP 接口，不冒充沙盒购买。`production_enabled=false`；商品草稿已按用户确认创建jide_ai_credits_1000，中国区CNY6.00／1000点；未提交审核，服务端商品目录已同步，production_enabled=false保留。
- 当前模拟器运行时 IAP 命名空间不可用，真实错误为 `Cannot read property isSandboxActivated of undefined`。页面处理此失败并禁用购买；未声称模拟器收银台、真实沙盒支付、退款或补单已端到端通过。余额查询不依赖此支付能力，来自真实服务器。
- 用户提供的 DeepSeek Key 已安全配置服务器。手机模拟器真实请求已返回；私有账本记录输入4875 Token、缓存0、输出76 Token，扣3点SANDBOX测试额度，余额997。证据 `.local/official-ai-evidence/official-ai-real-response.png`。
- 未配置华为订单 v3 通知地址，当前 IP 证书还需核对华为回调商业域名证书条件。首次商品或商品类型新增审核、商品审核截图、真实沙盒账号/设备及独立 AI 资质属于外部前置。

专项测试与真实调用分开：SQLite 并发、幂等、退款、失败释放、实际 usage 计价，临时真实证书链/ES256 签名校验均有直接测试。华为 IAP 与 DeepSeek 网络边界的测试替身不等于真实交易或真实模型调用。最终命令、数量与截图见本轮交付记录；后续改动须按当前输入重新验证。

## 后续界面校准与商品决策

用户指出原内联官方服务面板文字堆叠、历史记录层级不一致。最初改为独立额度页；用户随后明确要求直接放入AI配置页，现已内嵌OfficialAISettings，移除独立目的地与所有跳转回调。余额、充值、账号操作作为配置页同级分组，计费和数据流进入说明。历史记录回到统一14vp分组标题、12vp统计信息、32vp页面最终左边界，长说明移入帮助。当前规则补入[原生表面规范](../development/material-standard.md#二级设置分组的文字与对齐)。

用户最终确认只保留一个商品：¥6／1000点，名称“AI额度包·1000点”，ID `jide_ai_credits_1000`；不创建¥60档位，不提交商品审核或应用上架。真实调用采用开发者随后提供的 DeepSeek Key；测试余额已通过独立账本事件补足到1000点，以验证实际Token预占与结算。

平板覆盖安装后启动成功，显示华为系统隐私确认页；未代替用户点击同意。实机支付、账号登录和完整沙盒交易仍未验证。覆盖安装及启动日志见本机本轮记录。

## 实机沙盒授权修复

用户已在后台添加一个真实华为账号为沙盒测试账号。实机首次返回1001860002，不能归因为设备不支持。查得旧ceshi调试Profile未包含com.huawei.service.iap，且后台显示旧调试Profile失效。保留ceshi原p12密钥，生成CSR并补办ceshi-IAP-20261120调试证书；创建ceshi-IAP-20261120-v2 Profile，验证公钥与原ceshi相同、APP ID正确、包含IAP能力和已登记设备。私有配置.local/ceshi-iap-signing.json为本轮签名入口；既有.local中的ceshi引用已同步更新，发布签名选择未改。

钱包支付登录按iap.isSandboxActivated选择NORMAL／SANDBOX，旧NORMAL会话遇到沙盒时要求显式重新登录；普通AI入口登录不依赖IAP。测试额度说明与正式余额独立，1001860002显示支付授权提示。支付登录、环境匹配与普通登录门禁直接行为测试和资源检查已通过；HAP构建成功。扩大agent分组测试时出现7项与本轮支付修复无关的现有失败（hasExternalMcpEntry及卡片保存生命周期夹具），没有回滚或代补并行工作；日志/tmp/jide-sandbox-agent-tests.log。真实购买、验单及退款验证继续以实机记录为准。

签名缓存核验：首次切换本机Profile后Hvigor报告SignHap UP-TO-DATE，实际HAP仍嵌入旧Profile（不含IAP）。已保留旧包至.local/iap-before-profile-refresh-signed.hap，移除生成的signed输出后重新构建，SignHap实际执行。通过hap-sign-tool verify-app提取新HAP中的Profile，验证UUID17caeabe-9996-45b9-a65a-ea7ee0925760与IAP能力存在。今后本机签名文件内容或路径变更不能只依据BUILD SUCCESSFUL；需核验实际产物，发现缓存旧签名时先保留旧产物再使签名任务重新执行，不需全量clean或重编原生库。

## 已完成真实沙盒购买与额度页校准

新HAP实际包含IAP能力后，实机iap.queryProducts返回1000点及¥6.00；华为收银台明确显示沙盒不扣费。用户完成本人支付安全验证后，服务器记录一笔SANDBOX订单、1000点到账且confirmed=1；余额997变1997，正式余额未增加。恢复购买后没有再次加点。截图.local/official-ai-evidence/tablet-huawei-product-price.png及tablet-huawei-sandbox-checkout.png。回调空POST探测已支持并有测试；后台通知URL仅接受域名，当前IP接口不满足，尚未配置通知及实测退款。

用户要求参考成熟AI产品并复用已有实现。额度面板采用既有设置卡片、LabeledActionRow、PrimaryActionButton、SettingsActionRow；内嵌后宽度跟随配置页，手机单列，间距沿用页面分组标准8/12vp。页面外缘16vp归宿主、卡片内16vp归设置卡片，最终内容左边界32vp；顶部/底部安全区仅页面拥有。购买统计来自订单；累计消耗3点为既有联调调用，用户明确要求不显示，已从可见概览移除，原始账本保留。主题通过SeriesVisual.isDark传入，颜色/轮廓由原外观入口持有。

JIDE发送按钮原将requestFeedback成功状态交给IconActionButton导致箭头被勾替换；现在发送操作固定idle图标状态（处理中仍显示取消），结果状态保留在消息及JIDE观察中。公共IconActionButton增加显式solidSurface主操作选项，默认行为不变；发送按钮使用主题实色、白色描边箭头，玻璃材质不再改变主操作底色。验证以对应专项、增量HAP与实机/手机截图为准。

修复用户授权处理的AIAgent设置文件截断：恢复imports、Component/struct声明、宿主回调及初始字段，保留其余当前方法，不恢复已删除的批量上限界面。现有组合保存测试的缺联网密钥用例此前与允许DeepSeek共用模型Key的成功用例相同，改为明确选择doubao且无搜索Key，以继续验证写入前检查；32项设置/联网/额度回归通过。额度页平板宽度实测发现仅给组件Common约束不能传递到内部百分比，改为按WINDOW_SIZE_KEY及左右安全区首帧计算明确容器宽度，再交给既有卡片布局；增量HAP通过。

隐私变更诊断：本轮源码及启动配置未新增隐私弹窗。后台协议服务显示2026-11-20 09:23更新原协议、18:50完成记得闪卡2026.11.21协议，另有审核中协议；确切与系统变更提示的绑定仍需后台版本信息核对，不能把系统提示断言为签名变更导致。未修改、删除或撤销任何隐私协议，未代替用户同意。

## 额度直接显示于AI配置页

按用户最新要求，AIAgent设置分组在official提供商下直接组合OfficialAISettings（与providerSettings、历史管理为同级分组），不嵌套卡片表面与安全区。原OfficialAIPage及AppNavigation/HomeDestinations目的地移除，设置页和聊天设置不再传onOfficialAI跳转回调。所有入口共用同一面板。面板会话变化调用原reloadOfficialSession刷新模型配置，支付忙碌进入父分组的officialBusy并阻止切换/退出；isCovered沿用父级遮挡状态。JIDE仍通过official_ai子表面读取真实余额、商品和可操作状态；SettingsStructure将其标为AI额度，表达配置页内部区域，不作为独立Navigation目的地。此轮保留累计消耗不显示及实心箭头发送按钮。

内嵌验收：44项额度/配置/导航/文档专项通过，ceshi签名增量HAP成功并覆盖安装手机模拟器和平板。平板真实AI智能体配置页中显示提供商、保存、余额2993点、购买到账2000点、1000点包、华为价格、账号操作和历史管理；不再存在AI额度导航行。截图.local/official-ai-evidence/ai-settings-inline-credits.png。未执行新的购买。

## 充值数量与余额共卡

用户要求充值放在可用额度卡片内并选择数量。OfficialAISettings取消充值的独立设置卡片，在余额卡内组合现有FormSelectRow选择1–10份；单份仍为唯一jide_ai_credits_1000商品，点数乘份数，价格由iap.Product.microPrice及currency按地区格式计算，单份沿用localPrice。华为PurchaseParameter.quantity单笔上限10，不是应用额外用量限制。选择、总价及点数变化不发起付款，按购买才拉起华为收银台。

OfficialAIService将同一quantity传入服务端intent和IAP。服务端为旧intents表添加默认1的quantity列；验签订单、查询华为最新状态后严格匹配商品/环境/账号/数量，再按单份点数乘数量入账。旧单份意图继续有效，多份退款冲正原始总点数。31项服务端测试和21项客户端/资源专项通过；IAP签名HAP构建通过。无新增档位、无正式上架或正式扣费。

### 余额卡进一步简化

用户明确取消独立华为账号/恢复购买/计费说明模块、购买到账统计和刷新按钮。现界面只有一个余额与充值卡片：可用额度、必要测试说明、份数、总点数和华为总价、购买动作。计费说明使用既有HelpLabel在可用额度标题旁打开，恢复购买收于说明弹窗；未登录时主按钮显示登录，不再常驻账号管理区。购买到账/累计消耗不显示，账本记录不删除。自动刷新在出现时读取、购买及补单后读取，并在可见未遮挡/空闲时每30秒静默更新；保留已有余额避免闪空，离页释放定时器。没有新增支付或登录自动弹窗。

标准标题校准：可用额度必须由设置分组卡片.标题绘制，禁止showHeader:false后自行放普通HelpLabel。当前复用原分组标题14vp Medium、minRowHeight44、公共次文字色，标题与AI智能体/历史记录共用外缘及16vp卡片内边距；帮助由分组卡片回调拥有。29项额度/帮助/公共设置检查通过，HAP构建通过。

数量实机检查：2份显示2000点／¥12.00，华为收银台也显示¥12.00且明确SANDBOX不扣费。测试到支付密码页后取消，没有自动输入密码或新发放额度。服务端数量升级已部署并健康检查成功。多份验单/退款/迁移31项测试通过，尚未完成新多份订单实际付款；既有单份沙盒已验单成功不受影响。

### 充值区的视觉分隔

用户进一步要求同一模块内区分余额和充值。可用额度仍由原设置分组卡片拥有；充值份数、点数与华为价格、购买按钮统一放入12vp内边距的圆角内嵌区域，复用insetMaterialFill与SurfaceBorder。玻璃模式下填充透明，因此通过细边框和留白保持可辨识性，不能只靠透明背景声称已有视觉区分。余额标题保留公共分组规范，支付、数量与JIDE观察接口均未改变。24项额度/文档检查通过，ceshi签名HAP构建通过；只覆盖安装，不清数据，不发起新支付。

用户随后要求右列显示已用额度，并且只包裹数字与单位。当前固定两列读取generationBalance/usedCredits，各自数字与“点”组合为内容宽度的圆角细线框，标题留框外，数字14–44vp自适应。设置分组卡片新增可选副标题/帮助资源，默认单标题调用保持原样；仍只有一个BuilderParam，兼容现有尾随内容调用。计费说明移至已用额度右侧帮助，明确DeepSeek实际Token按账号换算点数；实际服务端token_usage以账号、环境和请求编号为主键，API Key共用不影响分别记账。手机1320×2232、平板1840×2800实际显示均为两列，平板购买仍显示1000点/¥6.00；截图wallet-two-column-boxes-phone.png与wallet-two-column-boxes-tablet.png。手机模拟器仅验收布局，其IAP仍提示不支持，支付验收以真实平板为准。未模拟更长数字或穷举全部窗口尺寸。
