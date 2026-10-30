import importlib.util
import pathlib
import unittest

root = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('domain', root / 'domain.py')
domain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(domain)


class DomainTests(unittest.TestCase):
    def test_inline_references_use_local_labels_and_survive_new_note_save_without_type_preparation(self):
        raw = ['Front', '<a href="#jide-note:b">one</a> / <a href="#jide-note:c">two</a>']
        saved = domain.prepare_references(raw, 'a')
        self.assertEqual(raw[1], '<a href="#jide-note:b">one</a> / <a href="#jide-note:c">two</a>')
        self.assertEqual(domain.decode(saved[1], 'a')['targets'], ['b', 'c'])
        removed = [domain.remove_reference(field, 'b') for field in saved]
        next_fields = domain.prepare_references(removed, 'a', saved)
        self.assertEqual(domain.decode(next_fields[1], 'a')['targets'], ['c'])
        self.assertTrue(next_fields[1].startswith('one / '))
        # Anki's visual editor can discard hidden comments: use the real saved baseline.
        stripped = ['Front', 'one / <a href="#jide-note:c">my local wording</a>']
        self.assertEqual(domain.decode(domain.prepare_references(stripped, 'a', saved)[1], 'a')['targets'], ['c'])

    def test_full_index_migration_exceeds_render_limit_and_is_idempotent(self):
        targets = ['target' + str(i) for i in range(65)]
        existing = set(['a'] + targets)
        old = {'links': {'a': targets + ['deleted']}, 'display_aliases': {targets[0]: '<b>中文</b>'}}
        records, missing = domain.migrate_legacy(old, existing, {})
        self.assertEqual(records['a']['targets'], targets + ['deleted'])
        self.assertEqual(missing, ['deleted'])
        self.assertEqual(domain.decode(domain.encode(records['a']), 'a'), records['a'])
        records['a']['targets'] = []  # user removed every link on the other device
        again, _ = domain.migrate_legacy(old, existing, records)
        self.assertEqual(again['a']['targets'], [])

    def test_preserves_user_field_contents_and_removes_only_owned_blocks(self):
        data = domain.empty('a')
        field = domain.replace_field('user <b>text</b>', data, '<!--ml-mirror:start-->old<!--ml-mirror:end-->')
        self.assertEqual(domain.replace_field(field, data, ''), 'user <b>text</b>' + domain.encode(data))

    def test_future_versions_and_corrupt_records_are_not_overwritten(self):
        for value in ['<!--jide-links:v2:future-->', '<!--jide-links:v1:broken-->']:
            with self.assertRaises(ValueError):
                domain.replace_field(value, domain.empty('a'), '')
        for data in [dict(domain.empty('a'), targets=['a']), dict(domain.empty('a'), targets=['b','b'])]:
            with self.assertRaises(ValueError):
                domain.decode(domain.encode(data), 'a')


if __name__ == '__main__':
    unittest.main()
