"""Derived mirror HTML. The full metadata is committed independently of display limits."""
import html as _html
from . import repository,store
from .helpers import cfg,sanitize_alias,nid_of_guid,title_of_guid
MARK_START = "<!--ml-mirror:start-->"
MARK_END = "<!--ml-mirror:end-->"
_MIN_LIMIT = 1
_BOX = (
    "margin:10px 0;padding:9px 10px 6px;border-radius:12px;"
    "background:rgba(127,127,127,.09);border:1px solid rgba(127,127,127,.17);"
    "font-size:14px;line-height:1.45;overflow-wrap:anywhere;text-align:left"
)
_HEAD = (
    "display:flex;align-items:center;gap:7px;"
    "font-weight:600;font-size:13px;letter-spacing:.01em;"
    "opacity:.92;margin:0 0 7px 2px"
)
_BADGE = (
    "font-weight:600;font-size:11px;line-height:17px;padding:0 7px;"
    "border-radius:9px;background:rgba(47,124,246,.16);color:#2f7cf6;"
    "letter-spacing:0"
)
_LABEL = (
    "display:flex;align-items:center;gap:6px;"
    "font-size:11px;font-weight:600;letter-spacing:.08em;"
    "opacity:.45;margin:8px 2px 5px 11px"
)
_GRP = "opacity:.62;font-size:12px;margin:3px 0 1px"
_MORE = "opacity:.45;font-size:11.5px;margin:7px 2px 2px;text-align:left"
_ITEM = (
    "display:flex;align-items:center;gap:7px;"
    "padding:6px 9px;border-radius:8px;background:rgba(127,127,127,.13);"
    "margin:0 0 4px;transition:background .12s ease"
)
_TXT = "flex:1 1 auto;min-width:0"
_ARROW = "flex:0 0 auto;opacity:.42;font-size:12.5px;line-height:1"
_DIR_NONE = "text-decoration:none;color:inherit"
_HOVER_CSS = (
    "<style>.ml-mirror-row{transition:background .12s ease}"
    ".ml-mirror-row:hover{background:rgba(47,124,246,.16)!important}"
    ".ml-mirror-row:active{background:rgba(47,124,246,.24)!important}</style>"
)

def render_links(guid, titles=None, limit=None, title_len=None):
    """渲染某张卡的关联列表（返回 HTML 片段，**不含**标记对）。没有关联返回 ''。

    ``titles`` 由 ``build_titles`` 生成，形态 ``{guid: {"title", "alias"}}``——
    ``alias`` 是用户自定义的显示文本（按目标卡片全局唯一），存在时优先用，
    空则退回 ``title``。别名不动目标卡片本身的字段、模板或笔记内容。
    """
    titles = titles or {}
    limit = max(int(limit or cfg("mirror_max_items") or 30), _MIN_LIMIT)
    title_len = int(title_len or cfg("title_length") or 34)

    layout = store.get_links(guid)
    backs = [g for g in store.get_backlinks(guid) if g and g != guid]
    total = len(layout) + len(backs)
    if not total:
        return ""

    budget = [limit]
    hidden = [0]

    def _row(title, g=""):
        if budget[0] <= 0:
            hidden[0] += 1
            return ""
        budget[0] -= 1
        # alias 由 _title_of 处理过；这里只负责把行渲染出来。
        #
        # 🔴 2026-10-21：这里必须带 data-guid / data-nid + onclick="mlxGo(event)"。
        # 字段有内容时 card_inject 会跳过注入块，桌面端**只显示这个字段**，
        # 若行是纯文字则点击毫无反应 —— 用户侧表现为「点击跳转没了」。
        nid = _nid_of(titles, g)
        attrs = ' class="ml-mirror-row"'
        if g:
            attrs += ' data-guid="%s"' % _html.escape(str(g), quote=True)
        style = _ITEM
        arrow = ""
        if nid:
            attrs += ' data-nid="%d" onclick="mlxGo(event)"' % nid
            style = _ITEM + ";cursor:pointer"
            arrow = '<span style="%s">↗</span>' % _ARROW
        # 别名允许有限富文本（加粗/斜体/下划线/颜色），走白名单清洗；
        # 默认标题是笔记原文，必须转义。两者不能混用同一个字符串。
        alias = _alias_of(titles, g)
        if alias:
            inner = sanitize_alias(alias)
        else:
            inner = _html.escape(title or "(空笔记)")
        return (
            '<div%s style="%s">'
            '<span style="%s">%s</span>%s</div>'
            % (attrs, style, _TXT, inner, arrow)
        )

    rows = []
    out_count = 0

    if layout:
        rows.append('<div style="%s">我引用</div>' % _LABEL)
        for g in layout:
            if not g or g == guid:
                continue
            line = _row(_title_of(titles, g) or _fallback_title(g, title_len), g)
            if line:
                rows.append(line)
                out_count += 1

    if backs:
        rows.append('<div style="%s">引用我</div>' % _LABEL)
        for g in backs:
            line = _row(_title_of(titles, g) or _fallback_title(g, title_len), g)
            if line:
                rows.append(line)

    if hidden[0]:
        rows.append(
            '<div style="%s">…另有 %d 条，请在电脑端查看</div>' % (_MORE, hidden[0])
        )

    return (
        _HOVER_CSS
        + '<div class="ml-mirror" style="%s">' % _BOX
        + '<div style="%s"><span>%s</span><span style="%s">%d</span></div>'
        % (
            _HEAD,
            _html.escape(str(cfg("links_title") or "关联卡片")),
            _BADGE,
            total,
        )
        + "".join(rows)
        + "</div>"
    )

def _nid_of(titles, guid):
    """guid -> nid，供镜像行挂 ``data-nid``（点击跳转用）。

    ``build_titles`` 的 rows 里本来就有 nid，优先零成本取；
    只有 guid 不在表里（增量/已删除）才兜底查一次库。
    """
    if not guid:
        return 0
    info = (titles or {}).get(guid) or {}
    try:
        nid = int(info.get("nid") or 0)
    except Exception:
        nid = 0
    if nid:
        return nid
    try:
        from .helpers import nid_of_guid

        return int(nid_of_guid(guid) or 0)
    except Exception:
        return 0

def _fallback_title(guid, limit):
    """标题表里没有时兜底查一次（增量场景常见）。"""
    try:
        from .helpers import nid_of_guid, title_of_guid

        if nid_of_guid(guid):
            return title_of_guid(guid, limit) or "(空笔记)"
    except Exception:
        pass
    return "(已删除/未找到)"

def _title_of(titles, guid):
    """从 titles dict 取标题。titles 是 {guid: 字符串} 或 {guid: {title, alias}} 形态。

    alias 与 title 同存在时优先用 alias（用户自定义的显示文本），
    alias 为空时退回 title。alias 按目标卡片全局唯一，所有引用方都一致。
    """
    if not titles or not guid:
        return ""
    ent = titles.get(guid)
    if isinstance(ent, dict):
        alias = str(ent.get("alias") or "").strip()
        if alias:
            return alias
        return str(ent.get("title") or "")
    return str(ent or "")

def _alias_of(titles, guid):
    """只取别名（原样返回，可能含富文本标签）；没有则返回 ''。

    与 ``_title_of`` 的区别：``_title_of`` 把别名/标题合并成一个字符串，
    分不清该转义还是该按 HTML 输出。渲染富文本必须分开判断。
    """
    ent = (titles or {}).get(guid)
    if isinstance(ent, dict):
        return str(ent.get("alias") or "").strip()
    return ""

def sync(guids=None, allow_legacy=False, **_kwargs):
    records=store.records()
    affected=set(records) if guids is None else set(guids)
    affected.update(store.pending_guids())
    for guid in list(affected):
        affected.update(store.get_links(guid))
        affected.update(store.get_backlinks(guid))
    needed = set(affected)
    for guid in affected:
        needed.update(store.get_links(guid))
        needed.update(store.get_backlinks(guid))
    titles={g:{'title':title_of_guid(g,0),'alias':store.get_display_alias(g),'nid':nid_of_guid(g)}
            for g in needed}
    try:
        result=repository.commit(records,affected,lambda g:'<!--ml-mirror:start-->'+render_links(g,titles=titles)+'<!--ml-mirror:end-->',allow_legacy=allow_legacy)
        return result
    finally:
        store.invalidate()

def sync_after_change(guid,old_targets=None):
    return sync(set([guid]+list(old_targets or [])+store.get_links(guid)))

def sync_for_target(guid,**_kwargs):
    return sync(set([guid]+store.get_backlinks(guid)))
