"""Existing search behavior, isolated from windows and persistence."""
import html as _html
import re
import traceback
from aqt import mw
from . import store
from .helpers import cfg, field_value, plain, nid_of_guid, title_of_guid, first_card_of_note
_FETCH_FACTOR = 20
_WORD_RX_CACHE = {}

def _deck_of_nid(nid):
    try:
        cid = first_card_of_note(nid)
        if not cid:
            return ""
        row = mw.col.db.first("select did from cards where id = ?", cid)
        if not row:
            return ""
        return mw.col.decks.name(row[0]) or ""
    except Exception:
        return ""

def _deck_list():
    """卡包树的扁平表示：[{f:全名, n:末级名, d:深度, c:本级卡片数, t:含子卡包卡片数}, ...]。

    前端按 ``f`` 的前缀关系还原成树。之所以扁平传输：卡包有 2000+ 个，
    嵌套结构在 JSON 里膨胀得厉害，扁平的体积只有一半左右。

    父卡包本身没有卡片、被子卡包「顶」出来时会被 ``skip_empty`` 漏掉，
    这里按 ``::`` 逐级补齐虚拟父节点，保证树不会断链。
    """
    try:
        items = None
        for kw in (
            {"skip_empty": True, "include_filtered": False},
            {"include_filtered": False},
            {},
        ):
            try:
                items = mw.col.decks.all_names_and_ids(**kw)
                break
            except TypeError:
                continue
        if items is None:
            return []
    except Exception:
        traceback.print_exc()
        return []

    direct = {}
    try:
        for did, n in mw.col.db.all("select did, count(*) from cards group by did"):
            direct[int(did)] = int(n)
    except Exception:
        traceback.print_exc()

    nodes = {}
    for item in items:
        name = getattr(item, "name", "") or ""
        if not name:
            continue
        try:
            did = int(getattr(item, "id", 0) or 0)
        except Exception:
            did = 0
        nodes[name] = {
            "f": name,
            "n": name.split("::")[-1],
            "d": name.count("::"),
            "c": direct.get(did, 0),
            "t": 0,
        }

    for name in list(nodes):
        parts = name.split("::")
        for i in range(1, len(parts)):
            anc = "::".join(parts[:i])
            if anc not in nodes:
                nodes[anc] = {"f": anc, "n": parts[i - 1], "d": i - 1, "c": 0, "t": 0}

    # 先把每个节点的 t 初始化成「本级卡片数」，再由深到浅把子树的量加上去。
    # 注意不能再在循环里写 ``node["t"] = node["c"]`` —— 由深到浅遍历时那一步会
    # 把子节点刚加上来的量覆盖掉，所有 t 都会退化成 c，整棵树的中间层就断了。
    for node in nodes.values():
        node["t"] = node["c"]
    for name in sorted(nodes, key=lambda s: -s.count("::")):
        if "::" not in name:
            continue
        parent = name.rsplit("::", 1)[0]
        if parent in nodes:
            nodes[parent]["t"] += nodes[name]["t"]

    out = [n for n in nodes.values() if n["t"] > 0]
    out.sort(key=lambda n: n["f"])
    return out

def _deck_ids(name):
    """某个卡包 + 其全部子卡包的 id。空卡包名 -> None（表示不筛选）。"""
    name = (name or "").strip()
    if not name:
        return None
    pref = name + "::"
    ids = []
    try:
        for item in mw.col.decks.all_names_and_ids():
            n = getattr(item, "name", "") or ""
            if n == name or n.startswith(pref):
                ids.append(int(item.id))
    except Exception:
        traceback.print_exc()
    return ids

def _field_list(deck=None):
    """字段下拉框：[[字段名, 可搜索笔记数], ...]，按笔记数降序。

    给了卡包就只列该卡包（含子卡包）里真正用到的字段——先选卡包，字段就短了。
    """
    deck = (deck or "").strip()
    args = []
    where = ""
    if deck:
        dids = _deck_ids(deck)
        if not dids:
            return []
        where = " where c.did in (%s)" % ",".join("?" * len(dids))
        args = list(dids)
    sql = (
        "select n.mid, count(distinct n.id) from notes n"
        " join cards c on c.nid = n.id" + where + " group by n.mid"
    )
    try:
        counts = {int(mid): int(n) for mid, n in mw.col.db.all(sql, *args)}
    except Exception:
        traceback.print_exc()
        counts = {}
    try:
        models = mw.col.models.all()
    except Exception:
        models = []
    weight = {}
    for model in models:
        try:
            mid = int(model.get("id") or 0)
        except Exception:
            continue
        n = counts.get(mid, 0)
        if not n:
            continue  # 没有笔记的笔记类型不参与，字段列表才不臃肿
        seen = set()
        for fld in model.get("flds") or []:
            name = (fld.get("name") or "").strip()
            if name and name not in seen:
                seen.add(name)
                weight[name] = weight.get(name, 0) + n
    return [[k, v] for k, v in sorted(weight.items(), key=lambda kv: (-kv[1], kv[0]))]

def _field_index(model, field):
    """字段在 flds 里的下标；找不到返回 -1。"""
    flds = (model or {}).get("flds") or []
    for i, fld in enumerate(flds):
        if (fld.get("name") or "") == field:
            return i
    low = (field or "").strip().lower()
    for i, fld in enumerate(flds):
        if (fld.get("name") or "").strip().lower() == low:
            return i
    return -1

def _link_items(guids, group_of=None, limit=None):
    """guid 列表 -> 对话框需要的条目结构；``g`` 是该条引用的分组名（空=未分组）。

    顺便带上目标卡片的全局自定义显示文本 ``alias``——dialog 里的「编辑」按钮
    打开时用它来预填输入框，并据此给画笔按钮打 ``marked`` 标记，
    避免改回去时不知道当前是什么样。
    """
    if limit is None:
        limit = int(cfg("title_length") or 34)
    gmap = group_of or {}
    out = []
    for g in guids:
        nid = nid_of_guid(g)
        if not nid:
            continue
        try:
            alias = store.get_display_alias(g) or ""
        except Exception:
            alias = ""
        # alias 是用户自定义、可为富文本（加粗/颜色等）；
        # alias_html 是清洗后可直接插入 DOM 的版本，alias 原文留给编辑器预填。
        try:
            from .helpers import sanitize_alias as _san

            alias_html = _san(alias) if alias else ""
        except Exception:
            alias_html = ""
        out.append(
            {
                "guid": g,
                "nid": int(nid),
                "title": title_of_guid(g, limit) or "(空笔记)",
                "meta": _deck_of_nid(nid),
                "g": str(gmap.get(g) or ""),
                "alias": alias,
                "alias_html": alias_html,
            }
        )
    return out

def _mids_with_field(field):
    """拥有该字段的笔记类型 id 列表。"""
    out = []
    try:
        models = mw.col.models.all()
    except Exception:
        traceback.print_exc()
        return out
    for model in models:
        try:
            mid = int(model.get("id") or 0)
        except Exception:
            continue
        if _field_index(model, field) >= 0:
            out.append(mid)
    return out

def _all_sfld(field, mids):
    """这些笔记类型里，是否都把该字段当作排序字段（sfld）。

    sfld 是独立的短列（全库 1.1MB），flds 是全库 169MB 的大列——
    能走 sfld 就直接在 SQL 里 like，快一个量级，而且匹配的是纯文本、不会
    被 HTML 属性误命中。
    """
    if not mids:
        return False
    want = set(mids)
    hit = set()
    try:
        models = mw.col.models.all()
    except Exception:
        return False
    for model in models:
        try:
            mid = int(model.get("id") or 0)
        except Exception:
            continue
        if mid not in want:
            continue
        idx = _field_index(model, field)
        if idx >= 0 and int(model.get("sortf") or 0) == idx:
            hit.add(mid)
    return hit == want

def _word_rx(query):
    """英文整词匹配的正则（前后不能是字母/数字），按关键词缓存。"""
    rx = _WORD_RX_CACHE.get(query)
    if rx is None:
        rx = re.compile(
            r"(?<![A-Za-z0-9])" + re.escape(query) + r"(?![A-Za-z0-9])", re.I
        )
        _WORD_RX_CACHE[query] = rx
    return rx

def _row_title(parts, hit, sfld):
    """一条命中结果的显示标题：命中字段优先，退回首/非空字段。"""
    if hit == -2:
        t = plain(sfld, 60)
    elif hit >= 0:
        t = plain(parts[hit], 60)
    else:
        t = ""
    if not t:
        for part in parts:
            t = plain(part, 60)
            if t:
                break
    return t or "(空笔记)"

def _decks_of_nids(nids):
    """批量 nid -> 卡包名（取该笔记最小 card id 所在的卡包）。"""
    out = {}
    nids = [int(n) for n in nids if n]
    for i in range(0, len(nids), 400):
        chunk = nids[i:i + 400]
        marks = ",".join("?" * len(chunk))
        try:
            rows = mw.col.db.all(
                "select c.nid, d.name from cards c join decks d on d.id = c.did"
                " where c.nid in (%s) order by c.id" % marks,
                *chunk,
            )
        except Exception:
            continue
        for nid, name in rows:
            if nid not in out:
                out[nid] = name or ""
    return out

def _search_items(query, exclude=None, limit=60, deck=None, field=None,
                  scope="all", order="relevance"):
    """全库子串搜索（直接查 notes.flds / notes.sfld，避免搜索语法干扰）。

    ``scope`` 搜索范围：
      all    全部字段里找子串（默认，最宽）
      title  只在标题（排序字段 sfld）里找
      prefix 标题以关键词**开头**（搜单词最精准）
      word   全部字段，但英文按**整词**匹配（搜 at 不会命中 rate）

    ``order`` 结果排序：
      relevance 标题开头 > 标题含关键词 > 只在其它字段命中（默认）
      title     按标题字母序
      deck      按卡包名（再按标题）

    可按 ``deck``（含子卡包）和 ``field``（只在某个字段里找）收窄。
    SQL 里把"卡包 / 笔记类型"这类便宜的条件放在前面，最后才碰大列。
    返回 ``(条目列表, 命中数, 是否被截断)``。
    """
    query = (query or "").strip()
    deck = (deck or "").strip()
    field = (field or "").strip()
    scope = scope if scope in ("all", "title", "prefix", "word") else "all"
    order = order if order in ("relevance", "title", "deck") else "relevance"
    if not query:
        return [], 0, False
    want = max(int(limit or 60), 1)
    like_body = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    args = []
    if deck:
        dids = _deck_ids(deck)
        if not dids:
            return [], 0, False
        # 用 IN 子查询而不是相关子查询：前者只扫卡包内的卡片，
        # 后者要对全表每一行跑一次子查询（实测 552ms vs 13ms）
        sql = (
            "select n.id, n.guid, n.mid, n.flds, n.sfld from notes n where n.id in"
            " (select c.nid from cards c where c.did in (%s))" % ",".join("?" * len(dids))
        )
        args.extend(dids)
    else:
        sql = "select n.id, n.guid, n.mid, n.flds, n.sfld from notes n where 1 = 1"

    on_sfld = False
    if field:
        mids = _mids_with_field(field)
        if not mids:
            return [], 0, False
        sql += " and n.mid in (%s)" % ",".join("?" * len(mids))
        args.extend(mids)
        on_sfld = _all_sfld(field, mids)

    if scope in ("title", "prefix"):
        on_sfld = True  # 标题搜索只碰 sfld 短列，flds 169MB 的大列根本不读
    col = "sfld" if on_sfld else "flds"
    like = (like_body + "%") if scope == "prefix" else ("%" + like_body + "%")
    sql += " and n.%s like ? escape '\\'" % col
    args.append(like)

    word = scope == "word"
    fetch = want * (1 if (on_sfld and not word) else _FETCH_FACTOR)
    sql += " limit ?"
    args.append(fetch)

    try:
        rows = mw.col.db.all(sql, *args)
    except Exception:
        traceback.print_exc()
        return [], 0, False

    needle = query.lower()
    rx = _word_rx(query) if word else None
    idx_cache = {}
    picked = []  # (score, seq, nid, guid, mid, parts, hit, sfld)
    for seq, (nid, guid, mid, flds, sfld) in enumerate(rows):
        if guid == exclude:
            continue
        parts = (flds or "").split("\x1f")
        hit = -1
        if on_sfld:
            hit = -2  # 标题直接取 sfld（本来就是该字段的纯文本）
            hay = (sfld or "").lower()
        elif field:
            idx = idx_cache.get(mid, -2)
            if idx == -2:
                try:
                    model = mw.col.models.get(mid)
                except Exception:
                    model = None
                idx = _field_index(model, field)
                idx_cache[mid] = idx
            if idx < 0 or idx >= len(parts):
                continue
            hay = (parts[idx] or "").lower()
            hit = idx
        else:
            hay = (flds or "").lower()
        if rx is not None and not rx.search(hay):
            continue
        # 相关度：标题开头 > 标题含 > 只在其它字段命中
        title_low = plain(sfld or "", 60).lower()
        if title_low.startswith(needle):
            score = 0
        elif needle in title_low:
            score = 1
        else:
            score = 2
        picked.append((score, seq, nid, guid, mid, parts, hit, sfld))

    capped = len(rows) >= fetch

    if order == "deck":
        decks = _decks_of_nids([r[2] for r in picked])
        picked.sort(key=lambda r: (
            decks.get(r[2], ""), _row_title(r[5], r[6], r[7]).lower(), r[1]))
    elif order == "title":
        picked.sort(key=lambda r: (_row_title(r[5], r[6], r[7]).lower(), r[1]))
    else:  # relevance：先按相关度，同分保持库里的稳定顺序
        picked.sort(key=lambda r: (r[0], r[1]))
    picked = picked[:want]

    # 标题/卡包名只对留下的这几条算——逐行查库会把搜索拖到几百毫秒
    out = []
    for score, seq, nid, guid, mid, parts, hit, sfld in picked:
        title = _row_title(parts, hit, sfld)
        meta = _deck_of_nid(nid)
        try:
            model = mw.col.models.get(mid)
            if model is not None and getattr(model, "name", ""):
                meta = (meta + " · " + model.name).strip(" ·")
        except Exception:
            pass
        out.append({"guid": guid, "nid": int(nid), "title": title, "meta": meta})

    return out, len(out), capped

