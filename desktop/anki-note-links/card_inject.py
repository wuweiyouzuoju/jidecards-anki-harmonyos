"""卡片端注入：把「关联卡片」渲染进复习 / 预览界面。

设计要点
--------
* 全部内容在 Python 侧渲染好再拼进卡片 HTML，所以不依赖任何外部资源文件
  （Anki 复习界面的 webview 不保证能取到 /_addons/ 路径，内联最稳）。
* 前端只做两件事：折叠面板、悬浮按钮发 pycmd 消息。
* 兼容 AnkiDroid / AnkiMobile / AnkiWeb：笔记类型有「关联」字段时
  让字段渲染，避免桌面端重复注入。
"""

from __future__ import annotations

import html
import json
import os

from aqt import gui_hooks, mw

from . import store
from .helpers import cfg, field_value, plain

_DIR = os.path.dirname(os.path.abspath(__file__))
_CACHE = {}


def _asset(name):
    """读取 web/ 下的资源并缓存（按 mtime 失效，方便边改边试）。"""
    path = os.path.join(_DIR, "web", name)
    try:
        stamp = os.path.getmtime(path)
    except OSError:
        return ""
    hit = _CACHE.get(name)
    if hit and hit[0] == stamp:
        return hit[1]
    try:
        with open(path, "r", encoding="utf8") as fh:
            data = fh.read()
    except OSError:
        return ""
    _CACHE[name] = (stamp, data)
    return data


def _side_enabled(which, side):
    """which 形如 'answer'；side 为 'front' 或 'answer'。"""
    which = (which or "off").lower()
    if which in ("off", "none", "false", "0", ""):
        return False
    if which in ("both", "all"):
        return True
    return which == side


def _titles(guids, limit):
    """guid 列表 -> [{guid, nid, title, alias}]，顺带丢掉已删除的笔记。

    ``alias`` 是该目标卡片的全局自定义显示文本（来自 store.get_display_aliases_batch）；
    渲染时优先用 alias，空则退回默认 title。**别名不动目标卡本身的字段/模板**。
    """
    out = []
    nids = []
    for guid in guids:
        try:
            row = mw.col.db.first("select id from notes where guid = ?", guid)
        except Exception:
            row = None
        if not row:
            continue
        nids.append((guid, row[0]))
    alias_map = {}
    if nids:
        try:
            alias_map = store.get_display_aliases_batch([g for g, _ in nids])
        except Exception:
            alias_map = {}
    for guid, nid in nids:
        title = "(空笔记)"
        try:
            note = mw.col.get_note(nid)
            title = _note_title(note, limit)
        except Exception:
            pass
        out.append({
            "guid": guid,
            "nid": nid,
            "title": title,
            "alias": alias_map.get(guid, ""),
        })
    return out


def _note_title(note, limit):
    from .helpers import note_title

    return note_title(note, limit)


def _links_block(items_out, items_in, title):
    """渲染关联条目块。

    显示规则：每个条目的「文本部分」(<span class="ml-text">) 优先显示
    ``alias``（用户自定义的显示文本），空则用默认 ``title``。
    别名按目标卡片全局唯一——所有引用方都显示同一份自定义文本，
    不动目标卡片本身的字段、模板或笔记内容。
    """
    if not items_out and not items_in:
        return ""

    def _disp(it):
        """别名可含有限富文本；默认标题必须转义。"""
        alias = str(it.get("alias") or "").strip()
        if alias:
            from .helpers import sanitize_alias

            return sanitize_alias(alias)
        return html.escape(it.get("title") or "(空笔记)")

    rows = []
    for it in items_out:
        rows.append(
            '<li><div class="ml-link-item" data-nid="%d" data-guid="%s">'
            '<span class="ml-dir out">我引用</span>'
            '<span class="ml-text">%s</span></div></li>'
            % (it["nid"], it["guid"], _disp(it))
        )
    for it in items_in:
        rows.append(
            '<li><div class="ml-link-item" data-nid="%d" data-guid="%s">'
            '<span class="ml-dir in">引用我</span>'
            '<span class="ml-text">%s</span></div></li>'
            % (it["nid"], it["guid"], _disp(it))
        )
    return (
        '<div class="ml-block" id="ml-block-links">'
        '<div class="ml-block-head">%s'
        '<span class="ml-badge">%d</span>'
        '<span class="ml-arrow">▼</span></div>'
        '<div class="ml-block-body"><ul class="ml-link-list">%s</ul></div>'
        "</div>" % (html.escape(title), len(rows), "".join(rows))
    )


def on_card_will_show(text, card, kind):
    """card_will_show 过滤器：可修改卡片正/背面 HTML。"""
    try:
        return _inject(text, card, kind)
    except Exception:
        return text  # 绝不影响正常复习


def _inject(text, card, kind):
    low = (kind or "reviewAnswer").lower()
    if "clayout" in low or "browser" in low:
        return text

    side = "front" if "question" in low else "answer"
    note = card.note()
    guid = note.guid

    out_guids = store.get_links(guid)
    in_guids = store.get_backlinks(guid)

    limit = int(cfg("title_length") or 34)
    items_out = _titles(out_guids, limit)
    items_in = _titles(in_guids, limit)

    # 移动端适配：笔记类型自己会渲染「关联」字段
    # （字段随收藏库同步，AnkiDroid/AnkiMobile/AnkiWeb 都看得到）。
    # 字段里有值时就不再注入，避免同一份内容出现两次。
    lk_field = (field_value(note, "关联") or "").strip()

    style = _asset("card.css")
    script = _asset("card.js")

    payload = {
        "guid": guid,
        "buttons": bool(cfg("show_float_buttons")),
        "pos": cfg("float_position") or "bottom-right",
        "outCount": len(items_out),
        "inCount": len(items_in),
        "lkLabel": cfg("links_title") or "关联",
    }

    blocks = ""
    if (items_out or items_in) and 'ml-mirror-row' not in text and _side_enabled(cfg("show_links"), side):
        blocks += _links_block(
            items_out, items_in, str(cfg("links_title") or "关联卡片")
        )

    if not blocks and not payload["buttons"] and 'ml-mirror-row' not in text and '#jide-note:' not in text:
        return text

    data_js = (
        "<script>window.__ML_DATA__="
        + json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
        + ";</script>"
    )
    return (
        text
        + '\n<style id="ml-style">' + (style or "") + "</style>\n"
        + '<div id="ml-root">' + blocks + "</div>\n"
        + data_js
        + '<script id="ml-script">' + (script or "") + "</script>\n"
    )


def register():
    gui_hooks.card_will_show.append(on_card_will_show)
