// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-RENDERING-001
// @名称 卡片渲染服务边界
//
// @作用
// 包装后端卡片渲染服务的 3 个 RPC：渲染既有卡片 / 提取音视频标签 / 获取空卡报告。
// 渲染既有卡片 返回正反面模板节点流与 CSS；提取音视频标签 同时承担音频文件名与 TTS 项两路提取；
// 获取空卡报告 返回因模板缺失或字段为空导致无卡片可渲染的笔记列表（含 will_delete_note 标记）。
// 不持有 UI 状态；节点流 → HTML 的组装在 model/StudyCardHtmlBuilder（纯函数，可单测）。
//
// @输入
// 卡片ID / 单侧 HTML文本 / 是否正面 / 无（空卡报告）
//
// @输出
// Promise<RenderedCard> / Promise<AvTagsResult> / Promise<空卡报告>
//
// @业务规则
// 编号来源：backend.rs run_backend_card_rendering_service_method 分支
//   3 提取音视频标签 / 5 获取空卡 / 6 渲染既有卡片
// 渲染既有卡片：browser=false / partial_render=false（学习页语义，非浏览页）；isEmpty=true 表示卡片内容为空（如字段缺失），调用方可跳过展示。
// extractAudioTags 一次返回声音文件名与 TTS 项，分别保持各自出现顺序。
// 获取空卡报告：请求为 generic.Empty（空字节）；返回 EmptyCardsReport，UI 自绘列表展示，不直接渲染后端 HTML 报告。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，可能修改 Anki collection 渲染缓存状态。
// ========================================================

import { 后端会话 } from './后端会话';
import { 卡片渲染方法, 服务号 } from './服务索引';
import type { RenderedCard, TemplateNode, 空卡报告 } from '../proto/messages/CardRenderingMessages';
import {
  decodeExtractAvTagsResponse,
  decodeExtractLatexResponse,
  decodeRenderCardResponse,
  decode空卡报告,
  encodeExtractAvTagsRequest,
  encodeExtractLatexRequest,
  encodeRenderExistingCardRequest,
  encode空请求
} from '../proto/messages/CardRenderingMessages';
import type { AvTagsResult } from '../proto/messages/CardRenderingMessages';

export class 卡片渲染服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 渲染既有卡片的正面/背面节点流与模板 CSS。
   * browser=false / partial_render=false（学习页语义，非浏览页）。
   * isEmpty=true 表示卡片内容为空（如字段缺失），调用方可跳过展示。
   */
  async 渲染既有卡片(卡片ID: number): Promise<RenderedCard> {
    const 请求字节: Uint8Array = encodeRenderExistingCardRequest(卡片ID);
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端卡片渲染, 卡片渲染方法.渲染既有卡片, 请求字节);
    const rendered: RenderedCard = decodeRenderCardResponse(响应字节);
    await this.resolveLatexImages(rendered.questionNodes, rendered.latexSvg);
    await this.resolveLatexImages(rendered.answerNodes, rendered.latexSvg);
    return rendered;
  }

  /**
   * 将传统 LaTeX 标签解析为牌组已有的媒体引用，不生成图片、不改笔记字段。
   * Invariants: 普通 MathJax 卡片不增加 RPC；保留节点、拼写标记和正反面挖空语义。
   */
  private async resolveLatexImages(nodes: TemplateNode[], svg: boolean): Promise<void> {
    const legacyLatex: RegExp = new RegExp('\\[(?:latex|\\$\\$?)\\]', 'i');
    for (const node of nodes) {
      const text: string = node.text !== null ? node.text : (node.replacement?.currentText ?? '');
      if (!legacyLatex.test(text)) {
        continue;
      }
      const response: Uint8Array = await this.会话.调用(
        服务号.后端卡片渲染, 卡片渲染方法.extractLatex, encodeExtractLatexRequest(text, svg));
      const html: string = decodeExtractLatexResponse(response);
      if (node.text !== null) {
        node.text = html;
      } else if (node.replacement !== null) {
        node.replacement.currentText = html;
      }
    }
  }

  /**
   * 获取空卡报告（GetEmptyCards RPC，service=27 method=5）。
   * 返回因模板缺失或字段为空导致无卡片可渲染的笔记列表。
   * 每条笔记含 note_id / card_ids / will_delete_note（删除这些卡后笔记是否变空）。
   * 调用方可据此决定：仅删除空卡，或连同笔记一起删除。
   */
  async 获取空卡报告(): Promise<空卡报告> {
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端卡片渲染, 卡片渲染方法.获取空卡, encode空请求());
    return decode空卡报告(响应字节);
  }

  /** 一次解析同一卡面的声音与 TTS，避免重复 RPC 和 HTML 解析。 */
  async extractAudioTags(html: string, question: boolean): Promise<AvTagsResult> {
    const request: Uint8Array = encodeExtractAvTagsRequest(html, question);
    const response: Uint8Array = await this.会话.调用(
      服务号.后端卡片渲染, 卡片渲染方法.提取音视频标签, request);
    return decodeExtractAvTagsResponse(response);
  }
}
