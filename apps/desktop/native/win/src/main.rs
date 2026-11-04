// kamo-capture (Windows): the native capture helper of the desktop app (D-023).
//
// Records one monitor with Windows Graphics Capture (no system cursor, D-005), encodes H.264
// into a fragmented MP4 with Media Foundation, writes the reference JPEGs and emits the mouse
// events (F-03, mouse only: AGENTS.md rule 2), talking to the Electron main process over stdio.
// The protocol is apps/desktop/src/main/capture/PROTOCOL.md; protocol.ts is the source of truth.
mod capture;
mod clock;
mod encoder;
mod gpu;
mod mouse;
mod out;
mod protocol;
mod recorder;
mod thumbs;

use recorder::{Msg, Recorder};
use std::io::BufRead;
use std::sync::mpsc::{RecvTimeoutError, channel};
use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize};
use windows::Win32::UI::HiDpi::{
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext,
};

fn main() {
    // panic = "abort": say so on stdout before the process goes away.
    std::panic::set_hook(Box::new(|info| {
        let place = info
            .location()
            .map(|l| format!(" at {}:{}", l.file(), l.line()))
            .unwrap_or_default();
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_default();
        out::error(
            out::ErrorCode::Internal,
            &format!("panic{place}: {message}"),
            true,
        );
    }));

    // Physical pixels everywhere: monitor rects, the mouse hook's points, the capture size.
    if let Err(e) =
        unsafe { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) }
    {
        out::diag(&format!("per-monitor DPI awareness not set: {e}"));
    }
    if let Err(e) = unsafe { RoInitialize(RO_INIT_MULTITHREADED) } {
        out::diag(&format!("RoInitialize: {e}"));
    }

    let (tx, rx) = channel::<Msg>();
    let stdin_tx = tx.clone();
    std::thread::Builder::new()
        .name("stdin".into())
        .spawn(move || {
            for line in std::io::stdin().lock().split(b'\n') {
                let Ok(line) = line else { break };
                let line = String::from_utf8_lossy(&line);
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let msg = match protocol::parse(line) {
                    Ok(command) => Msg::Command(command),
                    Err(problem) => Msg::BadCommand(problem),
                };
                if stdin_tx.send(msg).is_err() {
                    return;
                }
            }
            // stdin EOF means stop (main went away).
            let _ = stdin_tx.send(Msg::StdinClosed);
        })
        .expect("spawn the stdin thread");

    out::ready();
    let mut recorder = Recorder::new(tx);
    loop {
        match rx.recv_timeout(recorder.next_wakeup()) {
            Ok(msg) => recorder.handle(msg),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        recorder.tick();
    }
}
