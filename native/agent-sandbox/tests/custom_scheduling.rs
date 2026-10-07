// SPDX-License-Identifier: AGPL-3.0-or-later
use jidecards_agent_sandbox::{Budget, Failure, Sandbox};
use serde_json::Value;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

#[test]
fn anki_invocation_runs_in_the_real_bounded_engine_and_keeps_input_immutable() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tools/tests/fixtures/custom-scheduling.json"
    ))
    .unwrap();
    let engine = Sandbox::new().unwrap();
    let input = fixture["input"].to_string();
    let result = engine
        .run(
            fixture["source"].as_str().unwrap(),
            &input,
            Budget::default(),
            &AtomicBool::new(false),
        )
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(&result.json).unwrap(),
        fixture["expected"]
    );
    assert_eq!(
        fixture["input"]["states"]["good"]["normal"]["review"]["scheduledDays"],
        10
    );
    for source in [
        "await Promise.resolve(); return {};",
        "throw Error('script'); return {};",
    ] {
        assert_eq!(
            engine
                .run(source, &input, Budget::default(), &AtomicBool::new(false))
                .unwrap_err(),
            Failure::Script
        );
    }
    let budget = Budget {
        fuel: 10_000_000,
        timeout: Duration::from_secs(1),
    };
    assert!(matches!(
        engine.run("while(true) {}", &input, budget, &AtomicBool::new(false)),
        Err(Failure::Fuel | Failure::Deadline)
    ));
}
