"""Own Anki hooks and menus. No graph mutation is hidden in card rendering."""
import json
from urllib.parse import unquote
from aqt import gui_hooks, mw
from aqt.qt import QAction, QMenu
from aqt.utils import getFile, showInfo, showWarning
from anki import hooks
from . import card_inject, mirror, repository, store
from .domain import migrate_legacy
from .dialog import open_dialog, close_dialog, open_links_in_browser
from .helpers import guid_of_nid, nid_of_guid


def receive(handled, message, context):
    if not message.startswith(('ml:', 'jl:')):
        return handled
    verb, _, arg = message.split(':', 1)[1].partition(':')
    try:
        if verb == 'preview':
            nid = nid_of_guid(unquote(arg)) if message.startswith('jl:') else int(arg)
            guid = guid_of_nid(nid) if nid else None
            if guid:
                open_dialog(guid, 'preview', nid)
            else:
                showWarning('目标笔记未同步到本机，或已经删除。')
        elif verb == 'openLinks':
            open_dialog(unquote(arg))
        elif verb == 'openLinksInBrowser':
            open_links_in_browser(unquote(arg))
    except Exception as error:
        showWarning(str(error))
    return True, None


def prepare():
    try:
        # Core creates a collection backup before schema preparation.
        mw.col.create_backup(backup_folder=mw.pm.backupFolder(), force=True, wait_for_completion=True)
        repository.ensure_types([mid for mid, in mw.col.db.all('select id from notetypes')])
        showInfo('关联字段与背面模板已准备。现有字段内容保持不变。')
    except Exception as error:
        showWarning(str(error))


def migrate():
    path = getFile(mw, '选择旧插件 user_files/data.json', filter='JSON (*.json)')
    if not path:
        return
    try:
        with open(path, encoding='utf-8') as stream:
            legacy = json.load(stream)
        existing = {g for g, in mw.col.db.all('select guid from notes')}
        current = repository.read()
        records, missing = migrate_legacy(legacy, existing, current)
        mw.col.create_backup(backup_folder=mw.pm.backupFolder(), force=True, wait_for_completion=True)
        repository.ensure_types([mid for mid, in mw.col.db.all('select id from notetypes')])
        store.stage_migration(records)
        result = mirror.sync(allow_legacy=True)
        showInfo('迁移完成：更新 %d 条笔记；未找到 %d 个 GUID。再次导入不会覆盖已同步的新版关系。' %
                 (result['changed'], len(missing)))
    except Exception as error:
        store.invalidate()
        showWarning(str(error))


def register():
    hooks.note_will_flush.append(repository.prepare_note)
    card_inject.register()
    gui_hooks.webview_did_receive_js_message.append(receive)
    for name in ('sync_did_finish', 'operation_did_execute', 'profile_did_open'):
        hook = getattr(gui_hooks, name, None)
        if hook is not None:
            hook.append(store.invalidate)
    gui_hooks.profile_will_close.append(close_dialog)
    gui_hooks.profile_will_close.append(store.invalidate)
    menu = QMenu('双链引用', mw)
    for label, callback in [('准备所有笔记类型', prepare), ('迁移旧版引用…', migrate)]:
        action = QAction(label, mw)
        action.triggered.connect(callback)
        menu.addAction(action)
    mw.form.menuTools.addMenu(menu)
    def browser_menu(browser, context_menu):
        ids = browser.selectedNotes()
        if ids:
            action = context_menu.addAction('双链引用')
            action.triggered.connect(lambda: open_dialog(guid_of_nid(ids[0])))
    gui_hooks.browser_will_show_context_menu.append(browser_menu)
    def editor_buttons(buttons, editor):
        buttons.append(editor.addButton(icon=None, cmd='jideLinks', func=lambda _editor:
            open_dialog(editor.note.guid) if editor.note else None, tip='双链引用', label='关联'))
        return buttons
    gui_hooks.editor_did_init_buttons.append(editor_buttons)
