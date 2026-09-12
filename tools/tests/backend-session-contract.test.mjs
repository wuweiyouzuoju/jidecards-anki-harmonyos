// SPDX-License-Identifier: AGPL-3.0-or-later

// M3 契约测试：锁定服务/方法索引表（Anki 26.05 构建产物同源）与错误映射行为。
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  卡片渲染方法,
  集合方法,
  牌组配置方法,
  牌组方法,
  导入导出方法,
  原生状态,
  笔记方法,
  笔记类型方法,
  调度器方法,
  服务号
} from '../../entry/src/main/ets/backend/服务索引.ts';
import { 后端错误, 映射原生错误 } from '../../entry/src/main/ets/backend/错误类型.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

// 索引与 target/**​/build/anki-*​/out/backend.rs（Anki 26.05）match 分支一一对应；
// 修改本表必须同时更新来源注释与升级 SOP 文档。
test('service ids match the generated backend.rs dispatch table', () => {
  assert.equal(服务号.后端集合, 3);
  assert.equal(服务号.后端牌组, 7);
  assert.equal(服务号.后端牌组配置, 11);
  assert.equal(服务号.后端调度器, 13);
  assert.equal(服务号.后端卡片渲染, 27);
  assert.equal(服务号.后端导入导出, 39);
});

test('method ids match the generated backend.rs dispatch table', () => {
  assert.deepEqual({ ...集合方法 }, {
    打开: 0, 关闭: 1, 创建备份: 2, 等待备份完成: 3,
    最新进度: 4, 设置中止请求: 5,
    检查数据库: 6, 获取撤销状态: 7, 撤销: 8, 重做: 9
  });
  assert.deepEqual({ ...牌组方法 }, {
    新建牌组: 0, 添加牌组: 1, 牌组树: 4, 获取牌组名: 13,
    删除牌组: 16, 重命名牌组: 18,
    获取或创建过滤牌组: 19, 添加或更新过滤牌组: 20, 过滤牌组排序标签: 21,
    设置当前牌组: 22, 获取当前牌组: 23
  });
  assert.deepEqual({ ...牌组配置方法 }, {
    获取牌组配置: 1, 获取牌组配置编辑视图: 6, 更新牌组配置: 7
  });
  assert.deepEqual({ ...调度器方法 }, {
    获取队首卡片: 3, 提交评分: 4, 今日计时: 5,
    牌组今日计数: 10, 完成页信息: 11,
    恢复埋藏与暂停: 12, 按牌组恢复埋藏: 13, 埋藏或暂停: 14,
    清空过滤牌组: 15, 重建过滤牌组: 16,
    设置到期日: 19, 排序卡片: 21,
    描述下一档状态: 24, 自定义学习: 27, 自定义学习默认值: 28,
    重新定位默认值: 29
  });
  assert.deepEqual({ ...卡片渲染方法 }, { 提取音视频标签: 3, extractLatex: 4, 获取空卡: 5, 渲染既有卡片: 6 });
  assert.deepEqual({ ...导入导出方法 }, {
    导入集合包: 0, 导出集合包: 1,
    导入Anki包: 2, 导出Anki包: 4
  });
  // Type-in-the-Answer 翻面拉取笔记字段：笔记方法.获取笔记=6 + 笔记类型方法.获取笔记类型=6
  // 浏览编辑区 T7 保存修改：笔记方法.更新笔记=5（UpdateNotes RPC，返回 OpChanges）
  assert.deepEqual({ ...笔记方法 }, {
    新建笔记: 0, 添加笔记: 1, 添加默认值: 3,
    更新笔记: 5, 获取笔记: 6, 笔记字段校验: 11,
    某笔记的卡片: 12, 笔记的唯一笔记类型: 13
  });
  // T8 批量操作「更改笔记类型」：获取变更笔记类型信息=14 + 变更笔记类型=15
  assert.deepEqual({ ...笔记类型方法 }, {
    添加笔记类型旧版: 2, 更新笔记类型旧版: 3, 获取标准笔记类型JSON: 5,
    获取笔记类型: 6, 获取笔记类型旧版: 7, 获取笔记类型名列表: 8, 移除笔记类型: 11,
    获取变更笔记类型信息: 14, 变更笔记类型: 15, 获取填空字段序号: 18
  });
});

test('native status codes mirror rsharmony.h', () => {
  assert.deepEqual({ ...原生状态 }, {
    成功: 0, 参数非法: 1, 句柄未找到: 2, 后端错误: 3, 原生致命错误: 4
  });
});

test('映射原生错误 decodes 后端错误 protobuf details', () => {
  const w = new 协议写入器();
  w.写入字符串(1, 'collection is already open');
  w.写入变长整数(2, 5); // DB_ERROR
  w.写入字符串(4, 'openCollection');

  const err = 映射原生错误({
    nativeStatus: 原生状态.后端错误,
    details: w.转为字节(),
    message: 'Anki backend rejected the request'
  });
  assert.ok(err instanceof 后端错误);
  assert.equal(err.message, 'collection is already open');
  assert.equal(err.kind, 5);
  assert.equal(err.context, 'openCollection');
  assert.equal(err.nativeStatus, 原生状态.后端错误);
});

test('映射原生错误 falls back to native message for non-backend failures', () => {
  const err = 映射原生错误({ nativeStatus: 原生状态.句柄未找到, message: 'backend handle not found' });
  assert.equal(err.message, 'backend handle not found');
  assert.equal(err.kind, 0);
  assert.equal(err.nativeStatus, 原生状态.句柄未找到);

  const unknown = 映射原生错误(new Error('boom'));
  assert.equal(unknown.nativeStatus, 原生状态.原生致命错误);

  const corrupt = 映射原生错误({ nativeStatus: 原生状态.后端错误, details: new Uint8Array([0xff]), message: 'm' });
  assert.equal(corrupt.message, 'm');
});
