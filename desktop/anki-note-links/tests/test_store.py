"""Large graph lookups reuse one derived cache; no Anki/Qt required."""
import importlib.util
import pathlib
import sys
import types
import unittest

root = pathlib.Path(__file__).resolve().parents[1]


class StoreTests(unittest.TestCase):
    def test_lookup_cache_is_invalidated_by_edges_profile_and_sync(self):
        package = types.ModuleType('links_store_test')
        package.__path__ = [str(root)]
        sys.modules[package.__name__] = package
        repository = types.ModuleType('links_store_test.repository')
        reads = []
        graph = {str(i): {'v': 1, 'guid': str(i), 'targets': ['target'], 'alias': ''} for i in range(24000)}
        repository.read = lambda: (reads.append(True), {g: dict(d, targets=list(d['targets'])) for g, d in graph.items()})[1]
        sys.modules[repository.__name__] = repository
        try:
            import importlib
            store = importlib.import_module('links_store_test.store')
            for _ in range(30):
                self.assertEqual(len(store.get_backlinks('target')), 24000)
                self.assertEqual(store.get_links('1'), ['target'])
            self.assertEqual(len(reads), 1)
            store.remove_link('1', 'target')
            self.assertNotIn('1', store.get_backlinks('target'))
            store.invalidate()  # sync/undo/profile hook
            self.assertIn('1', store.get_backlinks('target'))
            self.assertEqual(len(reads), 2)
        finally:
            for name in list(sys.modules):
                if name.startswith('links_store_test'):
                    del sys.modules[name]
