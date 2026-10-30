"""Exercise the actual installed Anki add-on in a disposable, offscreen profile.

Never points Anki at its normal base directory. Requires an installed Anki GUI;
pure domain and cross-language tests remain available without that dependency.
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]


def run(anki, output):
    output.mkdir(parents=True, exist_ok=True)
    result_path = output / 'anki-result.json'
    if result_path.exists():
        result_path.unlink()
    # Use the installed Python runtime directly: the outer Anki launcher can be
    # an updater and is not a deterministic test entry. No Anki files are changed.
    app = anki.parent
    dll = next(path for path in app.glob('python3*.dll') if path.stem != 'python3')
    c_path = output / 'anki-python-probe.c'
    runtime = output / 'anki-python-probe.exe'
    c_path.write_text('#include <windows.h>\n#include <stdio.h>\n'
        'typedef int (__cdecl *PyMain)(int,char**);\nint main(int argc,char**argv){'
        'SetDllDirectoryW(L"' + str(app).replace('\\', '\\\\') + '");'
        'HMODULE h=LoadLibraryW(L"' + str(dll).replace('\\', '\\\\') + '");'
        'if(!h)return 2;PyMain run=(PyMain)GetProcAddress(h,"Py_BytesMain");return run?run(argc,argv):3;}', encoding='utf-8')
    subprocess.run(['clang', str(c_path), '-o', str(runtime)], check=True)
    base = pathlib.Path(tempfile.mkdtemp(prefix='jide-note-links-anki-'))
    addon_root = base / 'addons21'
    shutil.copytree(root / 'desktop' / 'anki-note-links', addon_root / 'jide_note_links',
                    ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'user_files'))
    probe = addon_root / 'zz_jide_links_probe'
    probe.mkdir()
    script = '''
import json, pathlib, traceback, os
from aqt import gui_hooks, mw
from aqt.qt import QTimer, QApplication
OUTPUT=pathlib.Path(OUTPUT_PATH)
def finish(result):
    (OUTPUT/'anki-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    # This is the dedicated disposable child, not the user's Anki process.
    # Native assertions and APKG export have completed before terminating it;
    # open Browser windows must not keep a smoke-test process alive indefinitely.
    os._exit(0 if result.get('ok') else 1)
def probe():
    try:
        from jide_note_links import repository,store,mirror,dialog,domain,card_inject
        nt=mw.col.models.by_name('Basic')
        # No field/template preparation: use a separate ordinary two-field type.
        plain=mw.col.models.copy(nt);plain['name']='Inline references without setup';mw.col.models.update_dict(plain)
        plain=mw.col.models.get(plain['id'])
        target_plain=mw.col.new_note(plain);target_plain.fields=['Inline target','Answer'];mw.col.add_note(target_plain,mw.col.decks.id('正文引用演示'))
        from urllib.parse import quote
        ref_url='#jide-note:'+quote(target_plain.guid,safe="~!*'()-._")
        inline=mw.col.new_note(plain);inline.fields=['Inline source','<a href="'+ref_url+'">本处显示文字</a>'];mw.col.add_note(inline,mw.col.decks.id('正文引用演示'))
        assert len(mw.col.models.get(plain['id'])['flds'])==2
        assert repository.read()[inline.guid]['targets']==[target_plain.guid]
        store.invalidate();assert store.get_backlinks(target_plain.guid)==[inline.guid]
        target_card=mw.col.get_card(mw.col.find_cards('nid:'+str(target_plain.id))[0])
        assert inline.guid in card_inject.on_card_will_show(target_card.answer(),target_card,'reviewAnswer')
        source_card=mw.col.get_card(mw.col.find_cards('nid:'+str(inline.id))[0])
        assert '__jlInlineClick' in card_inject.on_card_will_show(source_card.answer(),source_card,'reviewAnswer')
        from anki.import_export_pb2 import ExportAnkiPackageOptions, ExportLimit
        mw.col.export_anki_package(out_path=str(OUTPUT/'jide-inline-references-demo.apkg'),
            options=ExportAnkiPackageOptions(with_scheduling=False,with_deck_configs=False,with_media=False),
            limit=ExportLimit(deck_id=mw.col.decks.id('正文引用演示')))
        inline.fields[1]=inline.fields[1].replace('本处显示文字','修改此处文字');mw.col.update_notes([inline])
        assert mw.col.get_note(target_plain.id).fields[0]=='Inline target'
        store.invalidate();store.remove_link(inline.guid,target_plain.guid);mirror.sync_after_change(inline.guid,[target_plain.guid])
        assert domain.references(mw.col.get_note(inline.id).fields)==[]
        store.invalidate();assert store.get_backlinks(target_plain.guid)==[]
        assert len(mw.col.models.get(plain['id'])['flds'])==2
        inline_report={'ordinaryType':True,'noSchemaChange':True,'metadataPersisted':True,'backlinkRendered':True,'inlineClickBridge':True,'localLabel':True,'removePersists':True}
        repository.ensure_types([nt['id']])
        nt=mw.col.models.get(nt['id'])
        notes=[]
        for front in ['Source 中文','Target 目标']:
            n=mw.col.new_note(nt);n.fields[0]=front;n.fields[1]='Answer';mw.col.add_note(n,mw.col.decks.id('双端引用演示'));notes.append(n)
        source,target=notes
        source['关联']='<p>保留的用户内容</p><!--ml-mirror:start--><div class="ml-mirror-row">old</div><!--ml-mirror:end-->'
        mw.col.update_notes([source])
        old={'version':1,'links':{source.guid:[target.guid]},'display_aliases':{target.guid:'stay up <b>熬夜</b>'}}
        records,missing=domain.migrate_legacy(old,{source.guid,target.guid},{})
        assert missing==[]
        store.stage_migration(records);stats=mirror.sync(allow_legacy=True)
        assert stats['changed']==2
        assert mw.col.get_note(source.id)['关联'].startswith('<p>保留的用户内容</p>')
        from anki.import_export_pb2 import ExportAnkiPackageOptions, ExportLimit
        mw.col.export_anki_package(out_path=str(OUTPUT/'jide-links-demo.apkg'),
            options=ExportAnkiPackageOptions(with_scheduling=False,with_deck_configs=False,with_media=False),
            limit=ExportLimit(deck_id=mw.col.decks.id('双端引用演示')))
        persisted=repository.read()
        assert persisted[source.guid]['targets']==[target.guid]
        assert persisted[target.guid]['alias']=='stay up <b>熬夜</b>'
        store.invalidate();assert store.get_backlinks(target.guid)==[source.guid]
        current_cfg=card_inject.cfg
        try:
            card_inject.cfg=lambda key,default=None:False if key=='show_float_buttons' else current_cfg(key,default)
            card=mw.col.get_card(mw.col.find_cards('nid:'+str(source.id))[0])
            assert 'window.mlxGo' in card_inject.on_card_will_show(card.answer(),card,'reviewAnswer')
        finally:
            card_inject.cfg=current_cfg
        dialog.open_dialog(source.guid)
        window=dialog._dialogs[-1]
        def capture():
            def check(value):
                try:
                    result=json.loads(value)
                    assert result['out']==1 and result['incoming']==0 and result['ready']
                    window.grab().save(str(OUTPUT/'desktop-links.png'))
                    dialog.open_links_in_browser(source.guid)
                    store.remove_link(source.guid,target.guid);mirror.sync_after_change(source.guid,[target.guid])
                    assert repository.read()[source.guid]['targets']==[]
                    assert store.get_backlinks(target.guid)==[]
                    finish({'ok':True,'inlineReferences':inline_report,'migration':stats,'editor':result,'profile':str(mw.pm.base)})
                except Exception:
                    finish({'ok':False,'error':traceback.format_exc()})
            window.web.evalWithCallback("JSON.stringify({out:window.__ML_DLG__.out.length,incoming:window.__ML_DLG__.inc.length,ready:!!window.ML})",check)
        QTimer.singleShot(2500,capture)
    except Exception:
        finish({'ok':False,'error':traceback.format_exc()})
gui_hooks.profile_did_open.append(lambda:QTimer.singleShot(500,probe))
QTimer.singleShot(45000,lambda:finish({'ok':False,'error':'Anki probe timed out'}))
'''.replace('OUTPUT_PATH', repr(str(output.resolve())))
    (probe / '__init__.py').write_text(script, encoding='utf-8')
    env = dict(os.environ, QT_QPA_PLATFORM='offscreen', QTWEBENGINE_CHROMIUM_FLAGS='--disable-gpu --no-sandbox',
               ANKI_NOSYNC='1')
    log = output / 'anki-console.log'
    with log.open('w', encoding='utf-8') as stream:
        bootstrap = ('import site;site.addsitedir(' + repr(str(app / 'app_packages')) + ');'
            'from pathlib import Path;from aqt.profiles import ProfileManager;'
            'pm=ProfileManager(Path(' + repr(str(base)) + '));pm.setupMeta();pm.create("User 1");pm.db.close();'
            'import aqt;aqt.run()')
        process = subprocess.Popen([str(runtime), '-c', bootstrap, '-b', str(base), '-l', 'en', '-p', 'User 1'],
                                   stdout=stream, stderr=subprocess.STDOUT, env=env,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            process.wait(timeout=60)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=10)
            raise RuntimeError('Isolated Anki did not exit; see ' + str(log))
    if not result_path.exists():
        raise RuntimeError('Anki did not produce probe evidence; see ' + str(log))
    result = json.loads(result_path.read_text(encoding='utf-8'))
    if not result.get('ok'):
        raise RuntimeError(result.get('error'))
    print(result_path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--anki', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    run(args.anki.resolve(), args.output.resolve())
