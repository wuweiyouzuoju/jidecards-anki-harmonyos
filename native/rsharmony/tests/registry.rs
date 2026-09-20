// SPDX-License-Identifier: AGPL-3.0-or-later

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use jidecards_core::{BackendFailure, BackendRegistry, RawBackend, SyncAbort};

struct EchoBackend;

impl RawBackend for EchoBackend {
    fn run_method_raw(
        &mut self,
        service: u32,
        method: u32,
        input: &[u8],
    ) -> Result<Vec<u8>, BackendFailure> {
        let mut output = vec![service as u8, method as u8];
        output.extend_from_slice(input);
        Ok(output)
    }
}

#[test]
fn assigns_nonzero_unique_handles_and_routes_calls() {
    let registry = BackendRegistry::new();
    let first = registry.insert(EchoBackend);
    let second = registry.insert(EchoBackend);

    assert_ne!(first, 0);
    assert_ne!(first, second);
    assert_eq!(
        registry.call(first, 4, 9, b"payload").unwrap(),
        b"\x04\x09payload"
    );
}

#[test]
fn close_invalidates_the_handle_without_affecting_other_backends() {
    let registry = BackendRegistry::new();
    let closed = registry.insert(EchoBackend);
    let alive = registry.insert(EchoBackend);

    assert!(registry.close(closed));
    assert_eq!(
        registry.call(closed, 0, 0, b"").unwrap_err(),
        BackendFailure::HandleNotFound
    );
    assert!(registry.call(alive, 1, 2, b"").is_ok());
}

struct ConcurrencyProbe {
    active: Arc<AtomicUsize>,
    peak: Arc<AtomicUsize>,
}

impl RawBackend for ConcurrencyProbe {
    fn run_method_raw(
        &mut self,
        _service: u32,
        _method: u32,
        _input: &[u8],
    ) -> Result<Vec<u8>, BackendFailure> {
        let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
        self.peak.fetch_max(active, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(10));
        self.active.fetch_sub(1, Ordering::SeqCst);
        Ok(Vec::new())
    }
}

#[test]
fn serializes_calls_for_one_backend_instance() {
    let registry = Arc::new(BackendRegistry::new());
    let active = Arc::new(AtomicUsize::new(0));
    let peak = Arc::new(AtomicUsize::new(0));
    let handle = registry.insert(ConcurrencyProbe {
        active: Arc::clone(&active),
        peak: Arc::clone(&peak),
    });

    let workers: Vec<_> = (0..8)
        .map(|_| {
            let registry = Arc::clone(&registry);
            thread::spawn(move || registry.call(handle, 1, 1, b"").unwrap())
        })
        .collect();

    for worker in workers {
        worker.join().unwrap();
    }

    assert_eq!(peak.load(Ordering::SeqCst), 1);
}

struct CancellableBackend {
    started: std::sync::mpsc::Sender<()>,
    cancel: std::sync::mpsc::Sender<()>,
    cancelled: std::sync::mpsc::Receiver<()>,
}

impl RawBackend for CancellableBackend {
    fn sync_aborter(&self) -> Option<SyncAbort> {
        let cancel = self.cancel.clone();
        Some(Arc::new(move || {
            let _ = cancel.send(());
            Ok(Vec::new())
        }))
    }

    fn run_method_raw(&mut self, _: u32, _: u32, _: &[u8]) -> Result<Vec<u8>, BackendFailure> {
        self.started.send(()).unwrap();
        Ok(if self.cancelled.recv_timeout(Duration::from_secs(2)).is_ok() {
            b"cancelled".to_vec()
        } else {
            b"timed out".to_vec()
        })
    }
}

#[test]
fn sync_abort_bypasses_running_call_without_releasing_its_backend() {
    let registry = Arc::new(BackendRegistry::new());
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let (cancel_tx, cancel_rx) = std::sync::mpsc::channel();
    let handle = registry.insert(CancellableBackend {
        started: started_tx, cancel: cancel_tx, cancelled: cancel_rx,
    });
    let worker_registry = Arc::clone(&registry);
    let worker = thread::spawn(move || worker_registry.call(handle, 1, 3, &[]));
    started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    registry.call(handle, 1, 7, &[]).unwrap();
    assert_eq!(worker.join().unwrap().unwrap(), b"cancelled");
    assert!(registry.close(handle));
    assert_eq!(registry.call(handle, 1, 7, &[]), Err(BackendFailure::HandleNotFound));
}
