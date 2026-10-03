use jidecards_agent_sandbox::{Budget, Failure, Sandbox};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let samples = args
        .next()
        .map(|s| s.parse::<usize>())
        .transpose()?
        .unwrap_or(20);
    if !(1..=100).contains(&samples) || args.next().is_some() {
        return Err("usage: probe [samples: 1..100]".into());
    }
    let start = Instant::now();
    let sandbox = Sandbox::new().expect("compile trusted engine");
    let init_ms = start.elapsed().as_secs_f64() * 1000.0;
    let input = serde_json::to_string(
        &(0..1000)
            .map(|i| format!(" Field {} ", i % 200))
            .collect::<Vec<_>>(),
    )
    .unwrap();
    let mut workloads = Vec::new();
    for (name, source, input, expected) in [
        ("scalar", "return 6 * 7;", "null", "42".to_owned()),
        (
            "clean_deduplicate_1000",
            "return [...new Set(input.map(s => s.trim().toLowerCase()))];",
            input.as_str(),
            serde_json::to_string(&(0..200).map(|i| format!("field {i}")).collect::<Vec<_>>())?,
        ),
        (
            "sum_10000",
            "let n=0; for(let i=0;i<10000;i++) n+=i; return n;",
            "null",
            "49995000".to_owned(),
        ),
    ] {
        let mut durations = Vec::new();
        let mut max_memory = 0;
        let mut max_fuel = 0;
        for _ in 0..samples {
            let result = sandbox
                .run(source, input, Budget::default(), &AtomicBool::new(false))
                .expect(name);
            assert_eq!(result.json, expected, "{name}");
            durations.push(result.elapsed.as_secs_f64() * 1000.0);
            max_memory = max_memory.max(result.linear_memory_bytes);
            max_fuel = max_fuel.max(result.fuel_used);
        }
        workloads.push(serde_json::json!({
            "name": name, "elapsed_ms": distribution(durations),
            "max_fuel": max_fuel, "max_linear_memory_bytes": max_memory,
            "output_bytes": expected.len()
        }));
    }
    let mut cancellation = Vec::new();
    let mut memory_checkpoints =
        vec![serde_json::json!({"rounds": 0, "process": process_memory()})];
    for round in 1..=samples {
        let cancel = AtomicBool::new(false);
        std::thread::scope(|scope| {
            let task = scope.spawn(|| {
                sandbox.run(
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
            let signal_time = Instant::now();
            cancel.store(true, Ordering::Relaxed);
            assert_eq!(
                task.join().expect("worker").unwrap_err(),
                Failure::Cancelled
            );
            cancellation.push(signal_time.elapsed().as_secs_f64() * 1000.0);
        });
        // Exercise large failed allocations and poisoned execution paths before each recovery.
        for source in [
            "const parts=[]; for(let i=0;i<24;i++) parts.push(new Uint8Array(1024*1024)); return parts.length;",
            "return 'x'.repeat(65535);",
            "function f(){return f()+1} return f();",
        ] {
            assert!(
                sandbox
                    .run(source, "null", Budget::default(), &AtomicBool::new(false))
                    .is_err(),
                "{source}"
            );
            assert_eq!(
                sandbox
                    .run(
                        "return 42;",
                        "null",
                        Budget::default(),
                        &AtomicBool::new(false)
                    )
                    .unwrap()
                    .json,
                "42"
            );
        }
        if round % 10 == 0 || round == samples {
            memory_checkpoints
                .push(serde_json::json!({"rounds": round, "process": process_memory()}));
        }
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "schema_version": 1, "target_arch": std::env::consts::ARCH,
            "target_os": std::env::consts::OS, "samples": samples,
            "wasm_bytes": Sandbox::wasm_bytes(), "module_init_ms": init_ms,
            "workloads": workloads, "cancel_join_ms": distribution(cancellation),
            "memory_checkpoints": memory_checkpoints
        }))?
    );
    Ok(())
}

fn distribution(mut samples: Vec<f64>) -> serde_json::Value {
    samples.sort_by(f64::total_cmp);
    serde_json::json!({
        "min": samples[0], "median": samples[(samples.len() - 1) / 2],
        "p95": samples[(samples.len() * 95).div_ceil(100) - 1],
        "max": samples[samples.len() - 1]
    })
}

// Only the fixed measurement program reads its own process metrics, never guest code.
fn process_memory() -> serde_json::Value {
    #[cfg(target_env = "ohos")]
    {
        let status = std::fs::read_to_string("/proc/self/status").expect("process status");
        let kib = |key: &str| -> u64 {
            status
                .lines()
                .find_map(|line| line.strip_prefix(key))
                .and_then(|value| value.split_whitespace().next())
                .and_then(|value| value.parse().ok())
                .expect("process metric")
        };
        serde_json::json!({"rss_kib": kib("VmRSS:"), "high_water_kib": kib("VmHWM:")})
    }
    #[cfg(not(target_env = "ohos"))]
    {
        serde_json::Value::Null
    }
}
