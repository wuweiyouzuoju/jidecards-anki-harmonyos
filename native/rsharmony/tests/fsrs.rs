// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg(feature = "anki-core")]

use anki::backend::{init_backend, Backend};
use anki::collection::CollectionBuilder;
use anki::decks::DeckId;
use anki_proto::deck_config::deck_config::Config as Settings;
use anki_proto::scheduler::SimulateFsrsReviewRequest;
use prost::Message;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, PartialEq, Message)]
struct Open {
    #[prost(string, tag = "1")]
    collection: String,
    #[prost(string, tag = "2")]
    media: String,
    #[prost(string, tag = "3")]
    media_db: String,
}

#[derive(Clone, PartialEq, Message)]
struct Id {
    #[prost(int64, tag = "1")]
    id: i64,
}

#[derive(Clone, PartialEq, Message)]
struct Compute {
    #[prost(string, tag = "1")]
    search: String,
    #[prost(float, repeated, tag = "2")]
    params: Vec<f32>,
    #[prost(int64, tag = "3")]
    ignore_before: i64,
    #[prost(uint32, tag = "4")]
    relearning: u32,
    #[prost(bool, tag = "5")]
    health_check: bool,
}

#[derive(Clone, PartialEq, Message)]
struct Computed {
    #[prost(float, repeated, tag = "1")]
    params: Vec<f32>,
    #[prost(uint32, tag = "2")]
    items: u32,
    #[prost(bool, optional, tag = "3")]
    health: Option<bool>,
}

#[derive(Clone, PartialEq, Message)]
struct Workload {
    #[prost(map = "uint32, float", tag = "1")]
    cost: HashMap<u32, f32>,
    #[prost(float, tag = "2")]
    reviewless: f32,
    #[prost(map = "uint32, float", tag = "3")]
    memorized: HashMap<u32, f32>,
    #[prost(map = "uint32, uint32", tag = "4")]
    count: HashMap<u32, u32>,
}

#[derive(Clone, PartialEq, Message)]
struct Config {
    #[prost(int64, tag = "1")]
    id: i64,
    #[prost(string, tag = "2")]
    name: String,
    #[prost(int64, tag = "3")]
    mtime: i64,
    #[prost(int32, tag = "4")]
    usn: i32,
    #[prost(bytes = "vec", optional, tag = "5")]
    settings: Option<Vec<u8>>,
}

#[derive(Clone, PartialEq, Message)]
struct ConfigExtra {
    #[prost(message, optional, tag = "1")]
    config: Option<Config>,
    #[prost(uint32, tag = "2")]
    use_count: u32,
}

#[derive(Clone, PartialEq, Message)]
struct Current {
    #[prost(string, tag = "1")]
    name: String,
    #[prost(int64, tag = "2")]
    config_id: i64,
}

#[derive(Clone, PartialEq, Message)]
struct View {
    #[prost(message, repeated, tag = "1")]
    configs: Vec<ConfigExtra>,
    #[prost(message, optional, tag = "2")]
    current: Option<Current>,
    #[prost(message, optional, tag = "3")]
    defaults: Option<Config>,
}

#[derive(Clone, PartialEq, Message)]
struct Update {
    #[prost(int64, tag = "1")]
    target: i64,
    #[prost(message, repeated, tag = "2")]
    configs: Vec<Config>,
    #[prost(bool, tag = "8")]
    fsrs: bool,
}

struct Fixture {
    root: PathBuf,
    backend: Backend,
    shared_deck: i64,
    foreign_deck: i64,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.backend.run_service_method(3, 1, &[]).unwrap();
        assert_eq!(self.root.parent().unwrap(), std::env::temp_dir());
        assert!(self
            .root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("jidecards-fsrs-test-"));
        std::fs::remove_dir_all(&self.root).unwrap();
    }
}

fn fixture() -> Fixture {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let root = std::env::temp_dir().join(format!(
        "jidecards-fsrs-test-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("collection.anki2");
    let mut col = CollectionBuilder::new(&path).build().unwrap();
    let shared_deck = col.get_or_create_normal_deck("Shared").unwrap().id;
    let foreign_deck = col.get_or_create_normal_deck("Foreign").unwrap().id;
    let nt = col
        .get_all_notetypes()
        .unwrap()
        .into_iter()
        .find(|nt| nt.config.original_stock_kind == 1)
        .unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let timing = col.timing_today().unwrap();
    for index in 0..36 {
        let deck = if index < 12 {
            DeckId(1)
        } else if index < 24 {
            shared_deck
        } else {
            foreign_deck
        };
        let mut note = nt.new_note();
        note.set_field(0, &format!("FSRS {index}")).unwrap();
        note.set_field(1, "Answer").unwrap();
        col.add_note(&mut note, deck).unwrap();
        if index % 2 == 0 {
            let cid = col
                .storage
                .all_card_ids_of_note_in_template_order(note.id)
                .unwrap()[0]
                .0;
            let first = (now - 12 * 86400) * 1000 + index;
            let second = (now - 8 * 86400) * 1000 + index;
            let third = (now - 2 * 86400) * 1000 + index;
            col.storage
                .db()
                .execute_batch(&format!(
                    "UPDATE cards SET type=2,queue=2,due={},ivl=7,reps=3 WHERE id={cid};
                 INSERT INTO revlog VALUES ({first},{cid},-1,3,-60,0,2500,8000,0);
                 INSERT INTO revlog VALUES ({second},{cid},-1,3,4,1,2500,5000,1);
                 INSERT INTO revlog VALUES ({third},{cid},-1,3,7,4,2500,4000,1);",
                    timing.days_elapsed as i64 - 1
                ))
                .unwrap();
        }
    }
    col.close(None).unwrap();
    let backend = init_backend(&[]).unwrap();
    backend
        .run_service_method(
            3,
            0,
            &Open {
                collection: path.to_string_lossy().into_owned(),
                media: root.join("collection.media").to_string_lossy().into_owned(),
                media_db: root.join("collection.mdb").to_string_lossy().into_owned(),
            }
            .encode_to_vec(),
        )
        .unwrap();
    Fixture {
        root,
        backend,
        shared_deck: shared_deck.0,
        foreign_deck: foreign_deck.0,
    }
}

fn hex(source: &str) -> Vec<u8> {
    source
        .trim()
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect()
}

fn view(f: &Fixture, deck: i64) -> View {
    View::decode(
        f.backend
            .run_service_method(11, 6, &Id { id: deck }.encode_to_vec())
            .unwrap()
            .as_slice(),
    )
    .unwrap()
}

#[test]
fn arkts_golden_requests_run_real_core_optimization_and_workload() {
    let f = fixture();
    let optimize = hex(include_str!(
        "../../../tools/tests/fixtures/fsrs-optimize.hex"
    ));
    let before = view(&f, 1);
    let computed = Computed::decode(
        f.backend
            .run_service_method(13, 30, &optimize)
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    assert!(computed.items > 0);
    assert!(
        computed.params.is_empty() || computed.params.len() == 21,
        "Core can keep the empty/default parameter representation even with usable history"
    );
    assert!(computed.params.iter().all(|v| v.is_finite()));
    assert_eq!(
        computed.health, None,
        "small history cannot yield a health result"
    );
    assert_eq!(view(&f, 1), before, "optimization only returns parameters");
    let workload = hex(include_str!(
        "../../../tools/tests/fixtures/fsrs-workload.hex"
    ));
    let result = Workload::decode(
        f.backend
            .run_service_method(13, 34, &workload)
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    for retention in 70..=99 {
        assert!(result.cost[&retention].is_finite());
        assert!(result.cost[&retention] > 0.0);
        assert!(result.memorized[&retention] > 0.0);
        assert!(result.count[&retention] > 0);
    }
    assert_eq!(result.cost.len(), 30);
    assert_eq!(result.memorized.len(), 30);
    assert_eq!(result.count.len(), 30);
    assert!(result.reviewless.is_finite());
    assert_eq!(
        view(&f, 1),
        before,
        "simulation does not change preset options"
    );
    let defaults = Settings::decode(
        before
            .defaults
            .as_ref()
            .unwrap()
            .settings
            .as_ref()
            .unwrap()
            .as_slice(),
    )
    .unwrap()
    .fsrs_params_6;
    for length in [17, 19, 21] {
        let mut input = SimulateFsrsReviewRequest::decode(workload.as_slice()).unwrap();
        input.params = defaults[..length].to_vec();
        let result = Workload::decode(
            f.backend
                .run_service_method(13, 34, &input.encode_to_vec())
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        assert_eq!(result.cost.len(), 30);
        assert_eq!(result.memorized.len(), 30);
        assert_eq!(result.count.len(), 30);
        assert!(result.reviewless.is_finite() && result.reviewless >= 0.0);
        assert!(result
            .cost
            .values()
            .all(|cost| cost.is_finite() && *cost > 0.0));
    }
}

#[test]
fn shared_id_scope_no_history_dates_and_errors_obey_core_semantics() {
    let f = fixture();
    let input = Compute {
        search: format!("did:1,{} -is:suspended", f.shared_deck),
        params: vec![],
        ignore_before: 0,
        relearning: 1,
        health_check: true,
    };
    let result = Computed::decode(
        f.backend
            .run_service_method(13, 30, &input.encode_to_vec())
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let single = Computed::decode(
        f.backend
            .run_service_method(
                13,
                30,
                &hex(include_str!(
                    "../../../tools/tests/fixtures/fsrs-optimize.hex"
                )),
            )
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    assert_eq!(result.items, single.items * 2);
    let empty = Compute {
        search: "did:0 -is:suspended".into(),
        params: result.params.clone(),
        ..input.clone()
    };
    let unchanged = Computed::decode(
        f.backend
            .run_service_method(13, 30, &empty.encode_to_vec())
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    assert_eq!(unchanged.items, 0);
    assert_eq!(unchanged.params, result.params);
    assert_eq!(unchanged.health, None);
    let ignored = Compute {
        ignore_before: i64::MAX,
        ..input.clone()
    };
    let ignored = Computed::decode(
        f.backend
            .run_service_method(13, 30, &ignored.encode_to_vec())
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    assert_eq!(ignored.items, 0);
    let bad = Compute {
        search: "(".into(),
        ..input
    };
    assert!(f
        .backend
        .run_service_method(13, 30, &bad.encode_to_vec())
        .is_err());
}

#[test]
fn one_save_applies_multiple_presets_current_last_and_isolated_save_keeps_shared_preset() {
    let f = fixture();
    let initial = view(&f, 1);
    let default_params = Settings::decode(
        initial
            .defaults
            .as_ref()
            .unwrap()
            .settings
            .as_ref()
            .unwrap()
            .as_slice(),
    )
    .unwrap()
    .fsrs_params_6;
    assert_eq!(default_params.len(), 21);
    let mut foreign = initial.configs[0].config.clone().unwrap();
    foreign.id = 0;
    foreign.name = "Foreign options".into();
    f.backend
        .run_service_method(
            11,
            7,
            &Update {
                target: f.foreign_deck,
                configs: vec![foreign],
                fsrs: true,
            }
            .encode_to_vec(),
        )
        .unwrap();
    let foreign = view(&f, f.foreign_deck)
        .configs
        .into_iter()
        .find_map(|entry| entry.config.filter(|c| c.name == "Foreign options"))
        .unwrap();
    let compute = |search: String| {
        let input = Compute {
            search,
            params: default_params.clone(),
            ignore_before: 0,
            relearning: 1,
            health_check: false,
        };
        let result = Computed::decode(
            f.backend
                .run_service_method(13, 30, &input.encode_to_vec())
                .unwrap()
                .as_slice(),
        )
        .unwrap()
        .params;
        assert_eq!(result.len(), 21);
        result
    };
    let params = compute("did:1 -is:suspended".into());
    let mut current = initial.configs[0].config.clone().unwrap();
    let update_params = |config: &mut Config, params: &[f32]| {
        let mut settings = Settings::decode(config.settings.as_ref().unwrap().as_slice()).unwrap();
        settings.fsrs_params_6 = params.to_vec();
        config.settings = Some(settings.encode_to_vec());
    };
    update_params(&mut current, &params);
    let mut foreign_optimized = foreign.clone();
    update_params(
        &mut foreign_optimized,
        &compute(format!("did:{} -is:suspended", f.foreign_deck)),
    );
    f.backend
        .run_service_method(
            11,
            7,
            &Update {
                target: 1,
                configs: vec![foreign_optimized.clone(), current.clone()],
                fsrs: true,
            }
            .encode_to_vec(),
        )
        .unwrap();
    assert_eq!(view(&f, 1).current.unwrap().config_id, current.id);
    assert_eq!(
        view(&f, f.shared_deck).current.unwrap().config_id,
        current.id
    );
    assert_eq!(
        view(&f, f.foreign_deck).current.unwrap().config_id,
        foreign.id
    );
    let saved = view(&f, 1);
    assert_eq!(
        saved
            .configs
            .iter()
            .find(|c| c.config.as_ref().unwrap().id == foreign.id)
            .unwrap()
            .config
            .as_ref()
            .unwrap()
            .settings,
        foreign_optimized.settings
    );
    let mut isolated = current.clone();
    isolated.id = 0;
    isolated.name = "Target only".into();
    f.backend
        .run_service_method(
            11,
            7,
            &Update {
                target: 1,
                configs: vec![isolated],
                fsrs: true,
            }
            .encode_to_vec(),
        )
        .unwrap();
    assert_ne!(view(&f, 1).current.unwrap().config_id, current.id);
    assert_eq!(
        view(&f, f.shared_deck).current.unwrap().config_id,
        current.id
    );
}
