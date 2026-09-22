# APKG Deck Metadata Repair Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Repair the malformed schema 11 deck metadata in four distributable APKG files and update the local cloud catalog to their verified sizes.

**Architecture:** Keep the existing Azure TTS media and source collections. Add a focused schema validator to the packaging script, correct the generated root-deck shape, rebuild only the four affected packages, and validate each archive before changing the catalog sizes.

**Tech Stack:** Python 3 standard library (`unittest`, `zipfile`, `sqlite3`, `json`, `hashlib`), Anki schema 11 APKG, JSON hosting manifest.

## Global Constraints

- Do not call Azure TTS or regenerate audio.
- Do not upload, replace, or delete cloud files.
- Do not modify the JideCards client implementation.
- Preserve unrelated dirty files in `D:\Projects\jidecards`.

---

### Task 1: Add schema regression coverage and repair the packager

**Files:**
- Create: `D:\Projects\anki制卡\test_azure_build.py`
- Modify: `D:\Projects\anki制卡\.azure_build.py:140-180`

**Interfaces:**
- Produces: `validate_schema11_decks(decks: dict) -> None`, raising `ValueError` for malformed schema 11 Today fields.
- Consumes: The existing `package()` function's decoded `col.decks` mapping.

- [ ] **Step 1: Write the failing test**

```python
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("azure_build", ROOT / ".azure_build.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Schema11DeckTests(unittest.TestCase):
    def test_rejects_scalar_today_values(self):
        decks = {"2": {"name": "broken", "lrnToday": 0, "revToday": 0,
                         "newToday": 0, "timeToday": 0}}
        with self.assertRaisesRegex(ValueError, "lrnToday"):
            MODULE.validate_schema11_decks(decks)

    def test_accepts_two_integer_today_values(self):
        decks = {"2": {"name": "valid", "lrnToday": [0, 0], "revToday": [0, 0],
                         "newToday": [0, 0], "timeToday": [0, 0]}}
        MODULE.validate_schema11_decks(decks)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test and verify RED**

Run: `python -m unittest -v test_azure_build.py`

Expected: ERROR because `.azure_build.py` has no `validate_schema11_decks`.

- [ ] **Step 3: Implement the minimal repair**

Add to `.azure_build.py`:

```python
SCHEMA11_TODAY_FIELDS = ('lrnToday', 'revToday', 'newToday', 'timeToday')


def validate_schema11_decks(decks):
    for deck_id, deck in decks.items():
        for field in SCHEMA11_TODAY_FIELDS:
            value = deck.get(field)
            if not (isinstance(value, list) and len(value) == 2 and
                    all(isinstance(item, int) and not isinstance(item, bool) for item in value)):
                raise ValueError(f'deck {deck_id} {deck.get("name", "")} has invalid {field}: {value!r}')
```

Change newly created root decks from scalar zeroes to arrays and call validation before persisting:

```python
'lrnToday': [0, 0], 'revToday': [0, 0],
'newToday': [0, 0], 'timeToday': [0, 0],
...
validate_schema11_decks(decks)
con.execute('update col set decks=?', (json.dumps(decks, ensure_ascii=False),))
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `python -m unittest -v test_azure_build.py`

Expected: 2 tests pass.

### Task 2: Rebuild only affected packages and validate artifacts

**Files:**
- Replace: `D:\Projects\anki制卡\分发版\中考英语词汇（分发版）.apkg`
- Replace: `D:\Projects\anki制卡\分发版\高考英语词汇（分发版）.apkg`
- Replace: `D:\Projects\anki制卡\分发版\CET四六级词汇（分发版）.apkg`
- Replace: `D:\Projects\anki制卡\分发版\CET四六级词汇_谐音助记版（分发版）.apkg`
- Modify: `D:\Projects\jidecards\hosting\cloud-decks.json`

**Interfaces:**
- Consumes: `package()` and existing `.azure_mp3` cache.
- Produces: Four schema-compatible APKG files and matching exact byte sizes in the cloud catalog.

- [ ] **Step 1: Rebuild only the four affected packages**

Run from `D:\Projects\anki制卡`:

```powershell
python -c "import importlib.util; s=importlib.util.spec_from_file_location('azure_build','.azure_build.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.DECKS=['中考英语词汇','高考英语词汇','CET四六级词汇','CET四六级词汇_谐音助记版']; m.package()"
```

Expected: four package lines and `package done`; no TTS network calls.

- [ ] **Step 2: Validate each APKG**

For each output, assert:

```python
archive.testzip() is None
sqlite integrity_check == "ok"
all four Today fields are two-integer lists
every media-manifest key exists in the ZIP
cards and notes counts match their source package
```

- [ ] **Step 3: Update exact sizes in the catalog**

Set the `size` fields for the four matching deck IDs to `Path(apkg).stat().st_size`. Keep IDs, URLs, names, card counts, and versions unchanged.

- [ ] **Step 4: Run final verification**

Run:

```powershell
python -m unittest -v test_azure_build.py
npm test
git diff --check
```

Expected: Python tests pass, the JideCards test suite has zero failures, and `git diff --check` reports no errors.
