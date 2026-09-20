// SPDX-License-Identifier: AGPL-3.0-or-later

use std::collections::HashMap;
use std::mem::ManuallyDrop;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::ptr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

pub const STATUS_OK: i32 = 0;
pub const STATUS_INVALID_ARGUMENT: i32 = 1;
pub const STATUS_HANDLE_NOT_FOUND: i32 = 2;
pub const STATUS_BACKEND_ERROR: i32 = 3;
pub const STATUS_NATIVE_FATAL: i32 = 4;

#[repr(C)]
#[derive(Debug)]
pub struct AnkiBuffer {
    pub ptr: *mut u8,
    pub len: usize,
    pub cap: usize,
}

impl AnkiBuffer {
    fn from_vec(bytes: Vec<u8>) -> Self {
        if bytes.is_empty() {
            return Self::default();
        }
        let mut bytes = ManuallyDrop::new(bytes);
        Self {
            ptr: bytes.as_mut_ptr(),
            len: bytes.len(),
            cap: bytes.capacity(),
        }
    }
}

impl Default for AnkiBuffer {
    fn default() -> Self {
        Self {
            ptr: ptr::null_mut(),
            len: 0,
            cap: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendFailure {
    HandleNotFound,
    Poisoned,
    Backend(Vec<u8>),
}

pub type SyncAbort = Arc<dyn Fn() -> Result<Vec<u8>, BackendFailure> + Send + Sync>;

pub trait RawBackend: Send + 'static {
    /// 独立取消通道只触发 Core 的取消句柄，不读取或写入集合。
    fn sync_aborter(&self) -> Option<SyncAbort> {
        None
    }

    fn run_method_raw(
        &mut self,
        service: u32,
        method: u32,
        input: &[u8],
    ) -> Result<Vec<u8>, BackendFailure>;
}

struct BackendEntry {
    backend: Mutex<Box<dyn RawBackend>>,
    sync_abort: Option<SyncAbort>,
}

type SharedBackend = Arc<BackendEntry>;

pub struct BackendRegistry {
    next_handle: AtomicU32,
    backends: Mutex<HashMap<u32, SharedBackend>>,
}

impl BackendRegistry {
    pub fn new() -> Self {
        Self {
            next_handle: AtomicU32::new(1),
            backends: Mutex::new(HashMap::new()),
        }
    }

    pub fn insert<B: RawBackend>(&self, backend: B) -> u32 {
        let mut backends = match self.backends.lock() {
            Ok(backends) => backends,
            Err(_) => return 0,
        };
        if backends.len() >= u32::MAX as usize {
            return 0;
        }
        loop {
            let handle = self.next_handle.fetch_add(1, Ordering::Relaxed);
            if handle != 0 && !backends.contains_key(&handle) {
                let sync_abort = backend.sync_aborter();
                backends.insert(handle, Arc::new(BackendEntry {
                    backend: Mutex::new(Box::new(backend)),
                    sync_abort,
                }));
                return handle;
            }
        }
    }

    pub fn call(
        &self,
        handle: u32,
        service: u32,
        method: u32,
        input: &[u8],
    ) -> Result<Vec<u8>, BackendFailure> {
        let backend = self
            .backends
            .lock()
            .map_err(|_| BackendFailure::Poisoned)?
            .get(&handle)
            .cloned()
            .ok_or(BackendFailure::HandleNotFound)?;
        // Anki 26.05 BackendSyncService.AbortSync：不得排在网络调用的锁后。
        if service == 1 && method == 7 && input.is_empty() {
            return match &backend.sync_abort {
                Some(abort) => abort(),
                None => Err(BackendFailure::Backend(Vec::new())),
            };
        }
        let result = backend.backend
            .lock()
            .map_err(|_| BackendFailure::Poisoned)?
            .run_method_raw(service, method, input);
        result
    }

    pub fn close(&self, handle: u32) -> bool {
        self.backends
            .lock()
            .map(|mut backends| backends.remove(&handle).is_some())
            .unwrap_or(false)
    }
}

impl Default for BackendRegistry {
    fn default() -> Self {
        Self::new()
    }
}

static BACKENDS: OnceLock<BackendRegistry> = OnceLock::new();

fn global_backends() -> &'static BackendRegistry {
    BACKENDS.get_or_init(BackendRegistry::new)
}

unsafe fn set_buffer(target: *mut AnkiBuffer, value: Vec<u8>) {
    if !target.is_null() {
        unsafe { target.write(AnkiBuffer::from_vec(value)) };
    }
}

unsafe fn set_error(target: *mut AnkiBuffer, message: &str) {
    unsafe { set_buffer(target, message.as_bytes().to_vec()) };
}

unsafe fn call_with_registry(
    registry: &BackendRegistry,
    handle: u32,
    service: u32,
    method: u32,
    input_ptr: *const u8,
    input_len: usize,
    out_result: *mut AnkiBuffer,
    out_error: *mut AnkiBuffer,
) -> i32 {
    if out_result.is_null() || out_error.is_null() {
        return STATUS_INVALID_ARGUMENT;
    }
    unsafe {
        out_result.write(AnkiBuffer::default());
        out_error.write(AnkiBuffer::default());
    }
    if input_len > 0 && input_ptr.is_null() {
        unsafe { set_error(out_error, "input pointer is null") };
        return STATUS_INVALID_ARGUMENT;
    }

    let input = if input_len == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(input_ptr, input_len) }
    };

    match catch_unwind(AssertUnwindSafe(|| {
        registry.call(handle, service, method, input)
    })) {
        Ok(Ok(output)) => {
            unsafe { set_buffer(out_result, output) };
            STATUS_OK
        }
        Ok(Err(BackendFailure::HandleNotFound)) => {
            unsafe { set_error(out_error, "backend handle not found") };
            STATUS_HANDLE_NOT_FOUND
        }
        Ok(Err(BackendFailure::Poisoned)) => {
            unsafe { set_error(out_error, "native backend state is unavailable") };
            STATUS_NATIVE_FATAL
        }
        Ok(Err(BackendFailure::Backend(message))) => {
            unsafe { set_buffer(out_error, message) };
            STATUS_BACKEND_ERROR
        }
        Err(_) => {
            unsafe { set_error(out_error, "native backend panicked") };
            STATUS_NATIVE_FATAL
        }
    }
}

#[cfg(feature = "anki-core")]
struct AnkiBackend(anki::backend::Backend);

#[cfg(feature = "anki-core")]
impl RawBackend for AnkiBackend {
    fn sync_aborter(&self) -> Option<SyncAbort> {
        let backend = self.0.clone();
        Some(Arc::new(move || {
            backend.run_service_method(1, 7, &[]).map_err(BackendFailure::Backend)
        }))
    }

    fn run_method_raw(
        &mut self,
        service: u32,
        method: u32,
        input: &[u8],
    ) -> Result<Vec<u8>, BackendFailure> {
        self.0
            .run_service_method(service, method, input)
            .map_err(BackendFailure::Backend)
    }
}

#[no_mangle]
pub unsafe extern "C" fn anki_backend_open(
    init_ptr: *const u8,
    init_len: usize,
    out_handle: *mut u32,
    out_error: *mut AnkiBuffer,
) -> i32 {
    if out_handle.is_null() || out_error.is_null() {
        return STATUS_INVALID_ARGUMENT;
    }
    unsafe {
        out_handle.write(0);
        out_error.write(AnkiBuffer::default());
    }
    if init_len > 0 && init_ptr.is_null() {
        unsafe { set_error(out_error, "init pointer is null") };
        return STATUS_INVALID_ARGUMENT;
    }
    let init = if init_len == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(init_ptr, init_len) }
    };

    #[cfg(feature = "anki-core")]
    {
        return match catch_unwind(AssertUnwindSafe(|| anki::backend::init_backend(init))) {
            Ok(Ok(backend)) => {
                let registered = catch_unwind(AssertUnwindSafe(|| {
                    global_backends().insert(AnkiBackend(backend))
                }));
                match registered {
                    Ok(handle) if handle != 0 => {
                        unsafe { out_handle.write(handle) };
                        STATUS_OK
                    }
                    Ok(_) => {
                        unsafe { set_error(out_error, "native backend registry is unavailable") };
                        STATUS_NATIVE_FATAL
                    }
                    Err(_) => {
                        unsafe {
                            set_error(out_error, "native backend panicked during registration")
                        };
                        STATUS_NATIVE_FATAL
                    }
                }
            }
            Ok(Err(message)) => {
                unsafe { set_error(out_error, &message) };
                STATUS_BACKEND_ERROR
            }
            Err(_) => {
                unsafe { set_error(out_error, "native backend panicked during initialization") };
                STATUS_NATIVE_FATAL
            }
        };
    }

    #[cfg(not(feature = "anki-core"))]
    {
        let _ = init;
        unsafe { set_error(out_error, "anki-core feature is disabled") };
        STATUS_BACKEND_ERROR
    }
}

#[no_mangle]
pub unsafe extern "C" fn anki_backend_call(
    handle: u32,
    service: u32,
    method: u32,
    input_ptr: *const u8,
    input_len: usize,
    out_result: *mut AnkiBuffer,
    out_error: *mut AnkiBuffer,
) -> i32 {
    unsafe {
        call_with_registry(
            global_backends(),
            handle,
            service,
            method,
            input_ptr,
            input_len,
            out_result,
            out_error,
        )
    }
}

#[no_mangle]
pub extern "C" fn anki_backend_close(handle: u32) -> i32 {
    if global_backends().close(handle) {
        STATUS_OK
    } else {
        STATUS_HANDLE_NOT_FOUND
    }
}

#[no_mangle]
pub unsafe extern "C" fn anki_buffer_free(buffer: AnkiBuffer) {
    if !buffer.ptr.is_null() {
        unsafe {
            drop(Vec::from_raw_parts(buffer.ptr, buffer.len, buffer.cap));
        }
    }
}

#[cfg(test)]
mod ffi_tests {
    use super::*;

    struct PanicBackend;

    impl RawBackend for PanicBackend {
        fn run_method_raw(
            &mut self,
            _service: u32,
            _method: u32,
            _input: &[u8],
        ) -> Result<Vec<u8>, BackendFailure> {
            panic!("card content must never escape through a panic")
        }
    }

    fn buffer_text(buffer: &AnkiBuffer) -> String {
        if buffer.ptr.is_null() || buffer.len == 0 {
            return String::new();
        }
        let bytes = unsafe { std::slice::from_raw_parts(buffer.ptr, buffer.len) };
        String::from_utf8_lossy(bytes).into_owned()
    }

    #[test]
    fn ffi_rejects_a_null_input_with_nonzero_length() {
        let registry = BackendRegistry::new();
        let mut output = AnkiBuffer::default();
        let mut error = AnkiBuffer::default();

        let status = unsafe {
            call_with_registry(
                &registry,
                1,
                1,
                1,
                std::ptr::null(),
                4,
                &mut output,
                &mut error,
            )
        };

        assert_eq!(status, STATUS_INVALID_ARGUMENT);
        assert_eq!(buffer_text(&error), "input pointer is null");
        unsafe { anki_buffer_free(error) };
    }

    #[test]
    fn ffi_returns_owned_output_and_reports_missing_handles() {
        let registry = BackendRegistry::new();
        let mut output = AnkiBuffer::default();
        let mut error = AnkiBuffer::default();

        let status = unsafe {
            call_with_registry(
                &registry,
                42,
                1,
                1,
                std::ptr::null(),
                0,
                &mut output,
                &mut error,
            )
        };

        assert_eq!(status, STATUS_HANDLE_NOT_FOUND);
        assert_eq!(buffer_text(&error), "backend handle not found");
        unsafe { anki_buffer_free(error) };
    }

    #[test]
    fn ffi_contains_panics_and_returns_a_sanitized_error() {
        let registry = BackendRegistry::new();
        let handle = registry.insert(PanicBackend);
        let mut output = AnkiBuffer::default();
        let mut error = AnkiBuffer::default();

        let status = unsafe {
            call_with_registry(
                &registry,
                handle,
                1,
                1,
                std::ptr::null(),
                0,
                &mut output,
                &mut error,
            )
        };

        assert_eq!(status, STATUS_NATIVE_FATAL);
        assert_eq!(buffer_text(&error), "native backend panicked");
        unsafe { anki_buffer_free(error) };
    }

    #[test]
    fn insert_returns_zero_when_the_registry_lock_is_poisoned() {
        let registry = BackendRegistry::new();
        let poisoned = catch_unwind(AssertUnwindSafe(|| {
            let _guard = registry.backends.lock().unwrap();
            panic!("poison the registry mutex");
        }));
        assert!(poisoned.is_err());

        assert_eq!(registry.insert(PanicBackend), 0);
    }

    #[cfg(feature = "anki-core")]
    #[test]
    fn ffi_opens_and_closes_an_anki_backend_from_default_proto() {
        let mut handle = 0_u32;
        let mut error = AnkiBuffer::default();

        let status = unsafe { anki_backend_open(std::ptr::null(), 0, &mut handle, &mut error) };

        assert_eq!(status, STATUS_OK, "{}", buffer_text(&error));
        assert_ne!(handle, 0);
        assert_eq!(anki_backend_close(handle), STATUS_OK);
        unsafe { anki_buffer_free(error) };
    }

    #[cfg(feature = "anki-core")]
    #[test]
    fn real_core_abort_releases_a_slow_network_sync_and_collection_can_be_read_again() {
        use std::io::Read;
        use std::net::TcpListener;
        use std::sync::mpsc;
        use std::time::{Duration, SystemTime, UNIX_EPOCH};

        fn bytes_field(number: u8, value: &[u8], output: &mut Vec<u8>) {
            output.push((number << 3) | 2);
            let mut length = value.len();
            while length >= 128 {
                output.push((length as u8 & 127) | 128);
                length >>= 7;
            }
            output.push(length as u8);
            output.extend_from_slice(value);
        }

        let temp = std::env::temp_dir().canonicalize().unwrap();
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let folder = temp.join(format!("jidecards-sync-test-{unique}"));
        std::fs::create_dir(&folder).unwrap();
        let registry = Arc::new(BackendRegistry::new());
        let handle = registry.insert(AnkiBackend(anki::backend::init_backend(&[]).unwrap()));
        let mut open = Vec::new();
        for (number, name) in [(1, "collection.anki2"), (2, "collection.media"), (3, "collection.media.db")] {
            bytes_field(number, folder.join(name).to_str().unwrap().as_bytes(), &mut open);
        }
        registry.call(handle, 3, 0, &open).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}/", listener.local_addr().unwrap());
        let mut auth = Vec::new();
        bytes_field(1, b"test", &mut auth);
        bytes_field(2, endpoint.as_bytes(), &mut auth);
        auth.extend_from_slice(&[24, 2]); // 2-second network timeout bounds a failed test.
        let mut request = Vec::new();
        bytes_field(1, &auth, &mut request);
        let (finished_tx, finished_rx) = mpsc::channel();
        let worker_registry = Arc::clone(&registry);
        let worker = std::thread::spawn(move || {
            finished_tx.send(worker_registry.call(handle, 1, 5, &request)).unwrap();
        });
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut stream = loop {
            match listener.accept() {
                Ok((stream, _)) => break stream,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    assert!(std::time::Instant::now() < deadline, "sync did not contact the local server");
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(error) => panic!("{error}"),
            }
        };
        stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        assert!(stream.read(&mut [0; 1024]).unwrap() > 0);
        registry.call(handle, 1, 7, &[]).unwrap();
        let result = finished_rx.recv_timeout(Duration::from_secs(1)).expect("abort waited for the network timeout");
        assert!(matches!(result, Err(BackendFailure::Backend(_))));
        worker.join().unwrap();
        registry.call(handle, 7, 4, &[]).expect("collection unavailable after abort");
        registry.call(handle, 3, 1, &[]).unwrap();
        registry.close(handle);
        drop(stream);
        drop(listener);
        let resolved = folder.canonicalize().unwrap();
        assert!(resolved.starts_with(&temp) && resolved != temp);
        std::fs::remove_dir_all(resolved).unwrap();
    }
}
