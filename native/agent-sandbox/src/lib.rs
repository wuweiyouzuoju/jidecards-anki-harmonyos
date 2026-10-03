// SPDX-License-Identifier: AGPL-3.0-or-later
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use wasmi::{
    Config, Engine, Instance, Linker, Module, ResumableCall, Store, StoreLimits,
    StoreLimitsBuilder, Val,
};

pub mod ffi;

const WASM: &[u8] = include_bytes!("../engine/quickjs.wasm");
const MAX_SOURCE: usize = 64 * 1024;
const MAX_INPUT: usize = 128 * 1024;
const MAX_OUTPUT: usize = 64 * 1024;
const QUANTUM: u64 = 100_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Failure {
    InputLimit,
    InvalidInput,
    Cancelled,
    Deadline,
    Fuel,
    Engine(String),
    Initialization,
    Script,
    InvalidResult,
    OutputLimit,
    InvalidOutput,
}

impl From<wasmi::Error> for Failure {
    fn from(error: wasmi::Error) -> Self {
        Self::Engine(error.to_string())
    }
}

impl From<wasmi::errors::LinkerError> for Failure {
    fn from(error: wasmi::errors::LinkerError) -> Self {
        Self::Engine(error.to_string())
    }
}

impl From<wasmi::errors::InstantiationError> for Failure {
    fn from(error: wasmi::errors::InstantiationError) -> Self {
        Self::Engine(error.to_string())
    }
}

/// Trusted host budget. Source, input, heap and output limits are fixed.
pub struct Budget {
    pub fuel: u64,
    pub timeout: Duration,
}

impl Default for Budget {
    fn default() -> Self {
        Self {
            fuel: 5_000_000_000,
            timeout: Duration::from_secs(3),
        }
    }
}

#[derive(Debug)]
pub struct Output {
    pub json: String,
    pub elapsed: Duration,
    pub fuel_used: u64,
    /// Wasm linear memory high-water mark, not process RSS or total engine memory.
    pub linear_memory_bytes: usize,
}

/// Owns only the trusted compiled module. Every run creates and drops a fresh store.
pub struct Sandbox {
    engine: Engine,
    module: Module,
}

impl Sandbox {
    /// Module validation/translation is measured separately from a script's execution budget.
    pub fn new() -> Result<Self, Failure> {
        let mut config = Config::default();
        config.consume_fuel(true);
        let engine = Engine::new(&config);
        let module = Module::new(&engine, WASM)?;
        Ok(Self { engine, module })
    }

    pub fn wasm_bytes() -> usize {
        WASM.len()
    }

    /// Source is a synchronous function body with a deeply frozen JSON `input` argument.
    /// Run on a worker thread; cancellation is checked between bounded fuel slices.
    pub fn run(
        &self,
        source: &str,
        input: &str,
        budget: Budget,
        cancel: &AtomicBool,
    ) -> Result<Output, Failure> {
        let started = Instant::now();
        check_stop(started, budget.timeout, cancel)?;
        if source.len() > MAX_SOURCE || input.len() > MAX_INPUT {
            return Err(Failure::InputLimit);
        }
        serde_json::from_str::<serde_json::Value>(input).map_err(|_| Failure::InvalidInput)?;
        let wrapped = format!("(function(input) {{'use strict';\n{source}\n}})");
        if wrapped.len() > MAX_SOURCE {
            return Err(Failure::InputLimit);
        }
        let limits = StoreLimitsBuilder::new()
            .memory_size(32 * 1024 * 1024)
            .instances(1)
            .memories(1)
            .tables(1)
            .trap_on_grow_failure(true)
            .build();
        let mut store = Store::new(&self.engine, limits);
        store.limiter(|limits| limits);
        let mut linker = Linker::new(&self.engine);
        // The language core only needs a clock for its initial random seed and Date.
        // It sees a fixed epoch. libc's stdio imports are traps, never host I/O.
        linker.func_wrap(
            "wasi_snapshot_preview1",
            "clock_time_get",
            |mut caller: wasmi::Caller<'_, StoreLimits>,
             _clock: i32,
             _precision: i64,
             ptr: i32|
             -> Result<i32, wasmi::Error> {
                let memory = caller
                    .get_export("memory")
                    .and_then(|e| e.into_memory())
                    .ok_or_else(|| wasmi::Error::new("missing memory"))?;
                memory
                    .write(&mut caller, ptr as u32 as usize, &[0; 8])
                    .map_err(|_| wasmi::Error::new("invalid clock pointer"))?;
                Ok(0)
            },
        )?;
        linker.func_wrap(
            "wasi_snapshot_preview1",
            "fd_close",
            |_fd: i32| -> Result<i32, wasmi::Error> {
                Err(wasmi::Error::new("file descriptors are unavailable"))
            },
        )?;
        linker.func_wrap(
            "wasi_snapshot_preview1",
            "fd_fdstat_get",
            |_fd: i32, _ptr: i32| -> Result<i32, wasmi::Error> {
                Err(wasmi::Error::new("file descriptors are unavailable"))
            },
        )?;
        linker.func_wrap(
            "wasi_snapshot_preview1",
            "fd_seek",
            |_fd: i32, _offset: i64, _whence: i32, _ptr: i32| -> Result<i32, wasmi::Error> {
                Err(wasmi::Error::new("file descriptors are unavailable"))
            },
        )?;
        linker.func_wrap(
            "wasi_snapshot_preview1",
            "fd_write",
            |_fd: i32, _iovs: i32, _count: i32, _ptr: i32| -> Result<i32, wasmi::Error> {
                Err(wasmi::Error::new("file descriptors are unavailable"))
            },
        )?;
        let instance = linker
            .instantiate(&mut store, &self.module)?
            .ensure_no_start(&mut store)?;
        let mut task = Task {
            store,
            instance,
            started,
            budget,
            cancel,
            granted: 0,
        };
        task.call("_initialize", &[], &mut [])?;
        let source_ptr = task.int("source_ptr", &[])?;
        let input_ptr = task.int("input_ptr", &[])?;
        let memory = instance
            .get_memory(&task.store, "memory")
            .ok_or(Failure::InvalidOutput)?;
        memory
            .write(
                &mut task.store,
                source_ptr as u32 as usize,
                wrapped.as_bytes(),
            )
            .map_err(|_| Failure::InvalidInput)?;
        memory
            .write(&mut task.store, input_ptr as u32 as usize, input.as_bytes())
            .map_err(|_| Failure::InvalidInput)?;
        let status = task.int(
            "run",
            &[Val::I32(wrapped.len() as i32), Val::I32(input.len() as i32)],
        )?;
        match status {
            0 => {}
            1 => return Err(Failure::InputLimit),
            2 => return Err(Failure::Initialization),
            3 => return Err(Failure::InvalidInput),
            4 => return Err(Failure::Script),
            5 => return Err(Failure::InvalidResult),
            6 => return Err(Failure::OutputLimit),
            _ => return Err(Failure::Engine(format!("unknown guest status {status}"))),
        }
        let ptr = task.int("output_ptr", &[])? as u32 as usize;
        let len = task.int("output_len", &[])? as u32 as usize;
        if len > MAX_OUTPUT {
            return Err(Failure::OutputLimit);
        }
        let data = memory
            .data(&task.store)
            .get(ptr..ptr.checked_add(len).ok_or(Failure::InvalidOutput)?)
            .ok_or(Failure::InvalidOutput)?;
        let json = std::str::from_utf8(data)
            .map_err(|_| Failure::InvalidOutput)?
            .to_owned();
        serde_json::from_str::<serde_json::Value>(&json).map_err(|_| Failure::InvalidOutput)?;
        check_stop(started, task.budget.timeout, cancel)?;
        Ok(Output {
            json,
            elapsed: started.elapsed(),
            fuel_used: task.granted - task.store.get_fuel()?,
            linear_memory_bytes: memory.data_size(&task.store),
        })
    }
}

struct Task<'a> {
    store: Store<StoreLimits>,
    instance: Instance,
    started: Instant,
    budget: Budget,
    cancel: &'a AtomicBool,
    granted: u64,
}

impl Task<'_> {
    fn refill(&mut self, required: u64) -> Result<(), Failure> {
        check_stop(self.started, self.budget.timeout, self.cancel)?;
        let left = self.store.get_fuel()?;
        let add = QUANTUM
            .max(required.saturating_sub(left))
            .min(self.budget.fuel - self.granted);
        if add == 0 || left + add < required {
            return Err(Failure::Fuel);
        }
        self.store.set_fuel(left + add)?;
        self.granted += add;
        Ok(())
    }

    fn call(&mut self, name: &str, args: &[Val], outputs: &mut [Val]) -> Result<(), Failure> {
        check_stop(self.started, self.budget.timeout, self.cancel)?;
        if self.store.get_fuel()? == 0 {
            self.refill(1)?;
        }
        let func = self
            .instance
            .get_func(&self.store, name)
            .ok_or_else(|| Failure::Engine(format!("missing {name}")))?;
        let mut state = func.call_resumable(&mut self.store, args, outputs)?;
        loop {
            match state {
                ResumableCall::Finished => {
                    return check_stop(self.started, self.budget.timeout, self.cancel)
                }
                ResumableCall::HostTrap(trap) => return Err(trap.into_host_error().into()),
                ResumableCall::OutOfFuel(call) => {
                    self.refill(call.required_fuel())?;
                    state = call.resume(&mut self.store, outputs)?;
                }
            }
        }
    }

    fn int(&mut self, name: &str, args: &[Val]) -> Result<i32, Failure> {
        let mut out = [Val::I32(0)];
        self.call(name, args, &mut out)?;
        out[0].i32().ok_or(Failure::InvalidOutput)
    }
}

fn check_stop(started: Instant, timeout: Duration, cancel: &AtomicBool) -> Result<(), Failure> {
    if cancel.load(Ordering::Relaxed) {
        return Err(Failure::Cancelled);
    }
    if started.elapsed() >= timeout {
        return Err(Failure::Deadline);
    }
    Ok(())
}
