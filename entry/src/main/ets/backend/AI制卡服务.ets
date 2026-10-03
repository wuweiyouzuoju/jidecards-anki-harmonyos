// SPDX-License-Identifier: AGPL-3.0-or-later

// AI 制卡请求服务：OpenAI-compatible /chat/completions 直连。
// 职责：拼 Prompt（笔记类型名 + 字段顺序 + 制卡规则）→ POST → 解析 cards[].fields。
// 不依赖 Anki：入参全是纯字符串/布尔，返回纯 AI生成卡片[]。
// Note 落库由 笔记服务 负责，本模块不触碰后端会话。
// HTTP 形状对齐 官方公告服务.ets（createHttp + finally destroy）。

import { http } from '@kit.NetworkKit';
import { NOTE_TYPE_KIND_CLOZE } from '../proto/messages/NotetypeMessages';
import { AGENT_IDENTITY_INSTRUCTIONS } from '../model/agent/AgentSessionContext';

/** 错误类别：UI 层按 kind 本地化展示。 */
export type AI制卡错误类别 =
  'not_configured' | 'network' | 'http' | 'parse' | 'empty' | 'unsupported_notetype';

export class AI制卡错误 extends Error {
  readonly kind: AI制卡错误类别;
  /** HTTP 非 2xx 时的状态码；其他类别为 0。 */
  readonly 状态码: number;

  constructor(kind: AI制卡错误类别, 状态码: number = 0) {
    super(kind);
    this.kind = kind;
    this.状态码 = 状态码;
  }
}

/** AI 返回的一张卡：fields 与笔记类型字段顺序一一对应。 */
export interface AI生成卡片 {
  fields: string[];
}

export interface AI制卡请求参数 {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 当前笔记类型名称（进 Prompt 让模型知道在做什么题型） */
  笔记类型名: string;
  /** 字段名列表（顺序即 fields 顺序） */
  字段名列表: string[];
  /** `anki.notetypes.Notetype.Config.Kind`，由后端结构解码。 */
  noteTypeKind: number;
  /** 后端 `GetClozeFieldOrds` 返回的零基字段序号。 */
  clozeFieldOrds: number[];
  用户输入: string;
}

interface ChatCompletion消息 {
  role: string;
  content: string;
}

interface ChatCompletion请求体 {
  model: string;
  messages: ChatCompletion消息[];
}

interface AI请求头 {
  'Content-Type': string;
  'Authorization': string;
}

interface 原始消息 {
  content?: string;
}

interface 原始选项 {
  message?: 原始消息;
}

interface 原始Chat响应 {
  choices?: 原始选项[];
}

interface 原始卡片 {
  fields?: string[];
}

interface 原始卡片集 {
  cards?: 原始卡片[];
}

/** 单次生成上限：防失控响应撑爆 UI。 */
const 最大卡片数: number = 50;

export function 构建系统提示(参数: AI制卡请求参数): string {
  const 字段行: string = 参数.字段名列表
    .map((名: string, 序: number): string => `${序 + 1}. ${名}`)
    .join('\n');
  let 提示: string =
    AGENT_IDENTITY_INSTRUCTIONS + `本次根据用户提供的材料制作闪卡，严格遵循以下 JSON 输出规则。\n` +
    `当前笔记类型：${参数.笔记类型名}\n` +
    `字段（fields 数组必须严格按以下顺序输出，共 ${参数.字段名列表.length} 个）：\n${字段行}\n` +
    `规则：\n` +
    `- 每张卡只考一个知识点，适合主动回忆\n` +
    `- 只使用材料中的信息，不编造材料里没有的内容\n` +
    `- 答案尽量简洁\n` +
    `- cards 里每个元素的 fields 长度必须等于 ${参数.字段名列表.length}，顺序与上面字段顺序完全一致\n` +
    `- 只返回 JSON，不要输出 Markdown 代码块标记或任何解释\n` +
    `输出格式：{"cards":[{"fields":["字段1内容","字段2内容"]}]}`;
  if (参数.noteTypeKind === NOTE_TYPE_KIND_CLOZE) {
    const 填空字段说明: string[] = [];
    for (const 字段序号 of 参数.clozeFieldOrds) {
      if (字段序号 < 0 || 字段序号 >= 参数.字段名列表.length) {
        throw new AI制卡错误('unsupported_notetype');
      }
      填空字段说明.push(`第 ${字段序号 + 1} 个字段（${参数.字段名列表[字段序号]}）`);
    }
    if (填空字段说明.length === 0) {
      throw new AI制卡错误('unsupported_notetype');
    }
    提示 +=
      `\n填空类型额外要求：只允许在以下字段中写填空标记：${填空字段说明.join('、')}。` +
      `每张笔记至少在一个允许字段中用 {{c1::答案}} 格式挖空，` +
      `同一内容可继续用 {{c2::...}}；严禁把填空标记写进其他字段。`;
  } else {
    提示 += `\n普通类型额外要求：不要输出 {{c1::答案}} 等填空标记。`;
  }
  return 提示;
}

/** 剥掉模型偶发的 ```json 围栏与首尾空白，尽量只留 JSON 本体。 */
function 剥离围栏(内容: string): string {
  let 文本: string = 内容.trim();
  if (文本.startsWith('```')) {
    const 首行结束: number = 文本.indexOf('\n');
    if (首行结束 >= 0) {
      文本 = 文本.substring(首行结束 + 1);
    }
    const 围栏结束: number = 文本.lastIndexOf('```');
    if (围栏结束 >= 0) {
      文本 = 文本.substring(0, 围栏结束);
    }
    文本 = 文本.trim();
  }
  return 文本;
}

/** 把任意长度的原始 fields 规范化为恰好 期望字段数 个条目；全空卡丢弃。 */
function 规范化卡片(原始fields: string[], 期望字段数: number): AI生成卡片 | null {
  const fields: string[] = [];
  for (let i: number = 0; i < 期望字段数; i++) {
    let 值: string = '';
    if (i < 原始fields.length && typeof 原始fields[i] === 'string') {
      const 原值: string = 原始fields[i];
      值 = 原值.trim();
    }
    fields.push(值);
  }
  let 全空: boolean = true;
  for (const 值 of fields) {
    if (值.length > 0) {
      全空 = false;
      break;
    }
  }
  return 全空 ? null : { fields: fields };
}

/** 解析模型返回的 content 文本为卡片数组；格式异常抛 AI制卡错误。 */
export function 解析AI卡片(内容: string, 期望字段数: number): AI生成卡片[] {
  const 文本: string = 剥离围栏(内容);
  if (文本.length === 0) {
    throw new AI制卡错误('empty');
  }
  let 原始: 原始卡片集;
  try {
    原始 = JSON.parse(文本) as 原始卡片集;
  } catch (错误) {
    throw new AI制卡错误('parse');
  }
  if (原始 === null || typeof 原始 !== 'object' || !Array.isArray(原始.cards)) {
    throw new AI制卡错误('parse');
  }
  const 结果: AI生成卡片[] = [];
  for (const 卡 of 原始.cards) {
    if (卡 === null || typeof 卡 !== 'object' || !Array.isArray(卡.fields)) {
      continue;
    }
    const 规范卡: AI生成卡片 | null = 规范化卡片(卡.fields, 期望字段数);
    if (规范卡 !== null) {
      结果.push(规范卡);
    }
    if (结果.length >= 最大卡片数) {
      break;
    }
  }
  if (结果.length === 0) {
    throw new AI制卡错误('empty');
  }
  return 结果;
}

/** 拼 /chat/completions 完整地址：容忍 baseUrl 带不带结尾斜杠。 */
export function 构建请求地址(baseUrl: string): string {
  const 去斜杠: string = baseUrl.trim().replace(/\/+$/, '');
  return `${去斜杠}/chat/completions`;
}

/** 发起一次制卡请求。成功返回卡片数组；配置缺失/网络/HTTP/解析/空结果分别抛 AI制卡错误。 */
export async function 请求AI生成卡片(参数: AI制卡请求参数): Promise<AI生成卡片[]> {
  const 密钥: string = 参数.apiKey.trim();
  const 地址: string = 参数.baseUrl.trim();
  const 模型: string = 参数.model.trim();
  const 输入: string = 参数.用户输入.trim();
  if (密钥.length === 0 || 地址.length === 0 || 模型.length === 0 || 输入.length === 0) {
    throw new AI制卡错误('not_configured');
  }

  const 消息列表: ChatCompletion消息[] = [
    { role: 'system', content: 构建系统提示(参数) },
    { role: 'user', content: 输入 }
  ];
  const 请求体数据: ChatCompletion请求体 = { model: 模型, messages: 消息列表 };
  const 请求头: AI请求头 = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${密钥}`
  };

  const client: http.HttpRequest = http.createHttp();
  const options: http.HttpRequestOptions = {
    method: http.RequestMethod.POST,
    header: 请求头,
    extraData: JSON.stringify(请求体数据),
    expectDataType: http.HttpDataType.STRING,
    usingCache: false,
    connectTimeout: 15000,
    // AI 生成整批卡片可能要几十秒，读超时放大到 120s
    readTimeout: 120000
  };
  try {
    const response: http.HttpResponse =
      await client.request(构建请求地址(地址), options);
    if (response.responseCode < 200 || response.responseCode >= 300) {
      throw new AI制卡错误('http', response.responseCode);
    }
    if (typeof response.result !== 'string') {
      throw new AI制卡错误('parse');
    }
    let 响应体: 原始Chat响应;
    try {
      响应体 = JSON.parse(response.result) as 原始Chat响应;
    } catch (错误) {
      throw new AI制卡错误('parse');
    }
    let 内容: string = '';
    if (响应体 !== null && Array.isArray(响应体.choices) && 响应体.choices.length > 0) {
      const 消息: 原始消息 | undefined = 响应体.choices[0].message;
      if (消息 !== undefined && 消息 !== null && typeof 消息.content === 'string') {
        内容 = 消息.content;
      }
    }
    if (内容.length === 0) {
      throw new AI制卡错误('parse');
    }
    return 解析AI卡片(内容, 参数.字段名列表.length);
  } catch (错误) {
    if (错误 instanceof AI制卡错误) {
      throw 错误;
    }
    // http.createHttp 的业务错误（断网 / 域名解析失败 / 超时）统一归为 network
    throw new AI制卡错误('network');
  } finally {
    client.destroy();
  }
}
