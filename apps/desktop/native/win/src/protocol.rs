// Commands from main (PROTOCOL.md → Commands). `protocol.ts` is the source of truth for the
// field names. Unknown fields are ignored here, so a newer main does not break this helper.
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCommand {
    /// Electron's `Display.id`: only logged; `monitor_point` identifies the monitor.
    #[allow(dead_code)]
    pub display_id: String,
    pub fps: u32,
    pub output: String,
    pub frames_dir: String,
    pub frame_interval_ms: u64,
    pub frame_width: u32,
    pub mouse: Option<bool>,
    /// A point inside the display, in physical pixels of the virtual screen (Windows only).
    pub monitor_point: Option<Point>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "cmd", rename_all = "lowercase")]
pub enum Command {
    Start(Box<StartCommand>),
    Pause,
    Resume,
    Stop,
}

pub fn parse(line: &str) -> Result<Command, String> {
    // Not the serde message: it can quote a value, and values hold paths.
    serde_json::from_str(line).map_err(|e| {
        format!(
            "bad command ({:?} error at column {})",
            e.classify(),
            e.column()
        )
    })
}
