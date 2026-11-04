// stdout events and stderr diagnostics (PROTOCOL.md → Transport).
//
// stdout carries one JSON event per line and nothing else; every thread writes through
// `emit`, which holds the stdout lock for the whole line, so lines never interleave.
// stderr is copied into Kamo's local log: technical messages only, never a path (it may hold
// the user name), a window title or anything seen on screen.
use serde_json::{Map, Value, json};
use std::io::Write;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErrorCode {
    DisplayNotFound,
    PermissionDenied,
    EncoderFailed,
    DiskFull,
    DisplayLost,
    MouseUnavailable,
    Internal,
}

impl ErrorCode {
    fn as_str(self) -> &'static str {
        match self {
            ErrorCode::DisplayNotFound => "display_not_found",
            ErrorCode::PermissionDenied => "permission_denied",
            ErrorCode::EncoderFailed => "encoder_failed",
            ErrorCode::DiskFull => "disk_full",
            ErrorCode::DisplayLost => "display_lost",
            ErrorCode::MouseUnavailable => "mouse_unavailable",
            ErrorCode::Internal => "internal",
        }
    }
}

/// Milliseconds rounded to 0.1, like the Mac helper.
pub fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn emit(value: Value) {
    let mut line = value.to_string();
    line.push('\n');
    let mut out = std::io::stdout().lock();
    // A closed stdout means main is gone; stdin EOF will stop the recording.
    let _ = out.write_all(line.as_bytes());
    let _ = out.flush();
}

pub fn ready() {
    emit(json!({ "event": "ready", "version": env!("CARGO_PKG_VERSION") }));
}

pub fn started(width: u32, height: u32, scale_factor: f64, fps: u32) {
    emit(json!({
        "event": "started",
        "width": width,
        "height": height,
        "scaleFactor": scale_factor,
        "fps": fps,
    }));
}

pub fn paused(t_ms: f64) {
    emit(json!({ "event": "paused", "tMs": round1(t_ms) }));
}

pub fn resumed(t_ms: f64) {
    emit(json!({ "event": "resumed", "tMs": round1(t_ms) }));
}

pub fn frame(file: &str, t_ms: f64) {
    emit(json!({ "event": "frame", "file": file, "tMs": round1(t_ms) }));
}

/// `fields` are those of a line of events.jsonl (t, type, x, y, button?, dx?, dy?, outside?).
pub fn mouse(fields: Map<String, Value>) {
    let mut event = Map::with_capacity(fields.len() + 1);
    event.insert("event".into(), Value::from("mouse"));
    event.extend(fields);
    emit(Value::Object(event));
}

pub fn stopped(duration_ms: f64, frames: u32) {
    emit(json!({ "event": "stopped", "durationMs": round1(duration_ms), "frames": frames }));
}

pub fn error(code: ErrorCode, message: &str, fatal: bool) {
    diag(&format!("{}: {message}", code.as_str()));
    emit(json!({ "event": "error", "code": code.as_str(), "message": message, "fatal": fatal }));
}

/// A fatal error: the helper exits non-zero without `stopped` (PROTOCOL.md).
pub fn fatal(code: ErrorCode, message: &str) -> ! {
    error(code, message, true);
    std::process::exit(1)
}

pub fn diag(message: &str) {
    eprintln!("kamo-capture: {message}");
}
