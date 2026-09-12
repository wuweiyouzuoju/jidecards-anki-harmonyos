// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-RENDERING-001
// @名称 卡片渲染消息编解码
//
// @作用
// 编解码 anki.card_rendering.proto 消息（Anki 26.05）：
// - RenderExistingCardRequest：渲染指定卡片
// - ExtractAvTagsRequest/Response：抽取 [sound:...] 与 [anki:tts] 标签
// - RenderCardResponse：模板节点流（文本/字段替换交替），不是最终 HTML
// 字段来源：third_party/anki/proto/anki/card_rendering.proto
//
// @输入
// 编码：cardId / (text, questionSide) 等标量参数
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：AvTagsResult（soundFiles + ttsItems）/ RenderedCard（question/answer 节点树 + css）
//
// @业务规则
// 节点 → HTML 的组装属于渲染层（ArkWeb 页面），本文件只做纯编解码。
// TtsTag 的 voices/speed/other_fields 本端不使用，跳过。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 线类型_长度分隔, 协议写入器 } from '../core/ProtoWriter';

export function encodeRenderExistingCardRequest(cardId: number): Uint8Array {
  const w = new 协议写入器();
  if (cardId !== 0) {
    w.写入64位整数(1, cardId);
  }
  // browser=false、partial_render=false 为 proto3 默认值，按 prost 约定不写字段
  return w.转为字节();
}

/** ExtractAvTagsRequest：card_rendering.proto 字段 1=text, 2=question_side */
export function encodeExtractAvTagsRequest(text: string, questionSide: boolean): Uint8Array {
  const w = new 协议写入器();
  if (text !== '') {
    w.写入字符串(1, text);
  }
  if (questionSide) {
    w.写入布尔(2, true);
  }
  return w.转为字节();
}

/** ExtractLatexRequest：1=text, 2=svg；内容已经过模板挖空处理，不启用 expand_clozes。 */
export function encodeExtractLatexRequest(text: string, svg: boolean): Uint8Array {
  const w = new 协议写入器();
  if (text !== '') {
    w.写入字符串(1, text);
  }
  if (svg) {
    w.写入布尔(2, true);
  }
  return w.转为字节();
}

/** 仅消费上游替换后的 HTML；图片文件名与 HTML 转义由 Anki Core 负责。 */
export function decodeExtractLatexResponse(bytes: Uint8Array): string {
  const r = new 协议读取器(bytes);
  let text: string = '';
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      text = r.读取字符串();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return text;
}

/** ExtractAvTagsResponse 的解码结果：
 *  - soundFiles: [sound:xxx.mp3] 标签文件名（AVPlayer 播放）
 *  - ttsItems: [anki:tts lang=xxx]text[/anki:tts] 标签内容（CoreSpeechKit 朗读）
 */
export interface AvTagsResult {
  text: string;
  soundFiles: string[];
  ttsItems: TtsItem[];
}

export interface TtsItem {
  text: string;
  language: string;
}

function decodeAvTag(bytes: Uint8Array, soundFiles: string[], ttsItems: TtsItem[]): void {
  const r = new 协议读取器(bytes);
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      // sound_or_video: string
      soundFiles.push(r.读取字符串());
    } else if (tag.字段号 === 2) {
      // TTSTag: { text=1, lang=2, voices=3, speed=4, other_fields=5 }
      ttsItems.push(decodeTtsTag(r.读取字节()));
    } else {
      r.跳过字段(tag.线类型);
    }
  }
}

function decodeTtsTag(bytes: Uint8Array): TtsItem {
  const r = new 协议读取器(bytes);
  const out: TtsItem = { text: '', language: '' };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.text = r.读取字符串();
        break;
      case 2:
        out.language = r.读取字符串();
        break;
      default:
        // 3=voices(repeated string), 4=speed(float), 5=other_fields(map) — 本端不使用
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decodeExtractAvTagsResponse(bytes: Uint8Array): AvTagsResult {
  const r = new 协议读取器(bytes);
  const out: AvTagsResult = { text: '', soundFiles: [], ttsItems: [] };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.text = r.读取字符串();
        break;
      case 2:
        decodeAvTag(r.读取字节(), out.soundFiles, out.ttsItems);
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export interface TemplateReplacement {
  fieldName: string;
  currentText: string;
  filters: string[];
}

export interface TemplateNode {
  /** 文本节点内容；replacement 节点时为 null */
  text: string | null;
  /** 字段替换节点；text 节点时为 null */
  replacement: TemplateReplacement | null;
}

export interface RenderedCard {
  questionNodes: TemplateNode[];
  answerNodes: TemplateNode[];
  css: string;
  latexSvg: boolean;
  isEmpty: boolean;
}

function decodeReplacement(bytes: Uint8Array): TemplateReplacement {
  const r = new 协议读取器(bytes);
  const out: TemplateReplacement = { fieldName: '', currentText: '', filters: [] };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.fieldName = r.读取字符串();
        break;
      case 2:
        out.currentText = r.读取字符串();
        break;
      case 3:
        out.filters.push(r.读取字符串());
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function decodeTemplateNode(bytes: Uint8Array): TemplateNode {
  const r = new 协议读取器(bytes);
  const node: TemplateNode = { text: null, replacement: null };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        node.text = r.读取字符串();
        break;
      case 2:
        node.replacement = decodeReplacement(r.读取字节());
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return node;
}

export function decodeRenderCardResponse(bytes: Uint8Array): RenderedCard {
  const r = new 协议读取器(bytes);
  const out: RenderedCard = {
    questionNodes: [],
    answerNodes: [],
    css: '',
    latexSvg: false,
    isEmpty: false
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.questionNodes.push(decodeTemplateNode(r.读取字节()));
        break;
      case 2:
        out.answerNodes.push(decodeTemplateNode(r.读取字节()));
        break;
      case 3:
        out.css = r.读取字符串();
        break;
      case 4:
        out.latexSvg = r.读取布尔();
        break;
      case 5:
        out.isEmpty = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

// ========================================================
// EmptyCardsReport（card_rendering.proto 第 84-92 行）
// GetEmptyCards(generic.Empty) -> EmptyCardsReport
// 字段：report=string(1), notes=repeated NoteWithEmptyCards(2)
// NoteWithEmptyCards：note_id=int64(1), card_ids=repeated int64(2), will_delete_note=bool(3)
// ========================================================

export interface 笔记空卡 {
  笔记ID: number;
  卡片IDs: number[];
  删除后无卡: boolean;
}

export interface 空卡报告 {
  /** 后端生成的 HTML 报告（本端不直接展示，UI 自绘列表） */
  报告HTML: string;
  笔记列表: 笔记空卡[];
}

function decode笔记空卡(bytes: Uint8Array): 笔记空卡 {
  const r = new 协议读取器(bytes);
  const out: 笔记空卡 = { 笔记ID: 0, 卡片IDs: [], 删除后无卡: false };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.笔记ID = r.读取64位整数();
        break;
      case 2:
        // repeated int64 card_ids：proto3 默认 packed（线类型 2），兼容旧 unpacked
        if (tag.线类型 === 线类型_长度分隔) {
          const packed: number[] = r.读取打包64位整数();
          for (const cardId of packed) {
            out.卡片IDs.push(cardId);
          }
        } else {
          out.卡片IDs.push(r.读取64位整数());
        }
        break;
      case 3:
        out.删除后无卡 = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decode空卡报告(bytes: Uint8Array): 空卡报告 {
  const r = new 协议读取器(bytes);
  const out: 空卡报告 = { 报告HTML: '', 笔记列表: [] };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.报告HTML = r.读取字符串();
        break;
      case 2:
        out.笔记列表.push(decode笔记空卡(r.读取字节()));
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** GetEmptyCards 请求为 generic.Empty，无字段，编码为空字节 */
export function encode空请求(): Uint8Array {
  return new 协议写入器().转为字节();
}
