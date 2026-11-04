// The host clock: QueryPerformanceCounter in 100ns units ("hns").
//
// Direct3D11CaptureFrame.SystemRelativeTime is QPC expressed in 100ns units, so frames, the
// mouse hook (which reads QPC when it is called) and the commands all share one clock, and
// video time is computed the same way for all of them (recorder.rs).
use std::sync::OnceLock;
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};

pub const HNS_PER_SECOND: i64 = 10_000_000;
pub const HNS_PER_MS: f64 = 10_000.0;

fn frequency() -> i64 {
    static FREQUENCY: OnceLock<i64> = OnceLock::new();
    *FREQUENCY.get_or_init(|| {
        let mut frequency = 0i64;
        // Never fails on Windows XP and later.
        let _ = unsafe { QueryPerformanceFrequency(&mut frequency) };
        frequency.max(1)
    })
}

/// Now, in 100ns units on the QPC clock.
pub fn now_hns() -> i64 {
    let mut counter = 0i64;
    let _ = unsafe { QueryPerformanceCounter(&mut counter) };
    (counter as i128 * HNS_PER_SECOND as i128 / frequency() as i128) as i64
}

pub fn hns_to_ms(hns: i64) -> f64 {
    hns as f64 / HNS_PER_MS
}
