use sha2::{Digest, Sha256};
use std::fs;

fn main() {
    for path in ["engine/quickjs.wasm", "guest.c", "engine/SHA256SUMS"] {
        println!("cargo:rerun-if-changed={path}");
    }
    let checksums = fs::read_to_string("engine/SHA256SUMS").expect("engine provenance missing");
    for line in checksums.lines() {
        let (expected, path) = line.split_once("  ").expect("invalid engine checksum");
        let bytes = fs::read(path).expect("pinned engine input missing");
        assert_eq!(
            format!("{:x}", Sha256::digest(bytes)),
            expected,
            "{path} changed: rebuild and review the pinned engine before updating SHA256SUMS"
        );
    }
}
