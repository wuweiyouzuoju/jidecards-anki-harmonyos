# SPDX-License-Identifier: AGPL-3.0-or-later
"""Optional real-core acceptance: python -m pip install anki==26.5."""
import json
import tempfile
from pathlib import Path

from anki.collection import (
    Collection, ExportAnkiPackageOptions, ImportAnkiPackageOptions,
    ImportAnkiPackageRequest,
)
from anki.scheduler.v3 import CardAnswer


ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / 'docs/examples/choice-demo.apkg'


def import_package(collection, path):
    collection.import_anki_package(ImportAnkiPackageRequest(
        package_path=str(path), options=ImportAnkiPackageOptions(with_scheduling=True),
    ))


def snapshot(collection):
    return {
        collection.get_note(nid).guid: collection.get_note(nid).fields
        for nid in collection.find_notes('')
    }


def review_log(collection):
    # GUID links review rows across import, even if a collection remaps numeric IDs.
    return sorted(collection.db.all(
        'SELECT n.guid, r.ease FROM revlog r '
        'JOIN cards c ON c.id = r.cid JOIN notes n ON n.id = c.nid'
    ))


def main():
    with tempfile.TemporaryDirectory(prefix='jidecards-choice-anki-') as directory:
        root = Path(directory)
        exported = root / 'roundtrip.apkg'
        collection = Collection(str(root / 'first.anki2'))
        try:
            import_package(collection, FIXTURE)
            assert collection.note_count() == collection.card_count() == 3
            original = snapshot(collection)
            for cid in collection.find_cards(''):
                card = collection.get_card(cid)
                note = card.note()
                payload = json.loads(note['JidePayload'])
                assert payload['format'] == 'jidecards.choice'
                front, back = card.question(), card.answer()
                assert note['Prompt'] in front and note['OptionsHTML'] in front
                assert note['AnswerHTML'] in back and note['Explanation'] in back
                assert note['JidePayload'] not in front + back

            # A second import must not duplicate notes or lose the hidden metadata.
            import_package(collection, FIXTURE)
            assert collection.note_count() == collection.card_count() == 3
            assert snapshot(collection) == original

            first_card = collection.get_card(collection.find_cards('')[0])
            collection.decks.select(first_card.did)
            for rating in (CardAnswer.HARD, CardAnswer.GOOD):
                queued = collection.sched.get_queued_cards().cards[0]
                card = collection.get_card(queued.card.id)
                card.start_timer()
                answer = collection.sched.build_answer(
                    card=card, states=queued.states, rating=rating,
                )
                collection.sched.answer_card(answer)
            reviews = review_log(collection)
            assert sorted(row[1] for row in reviews) == [2, 3]
            collection.export_anki_package(
                out_path=str(exported), limit=None,
                options=ExportAnkiPackageOptions(with_scheduling=True, with_media=False),
            )
        finally:
            collection.close()

        collection = Collection(str(root / 'second.anki2'))
        try:
            import_package(collection, exported)
            assert collection.note_count() == collection.card_count() == 3
            assert snapshot(collection) == original
            assert review_log(collection) == reviews
        finally:
            collection.close()
    print('Anki core acceptance passed: import, front/back rendering, duplicate import, '
          'Hard/Good revlog, export/reimport with identical fields and review history.')


if __name__ == '__main__':
    main()
