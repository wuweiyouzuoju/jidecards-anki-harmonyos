"""Reproducibly package the add-on and review sources; never includes user files."""
import argparse
import hashlib
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]


def package(output):
    output.mkdir(parents=True, exist_ok=True)
    source = root / 'desktop' / 'anki-note-links'
    entries = sorted(p for p in source.rglob('*') if p.is_file() and
                     not any(part in ('__pycache__', 'user_files', '.git') for part in p.parts) and p.suffix != '.pyc')
    addon = output / 'jide_note_links.ankiaddon'
    with zipfile.ZipFile(addon, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in entries:
            info = zipfile.ZipInfo(path.relative_to(source).as_posix(), (2026, 10, 21, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    manifest = {'addon': addon.name, 'sha256': hashlib.sha256(addon.read_bytes()).hexdigest(),
                'protocol': 1, 'source': 'desktop/anki-note-links', 'excluded': ['user_files', '__pycache__', '*.pyc']}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(addon)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    package(parser.parse_args().output.resolve())
