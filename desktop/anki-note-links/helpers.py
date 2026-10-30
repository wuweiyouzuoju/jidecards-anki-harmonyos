"""公共小工具：配置读取、标题提取、guid/nid 互查。"""

from __future__ import annotations

import html as _html
import re

from aqt import mw

ADDON = __name__.split(".")[0]

_TAG = re.compile(r"<[^>]*>")
_SCRIPT = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.S | re.I)
_WS = re.compile(r"\s+")

DEFAULTS = {
    "show_links": "answer",
    "show_float_buttons": True,
    "float_position": "bottom-right",
    "links_title": "关联卡片",
    "rename_links_title": True,
    "placeholder": True,
    "mirror_field": "",
    # 字段镜像（手机端可见）：字段名 + 单卡最多显示多少条
    "mirror_links_field": "关联",
    "mirror_max_items": 30,
    "auto_mirror": True,      # 每次改动引用后自动增量写字段
    # 0 = 不截断。用户要求「真题例句要完整显示」——截成「…」就看不到词组在句中的用法。
    "title_length": 0,
    "accent": "#2f7cf6",
    "accent_soft": "#eaf1fe",
}


def cfg(key, default=None):
    conf = {}
    try:
        manager = getattr(mw, "addonManager", None)
        if manager is not None:
            conf = manager.getConfig(ADDON) or {}
    except Exception:
        conf = {}
    if isinstance(conf, dict) and key in conf and conf[key] is not None:
        return conf[key]
    if key in DEFAULTS:
        return DEFAULTS[key]
    return default


def plain(text, limit=None):
    """去掉 HTML 标签，压平空白；用于列表里显示卡片标题。

    ``limit`` 为 0/None 时**不截断** —— 真题例句被截成「…」就没法看词组的用法了。
    """
    if not text:
        return ""
    s = _SCRIPT.sub(" ", str(text))
    s = _TAG.sub(" ", s)
    s = _html.unescape(s)
    s = _WS.sub(" ", s).strip()
    if limit and len(s) > limit:
        s = s[: limit - 1] + "…"
    return s


# ---------------------------------------------------------------- 别名富文本
#
# 用户可以在「编辑显示文本」里加粗 / 斜体 / 下划线 / 改颜色。
# 这段内容会被写进笔记字段、直接当 HTML 渲染，因此必须**白名单过滤**：
#   · 只保留排版类标签，脚本 / 事件属性 / 外部资源一律丢弃
#   · style 只保留颜色与文字装饰类属性，含 url() / expression 的值直接丢
#
# 用标准库 HTMLParser 而不是正则：正则在嵌套标签和畸形输入上很容易漏。

from html.parser import HTMLParser as _HTMLParser

_ALIAS_TAGS = {
    "b", "strong", "i", "em", "u", "s", "del", "mark",
    "sub", "sup", "code", "br", "span", "font",
}
_ALIAS_STYLE_OK = {
    "color", "background-color",
    "font-weight", "font-style", "text-decoration",
    "text-decoration-line", "text-decoration-color",
    "text-decoration-style",
}
_ALIAS_BLOCK_TAGS = {"div", "p", "li"}   # contenteditable 换行产物 → <br>
_ALIAS_DROP = {"script", "style", "iframe", "object", "embed", "template"}


class _AliasSanitizer(_HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks = []
        self._dropping = 0

    # --- 标签 ---
    def handle_starttag(self, tag, attrs):
        tag = (tag or "").lower()
        if tag in _ALIAS_DROP:
            self._dropping += 1
            return
        if self._dropping:
            return
        if tag in _ALIAS_BLOCK_TAGS:
            self._maybe_br()
            return
        if tag not in _ALIAS_TAGS:
            return
        if tag == "br":
            self.chunks.append("<br>")
            return
        self.chunks.append("<%s%s>" % (tag, self._style_attr(attrs)))

    def handle_startendtag(self, tag, attrs):
        tag = (tag or "").lower()
        if tag == "br":
            self.chunks.append("<br>")
            return
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        tag = (tag or "").lower()
        if tag in _ALIAS_DROP:
            self._dropping = max(0, self._dropping - 1)
            return
        if self._dropping:
            return
        if tag in _ALIAS_BLOCK_TAGS:
            # 块级结束标签不再补 <br>：开始标签已经补过，
            # 两边都补会变成 "第一行<br><br>第二行"（空一行）
            return
        if tag not in _ALIAS_TAGS or tag == "br":
            return
        self.chunks.append("</%s>" % tag)

    # --- 文本 ---
    def handle_data(self, data):
        if self._dropping or not data:
            return
        self.chunks.append(_html.escape(data, quote=False))

    # --- 内部 ---
    def _maybe_br(self):
        """块级换行 → <br>，但避免开头多一个空行。"""
        if self.chunks:
            self.chunks.append("<br>")

    def _style_attr(self, attrs):
        raw = ""
        for k, v in attrs or []:
            if (k or "").lower() == "style" and v:
                raw = v
                break
        keep = []
        for part in str(raw).split(";"):
            if ":" not in part:
                continue
            prop, val = part.split(":", 1)
            prop = prop.strip().lower()
            val = val.strip()
            if not val or prop not in _ALIAS_STYLE_OK:
                continue
            low = val.lower()
            if "url(" in low or "expression" in low or "javascript" in low:
                continue
            if "<" in val or ">" in val:
                continue
            keep.append("%s: %s" % (prop, val))
        if not keep:
            return ""
        return ' style="%s"' % _html.escape("; ".join(keep), quote=True)


def sanitize_alias(text):
    """把用户输入的别名过滤成安全 HTML；纯文本则原样转义返回。"""
    if text is None:
        return ""
    s = str(text)
    if not s:
        return ""
    if "<" not in s and ">" not in s:
        return _html.escape(s, quote=False)
    parser = _AliasSanitizer()
    try:
        parser.feed(s)
        parser.close()
    except Exception:
        return _html.escape(_TAG.sub("", s), quote=False)
    out = "".join(parser.chunks)
    out = re.sub(r"(?:\s*<br>\s*){3,}", "<br><br>", out)
    out = re.sub(r"^(?:\s*<br>\s*)+", "", out)
    out = re.sub(r"(?:\s*<br>\s*)+$", "", out)
    return out.strip()


# 标题优先取这些字段（按顺序）；取不到再退回“第一个非空字段”。
# 注意："编号/序号/单元" 这类字段往往是纯 ID，当标题毫无意义
# —— 实测某词组卡包第一个字段是「卡片编号」，直接取首字段会显示
#    "26新东方恋词词组_0165" 而不是 "be hostile to"。
_TITLE_PREFER = ("显示单词", "正面", "word", "真题句子", "查询单词", "Front", "背面")
_TITLE_SKIP = (
    "卡片编号",
    "序号",
    "所在组",
    "一级单元",
    "二级单元",
    "三级单元",
    "真题题型分布",
    "真题分布",
    "分布",
)


def field_value(note, name):
    """按名字取字段值（忽略大小写与首尾空白）；没有该字段返回 None。"""
    try:
        keys = list(note.keys())
    except Exception:
        return None
    want = str(name).strip().lower()
    for k in keys:
        if str(k).strip().lower() == want:
            try:
                return note[k]
            except Exception:
                return None
    return None


def note_title(note, limit=None):
    """取笔记标题：优先语义字段，其次跳过编号类字段，最后才退回首字段。"""
    if limit is None:
        limit = int(cfg("title_length") or 34)
    try:
        keys = list(note.keys())
    except Exception:
        return "(无法读取)"

    for want in _TITLE_PREFER:
        v = field_value(note, want)
        if v is None:
            continue
        t = plain(v, limit)
        if t:
            return t

    for k in keys:
        if str(k).strip() in _TITLE_SKIP:
            continue
        t = plain(note[k], limit)
        if t:
            return t

    for k in keys:
        t = plain(note[k], limit)
        if t:
            return t
    return "(空笔记)"


def title_of_guid(guid, limit=None):
    """按 guid 找笔记标题。找不到返回 None。"""
    try:
        nid = nid_of_guid(guid)
        if not nid:
            return None
        note = mw.col.get_note(nid)
        return note_title(note, limit)
    except Exception:
        return None


def nid_of_guid(guid):
    """guid -> note id。用列级查询，避免全量扫描。"""
    if not guid:
        return None
    try:
        row = mw.col.db.first("select id from notes where guid = ?", guid)
        return row[0] if row else None
    except Exception:
        return None


def guid_of_nid(nid):
    try:
        row = mw.col.db.first("select guid from notes where id = ?", int(nid))
        return row[0] if row else None
    except Exception:
        return None


def guids_of_nids(nids):
    """批量 nid -> guid。"""
    out = {}
    nids = [int(n) for n in nids if n]
    for i in range(0, len(nids), 400):
        chunk = nids[i : i + 400]
        marks = ",".join("?" * len(chunk))
        try:
            rows = mw.col.db.all(f"select id, guid from notes where id in ({marks})", *chunk)
        except Exception:
            continue
        for nid, guid in rows:
            out[nid] = guid
    return out


def first_card_of_note(nid):
    try:
        cids = mw.col.card_ids_of_note(nid)
        return cids[0] if cids else None
    except Exception:
        try:
            row = mw.col.db.first("select id from cards where nid = ?", int(nid))
            return row[0] if row else None
        except Exception:
            return None


def refresh_reviewer():
    """在复习界面里刷新当前卡片，让新写入的关联立刻显示。

    Anki 26 起 Reviewer 有 ``_redraw_current_card``：按**当前所在的那一面**
    重新渲染，不会把正面翻成背面。老版本再退回 ``_showAnswer/_showQuestion``。
    """
    try:
        r = getattr(mw, "reviewer", None)
        card = getattr(r, "card", None) if r else None
        if not r or not card:
            return
        redraw = getattr(r, "_redraw_current_card", None)
        if callable(redraw):
            redraw()
            return
        state = getattr(r, "state", "")
        if state == "answer" and hasattr(r, "_showAnswer"):
            r._showAnswer()
        elif state == "question" and hasattr(r, "_showQuestion"):
            r._showQuestion()
    except Exception:
        pass
