"""Only Anki adapter: collection reads and one Core batch per accepted write.

    Field metadata is authoritative; no private JSON graph is written. Callers
    invalidate their derived cache after sync, undo, import and profile changes.
"""
from aqt import mw
from .domain import decode, empty, replace_field, remove_reference, references, prepare_references
from .helpers import cfg, sanitize_alias


def read():
    records = {}
    tail = "substr(flds,instr(flds,'<!--jide-links:'))"
    query = ("select guid,substr(" + tail + ",1,instr(" + tail + ",'-->')+2),"
             "(length(flds)-length(replace(flds,'<!--jide-links:','')))/length('<!--jide-links:') "
             "from notes where instr(flds,'<!--jide-links:')>0")
    for guid, metadata, count in mw.col.db.all(query):
        if count != 1 or not metadata.endswith('-->'):
            raise ValueError('Duplicate note links metadata for ' + guid)
        records[guid] = decode(metadata, guid)
    return records


def prepare_note(note):
    """Anki's note_will_flush hook operates on the accepted note before serialization."""
    before = mw.col.db.scalar('select flds from notes where id = ?', note.id) if note.id else None
    original = before.split('\x1f') if before is not None else []
    # Fast path for ordinary unrelated notes and type-check probes.
    if not any('#jide-note:' in f or '<!--jide-links:' in f for f in note.fields + original):
        return
    note.fields = prepare_references(note.fields, note.guid, original)


def ensure_types(mids):
    """Explicit preparation entry. Existing template/field contents stay intact."""
    field_name = str(cfg('mirror_links_field') or '关联')
    for mid in sorted(set(mids)):
        model = mw.col.models.get(mid)
        if not any(f['name'] == field_name for f in model['flds']):
            field = mw.col.models.new_field(field_name)
            mw.col.models.add_field(model, field)
            model = mw.col.models.get(mid)
        changed = False
        for template in model['tmpls']:
            if '{{' + field_name + '}}' not in template['afmt']:
                template['afmt'] += '\n{{#' + field_name + '}}{{' + field_name + '}}{{/' + field_name + '}}'
                changed = True
        if changed:
            mw.col.models.update_dict(model)


def commit(records, affected, render, allow_legacy=False):
    ids = {g: n for g, n in mw.col.db.all('select guid,id from notes')}
    notes = [mw.col.get_note(ids[g]) for g in affected if g in ids]
    field_name = str(cfg('mirror_links_field') or '关联')
    if not allow_legacy and any(any('ml-mirror-row' in field for field in note.fields) and not any('<!--jide-links:' in field for field in note.fields) for note in notes):
        raise ValueError('检测到旧版关联，请先通过「迁移旧版引用」导入完整 data.json，再编辑。')
    updates = []
    for note in notes:
        data = records.get(note.guid, empty(note.guid))
        data = dict(data, alias=sanitize_alias(data['alias']))
        for target in references(note.fields):
            if target not in data['targets']:
                note.fields = [remove_reference(field, target) for field in note.fields]
        owned = [i for i, field in enumerate(note.fields) if '<!--jide-links:' in field]
        if len(owned) > 1:
            raise ValueError('Duplicate note links metadata')
        index = owned[0] if owned else next((i for i, f in enumerate(note.note_type()['flds']) if f['name'] == field_name), len(note.fields) - 1)
        original = note.fields[index]
        next_value = replace_field(original, data, render(note.guid) if field_name in note and note.note_type()['flds'][index]['name'] == field_name else '')
        if next_value != original:
            note.fields[index] = next_value
            updates.append(note)
    if updates:
        mw.col.update_notes(updates)
    return {'checked': len(notes), 'changed': len(updates)}
