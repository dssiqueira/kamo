// Records one monitor: WGC frames → NV12 → H.264 fragmented MP4, reference JPEGs and mouse
// events, all on one clock (PROTOCOL.md).
//
// Threading: everything mutable lives on the main thread, which owns the Recorder and handles
// one message at a time (commands from the stdin thread, frames from WGC's thread, events from
// the mouse hook's thread), plus timed work in `tick`. No locks.
//
// Clock (QPC in 100ns units, clock.rs):
//   video time = host time - start - paused_total
// where `start` is the first frame's SystemRelativeTime and `paused_total` the sum of the
// pauses. Paused time is not video time, so the MP4 is continuous and its duration excludes the
// pauses (F-02); every tMs sent to main is video time. Mouse events use the same formula on the
// QPC time the hook stamped them with, and none is sent before the first frame, while paused or
// for a moment that fell in a pause.
//
// Constant frame rate: WGC only delivers a frame when the screen changes, so the encoder is fed
// on a fixed timeline instead. Slot k is at k/fps of video time and shows the newest frame
// captured at or before it (a static screen repeats the last frame, which H.264 turns into tiny
// P-frames). A slot is written LAG after its time, so a frame captured just before it has had
// time to arrive. The MP4 lasts exactly slots × 1/fps, which is `durationMs`.
use crate::capture::{self, Capture};
use crate::clock::{HNS_PER_SECOND, hns_to_ms, now_hns};
use crate::encoder::{self, Encoder, Path};
use crate::gpu::{Gpu, Processor, Surface, SurfacePool};
use crate::mouse::{Geometry, MouseHook, MouseTrack, RawMouse};
use crate::out::{self, ErrorCode};
use crate::protocol::{Command, StartCommand};
use crate::thumbs::{self, Thumbs};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::rc::Rc;
use std::sync::mpsc::Sender;
use std::time::Duration;
use windows::Graphics::Capture::{Direct3D11CaptureFrame, GraphicsCaptureSession};
use windows::Win32::Foundation::{E_ACCESSDENIED, POINT};
use windows::Win32::Graphics::Direct3D11::ID3D11Texture2D;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, HMONITOR, MONITOR_DEFAULTTONULL, MONITORINFO, MonitorFromPoint,
};
use windows::Win32::Media::MediaFoundation::{
    IMFMediaBuffer, MF_VERSION, MFCreateMemoryBuffer, MFSTARTUP_LITE, MFStartup,
};
use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::core::HSTRING;

pub enum Msg {
    Command(Command),
    BadCommand(String),
    StdinClosed,
    Frame(Direct3D11CaptureFrame),
    CaptureClosed,
    Mouse(RawMouse),
}

/// H.264 encoders top out around 4096 px; larger monitors are scaled down to fit.
const MAX_VIDEO_SIDE: f64 = 4096.0;
/// How long after its time a slot is encoded (see the header).
const LAG_HNS: i64 = 500_000;
/// Below this much free space the recording stops by itself with `disk_full` (main asks for
/// 1GB before starting), so the MP4 can still be finalized.
const MIN_FREE_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum State {
    Idle,
    Starting,
    Recording,
    Finishing,
}

/// The video clock (see the header). Copy, so the mouse track can borrow a snapshot.
#[derive(Clone, Copy)]
struct Clock {
    recording: bool,
    start: Option<i64>,
    paused_total: i64,
    pause_at: Option<i64>,
    /// Video time of the current (or last) pause.
    paused_video: i64,
    /// Host time of the last resume: anything captured before it fell in a pause.
    resume_at: i64,
}

impl Clock {
    fn video_now(&self) -> i64 {
        match (self.start, self.pause_at) {
            (_, Some(_)) => self.paused_video,
            (Some(start), None) => (now_hns() - start - self.paused_total).max(0),
            (None, None) => 0,
        }
    }

    /// Video time of a frame captured at `host` while not paused.
    fn frame_time(&self, host: i64) -> i64 {
        let Some(start) = self.start else { return 0 };
        // Captured during the last pause, delivered after it: it is what the resume shows.
        if host < self.resume_at {
            self.paused_video
        } else {
            (host - start - self.paused_total).max(0)
        }
    }

    /// Video ms of a mouse event at `host`, or None when that moment is not in the video.
    fn mouse_ms(&self, host: i64) -> Option<f64> {
        let start = self.start?;
        if !self.recording || self.pause_at.is_some() || host < start || host < self.resume_at {
            return None;
        }
        Some(hns_to_ms((host - start - self.paused_total).max(0)))
    }
}

fn slot_time(slot: u64, fps: u32) -> i64 {
    (slot as i128 * HNS_PER_SECOND as i128 / fps as i128) as i64
}

/// NV12 → small BGRA for the reference JPEGs.
struct ThumbMaker {
    processor: Processor,
    texture: ID3D11Texture2D,
    view: windows::Win32::Graphics::Direct3D11::ID3D11VideoProcessorOutputView,
    staging: ID3D11Texture2D,
}

/// Everything that exists once `start` is accepted.
struct Session {
    opts: StartCommand,
    fps: u32,
    gpu: Gpu,
    capture: Capture,
    monitor: HMONITOR,
    video_size: (u32, u32),
    scale_factor: f64,
    converter: Processor,
    pool: SurfacePool,
    encoder: Option<Encoder>,
    staging: ID3D11Texture2D,
    thumb: ThumbMaker,
    thumbs: Thumbs,
    hook: Option<MouseHook>,
    track: Option<MouseTrack>,
    /// Why the hook failed before `started` went out; reported right after it.
    mouse_problem: Option<String>,

    /// Frames waiting for their slot, by video time.
    pending: VecDeque<(i64, Rc<Surface>)>,
    /// Newest frame captured while paused: what the screen shows when recording resumes.
    pause_latest: Option<Rc<Surface>>,
    /// The frame in the last slot, and the media buffer it was encoded from.
    current: Option<Rc<Surface>>,
    current_buffer: Option<IMFMediaBuffer>,
    next_slot: u64,
    next_thumb: i64,
    next_check: i64,
    checks: u64,
    /// Disk-full write error seen while encoding.
    write_error: Option<windows::core::Error>,
    stats_captured: u64,
    stats_new: u64,
}

pub struct Recorder {
    tx: Sender<Msg>,
    state: State,
    clock: Clock,
    session: Option<Session>,
}

impl Recorder {
    pub fn new(tx: Sender<Msg>) -> Recorder {
        Recorder {
            tx,
            state: State::Idle,
            clock: Clock {
                recording: false,
                start: None,
                paused_total: 0,
                pause_at: None,
                paused_video: 0,
                resume_at: i64::MIN,
            },
            session: None,
        }
    }

    pub fn handle(&mut self, msg: Msg) {
        match msg {
            Msg::Command(Command::Start(opts)) => {
                // Only the first `start` counts.
                if self.state == State::Idle {
                    self.begin(*opts);
                }
            }
            Msg::Command(Command::Pause) => self.pause(),
            Msg::Command(Command::Resume) => self.resume(),
            Msg::Command(Command::Stop) | Msg::StdinClosed => self.stop(),
            Msg::BadCommand(message) => out::error(ErrorCode::Internal, &message, false),
            Msg::Frame(frame) => self.on_frame(frame),
            Msg::CaptureClosed => match self.state {
                State::Starting => out::fatal(
                    ErrorCode::DisplayNotFound,
                    "the capture item closed before the first frame",
                ),
                State::Recording => {
                    self.finish(Some((ErrorCode::DisplayLost, "the monitor was removed")))
                }
                _ => {}
            },
            Msg::Mouse(raw) => {
                let clock = self.clock;
                if let Some(track) = self.session.as_mut().and_then(|s| s.track.as_mut()) {
                    track.add(raw, &|host| clock.mouse_ms(host));
                }
            }
        }
    }

    /// How long the main loop may sleep before `tick` has work.
    pub fn next_wakeup(&self) -> Duration {
        let (State::Recording, Some(session)) = (self.state, &self.session) else {
            return Duration::from_millis(if self.state == State::Idle { 1000 } else { 50 });
        };
        let now = now_hns();
        let mut due = session.next_check;
        if let (None, Some(start)) = (self.clock.pause_at, self.clock.start) {
            due = due.min(
                start
                    + self.clock.paused_total
                    + slot_time(session.next_slot, session.fps)
                    + LAG_HNS,
            );
        }
        if let Some(flush) = session.track.as_ref().and_then(|t| t.flush_due()) {
            due = due.min(flush);
        }
        Duration::from_micros(((due - now).max(10_000) / 10) as u64)
    }

    /// Timed work: due slots, held-back mouse events, the once-a-second checks.
    pub fn tick(&mut self) {
        if self.state != State::Recording {
            return;
        }
        let clock = self.clock;
        let Some(session) = self.session.as_mut() else {
            return;
        };
        let now = now_hns();
        if let Some(track) = session.track.as_mut()
            && track.flush_due().is_some_and(|due| now >= due)
        {
            track.flush(&|host| clock.mouse_ms(host));
        }
        if clock.pause_at.is_none() {
            let limit = clock.video_now() - LAG_HNS;
            while slot_time(session.next_slot, session.fps) <= limit {
                if let Err(e) = session.write_slot() {
                    self.encoder_failed(e);
                    return;
                }
            }
        }
        if now >= session.next_check {
            session.next_check = now + HNS_PER_SECOND;
            session.checks += 1;
            let mut info = MONITORINFO {
                cbSize: size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !unsafe { GetMonitorInfoW(session.monitor, &mut info) }.as_bool() {
                self.finish(Some((ErrorCode::DisplayLost, "the monitor is gone")));
                return;
            }
            // The monitor can move in the arrangement while recording.
            if let Some(track) = session.track.as_mut() {
                track.geometry.rect = info.rcMonitor;
            }
            if session.checks % 5 == 0
                && session
                    .free_bytes()
                    .is_some_and(|free| free < MIN_FREE_BYTES)
            {
                self.finish(Some((
                    ErrorCode::DiskFull,
                    "less than 200MB free on the output volume",
                )));
            }
        }
    }

    // MARK: commands

    fn begin(&mut self, opts: StartCommand) {
        self.state = State::Starting;
        if opts.fps != 30 && opts.fps != 60 {
            out::fatal(ErrorCode::Internal, "fps must be 30 or 60");
        }
        let Some(point) = opts.monitor_point else {
            out::fatal(ErrorCode::DisplayNotFound, "start has no monitorPoint");
        };
        let monitor = unsafe {
            MonitorFromPoint(
                POINT {
                    x: point.x,
                    y: point.y,
                },
                MONITOR_DEFAULTTONULL,
            )
        };
        if monitor.is_invalid() {
            out::fatal(ErrorCode::DisplayNotFound, "no monitor at monitorPoint");
        }
        let mut info = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
            out::fatal(ErrorCode::DisplayNotFound, "GetMonitorInfo failed");
        }
        if !GraphicsCaptureSession::IsSupported().unwrap_or(false) {
            out::fatal(
                ErrorCode::PermissionDenied,
                "Windows Graphics Capture is not supported or is blocked",
            );
        }
        if let Err(e) = unsafe { MFStartup(MF_VERSION, MFSTARTUP_LITE) } {
            out::fatal(
                ErrorCode::EncoderFailed,
                &format!(
                    "Media Foundation unavailable (Windows N without the Media Feature Pack?): {e}"
                ),
            );
        }
        let gpu = Gpu::new().unwrap_or_else(|e| {
            out::fatal(
                ErrorCode::EncoderFailed,
                &format!("no Direct3D 11 hardware device with video support: {e}"),
            )
        });
        let item = capture::create_item(monitor).unwrap_or_else(|e| {
            let code = if e.code() == E_ACCESSDENIED {
                ErrorCode::PermissionDenied
            } else {
                ErrorCode::DisplayNotFound
            };
            out::fatal(code, &format!("cannot capture the monitor: {e}"))
        });
        let size = item.Size().unwrap_or_else(|e| {
            out::fatal(ErrorCode::Internal, &format!("capture item size: {e}"))
        });
        let source = (size.Width.max(2) as u32, size.Height.max(2) as u32);

        // Video size = physical pixels of the monitor, even, scaled down past 4096.
        let fit = (MAX_VIDEO_SIDE / source.0.max(source.1) as f64).min(1.0);
        let even = |v: u32| (((v as f64 * fit).round() as u32) & !1).max(2);
        let video = (even(source.0), even(source.1));
        let dpi_scale = monitor_dpi_scale(monitor);
        // Video pixels per DIP, like Electron's Display.scaleFactor and the Mac helper's
        // "per point": the DPI scale, times the downscale if any.
        let scale_factor =
            ((video.0 as f64 / source.0 as f64) * dpi_scale * 10_000.0).round() / 10_000.0;
        out::diag(&format!(
            "monitor {}x{} px, dpi scale {dpi_scale}, video {}x{} @ {}fps",
            source.0, source.1, video.0, video.1, opts.fps
        ));

        let fatal_gpu = |what: &str, e: windows::core::Error| -> ! {
            out::fatal(ErrorCode::EncoderFailed, &format!("{what}: {e}"))
        };
        let converter = Processor::new(
            &gpu,
            source,
            video,
            DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
            DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
        )
        .unwrap_or_else(|e| fatal_gpu("video processor (BGRA to NV12)", e));

        let force_cpu = std::env::var("KAMO_CAPTURE_CPU").is_ok_and(|v| v == "1");
        let encoder = if force_cpu {
            Encoder::new(&opts.output, &gpu, video.0, video.1, opts.fps, Path::Cpu)
        } else {
            Encoder::new(&opts.output, &gpu, video.0, video.1, opts.fps, Path::Gpu).or_else(|e| {
                out::diag(&format!(
                    "GPU encoding path unavailable, using the CPU path: {e}"
                ));
                Encoder::new(&opts.output, &gpu, video.0, video.1, opts.fps, Path::Cpu)
            })
        }
        .unwrap_or_else(|e| fatal_gpu("cannot set up the H.264 encoder", e));
        out::diag(&format!("encoding path: {:?}", encoder.path));

        let staging = gpu
            .texture(video.0, video.1, DXGI_FORMAT_NV12, true)
            .unwrap_or_else(|e| fatal_gpu("staging texture", e));
        let thumb_width = opts.frame_width.max(2);
        let thumb_height =
            ((thumb_width as f64 * video.1 as f64 / video.0 as f64).round() as u32).max(2);
        let thumb = (|| -> windows::core::Result<ThumbMaker> {
            let processor = Processor::new(
                &gpu,
                video,
                (thumb_width, thumb_height),
                DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
                DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
            )?;
            let texture =
                gpu.texture(thumb_width, thumb_height, DXGI_FORMAT_B8G8R8A8_UNORM, false)?;
            let view = processor.output_view(&gpu, &texture)?;
            let staging =
                gpu.texture(thumb_width, thumb_height, DXGI_FORMAT_B8G8R8A8_UNORM, true)?;
            Ok(ThumbMaker {
                processor,
                texture,
                view,
                staging,
            })
        })()
        .unwrap_or_else(|e| fatal_gpu("video processor (thumbnails)", e));

        out::diag(&capture::request_borderless());
        let frames_tx = self.tx.clone();
        let closed_tx = self.tx.clone();
        let capture = Capture::new(
            &gpu,
            item,
            opts.fps,
            move |frame| {
                let _ = frames_tx.send(Msg::Frame(frame));
            },
            move || {
                let _ = closed_tx.send(Msg::CaptureClosed);
            },
        )
        .unwrap_or_else(|e| {
            let code = if e.code() == E_ACCESSDENIED {
                ErrorCode::PermissionDenied
            } else {
                ErrorCode::Internal
            };
            out::fatal(code, &format!("cannot set up the capture: {e}"))
        });

        // Before the capture, so the first frames already have their mouse events.
        let (mut hook, mut track, mut mouse_problem) = (None, None, None);
        if opts.mouse != Some(false) {
            let mouse_tx = self.tx.clone();
            match MouseHook::start(move |raw| {
                let _ = mouse_tx.send(Msg::Mouse(raw));
            }) {
                Ok(h) => {
                    hook = Some(h);
                    track = Some(MouseTrack::new(Geometry {
                        rect: info.rcMonitor,
                        video_width: video.0,
                        video_height: video.1,
                        dpi_scale,
                    }));
                }
                Err(problem) => mouse_problem = Some(problem),
            }
        }

        let pool = SurfacePool::new(video.0, video.1, encoder.path == Path::Gpu);
        let thumbs = Thumbs::start(PathBuf::from(&opts.frames_dir));
        self.session = Some(Session {
            fps: opts.fps,
            opts,
            gpu,
            capture,
            monitor,
            video_size: video,
            scale_factor,
            converter,
            pool,
            encoder: Some(encoder),
            staging,
            thumb,
            thumbs,
            hook,
            track,
            mouse_problem,
            pending: VecDeque::new(),
            pause_latest: None,
            current: None,
            current_buffer: None,
            next_slot: 0,
            next_thumb: 0,
            next_check: i64::MAX,
            checks: 0,
            write_error: None,
            stats_captured: 0,
            stats_new: 0,
        });
        // `started` goes out with the first encoded frame (on_frame).
        if let Err(e) = self
            .session
            .as_ref()
            .map(|s| s.capture.start())
            .unwrap_or(Ok(()))
        {
            let code = if e.code() == E_ACCESSDENIED {
                ErrorCode::PermissionDenied
            } else {
                ErrorCode::Internal
            };
            out::fatal(code, &format!("cannot start the capture: {e}"));
        }
    }

    fn pause(&mut self) {
        if self.state != State::Recording || self.clock.pause_at.is_some() {
            return;
        }
        let clock = self.clock;
        // Mouse events held back by the throttle belong before `paused`.
        if let Some(track) = self.session.as_mut().and_then(|s| s.track.as_mut()) {
            track.flush(&|host| clock.mouse_ms(host));
        }
        self.clock.paused_video = self.clock.video_now();
        self.clock.pause_at = Some(now_hns());
        out::paused(hns_to_ms(self.clock.paused_video));
    }

    fn resume(&mut self) {
        let (State::Recording, Some(pause_at)) = (self.state, self.clock.pause_at) else {
            return;
        };
        let now = now_hns();
        self.clock.paused_total += now - pause_at;
        self.clock.resume_at = now;
        self.clock.pause_at = None;
        if let Some(session) = self.session.as_mut()
            && let Some(latest) = session.pause_latest.take()
        {
            session.pending.push_back((self.clock.paused_video, latest));
        }
        // Paused time is not video time: the video resumes where it paused.
        out::resumed(hns_to_ms(self.clock.paused_video));
    }

    fn stop(&mut self) {
        match self.state {
            // Nothing recorded (or main gave up before the first frame): nothing worth keeping.
            State::Idle | State::Starting => std::process::exit(0),
            State::Recording => self.finish(None),
            State::Finishing => {}
        }
    }

    // MARK: frames

    fn on_frame(&mut self, frame: Direct3D11CaptureFrame) {
        if !matches!(self.state, State::Starting | State::Recording) {
            let _ = frame.Close();
            return;
        }
        let Some(session) = self.session.as_mut() else {
            return;
        };
        let host = frame
            .SystemRelativeTime()
            .map(|t| t.Duration)
            .unwrap_or_else(|_| now_hns());
        session.stats_captured += 1;
        let converted = session.convert(&frame);
        let _ = frame.Close();
        let surface = match converted {
            Ok(Some(surface)) => surface,
            Ok(None) => return,
            Err(e) if self.state == State::Starting => out::fatal(
                ErrorCode::EncoderFailed,
                &format!("cannot convert the first frame: {e}"),
            ),
            Err(e) => {
                out::diag(&format!("frame dropped: {e}"));
                return;
            }
        };
        if self.state == State::Starting {
            self.first_frame(host, surface);
            return;
        }
        if let Some(pause_at) = self.clock.pause_at
            && host >= pause_at
        {
            session.pause_latest = Some(surface);
            return;
        }
        session
            .pending
            .push_back((self.clock.frame_time(host), surface));
    }

    fn first_frame(&mut self, host: i64, surface: Rc<Surface>) {
        self.clock.start = Some(host);
        let Some(session) = self.session.as_mut() else {
            return;
        };
        session.pending.push_back((0, surface));
        if let Err(e) = session.write_slot() {
            // The GPU path can fail only once frames flow; retry once on the CPU path.
            if session
                .encoder
                .as_ref()
                .is_some_and(|enc| enc.path == Path::Gpu)
            {
                out::diag(&format!(
                    "GPU encoding failed on the first frame, using the CPU path: {e}"
                ));
                session.encoder = None; // releases the file before it is created again
                let (w, h) = session.video_size;
                match Encoder::new(
                    &session.opts.output,
                    &session.gpu,
                    w,
                    h,
                    session.fps,
                    Path::Cpu,
                ) {
                    Ok(encoder) => session.encoder = Some(encoder),
                    Err(e) => out::fatal(
                        ErrorCode::EncoderFailed,
                        &format!("cannot set up the H.264 encoder: {e}"),
                    ),
                }
                session.pool.set_dxgi_buffers(false);
                session.current_buffer = None;
                if let Some(current) = session.current.take() {
                    session.pending.push_front((0, current));
                }
                if let Err(e) = session.write_slot() {
                    out::fatal(
                        ErrorCode::EncoderFailed,
                        &format!("the first frame was refused: {e}"),
                    );
                }
            } else {
                out::fatal(
                    ErrorCode::EncoderFailed,
                    &format!("the first frame was refused: {e}"),
                );
            }
        }
        self.state = State::Recording;
        self.clock.recording = true;
        session.next_check = now_hns() + HNS_PER_SECOND;
        let (w, h) = session.video_size;
        out::started(w, h, session.scale_factor, session.fps);
        if let Some(problem) = session.mouse_problem.take() {
            out::error(ErrorCode::MouseUnavailable, &problem, false);
        }
    }

    // MARK: stopping

    /// The encoder refused a frame while recording. A full disk is a normal stop with a
    /// warning (the fragments already written play); anything else is fatal, and main keeps
    /// the folder for recovery.
    fn encoder_failed(&mut self, error: windows::core::Error) {
        if encoder::is_disk_full(&error) {
            if let Some(session) = self.session.as_mut() {
                session.write_error = Some(error);
            }
            self.finish(Some((ErrorCode::DiskFull, "the disk is full")));
            return;
        }
        if let Some(session) = self.session.as_mut() {
            if let Some(hook) = session.hook.as_mut() {
                hook.stop();
            }
            session.capture.close();
            if let Some(encoder) = session.encoder.take() {
                let _ = encoder.finalize();
            }
            session.thumbs.finish();
        }
        out::fatal(
            ErrorCode::EncoderFailed,
            &format!("the H.264 encoder failed: {error}"),
        );
    }

    /// Normal end: finalize the MP4, send `stopped`, exit 0. With a warning (display_lost,
    /// disk_full), the error goes out first as non-fatal, as PROTOCOL.md asks.
    fn finish(&mut self, warning: Option<(ErrorCode, &str)>) {
        if self.state != State::Recording {
            return;
        }
        let clock = self.clock;
        let Some(session) = self.session.as_mut() else {
            return;
        };
        // Mouse events held back by the throttle belong before `stopped`.
        if let Some(track) = session.track.as_mut() {
            track.flush(&|host| clock.mouse_ms(host));
        }
        self.state = State::Finishing;
        self.clock.recording = false;
        if let Some(hook) = session.hook.as_mut() {
            hook.stop();
        }
        session.capture.close();

        // The rest of the timeline, up to now (or the pause), from the frames already here.
        let end = clock.video_now();
        while session.write_error.is_none() && slot_time(session.next_slot, session.fps) < end {
            if let Err(e) = session.write_slot() {
                session.write_error = Some(e);
            }
        }
        let duration = slot_time(session.next_slot, session.fps);
        if let Some(current) = session.current.clone() {
            let interval = session.opts.frame_interval_ms.max(1) as i64 * 10_000;
            while session.next_thumb <= end.min(duration) {
                session.thumbnail(&current, session.next_thumb);
                session.next_thumb += interval;
            }
        }
        if let Some((code, message)) = warning {
            out::error(code, message, false);
        }
        let finalized = session.encoder.take().map_or(Ok(()), |e| e.finalize());
        let frames = session.thumbs.finish();
        out::diag(&format!(
            "stopped: {} frames captured, {} slots encoded ({} new), {} reference frames",
            session.stats_captured, session.next_slot, session.stats_new, frames
        ));
        let failure = finalized.err().or(session.write_error.take());
        match failure {
            None => {}
            Some(e) if encoder::is_disk_full(&e) => {
                if warning.is_none_or(|(code, _)| code != ErrorCode::DiskFull) {
                    out::error(ErrorCode::DiskFull, "the disk is full", false);
                }
            }
            Some(e) => out::fatal(
                ErrorCode::EncoderFailed,
                &format!("the MP4 writer failed: {e}"),
            ),
        }
        out::stopped(hns_to_ms(duration), frames);
        std::process::exit(0);
    }
}

impl Session {
    /// Converts a captured frame to an NV12 surface at the video size.
    fn convert(
        &mut self,
        frame: &Direct3D11CaptureFrame,
    ) -> windows::core::Result<Option<Rc<Surface>>> {
        let (texture, content) = self.capture.texture(frame)?;
        let Some(surface) = self.pool.acquire(&self.gpu, &self.converter)? else {
            return Ok(None);
        };
        self.converter
            .blit(&self.gpu, &texture, content, &surface.view)?;
        Ok(Some(surface))
    }

    /// Encodes the next slot (see the recorder's header) and any reference frame due in it.
    fn write_slot(&mut self) -> windows::core::Result<()> {
        let time = slot_time(self.next_slot, self.fps);
        let duration = slot_time(self.next_slot + 1, self.fps) - time;
        let mut changed = false;
        while self.pending.front().is_some_and(|(t, _)| *t <= time) {
            self.current = self.pending.pop_front().map(|(_, surface)| surface);
            changed = true;
        }
        let Some(current) = self.current.clone() else {
            return Ok(());
        };
        if changed || self.current_buffer.is_none() {
            self.current_buffer = Some(self.media_buffer(&current)?);
            self.stats_new += 1;
        }
        let (Some(encoder), Some(buffer)) = (&self.encoder, &self.current_buffer) else {
            return Ok(());
        };
        encoder.write(buffer, time, duration)?;
        self.next_slot += 1;
        let interval = self.opts.frame_interval_ms.max(1) as i64 * 10_000;
        while self.next_thumb <= time {
            self.thumbnail(&current, self.next_thumb);
            self.next_thumb += interval;
        }
        Ok(())
    }

    /// What the encoder gets for a surface: its DXGI buffer (GPU path) or a copy in system
    /// memory (CPU path). Repeated slots reuse it.
    fn media_buffer(&self, surface: &Surface) -> windows::core::Result<IMFMediaBuffer> {
        if self.encoder.as_ref().is_some_and(|e| e.path == Path::Gpu)
            && let Some(buffer) = &surface.buffer
        {
            return Ok(buffer.clone());
        }
        let (width, height) = (self.video_size.0 as usize, self.video_size.1 as usize);
        let size = width * height * 3 / 2;
        unsafe {
            let buffer = MFCreateMemoryBuffer(size as u32)?;
            let mut data = std::ptr::null_mut();
            buffer.Lock(&mut data, None, None)?;
            let copied = self
                .gpu
                .read_back(&surface.texture, &self.staging, |src, pitch| {
                    // NV12 mapped: the luma rows, then the interleaved chroma rows at pitch × height.
                    for row in 0..height + height / 2 {
                        std::ptr::copy_nonoverlapping(
                            src.add(row * pitch),
                            data.add(row * width),
                            width,
                        );
                    }
                });
            buffer.Unlock()?;
            copied?;
            buffer.SetCurrentLength(size as u32)?;
            Ok(buffer)
        }
    }

    /// Queues the reference JPEG for video time `time` (100ns), from `surface`.
    fn thumbnail(&mut self, surface: &Surface, time: i64) {
        let t_ms = hns_to_ms(time);
        let file = format!("{:04}.jpg", (t_ms / 1000.0).round() as u64);
        let (width, height) = self.thumb.processor.output_size();
        let pixels = self
            .thumb
            .processor
            .blit(
                &self.gpu,
                &surface.texture,
                self.video_size,
                &self.thumb.view,
            )
            .and_then(|()| {
                self.gpu
                    .read_back(&self.thumb.texture, &self.thumb.staging, |src, pitch| {
                        let row_bytes = width as usize * 4;
                        let mut pixels = Vec::with_capacity(row_bytes * height as usize);
                        for row in 0..height as usize {
                            pixels.extend_from_slice(unsafe {
                                std::slice::from_raw_parts(src.add(row * pitch), row_bytes)
                            });
                        }
                        pixels
                    })
            });
        match pixels {
            Ok(pixels) => self.thumbs.send(thumbs::Job {
                file,
                t_ms,
                width,
                height,
                pixels,
            }),
            Err(e) => out::diag(&format!("reference frame skipped: {e}")),
        }
    }

    fn free_bytes(&self) -> Option<u64> {
        let dir = std::path::Path::new(&self.opts.output).parent()?;
        let mut free = 0u64;
        unsafe { GetDiskFreeSpaceExW(&HSTRING::from(dir), Some(&mut free), None, None) }.ok()?;
        Some(free)
    }
}

/// Physical pixels per DIP on a monitor (its effective DPI / 96).
fn monitor_dpi_scale(monitor: HMONITOR) -> f64 {
    let (mut x, mut y) = (0u32, 0u32);
    match unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut x, &mut y) } {
        Ok(()) if x > 0 => x as f64 / 96.0,
        _ => 1.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clock() -> Clock {
        Clock {
            recording: true,
            start: Some(1_000_000),
            paused_total: 0,
            pause_at: None,
            paused_video: 0,
            resume_at: i64::MIN,
        }
    }

    #[test]
    fn slots_are_exact_at_30_and_60_fps() {
        assert_eq!(slot_time(0, 30), 0);
        assert_eq!(slot_time(1, 30), 333_333);
        assert_eq!(slot_time(150, 30), 5 * HNS_PER_SECOND);
        assert_eq!(slot_time(300, 60), 5 * HNS_PER_SECOND);
    }

    #[test]
    fn pauses_are_not_video_time() {
        let mut c = clock();
        assert_eq!(c.mouse_ms(1_000_000 + 20_000), Some(2.0));
        assert_eq!(c.mouse_ms(999_999), None);
        // paused at video 3s (host 31_000_000) for 2s
        c.paused_video = 30_000_000;
        c.pause_at = Some(31_000_000);
        assert_eq!(c.mouse_ms(31_500_000), None);
        c.pause_at = None;
        c.paused_total = 20_000_000;
        c.resume_at = 51_000_000;
        // an event from inside the pause, handled after the resume
        assert_eq!(c.mouse_ms(50_000_000), None);
        assert_eq!(c.mouse_ms(51_000_000), Some(3000.0));
        assert_eq!(c.mouse_ms(52_000_000), Some(3100.0));
        // a frame captured during the pause shows at the resume
        assert_eq!(c.frame_time(40_000_000), 30_000_000);
        assert_eq!(c.frame_time(52_000_000), 31_000_000);
        c.recording = false;
        assert_eq!(c.mouse_ms(52_000_000), None);
    }
}
