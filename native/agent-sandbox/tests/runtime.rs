use jidecards_agent_sandbox::{Budget, Failure, Sandbox};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};
use std::time::Duration;

fn sandbox() -> &'static Sandbox {
    static ENGINE: OnceLock<Sandbox> = OnceLock::new();
    ENGINE.get_or_init(|| Sandbox::new().expect("real QuickJS Wasm module"))
}

fn run(source: &str, input: &str) -> Result<String, Failure> {
    sandbox()
        .run(source, input, Budget::default(), &AtomicBool::new(false))
        .map(|out| out.json)
}

#[test]
fn cleans_and_deduplicates_fields() {
    assert_eq!(
        run(
            "return [...new Set(input.map(s => s.trim().toLowerCase()))];",
            r#"[" A ","a","B"]"#
        )
        .unwrap(),
        r#"["a","b"]"#
    );
    assert_eq!(
        run("return input;", r#"{"unicode":"你好","__proto__":{"x":1}}"#).unwrap(),
        r#"{"unicode":"你好","__proto__":{"x":1}}"#
    );
}

#[test]
fn freezes_nested_inputs_and_discards_globals() {
    assert_eq!(
        run("input.nested.x = 2; return input;", r#"{"nested":{"x":1}}"#),
        Err(Failure::Script)
    );
    assert_eq!(
        run("globalThis.secret = 7; return 1;", "null").unwrap(),
        "1"
    );
    assert_eq!(
        run("return typeof secret;", "null").unwrap(),
        r#""undefined""#
    );
}

#[test]
fn has_no_host_capabilities_or_module_loader() {
    assert_eq!(run("return [typeof fetch, typeof std, typeof os, typeof process, typeof require, typeof console];", "null").unwrap(), r#"["undefined","undefined","undefined","undefined","undefined","undefined"]"#);
    assert_eq!(
        run("return import('qjs:std');", "null"),
        Err(Failure::InvalidResult)
    );
    assert_eq!(
        run("return import('qjs:bjson');", "null"),
        Err(Failure::InvalidResult)
    );
}

#[test]
fn validates_inputs_and_bounded_outputs() {
    assert_eq!(run("return 1;", "{"), Err(Failure::InvalidInput));
    assert_eq!(run(&" ".repeat(65537), "null"), Err(Failure::InputLimit));
    assert_eq!(
        run("return input;", &format!("\"{}\"", "x".repeat(131073))),
        Err(Failure::InputLimit)
    );
    assert_eq!(
        run("return 'x'.repeat(65535);", "null"),
        Err(Failure::OutputLimit)
    );
    assert_eq!(
        run("return 'x'.repeat(65534);", "null").unwrap().len(),
        65536
    );
    for source in [
        "return undefined;",
        "return 1n;",
        "return Promise.resolve(1);",
        "const a={}; a.a=a; return a;",
    ] {
        assert_eq!(run(source, "null"), Err(Failure::InvalidResult), "{source}");
    }
}

#[test]
fn fuel_covers_execution_and_compilation() {
    let tiny = Budget {
        fuel: 1,
        timeout: Duration::from_secs(10),
    };
    assert_eq!(
        sandbox()
            .run("return 1;", "null", tiny, &AtomicBool::new(false))
            .unwrap_err(),
        Failure::Fuel
    );
    for source in [
        "while(true) {}",
        "return {toJSON(){while(true){}}};",
        "return /^(a+)+$/.test('a'.repeat(1000)+'!');",
        "return new Proxy({}, {ownKeys(){while(true){}}});",
    ] {
        let bounded = Budget {
            fuel: 5_000_000,
            timeout: Duration::from_secs(10),
        };
        assert_eq!(
            sandbox()
                .run(source, "null", bounded, &AtomicBool::new(false))
                .unwrap_err(),
            Failure::Fuel
        );
    }
    let nested = format!("return {}0{};", "(".repeat(20000), ")".repeat(20000));
    assert!(run(&nested, "null").is_err());
    assert_eq!(run("return {;", "null"), Err(Failure::Script));
}

#[test]
fn stops_on_deadline_and_live_cancellation() {
    let budget = Budget {
        fuel: u64::MAX,
        timeout: Duration::from_millis(30),
    };
    assert_eq!(
        sandbox()
            .run("while(true) {}", "null", budget, &AtomicBool::new(false))
            .unwrap_err(),
        Failure::Deadline
    );
    let cancel = AtomicBool::new(false);
    std::thread::scope(|scope| {
        let worker = scope.spawn(|| {
            sandbox().run(
                "while(true) {}",
                "null",
                Budget {
                    fuel: u64::MAX,
                    timeout: Duration::from_secs(5),
                },
                &cancel,
            )
        });
        std::thread::sleep(Duration::from_millis(30));
        cancel.store(true, Ordering::Relaxed);
        assert_eq!(worker.join().unwrap().unwrap_err(), Failure::Cancelled);
    });
    assert_eq!(run("return 42;", "null").unwrap(), "42");
}

#[test]
fn allocation_and_recursion_fail_without_poisoning_next_run() {
    assert_eq!(run("const parts=[]; for(let i=0;i<24;i++) parts.push(new Uint8Array(1024*1024)); return parts.length;", "null"), Err(Failure::Script));
    for source in [
        "return new Array(100000000).fill('x');",
        "return 'x'.repeat(100000000);",
        "return new ArrayBuffer(100000000);",
        "function f(){return f()+1} return f();",
        "throw {toString(){while(true){}}};",
    ] {
        assert!(run(source, "null").is_err(), "{source}");
        assert_eq!(run("return 42;", "null").unwrap(), "42");
    }
}

#[test]
fn cancelled_or_expired_requests_never_return_a_result() {
    assert_eq!(
        sandbox()
            .run(
                "return 42;",
                "null",
                Budget::default(),
                &AtomicBool::new(true)
            )
            .unwrap_err(),
        Failure::Cancelled
    );
    assert_eq!(
        sandbox()
            .run(
                "return 42;",
                "null",
                Budget {
                    timeout: Duration::ZERO,
                    ..Budget::default()
                },
                &AtomicBool::new(false)
            )
            .unwrap_err(),
        Failure::Deadline
    );
}
