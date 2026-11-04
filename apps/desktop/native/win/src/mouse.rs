// Mouse events for F-03 (D-003, D-023): a low-level MOUSE hook (WH_MOUSE_LL) and nothing else.
// AGENTS.md rule 2: Kamo never captures the keyboard, so this helper installs no other hook and
// calls no keyboard API; `pnpm guard:keyboard` fails CI otherwise.
//
// The hook runs on its own thread with a GetMessage loop (low-level hooks are called on the
// thread that installed them, through its message loop) and only reads the event: it stamps it
// with QPC, the clock of the video frames, hands it to the recorder and lets it through. All
// the rest (video pixels, video time, the ~60Hz throttle) happens in MouseTrack, on the
// recorder's thread.
use crate::clock::now_hns;
use crate::out::round1;
use serde_json::{Map, Value};
use std::cell::RefCell;
use std::sync::mpsc::sync_channel;
use std::thread::JoinHandle;
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Button {
    Left,
    Right,
    Middle,
}

impl Button {
    fn as_str(self) -> &'static str {
        match self {
            Button::Left => "left",
            Button::Right => "right",
            Button::Middle => "middle",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Kind {
    Move,
    Down(Button),
    Up(Button),
    /// Wheel notches (120 = one notch), horizontal and vertical, with the OS sign.
    Scroll {
        dx: i32,
        dy: i32,
    },
}

/// One event as the hook saw it: physical screen pixels (the process is per-monitor DPI aware)
/// and the QPC clock in 100ns units.
#[derive(Clone, Copy, Debug)]
pub struct RawMouse {
    pub kind: Kind,
    pub hns: i64,
    pub x: i32,
    pub y: i32,
}

type Deliver = Box<dyn Fn(RawMouse)>;

thread_local! {
    // The hook procedure runs on the hook thread; this is where it delivers.
    static DELIVER: RefCell<Option<Deliver>> = const { RefCell::new(None) };
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 && lparam.0 != 0 {
        let info = unsafe { &*(lparam.0 as *const MSLLHOOKSTRUCT) };
        // The high word of mouseData is the signed wheel delta.
        let wheel = (info.mouseData >> 16) as u16 as i16 as i32;
        let kind = match wparam.0 as u32 {
            WM_MOUSEMOVE => Some(Kind::Move),
            WM_LBUTTONDOWN => Some(Kind::Down(Button::Left)),
            WM_LBUTTONUP => Some(Kind::Up(Button::Left)),
            WM_RBUTTONDOWN => Some(Kind::Down(Button::Right)),
            WM_RBUTTONUP => Some(Kind::Up(Button::Right)),
            WM_MBUTTONDOWN => Some(Kind::Down(Button::Middle)),
            WM_MBUTTONUP => Some(Kind::Up(Button::Middle)),
            WM_MOUSEWHEEL => Some(Kind::Scroll { dx: 0, dy: wheel }),
            WM_MOUSEHWHEEL => Some(Kind::Scroll { dx: wheel, dy: 0 }),
            // X buttons (back, forward) are not in the events.jsonl format
            _ => None,
        };
        if let Some(kind) = kind {
            let raw = RawMouse {
                kind,
                hns: now_hns(),
                x: info.pt.x,
                y: info.pt.y,
            };
            DELIVER.with(|d| {
                if let Some(deliver) = d.borrow().as_ref() {
                    deliver(raw);
                }
            });
        }
    }
    // Observe only: the event always goes on to the next hook and the system.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

pub struct MouseHook {
    thread_id: u32,
    thread: Option<JoinHandle<()>>,
}

impl MouseHook {
    /// Installs the hook on a new thread. `deliver` runs on that thread for every event.
    pub fn start(deliver: impl Fn(RawMouse) + Send + 'static) -> Result<MouseHook, String> {
        let (ready_tx, ready_rx) = sync_channel::<Result<u32, String>>(1);
        let thread = std::thread::Builder::new()
            .name("mouse-hook".into())
            .spawn(move || {
                let mut msg = MSG::default();
                unsafe {
                    // Creates the thread's message queue, so stop() can post WM_QUIT right away.
                    let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
                }
                DELIVER.with(|d| *d.borrow_mut() = Some(Box::new(deliver)));
                let module = unsafe { GetModuleHandleW(None) }.ok().map(Into::into);
                let hook = match unsafe {
                    SetWindowsHookExW(WH_MOUSE_LL, Some(hook_proc), module, 0)
                } {
                    Ok(hook) => hook,
                    Err(e) => {
                        let _ = ready_tx.send(Err(format!("cannot install the mouse hook: {e}")));
                        return;
                    }
                };
                let _ = ready_tx.send(Ok(unsafe { GetCurrentThreadId() }));
                // Returns 0 on WM_QUIT (stop) and -1 on error.
                while unsafe { GetMessageW(&mut msg, None, 0, 0) }.0 > 0 {
                    unsafe {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }
                let _ = unsafe { UnhookWindowsHookEx(hook) };
                DELIVER.with(|d| *d.borrow_mut() = None);
            })
            .map_err(|e| format!("cannot start the mouse thread: {e}"))?;
        match ready_rx.recv() {
            Ok(Ok(thread_id)) => Ok(MouseHook {
                thread_id,
                thread: Some(thread),
            }),
            Ok(Err(problem)) => {
                let _ = thread.join();
                Err(problem)
            }
            Err(_) => Err("the mouse thread ended before installing the hook".into()),
        }
    }

    pub fn stop(&mut self) {
        if let Some(thread) = self.thread.take() {
            let _ = unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) };
            let _ = thread.join();
        }
    }
}

impl Drop for MouseHook {
    fn drop(&mut self) {
        self.stop();
    }
}

/// A little under 1/60 s, so a 60Hz stream of events is not halved by jitter (100ns units).
const INTERVAL_HNS: i64 = 10_000_000 / 60 - 20_000;

/// One wheel notch scrolls about 100 DIP in Chromium and most Windows apps (3 lines).
const DIP_PER_NOTCH: f64 = 100.0;

/// Where the recorded monitor is and how big the video is.
#[derive(Clone, Copy, Debug)]
pub struct Geometry {
    /// The monitor in physical virtual-screen pixels (GetMonitorInfo, per-monitor DPI aware).
    pub rect: RECT,
    pub video_width: u32,
    pub video_height: u32,
    /// Physical pixels per DIP on that monitor (its DPI / 96).
    pub dpi_scale: f64,
}

impl Geometry {
    fn contains(&self, x: i32, y: i32) -> bool {
        // RECT is right/bottom exclusive, which PtInRect would also say.
        let p = POINT { x, y };
        p.x >= self.rect.left
            && p.x < self.rect.right
            && p.y >= self.rect.top
            && p.y < self.rect.bottom
    }

    /// Video pixels per physical pixel, on each axis.
    fn scale(&self) -> (f64, f64) {
        let w = (self.rect.right - self.rect.left).max(1) as f64;
        let h = (self.rect.bottom - self.rect.top).max(1) as f64;
        (self.video_width as f64 / w, self.video_height as f64 / h)
    }

    fn video_point(&self, x: i32, y: i32) -> (f64, f64) {
        let (sx, sy) = self.scale();
        (
            round1((x - self.rect.left) as f64 * sx),
            round1((y - self.rect.top) as f64 * sy),
        )
    }
}

/// Turns raw events into protocol `mouse` events (PROTOCOL.md → Mouse events): video pixels of
/// the recorded monitor, video time, moves and scrolls thinned to ~60Hz.
///
/// Off the recorded monitor: moves go out with `outside: true`; `down` and `scroll` are not
/// sent; an `up` is sent only when its `down` was, clamped to the edge, so a drag that leaves
/// the monitor still ends.
pub struct MouseTrack {
    pub geometry: Geometry,
    pending_move: Option<RawMouse>,
    pending_scroll: Option<RawMouse>,
    last_move: i64,
    last_scroll: i64,
    pressed: Vec<Button>,
    /// Where events go: stdout (out::mouse), or a list in the tests.
    sink: Box<dyn FnMut(Map<String, Value>)>,
}

impl MouseTrack {
    pub fn new(geometry: Geometry) -> MouseTrack {
        Self::with_sink(geometry, Box::new(crate::out::mouse))
    }

    fn with_sink(geometry: Geometry, sink: Box<dyn FnMut(Map<String, Value>)>) -> MouseTrack {
        MouseTrack {
            geometry,
            pending_move: None,
            pending_scroll: None,
            last_move: i64::MIN / 2,
            last_scroll: i64::MIN / 2,
            pressed: Vec::new(),
            sink,
        }
    }

    /// `video_ms` maps a QPC time to video ms, or None when that moment is not in the video
    /// (before the first frame, while paused, during a pause, stopping).
    pub fn add(&mut self, raw: RawMouse, video_ms: &dyn Fn(i64) -> Option<f64>) {
        match raw.kind {
            Kind::Move => {
                if raw.hns - self.last_move >= INTERVAL_HNS {
                    self.pending_move = None;
                    self.emit_move(raw, video_ms);
                } else {
                    // Held back, not dropped: the last position before the pointer rests must go out.
                    self.pending_move = Some(raw);
                }
            }
            Kind::Scroll { dx, dy } => {
                let mut merged = raw;
                if let Some(RawMouse {
                    kind: Kind::Scroll { dx: px, dy: py },
                    ..
                }) = self.pending_scroll
                {
                    merged.kind = Kind::Scroll {
                        dx: dx + px,
                        dy: dy + py,
                    };
                }
                if raw.hns - self.last_scroll >= INTERVAL_HNS {
                    self.pending_scroll = None;
                    self.emit_scroll(merged, video_ms);
                } else {
                    self.pending_scroll = Some(merged);
                }
            }
            Kind::Down(button) | Kind::Up(button) => {
                // The position just before a click goes out before the click.
                self.flush(video_ms);
                self.emit_button(raw, button, video_ms);
            }
        }
    }

    /// When the held-back events are due (QPC, 100ns), if any: one interval after the last
    /// event that went out, so the stream stays at ~60Hz.
    pub fn flush_due(&self) -> Option<i64> {
        let mv = self.pending_move.map(|_| self.last_move + INTERVAL_HNS);
        let sc = self.pending_scroll.map(|_| self.last_scroll + INTERVAL_HNS);
        match (mv, sc) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        }
    }

    /// Sends what the throttle holds back. Called when due, before `paused` and before `stopped`.
    pub fn flush(&mut self, video_ms: &dyn Fn(i64) -> Option<f64>) {
        if let Some(raw) = self.pending_move.take() {
            self.emit_move(raw, video_ms);
        }
        if let Some(raw) = self.pending_scroll.take() {
            self.emit_scroll(raw, video_ms);
        }
    }

    fn emit_move(&mut self, raw: RawMouse, video_ms: &dyn Fn(i64) -> Option<f64>) {
        let Some(t) = video_ms(raw.hns) else { return };
        self.last_move = raw.hns;
        let (x, y) = self.geometry.video_point(raw.x, raw.y);
        let mut fields = event(t, "move", x, y);
        if !self.geometry.contains(raw.x, raw.y) {
            fields.insert("outside".into(), Value::from(true));
        }
        (self.sink)(fields);
    }

    fn emit_scroll(&mut self, raw: RawMouse, video_ms: &dyn Fn(i64) -> Option<f64>) {
        let Kind::Scroll { dx, dy } = raw.kind else {
            return;
        };
        if !self.geometry.contains(raw.x, raw.y) {
            return;
        }
        let Some(t) = video_ms(raw.hns) else { return };
        self.last_scroll = raw.hns;
        let (x, y) = self.geometry.video_point(raw.x, raw.y);
        let (sx, sy) = self.geometry.scale();
        // notches → DIP → physical pixels → video pixels
        let px = DIP_PER_NOTCH / WHEEL_DELTA as f64 * self.geometry.dpi_scale;
        let mut fields = event(t, "scroll", x, y);
        fields.insert("dx".into(), Value::from(round1(dx as f64 * px * sx)));
        fields.insert("dy".into(), Value::from(round1(dy as f64 * px * sy)));
        (self.sink)(fields);
    }

    fn emit_button(
        &mut self,
        raw: RawMouse,
        button: Button,
        video_ms: &dyn Fn(i64) -> Option<f64>,
    ) {
        let (mut x, mut y) = self.geometry.video_point(raw.x, raw.y);
        if let Kind::Down(_) = raw.kind {
            if !self.geometry.contains(raw.x, raw.y) {
                return;
            }
            let Some(t) = video_ms(raw.hns) else { return };
            if !self.pressed.contains(&button) {
                self.pressed.push(button);
            }
            let mut fields = event(t, "down", x, y);
            fields.insert("button".into(), Value::from(button.as_str()));
            (self.sink)(fields);
        } else {
            // Released either way; sent only if its `down` was.
            let Some(index) = self.pressed.iter().position(|b| *b == button) else {
                return;
            };
            self.pressed.swap_remove(index);
            let Some(t) = video_ms(raw.hns) else { return };
            x = x.clamp(0.0, self.geometry.video_width as f64);
            y = y.clamp(0.0, self.geometry.video_height as f64);
            let mut fields = event(t, "up", x, y);
            fields.insert("button".into(), Value::from(button.as_str()));
            (self.sink)(fields);
        }
    }
}

fn event(t: f64, kind: &str, x: f64, y: f64) -> Map<String, Value> {
    let mut fields = Map::new();
    fields.insert("t".into(), Value::from(round1(t.max(0.0))));
    fields.insert("type".into(), Value::from(kind));
    fields.insert("x".into(), Value::from(x));
    fields.insert("y".into(), Value::from(y));
    fields
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::rc::Rc;

    const MS: i64 = 10_000;

    /// A 2560x1440 monitor at x = 1920 recorded into a 1280x720 video, 150% DPI.
    fn track() -> (MouseTrack, Rc<RefCell<Vec<Value>>>) {
        let events = Rc::new(RefCell::new(Vec::new()));
        let sink = events.clone();
        let geometry = Geometry {
            rect: RECT {
                left: 1920,
                top: 0,
                right: 4480,
                bottom: 1440,
            },
            video_width: 1280,
            video_height: 720,
            dpi_scale: 1.5,
        };
        let track = MouseTrack::with_sink(
            geometry,
            Box::new(move |f| sink.borrow_mut().push(Value::Object(f))),
        );
        (track, events)
    }

    fn raw(kind: Kind, ms: i64, x: i32, y: i32) -> RawMouse {
        RawMouse {
            kind,
            hns: ms * MS,
            x,
            y,
        }
    }

    /// Video time = host ms - 1000; nothing before 1000.
    fn clock(host: i64) -> Option<f64> {
        (host >= 1000 * MS).then(|| (host - 1000 * MS) as f64 / MS as f64)
    }

    #[test]
    fn maps_physical_pixels_to_video_pixels() {
        let (mut t, events) = track();
        t.add(raw(Kind::Move, 1100, 1920 + 1001, 501), &clock);
        assert_eq!(
            events.borrow()[0],
            serde_json::json!({"t": 100.0, "type": "move", "x": 500.5, "y": 250.5})
        );
    }

    #[test]
    fn marks_moves_off_the_monitor_as_outside() {
        let (mut t, events) = track();
        t.add(raw(Kind::Move, 1100, 1000, 300), &clock);
        let e = &events.borrow()[0];
        assert_eq!(e["outside"], true);
        assert_eq!(e["x"], -460.0);
    }

    #[test]
    fn sends_no_down_or_scroll_off_the_monitor_but_ends_a_drag_that_leaves_it() {
        let (mut t, events) = track();
        t.add(raw(Kind::Down(Button::Right), 1100, 100, 100), &clock);
        t.add(raw(Kind::Scroll { dx: 0, dy: 120 }, 1200, 100, 100), &clock);
        t.add(raw(Kind::Up(Button::Right), 1300, 100, 100), &clock);
        assert!(events.borrow().is_empty());

        t.add(raw(Kind::Down(Button::Left), 1400, 2000, 100), &clock);
        t.add(raw(Kind::Up(Button::Left), 1500, 9000, -50), &clock);
        let e = events.borrow();
        assert_eq!(
            e[0],
            serde_json::json!({"t": 400.0, "type": "down", "button": "left", "x": 40.0, "y": 50.0})
        );
        assert_eq!(
            e[1],
            serde_json::json!({"t": 500.0, "type": "up", "button": "left", "x": 1280.0, "y": 0.0})
        );
    }

    #[test]
    fn thins_moves_to_60hz_keeping_the_last_position() {
        let (mut t, events) = track();
        t.add(raw(Kind::Move, 1100, 2000, 100), &clock);
        t.add(raw(Kind::Move, 1105, 2002, 100), &clock);
        t.add(raw(Kind::Move, 1110, 2004, 100), &clock);
        assert_eq!(events.borrow().len(), 1);
        assert_eq!(t.flush_due(), Some((1100 * MS) + INTERVAL_HNS));
        t.flush(&clock);
        assert_eq!(events.borrow().len(), 2);
        assert_eq!(events.borrow()[1]["x"], 42.0);
        assert_eq!(events.borrow()[1]["t"], 110.0);
        // a click sends the held-back position first
        t.add(raw(Kind::Move, 1112, 2010, 100), &clock);
        t.add(raw(Kind::Down(Button::Middle), 1113, 2010, 100), &clock);
        let e = events.borrow();
        assert_eq!(e[2]["type"], "move");
        assert_eq!(e[3]["button"], "middle");
    }

    #[test]
    fn converts_wheel_notches_to_video_pixels() {
        let (mut t, events) = track();
        t.add(
            raw(Kind::Scroll { dx: 0, dy: -120 }, 1100, 2000, 100),
            &clock,
        );
        // 1 notch = 100 DIP = 150 physical px = 75 video px
        assert_eq!(events.borrow()[0]["dy"], -75.0);
        assert_eq!(events.borrow()[0]["dx"], 0.0);
    }

    #[test]
    fn drops_what_is_not_in_the_video() {
        let (mut t, events) = track();
        t.add(raw(Kind::Move, 900, 2000, 100), &clock);
        t.add(raw(Kind::Down(Button::Left), 950, 2000, 100), &clock);
        assert!(events.borrow().is_empty());
    }
}
