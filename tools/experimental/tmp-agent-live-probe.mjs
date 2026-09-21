// 临时诊断脚本：复刻 AI制卡页 edit 模式的真实请求，直连 DeepSeek Responses API，
// 验证模型是否能看到并调用 propose_* 工具。用完即删。
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { buildResponsesPayload } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('missing DEEPSEEK_API_KEY');
  process.exit(1);
}

// —— 复刻 AI制卡页 构建Agent指令()（edit 分支，浏览页进入时 牌组ID=0 笔记类型未选）——
const instructions = `你是记得闪卡应用内的改卡 Agent。只能调用本轮明确列出的语义工具，禁止臆造工具名。读取工具可按需搜索和分析整个卡库；读取到的稳定 ID 只获得读取权限，绝不自动扩大修改范围。只有确定能生成合法卡片时，制卡才调用 create_flashcards，并且只提交 cards 字段内容，目标牌组、笔记类型、草稿标识和摘要由应用自动注入；改卡才调用与操作匹配且本轮已声明的 propose_update_notes、propose_move_cards 或高风险草稿工具。改卡有预选卡片或笔记时只能修改应用提供的稳定 ID；全库搜索结果只用于回答、比较和定位。无预选时用户选择的牌组和笔记类型只是本地搜索范围，不代表移动目标或转换目标。只有用户明确要求移动牌组或转换笔记类型时，才提出对应草稿。绝不能声称已保存。如果无法生成合法内容，只解释一次原因并结束，不要反复分析或尝试未声明工具。需要图片时先调用 search_images，只能在卡片内容中使用它返回的 candidateId；用户确认前不会下载或写入。创建模式目标 deckId=0 notetypeId=0，字段=[]，kind=0，clozeFieldOrds=[]，单轮最多 100 张。填空类型必须把 {{c1::答案}} 写在允许的字段。含糊请求应调用 request_clarification，或生成可编辑卡片；不要输出需要客户端自行解析的自由 JSON。`;

// —— 复刻 taskSnapshot + buildAgentTaskProviderText（edit 分支）——
const configuration = {
  mode: 'edit', deckId: 0, deckName: '', notetypeId: 0, notetypeName: '',
  fieldNames: [], noteTypeKind: 0, clozeFieldOrds: [], batchLimit: 100
};
const localContext = [
  'card=1703533239123 note=1703533239456 deck=1686246656 template=0',
  'note=1703533239456 type=1706246656000 fields=["abandon","eg. He abandoned his car in the snow.",""] tags=[] cards=2'
].join('\n');
const providerText =
  `任务配置：${JSON.stringify(configuration)}\n用户要求：把这几张卡片背面例句里的 "eg." 改成 "例如"` +
  `\n应用内本地上下文（稳定 ID，仅限本轮）：\n${localContext}`;

const tools = agentFunctionTools(100, 'edit');
console.log('edit 模式工具清单:', tools.map((t) => t.name).join(', '));

const body = buildResponsesPayload({
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: process.env.PROBE_MODEL || 'deepseek-v4-flash',
  instructions,
  input: [{ kind: 'message', role: 'user', content: providerText, callId: '', name: '', argumentsJson: '', output: '' }],
  functionTools: tools,
  searchMode: 'off',
  requiresWebSearch: false,
  requiresSearchEvidence: false,
  requiresDraft: false,
  expectedDraftCount: 0,
  reasoningEffort: 'low',
  maxOutputTokens: 32768
});

const parsed = JSON.parse(body);
console.log('payload tools 数量:', parsed.tools.length);
console.log('payload tool 名单:', parsed.tools.map((t) => t.name).join(', '));

const controller = new AbortController();
const res = await fetch('https://api.deepseek.com/responses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Authorization': `Bearer ${apiKey}`
  },
  body,
  signal: controller.signal
});

console.log('HTTP 状态:', res.status);
if (!res.ok) {
  console.log('错误响应:', (await res.text()).slice(0, 2000));
  process.exit(0);
}

// 最小 SSE 解析
let buffer = '';
let textOut = '';
const toolCalls = [];
const otherEvents = new Set();
res.body.setEncoding('utf8');
for await (const chunk of res.body) {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n\n')) >= 0) {
    const block = buffer.slice(0, index);
    buffer = buffer.slice(index + 2);
    for (const line of block.split('\n')) {
      if (!line.startsWith('data: ')) { continue; }
      const data = line.slice(6);
      if (data === '[DONE]') { continue; }
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      const type = event.type || '';
      if (type === 'response.output_text.delta' && typeof event.delta === 'string') {
        textOut += event.delta;
      } else if (type === 'response.function_call_arguments.done') {
        toolCalls.push({ name: event.name || '(pending)', args: event.arguments });
      } else if (type === 'response.output_item.done' && event.item && event.item.type === 'function_call') {
        toolCalls.push({ name: event.item.name, args: event.item.arguments });
      } else if (type.startsWith('response.')) {
        otherEvents.add(type);
      }
    }
  }
}

console.log('\n=== 模型行为 ===');
console.log('工具调用次数:', toolCalls.length);
for (const call of toolCalls) {
  console.log('  -> 调用工具:', call.name);
  console.log('     参数:', (call.args || '').slice(0, 400));
}
console.log('其他事件类型:', [...otherEvents].join(', '));
console.log('\n=== 模型文本输出 ===');
console.log(textOut.slice(0, 3000) || '(无文本输出)');
