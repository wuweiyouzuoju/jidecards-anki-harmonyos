"""Versioned note-field transport. No Qt, Anki, disk or mutable global state.

The matching implementation and conformance corpus live in model/NoteLinks.ts
and tools/tests/fixtures/note-links.json. A mirror is never an authority.
"""
import json
import re
from urllib.parse import quote, unquote
import html

MARKER = '<!--jide-links:v1:'
REFERENCE_PREFIX = '#jide-note:'


def references(fields):
    result = []
    for field in fields:
        for match in re.finditer(r'<a\b[^>]*\bhref\s*=\s*([\"\'])(.*?)\1[^>]*>([\s\S]*?)</a\s*>', field, re.I):
            url = html.unescape(match[2])
            if url.startswith(REFERENCE_PREFIX):
                guid = unquote(url[len(REFERENCE_PREFIX):], errors='strict')
                if not guid or len(guid) > 128 or any(ord(c) < 32 for c in guid):
                    raise ValueError('Invalid inline reference GUID')
                result.append(guid)
    return list(dict.fromkeys(result))


def remove_reference(field, guid):
    def replace(match):
        url = html.unescape(match[2])
        return match[3] if url.startswith(REFERENCE_PREFIX) and unquote(url[len(REFERENCE_PREFIX):]) == guid else match[0]
    return re.sub(r'<a\b[^>]*\bhref\s*=\s*([\"\'])(.*?)\1[^>]*>([\s\S]*?)</a\s*>', replace, field, flags=re.I)


def prepare_references(fields, guid, before=()):
    """Runs before the same Core note write; a render never modifies the graph."""
    owned = [i for i, field in enumerate(fields) if '<!--jide-links:' in field]
    old_owned = [i for i, field in enumerate(before) if '<!--jide-links:' in field]
    if len(owned) > 1 or len(old_owned) > 1:
        raise ValueError('Duplicate note links metadata')
    inline = references(fields)
    if not inline and not references(before):
        return list(fields)
    if not inline and not owned and not old_owned:
        return list(fields)
    data = decode(fields[owned[0]], guid) if owned else decode(before[old_owned[0]], guid) if old_owned else empty(guid)
    data = dict(data, targets=list(dict.fromkeys([g for g in data['targets'] if g not in references(before)] + inline)))
    if guid in data['targets']:
        raise ValueError('A note cannot reference itself')
    index = owned[0] if owned else old_owned[0] if old_owned and old_owned[0] < len(fields) else len(fields) - 1
    output = list(fields)
    output[index] = replace_field(output[index], data, '')
    return output


def empty(guid):
    return {'v': 1, 'guid': guid, 'targets': [], 'alias': ''}


def decode(field, guid):
    start = field.find(MARKER)
    if start < 0:
        if '<!--jide-links:' in field:
            raise ValueError('Unsupported note links version')
        return None
    end = field.find('-->', start)
    if end < 0 or field.find('<!--jide-links:', start + len(MARKER)) >= 0:
        raise ValueError('Damaged note links metadata')
    data = json.loads(unquote(field[start + len(MARKER):end], errors='strict'))
    if (data.get('v') != 1 or data.get('guid') != guid
            or not isinstance(data.get('alias'), str)
            or not isinstance(data.get('targets'), list)
            or any(not isinstance(g, str) or not g or g == guid for g in data['targets'])
            or len(set(data['targets'])) != len(data['targets'])):
        raise ValueError('Unsupported or damaged note links metadata')
    return data


def encode(data):
    # Match JavaScript encodeURIComponent exactly, including non-ASCII UTF-8.
    return MARKER + quote(json.dumps(data, ensure_ascii=False, separators=(',', ':')),
                          safe="~!*'()-._") + '-->'


def replace_field(field, data, mirror):
    decode(field, data['guid'])  # reject unknown versions before a write
    rest = re.sub(r'<!--jide-links:v1:.*?-->', '', field, flags=re.S)
    rest = re.sub(r'<!--ml-mirror:start-->.*?<!--ml-mirror:end-->', '', rest, flags=re.S)
    return rest + encode(data) + mirror


def migrate_legacy(value, existing, current):
    """Import complete local JSON once. A v1 field, including an empty one, wins.

    Re-running migration must never resurrect a link deleted on HarmonyOS.
    Unknown/deleted GUIDs are reported, not silently redirected by note ID.
    """
    if not isinstance(value, dict) or not isinstance(value.get('links'), dict):
        raise ValueError('Not a mnemonic_links index')
    result = {g: dict(data, targets=list(data['targets'])) for g, data in current.items()}
    missing = set()
    aliases = value.get('display_aliases', {})
    for guid in dict.fromkeys(list(value['links']) + list(aliases)):
        if guid not in existing:
            missing.add(guid)
            continue
        if guid in current:
            continue
        data = empty(guid)
        data['alias'] = str(aliases.get(guid, ''))
        for target in value['links'].get(guid, []):
            if not isinstance(target, str):
                raise ValueError('Invalid legacy target')
            if target not in existing:
                missing.add(target)
            if target != guid and target not in data['targets']:
                data['targets'].append(target)
        result[guid] = data
    return result, sorted(missing)
