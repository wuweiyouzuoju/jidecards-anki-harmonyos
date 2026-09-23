# SPDX-License-Identifier: AGPL-3.0-or-later
"""APKG I/O only. Domain validation and templates live in JideChoice.ts."""
import json
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path


def build(manifest_path, output_path):
    try:
        import genanki
    except ImportError as exc:
        raise ValueError('Install the packager: python -m pip install -r tools/choice-requirements.txt') from exc
    data = json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    model = genanki.Model(
        data['modelId'], data['modelName'],
        fields=[{'name': name} for name in data['fields']],
        templates=[{'name': 'Choice', 'qfmt': data['qfmt'], 'afmt': data['afmt']}],
        css=data['css'], sort_field_index=0,
    )
    deck = genanki.Deck(data['deckId'], data['title'])
    for entry in data['notes']:
        deck.add_note(genanki.Note(
            model=model, fields=entry['fields'],
            guid=genanki.guid_for('jidecards.choice.v1', data['namespace'], entry['id']),
            tags=['jidecards::choice::v1'],
        ))
    genanki.Package(deck).write_to_file(output_path)


def inspect(path):
    # 本检查器针对本工具生成的 v11 APKG，不接管应用的 Anki 通用导入器。
    with zipfile.ZipFile(path) as archive:
        if sorted(archive.namelist()) != ['collection.anki2', 'media']:
            raise ValueError('Expected a text-only generated APKG (collection.anki2 + media)')
        if archive.getinfo('collection.anki2').file_size > 64 * 1024 * 1024:
            raise ValueError('Collection exceeds 64 MiB inspection limit')
        if archive.getinfo('media').file_size > 1024 or json.loads(archive.read('media')) != {}:
            raise ValueError('Unexpected media in text-only package')
        with tempfile.TemporaryDirectory(prefix='jidecards-choice-inspect-') as directory:
            database = Path(directory) / 'collection.anki2'
            database.write_bytes(archive.read('collection.anki2'))
            connection = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
            try:
                if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('Invalid collection database')
                models = json.loads(connection.execute('SELECT models FROM col').fetchone()[0])
                notes = []
                for nid, guid, mid, fields in connection.execute('SELECT id, guid, mid, flds FROM notes ORDER BY id'):
                    model = models[str(mid)]
                    cards = connection.execute('SELECT ord FROM cards WHERE nid = ?', (nid,)).fetchall()
                    if cards != [(0,)] or len(model['tmpls']) != 1:
                        raise ValueError('Each choice note must generate exactly one card')
                    notes.append({
                        'guid': guid, 'modelId': mid, 'modelName': model['name'],
                        'fields': fields.split('\x1f'),
                        'fieldNames': [f['name'] for f in sorted(model['flds'], key=lambda f: f['ord'])],
                        'qfmt': model['tmpls'][0]['qfmt'], 'afmt': model['tmpls'][0]['afmt'],
                    })
                return {'notes': notes}
            finally:
                connection.close()


if __name__ == '__main__':
    try:
        if len(sys.argv) == 4 and sys.argv[1] == 'build':
            build(sys.argv[2], sys.argv[3])
        elif len(sys.argv) == 3 and sys.argv[1] == 'inspect':
            # ASCII JSON avoids platform console codepage altering Chinese fields.
            print(json.dumps(inspect(sys.argv[2]), ensure_ascii=True))
        else:
            raise ValueError('Use node tools/choice-package.mjs as the public entry point')
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
