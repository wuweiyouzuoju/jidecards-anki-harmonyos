// SPDX-License-Identifier: AGPL-3.0-or-later
//! One process-wide job owns input, cancellation and its execution slot until release.
use crate::{Budget, Failure, Sandbox};
use std::ffi::{c_char, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Instant;

struct Job {
    id: u64,
    input: Mutex<Option<(String, String)>>,
    cancel: AtomicBool,
    started: Instant,
}

static ACTIVE: Mutex<Option<Arc<Job>>> = Mutex::new(None);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn lookup(id: u64) -> Option<Arc<Job>> {
    ACTIVE
        .lock()
        .ok()?
        .as_ref()
        .filter(|job| job.id == id)
        .cloned()
}

/// # Safety
/// Pointers reference readable UTF-8 buffers of the supplied lengths for this call.
/// Returns zero for invalid input, busy, or internal failure. No task is queued on zero.
#[no_mangle]
pub unsafe extern "C" fn sandbox_create(
    source: *const u8,
    source_len: usize,
    input: *const u8,
    input_len: usize,
) -> u64 {
    catch_unwind(AssertUnwindSafe(|| {
        if source.is_null() || input.is_null() || source_len > 65500 || input_len > 131072 {
            return 0;
        }
        let mut active = match ACTIVE.lock() {
            Ok(lock) => lock,
            Err(_) => return 0,
        };
        if active.is_some() {
            return 0;
        }
        let source =
            match std::str::from_utf8(unsafe { std::slice::from_raw_parts(source, source_len) }) {
                Ok(s) => s.to_owned(),
                Err(_) => return 0,
            };
        let input =
            match std::str::from_utf8(unsafe { std::slice::from_raw_parts(input, input_len) }) {
                Ok(s) => s.to_owned(),
                Err(_) => return 0,
            };
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        if id == 0 || id > (1_u64 << 53) - 1 {
            return 0;
        }
        *active = Some(Arc::new(Job {
            id,
            input: Mutex::new(Some((source, input))),
            cancel: AtomicBool::new(false),
            started: Instant::now(),
        }));
        id
    }))
    .unwrap_or(0)
}

fn error_code(error: &Failure) -> &'static str {
    match error {
        Failure::InputLimit => "sandbox_input_limit",
        Failure::InvalidInput => "sandbox_invalid_input",
        Failure::Cancelled => "cancelled",
        Failure::Deadline => "sandbox_deadline",
        Failure::Fuel => "sandbox_fuel",
        Failure::OutputLimit => "sandbox_output_limit",
        Failure::InvalidResult | Failure::InvalidOutput => "sandbox_invalid_result",
        Failure::Script => "sandbox_script_error",
        Failure::Initialization | Failure::Engine(_) => "sandbox_engine_error",
    }
}

fn execute(id: u64) -> String {
    let result = (|| {
        let job = lookup(id).ok_or(Failure::Cancelled)?;
        let (source, input) = job
            .input
            .lock()
            .map_err(|_| Failure::Initialization)?
            .take()
            .ok_or(Failure::Cancelled)?;
        crate::check_stop(job.started, Budget::default().timeout, &job.cancel)?;
        let sandbox = Sandbox::new()?;
        let remaining = Budget::default()
            .timeout
            .checked_sub(job.started.elapsed())
            .ok_or(Failure::Deadline)?;
        let result = sandbox.run(
            &source,
            &input,
            Budget {
                timeout: remaining,
                ..Budget::default()
            },
            &job.cancel,
        )?;
        crate::check_stop(job.started, Budget::default().timeout, &job.cancel)?;
        Ok::<_, Failure>((result, job.started.elapsed()))
    })();
    match result {
        Ok((output, elapsed)) => serde_json::json!({"ok":true, "resultJson":output.json,
            "elapsedMs":elapsed.as_secs_f64()*1000.0, "fuelUsed":output.fuel_used,
            "linearMemoryBytes":output.linear_memory_bytes})
        .to_string(),
        Err(error) => serde_json::json!({"ok":false,"error":error_code(&error)}).to_string(),
    }
}

/// Run off the UI thread exactly once per handle. The caller releases the returned string.
#[no_mangle]
pub extern "C" fn sandbox_execute(id: u64) -> *mut c_char {
    let json = catch_unwind(AssertUnwindSafe(|| execute(id)))
        .unwrap_or_else(|_| "{\"ok\":false,\"error\":\"sandbox_internal_error\"}".to_owned());
    CString::new(json)
        .expect("JSON contains no raw NUL")
        .into_raw()
}

#[no_mangle]
pub extern "C" fn sandbox_cancel(id: u64) {
    let _ = catch_unwind(|| {
        if let Some(job) = lookup(id) {
            job.cancel.store(true, Ordering::Relaxed);
        }
    });
}

/// Only the owner calls this after execution/queue failure, never to cancel active execution.
#[no_mangle]
pub extern "C" fn sandbox_release(id: u64) {
    let _ = catch_unwind(|| {
        if let Ok(mut active) = ACTIVE.lock() {
            if active.as_ref().is_some_and(|job| job.id == id) {
                *active = None;
            }
        }
    });
}

/// # Safety
/// `text` is a non-null pointer returned by sandbox_execute, freed exactly once.
#[no_mangle]
pub unsafe extern "C" fn sandbox_string_free(text: *mut c_char) {
    if !text.is_null() {
        drop(unsafe { CString::from_raw(text) });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn create(source: &str) -> u64 {
        unsafe { sandbox_create(source.as_ptr(), source.len(), b"null".as_ptr(), 4) }
    }
    fn run(id: u64) -> serde_json::Value {
        let ptr = sandbox_execute(id);
        let json = unsafe { std::ffi::CStr::from_ptr(ptr).to_str().unwrap().to_owned() };
        unsafe { sandbox_string_free(ptr) };
        serde_json::from_str(&json).unwrap()
    }
    #[test]
    fn job_ownership_cancellation_and_recovery() {
        let id = create("return 42;");
        assert_ne!(id, 0);
        assert_eq!(create("return 1;"), 0);
        sandbox_cancel(id);
        assert_eq!(run(id)["error"], "cancelled");
        sandbox_release(id);
        let next = create("return 42;");
        assert_ne!(next, id);
        sandbox_cancel(id);
        sandbox_release(id);
        assert_eq!(run(next)["resultJson"], "42");
        assert_eq!(run(next)["ok"], false);
        sandbox_release(next);
        let active = create("while(true){}");
        std::thread::scope(|scope| {
            let worker = scope.spawn(|| run(active));
            sandbox_cancel(active);
            assert_eq!(worker.join().unwrap()["error"], "cancelled");
        });
        sandbox_release(active);
        assert_eq!(
            unsafe { sandbox_create(std::ptr::null(), 1, b"null".as_ptr(), 4) },
            0
        );
    }
}
