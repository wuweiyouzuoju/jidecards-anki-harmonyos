// SPDX-License-Identifier: AGPL-3.0-or-later

/** ECS 公告查询入口，用户识别码和安装凭证通过请求正文与请求头传输。 */
export const 官方公告地址: string = 'https://8.145.41.24/v1/announcements/query';

/** 调试与发行构建共用，服务器按公告受众筛选。 */
export const OFFICIAL_ANNOUNCEMENTS_ENABLED: boolean = true;
