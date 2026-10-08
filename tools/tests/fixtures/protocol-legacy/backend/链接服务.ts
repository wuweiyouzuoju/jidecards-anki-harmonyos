// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-LINKS-001
// @名称 链接服务边界
//
// @作用
// 包装后端 Links 服务的 1 个 RPC：HelpPageLink。
// 传入 HelpPage 枚举，后端返回对应 Anki 官方文档章节的 URL（generic.String）。
// 不持有 UI 状态，失败抛 后端错误（经 后端会话 类型化）。
// 方法索引来源：服务索引.ts（提取自 Anki 26.05 生成代码 backend.rs）。
//
// @输入
// 页面（HelpPage 枚举，指明文档章节；设置页传 INDEX）
//
// @输出
// Promise<string>（官方文档 URL，如 https://docs.ankiweb.net）
//
// @业务规则
// 编号来源：backend.rs line 4909 run_backend_links_service_method
//   0 帮助页链接
// HelpPage.INDEX(10) 返回 docs.ankiweb.net 主页 URL。
// 后端用 locale 决定中英文文档站点，调用方无需拼接语言参数。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，仅读取后端内置的 URL 映射，无外部网络请求。
// ========================================================

import { 后端会话 } from './后端会话';
import { 服务号, 链接方法 } from './服务索引';
import { decodeStringResponse, encodeHelpPageLinkRequest } from '../proto/messages/LinksMessages';
import type { HelpPage } from '../proto/messages/LinksMessages';

export class 链接服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 拉取 Anki 官方文档指定章节的 URL。
   * 页面 为 HelpPage 枚举；设置页底部「查看 Anki 官方文档」入口传 INDEX(10)，
   * 后端返回 docs.ankiweb.net 主页 URL（按当前 locale 选择中英文站点）。
   */
  async 获取帮助页链接(页面: HelpPage): Promise<string> {
    const 请求字节: Uint8Array = encodeHelpPageLinkRequest(页面);
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端链接, 链接方法.帮助页链接, 请求字节);
    return decodeStringResponse(响应字节);
  }
}
