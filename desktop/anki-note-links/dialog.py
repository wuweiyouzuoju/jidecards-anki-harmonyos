"""Preserved editor UI and preview stack; no durable graph state."""
import html as _html
import json, os, traceback, urllib.parse
from aqt import mw, dialogs as aqt_dialogs
from aqt.qt import QDialog,QKeySequence,QShortcut,Qt,QVBoxLayout
from aqt.theme import theme_manager
from aqt.webview import AnkiWebView,AnkiWebViewKind
from . import store, mirror
from .helpers import cfg, nid_of_guid, guid_of_nid, first_card_of_note, title_of_guid, refresh_reviewer
from .search import _link_items,_deck_of_nid,_deck_list,_field_list,_search_items
_DIR=os.path.dirname(os.path.abspath(__file__))
DLG_PREFIX='mldlg:'
_UI_STATE_FILE = 'ui_state.json'
_dialogs=[]
_INNER = """
<div id="ml-dlg">
  <div class="ml-head">
    <span class="ml-h-title">双链引用</span>
    <span class="ml-h-sub">{{SUB}}</span>
    <button class="ml-x" type="button" title="关闭">&#10005;</button>
  </div>

  <div class="ml-pane" id="ml-pane-links">
    <div class="ml-scroll">
      <div class="ml-sec">
        <div class="ml-sec-h">我引用 <span class="cnt" id="ml-out-count">0</span>
          <span class="ml-fill"></span>
        </div>
        <ul class="ml-list ml-groups" id="ml-out-list"></ul>
      </div>
      <div class="ml-sec">
        <div class="ml-sec-h">引用我（反向链接） <span class="cnt" id="ml-in-count">0</span></div>
        <ul class="ml-list" id="ml-in-list"></ul>
      </div>
      <div class="ml-sec">
        <div class="ml-sec-h">添加引用 · 搜索全库</div>
        <input id="ml-search" type="search" placeholder="输入关键词后自动搜索…" autocomplete="off">
        <div class="ml-filters">
          <span class="ml-fl" id="ml-fl-deck"><span>卡包</span>
            <span class="ml-dd" id="ml-dd">
              <button class="ml-dd-btn" id="ml-dd-btn" type="button">
                <span class="ml-dd-tx" id="ml-dd-tx">全部卡包</span><span class="ml-dd-ar">▾</span>
              </button>
              <span class="ml-dd-pop" id="ml-dd-pop" hidden>
                <span class="ml-dd-search"><input id="ml-dd-q" type="search"
                  placeholder="筛选卡包…" autocomplete="off"></span>
                <span class="ml-dd-tree" id="ml-dd-tree"></span>
                <span class="ml-dd-foot" id="ml-dd-foot"></span>
              </span>
            </span>
            <input type="hidden" id="ml-f-deck" value="">
          </span>
          <label class="ml-fl"><span>字段</span><select id="ml-f-field"></select></label>
          <label class="ml-fl" title="全部字段=任何位置含关键词即命中；仅标题=只搜每张卡的标题（排序字段）；标题开头=标题以关键词开头，搜单词最准；全词匹配=英文按整词，搜 at 不会命中 rate">
            <span>范围</span>
            <select id="ml-f-scope">
              <option value="all">全部字段</option>
              <option value="title">仅标题</option>
              <option value="prefix">标题开头</option>
              <option value="word">全词匹配</option>
            </select>
          </label>
          <label class="ml-fl" title="相关度=标题开头的排最前；按标题/按卡包=字母序">
            <span>排序</span>
            <select id="ml-f-order">
              <option value="relevance">相关度</option>
              <option value="title">按标题</option>
              <option value="deck">按卡包</option>
            </select>
          </label>
          <button class="ml-btn" id="ml-f-reset" type="button" title="清空卡包、字段、范围与排序">重置</button>
        </div>
        <div id="ml-f-hint"></div>
        <ul class="ml-list" id="ml-results">
          <li class="ml-empty">输入关键词搜索全库卡片</li>
        </ul>
      </div>
    </div>
    <div class="ml-foot">
      <span class="ml-tip">点条目预览 · ✕ 取消引用 · 可拖动改顺序</span>
      <span class="ml-fill"></span>
      <button class="ml-btn" id="ml-lk-refresh" type="button">刷新</button>
      <button class="ml-btn" id="ml-lk-browser" type="button"
        title="在 Anki 浏览器中打开本卡 + 它的全部关联卡片">🌐 浏览器中显示</button>
      <button class="ml-btn primary" id="ml-lk-close" type="button">完成</button>
    </div>
  </div>

  <div class="ml-pane" id="ml-pane-preview">
    <div class="ml-prev-nav" id="ml-prev-nav">
      <button class="ml-btn" data-side="question" type="button">正面</button>
      <button class="ml-btn" data-side="answer" type="button">背面</button>
      <span class="ml-fill"></span>
      <button class="ml-btn" id="ml-prev-browse" type="button">在浏览器中打开</button>
    </div>
    <div class="ml-prev-body" id="ml-prev-body"></div>
    <div class="ml-foot">
      <span class="ml-tip" id="ml-prev-title"></span>
      <span class="ml-fill"></span>
      <button class="ml-btn" id="ml-prev-back" type="button">返回</button>
      <button class="ml-btn primary" id="ml-prev-close" type="button">关闭</button>
    </div>
  </div>

  <div id="ml-toast"></div>
</div>
"""

def _asset(name):
    try:
        with open(os.path.join(_DIR, "web", name), "r", encoding="utf8") as fh:
            return fh.read()
    except OSError:
        return ""

def _night_vars():
    """对话框自带配色，直接按主题覆盖 CSS 变量，不依赖 body class。"""
    if not getattr(theme_manager, "night_mode", False):
        return ""
    return (
        ":root{--ml-accent:#6aa4ff;--ml-accent-soft:#1e2a3f;--fg:#e6e8eb;"
        "--muted:#9aa4b2;--bd:#38414d;--bg:#23272e;--bg2:#2b3038;--hover:#333a44;}"
    )

def _js(obj):
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")

def _decode(arg):
    try:
        return json.loads(urllib.parse.unquote(arg or ""))
    except Exception:
        return None

def _ui_state_path():
    folder = os.path.join(_DIR, "user_files")
    try:
        os.makedirs(folder, exist_ok=True)
    except OSError:
        return ""
    return os.path.join(folder, _UI_STATE_FILE)

def _load_ui_state():
    path = _ui_state_path()
    if not path:
        return {}
    try:
        with open(path, "r", encoding="utf8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _save_ui_state(deck, field, scope="", order=""):
    """记住上次的卡包/字段/范围/排序筛选，下次打开对话框直接沿用。"""
    path = _ui_state_path()
    if not path:
        return
    try:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf8") as fh:
            json.dump(
                {
                    "search_deck": deck or "",
                    "search_field": field or "",
                    "search_scope": scope or "",
                    "search_order": order or "",
                },
                fh,
                ensure_ascii=False,
            )
        os.replace(tmp, path)
    except Exception:
        pass

def _card_doc(nid, side):
    """把一张卡片渲染成独立 HTML 文档，供 iframe 隔离显示。"""
    if not nid:
        return "<p style='font-family:sans-serif;padding:14px'>没有可预览的卡片</p>"
    try:
        cid = first_card_of_note(nid)
        if not cid:
            return "<p style='font-family:sans-serif;padding:14px;color:#8a8f98'>这张笔记还没有生成卡片</p>"
        card = mw.col.get_card(cid)
        try:
            css = card.css() or ""
        except Exception:
            css = ""
        body = card.question() if side == "question" else card.answer()
    except Exception as exc:
        return "<p style='font-family:sans-serif;padding:14px'>渲染失败：%s</p>" % _html.escape(
            str(exc)
        )
    return (
        "<!doctype html><html><head><meta charset='utf-8'><style>"
        + css
        + "\nhtml,body{margin:0;padding:14px 16px;background:transparent;}"
        + "</style></head><body class='card'>"
        + (body or "")
        + "</body></html>"
    )

def _body_html(payload):
    css = _asset("dialog.css") + _night_vars()
    script = _asset("dialog.js")
    sub = _html.escape(str(payload.get("title") or ""))
    return (
        "<style>" + css + "</style>\n"
        + "<script>window.__ML_DLG__=" + _js(payload) + ";</script>\n"
        + _INNER.replace("{{SUB}}", sub)
        + "\n<script>" + script + "</script>\n"
    )

class MLDialog(QDialog):
    def __init__(self, parent, guid, mode="links", nid=None):
        super().__init__(parent)
        self.guid = guid or ""
        self.home_mode = mode if mode in ("links", "preview") else "links"
        self.mode = self.home_mode
        self.preview_nid = int(nid) if nid else None
        self.preview_side = "answer"
        self.stack = []
        self.search_deck = ""
        self.search_field = ""

        try:
            self.setWindowFlags(Qt.WindowType.Window)
        except AttributeError:
            self.setWindowFlags(Qt.Window)

        note_title = title_of_guid(self.guid, 72) or "(未命名笔记)"
        self.setWindowTitle("双链引用 — " + note_title)
        self.resize(790 if self.mode == "preview" else 750, 690 if self.mode == "preview" else 640)
        self.setMinimumSize(540, 420)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        try:
            self.web = AnkiWebView(parent=self, kind=AnkiWebViewKind.DEFAULT)
        except TypeError:
            self.web = AnkiWebView(parent=self)
        try:
            self.web.set_open_links_externally(False)
        except Exception:
            pass
        layout.addWidget(self.web)

        # 对话框的消息走自己的回调，绕开卡片端的全局分发
        self.web.onBridgeCmd = self._on_cmd

        ui = _load_ui_state()
        saved_deck = str(ui.get("search_deck") or "")
        saved_scope = str(ui.get("search_scope") or "")
        saved_order = str(ui.get("search_order") or "")
        payload = {
            "mode": self.mode,
            "guid": self.guid,
            "title": note_title,
            "out": _link_items(store.get_links(self.guid)),
            "inc": _link_items(store.get_backlinks(self.guid)),
            "nid": self.preview_nid,
            "side": self.preview_side,
            "decks": _deck_list(),
            "fields": _field_list(saved_deck),
            "cur_deck": _deck_of_nid(nid_of_guid(self.guid) or 0),
            "saved_deck": saved_deck,
            "saved_field": str(ui.get("search_field") or ""),
            "saved_scope": saved_scope,
            "saved_order": saved_order,
        }
        try:
            self.web.stdHtml(_body_html(payload))
        except Exception:
            traceback.print_exc()

        try:
            short = QShortcut(QKeySequence("Esc"), self)
            short.activated.connect(self.close)
            self._esc = short
        except Exception:
            pass

        if self.mode == "preview" and self.preview_nid:
            self._render_preview()

    # ----------------------------------------------------------- 消息分发

    def _on_cmd(self, cmd):
        if not isinstance(cmd, str):
            return
        body = cmd[len(DLG_PREFIX):] if cmd.startswith(DLG_PREFIX) else cmd
        verb, _, arg = body.partition(":")
        handler = getattr(self, "_c_" + verb, None)
        if handler is None:
            return
        try:
            store.load(force=True)
            handler(arg)
        except Exception as error:
            store.invalidate()
            try:
                self._push_links()
            except Exception:
                traceback.print_exc()
            self._toast(str(error))
            traceback.print_exc()

    def _toast(self, msg):
        self.web.eval("window.ML&&window.ML.toast(%s)" % _js(msg))

    def _push_links(self):
        out = _link_items(store.get_links(self.guid))
        inc = _link_items(store.get_backlinks(self.guid))
        self.web.eval(
            "window.ML&&window.ML.setLinks(%s,%s)"
            % (_js(out), _js(inc))
        )

    # 2026-10-21 删除 _c_syncField：
    # 别名改完 / 增删引用都会自动同步字段（见 _c_setAlias 与 mirror.sync_after_change），
    # tag: 弹窗里那对「同步试跑 / 写入字段」按钮已无使用场景，一并移除；
    # 全库同步保留在 工具 → 双链引用 → 全库同步到手机端。

    # ----------------------------------------------------------- 在浏览器中显示关联

    def _c_openLinksInBrowser(self, arg):
        """打开 Anki 浏览器，仅显示当前卡 + 它的全部关联（我引用 + 引用我）。

        接收 dialog 端 ``ml:openLinksInBrowser:<guid>`` 命令。无参数时取当前 dialog。
        复习界面（卡片端）发的是 ``ml:openLinksInBrowser`` 无参数版本，由
        ``_on_js_message`` 直接调 ``_open_browser_with_nids(guid)``。
        """
        # 复习界面调用时 arg 是当前 card 的 guid；dialog 端调用时 arg 是 dialog 当前 guid
        target = str(arg or "").strip() or self.guid
        open_links_in_browser(target)

    # ----------------------------------------------------------- 双链

    def _c_search(self, arg):
        data = _decode(arg)
        if not isinstance(data, dict):
            # 兼容旧格式：整段就是一个 URL 编码的关键词
            data = {"q": urllib.parse.unquote(arg or "")}
        query = str(data.get("q") or "")
        deck = str(data.get("deck") or "")
        field = str(data.get("field") or "")
        scope = str(data.get("scope") or "")
        order = str(data.get("order") or "")
        self.search_deck = deck
        self.search_field = field
        items, total, capped = _search_items(
            query, exclude=self.guid, deck=deck, field=field,
            scope=scope, order=order,
        )
        _save_ui_state(deck, field, scope, order)
        self.web.eval(
            "window.ML&&window.ML.setResults(%s)"
            % _js(
                {
                    "items": items,
                    "total": total,
                    "capped": capped,
                    "fields": _field_list(deck),
                }
            )
        )

    def _c_setLinks(self, arg):
        """界面拖拽后，把新引用顺序落盘。无分组版本。"""
        data = _decode(arg) or {}
        links = data.get("links")
        if not isinstance(links, list):
            return
        old = list(store.get_links(self.guid))
        new_links = [str(g) for g in links if g and g != self.guid]
        store.set_links(self.guid, new_links, self_guid=self.guid)
        self._push_links()
        mirror.sync_after_change(self.guid, old)
        refresh_reviewer()

    def _c_addLink(self, arg):
        target = (arg or "").strip()
        if not target or target == self.guid:
            return
        old = list(store.get_links(self.guid))
        store.add_link(self.guid, target)
        self._push_links()
        mirror.sync_after_change(self.guid, old)
        self._toast("已添加引用（已写入字段，同步后手机可见）")
        refresh_reviewer()

    def _c_delLink(self, arg):
        target = (arg or "").strip()
        old = list(store.get_links(self.guid)) + [target]
        store.remove_link(self.guid, target)
        self._push_links()
        mirror.sync_after_change(self.guid, old)
        self._toast("已取消引用")
        refresh_reviewer()

    def _c_refreshLinks(self, arg):
        self._push_links()
        self._toast("已刷新")

    def _c_completeLinks(self, arg):
        """补全本卡引用。

        取「引用我的人」+「这些人各自引用的卡片」，全部变成**我也引用**。
        例：① 引用 ②③ —— 在 ② 上按一下，② 就引用 ①③；在 ③ 上按一下，③ 就引用 ①②。
        ①（源头）自己没有入链，按下无变化；反复按是幂等的。

        2026-10-21：此函数原本**误命名为 `_c_setAlias`**，与下面真正的别名函数
        同名 → 被后定义的那个覆盖，功能整条失效。改名后至少可被
        ``mldlg:completeLinks`` 调起；界面按钮仍需另行添加。
        """
        mine = list(store.get_links(self.guid))
        parents = list(store.get_backlinks(self.guid))
        want = list(parents)
        for p in parents:
            want.extend(store.get_links(p))

        seen = set(mine)
        add = []
        for g in want:
            if not g or g == self.guid or g in seen:
                continue
            if not nid_of_guid(g):  # 指向已删除笔记的 guid，不进界面
                continue
            seen.add(g)
            add.append(g)

        if not add:
            self._toast("没有需要补全的引用" if not parents else "该卡引用已是最全")
            return
        store.set_links(self.guid, mine + add)
        self._push_links()
        mirror.sync_after_change(self.guid, mine)
        self._toast("已补全 %d 条引用（已写入字段）" % len(add))
        refresh_reviewer()

    # ----------------------------------------------------------- 显示别名

    def _c_setAlias(self, arg):
        """编辑某目标卡片的全局自定义显示文本（别名）。

        别名按 **target_guid** 全局唯一：改一处等于改所有引用该目标的条目。

        2026-10-21 起**自动同步**（此前要手动点「写入字段」）：
          1. store 里改别名
          2. mirror.sync_for_target() 重写所有「引用了这张卡」的笔记字段
             —— 只影响这批笔记，不是全库 5 千条，开销很小
          3. refresh_reviewer() 立刻重绘当前卡片
             —— 不刷新的话字段虽已更新，屏幕上还是旧画面，
                用户只有在翻卡后才看到，体感就是「没同步」

        别名只写目标笔记的关联元数据，不改题面、答案或原模板内容。
        """
        data = _decode(arg) or {}
        target = str(data.get("target") or "").strip()
        alias = str(data.get("alias") or "")
        # 编辑器提交的是富文本 HTML：入库前先白名单清洗。
        # 渲染侧还会再洗一次（幂等），两道关是为了防止旧数据/手工改 json 绕过。
        try:
            from .helpers import sanitize_alias

            alias = sanitize_alias(alias)
        except Exception:
            traceback.print_exc()
        if not target:
            self._toast("缺少目标卡片")
            return
        changed = store.set_display_alias(target, alias)
        if not changed:
            self._toast("显示文本未改变")
            return
        # 当前 dialog 的列表也要刷新（可能多条引用了同一个 target）
        self._push_links()

        # ① 写进所有引用方的「关联」字段（手机端 / 复习界面都靠它）
        stats = mirror.sync_for_target(target)
        # ② 立刻重绘当前卡片，让新文本当场可见
        refresh_reviewer()

        n = (stats or {}).get("changed") or 0
        if alias:
            msg = "已保存「%s」" % alias
        else:
            msg = "已恢复默认标题"
        self._toast(msg + ("，同步 %d 条卡片" % n if n else "，无需更新卡片"))

    def _c_clearAlias(self, arg):
        """清除某目标卡片的全局别名。等于 ``setAlias(target, "")``。"""
        target = str(arg or "").strip()
        if not target:
            return
        self._c_setAlias(_js({"target": target, "alias": ""}))

    # ----------------------------------------------------------- 预览 / 其它

    def _c_preview(self, arg):
        s = str(arg or "").strip()
        if not s.isdigit():
            return
        self.stack.append((self.preview_nid, self.preview_side))
        self.mode = "preview"
        self._show_preview(int(s), "answer")

    def _show_preview(self, nid, side):
        self.preview_nid = int(nid)
        self.preview_side = side
        title = title_of_guid(guid_of_nid(nid) or "", 60) or "(卡片预览)"
        self.web.eval(
            "window.ML&&window.ML.openPreview(%d,%s,%s);"
            "document.getElementById('ml-prev-title')&&"
            "(document.getElementById('ml-prev-title').textContent=%s)"
            % (self.preview_nid, _js(side), _js(title), _js(title))
        )
        self._render_preview()

    def _render_preview(self):
        self.web.eval("window.ML&&window.ML.setPreview(%s)" % _js(_card_doc(self.preview_nid, self.preview_side)))

    def _c_previewSide(self, arg):
        side = arg if arg in ("question", "answer") else "answer"
        self.preview_side = side
        if self.preview_nid:
            self._render_preview()

    def _c_previewBack(self, arg):
        if self.stack:
            nid, side = self.stack.pop()
            if nid:
                self.mode = "preview"
                self._show_preview(nid, side)
                return
        self.mode = self.home_mode
        self.web.eval("window.ML&&window.ML.switchPane(%s)" % _js(self.home_mode))

    def _c_openBrowser(self, arg):
        s = str(arg or "").strip()
        nid = int(s) if s.isdigit() else self.preview_nid
        if not nid:
            nid = nid_of_guid(self.guid)
        if nid:
            _open_browser_for_nid(nid)

    def _c_close(self, arg):
        self.close()

    def _c_closeOrBack(self, arg=""):
        """头部 ✕：**预览态先返回列表**，只有退无可退才关窗（2026-10-21 用户要求）。

        用户在预览里看到的 ✕ 和列表里的 ✕ 不该是同一个功能：
          列表页 ✕  → 关闭窗口
          预览页 ✕  → 回到「我引用 / 引用我」列表（跟底部「返回」同义）

        实现上复用 ``_c_previewBack``：它会按栈回退，栈底那条是
        ``(进入预览前的 nid, side)`` —— 从列表点进预览时该 nid 为 None，
        于是回退的结果就是切回 home_mode（= links）。
        从复习界面**直接**以 preview 模式打开的窗口，home_mode 也是 preview，
        回退后仍是 preview，此时才真的关窗。

        ⚠️ 不能用「调用后 self.mode 是否还是 preview」来判断是否该关窗：
        回退到**上一层预览**时 mode 也还是 preview，会被误关。
        必须分别按「栈非空 / 首页是列表 / 首页就是预览」三种情况判断。
        """
        if self.mode != "preview":
            self.close()
            return
        if self.stack:
            self._c_previewBack("")   # 逐层回退：上一层预览或列表
            return
        if self.home_mode != "preview":
            self.mode = self.home_mode
            self.web.eval("window.ML&&window.ML.switchPane(%s)" % _js(self.home_mode))
            return
        self.close()


def _open_browser_for_nid(nid):
    browser=aqt_dialogs.open('Browser',mw)
    browser.search_for('nid:'+str(nid))

def open_links_in_browser(guid):
    ids=[nid_of_guid(g) for g in [guid]+store.get_links(guid)+store.get_backlinks(guid)]
    browser=aqt_dialogs.open('Browser',mw)
    browser.search_for('nid:'+','.join(str(n) for n in ids if n))

def open_dialog(guid,mode='links',nid=None):
    close_dialog()
    window=MLDialog(mw,guid,mode,nid)
    _dialogs.append(window)
    window.finished.connect(lambda _result: _dialogs.remove(window) if window in _dialogs else None)
    window.show()

def close_dialog(*_args):
    for dialog in list(_dialogs):
        dialog.close()
