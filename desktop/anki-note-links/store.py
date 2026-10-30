"""Small compatibility facade for the preserved editor UI.

Only pending edits are mutable here. mirror.sync commits through repository,
and invalidates on failure. This cache never becomes a second source of truth.
"""
from . import repository
from .domain import empty

_cache = None
_dirty = set()
_reverse = None


def invalidate(*_args):
    global _cache, _reverse
    _cache = None
    _reverse = None
    _dirty.clear()


def records():
    if _cache is None:
        load()
    return _cache


def stage_migration(data):
    global _cache, _reverse
    _cache = data
    _reverse = None
    _dirty.update(data)


def load(force=False):
    global _cache, _reverse
    if _cache is None or force:
        _cache = repository.read()
        _reverse = None
    return {'version': 1, 'links': {g: d['targets'] for g, d in _cache.items()},
            'display_aliases': {g: d['alias'] for g, d in _cache.items() if d['alias']}}


def get_links(guid):
    return list(records().get(guid, empty(guid))['targets'])


def set_links(guid, guids, self_guid=None):
    global _reverse
    data = records().setdefault(guid, empty(guid))
    data['targets'] = list(dict.fromkeys(g for g in guids if g and g != guid))
    _dirty.add(guid)
    _reverse = None


def add_link(guid, target):
    set_links(guid, get_links(guid) + [target])


def remove_link(guid, target):
    set_links(guid, [g for g in get_links(guid) if g != target])


def get_backlinks(guid):
    global _reverse
    graph = records()
    if _reverse is None:
        _reverse = {}
        for source, data in graph.items():
            for target in data['targets']:
                _reverse.setdefault(target, []).append(source)
    return list(_reverse.get(guid, []))


def pending_guids():
    return set(_dirty)


def has_links(guid):
    return bool(get_links(guid) or get_backlinks(guid))


def get_display_alias(guid):
    return records().get(guid, empty(guid))['alias']


def get_display_aliases_batch(guids):
    return {g: get_display_alias(g) for g in guids}


def set_display_alias(guid, alias):
    if get_display_alias(guid) == alias:
        return False
    records().setdefault(guid, empty(guid))['alias'] = alias
    _dirty.add(guid)
    return True


def sources_referencing(guid):
    return get_backlinks(guid)
