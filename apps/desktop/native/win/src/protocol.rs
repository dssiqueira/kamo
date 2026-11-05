// Commands from main (PROTOCOL.md → Commands). `protocol.ts` is the source of truth for the
// field names. Unknown fields are ignored here, so a newer main does not break this helper.
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

/// A rectangle in DIP, relative to the top left of the display (A-08 region).
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
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
    /// A-08: record this window (an HWND in decimal, from `listWindows`) instead of the display.
    pub window_id: Option<String>,
    /// A-08: record only this part of the display (DIP, relative to its top left).
    pub region: Option<Rect>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWindowsCommand {
    /// Leave out this process's windows (main sends its own pid: Kamo never lists itself).
    pub exclude_pid: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "cmd", rename_all = "lowercase")]
pub enum Command {
    Start(Box<StartCommand>),
    #[serde(rename = "listWindows")]
    ListWindows(ListWindowsCommand),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_capture_targets() {
        let Ok(Command::Start(start)) = parse(
            r#"{"cmd":"start","displayId":"1","fps":30,"output":"o","framesDir":"f","frameIntervalMs":5000,"frameWidth":480,"region":{"x":10,"y":20.5,"width":640,"height":480},"monitorPoint":{"x":0,"y":0}}"#,
        ) else {
            panic!("start")
        };
        assert_eq!(
            start.region,
            Some(Rect {
                x: 10.0,
                y: 20.5,
                width: 640.0,
                height: 480.0
            })
        );
        assert!(start.window_id.is_none());
        let Ok(Command::Start(start)) = parse(
            r#"{"cmd":"start","displayId":"1","fps":30,"output":"o","framesDir":"f","frameIntervalMs":5000,"frameWidth":480,"windowId":"132456"}"#,
        ) else {
            panic!("start")
        };
        assert_eq!(start.window_id.as_deref(), Some("132456"));
        let Ok(Command::ListWindows(list)) = parse(r#"{"cmd":"listWindows","excludePid":42}"#)
        else {
            panic!("listWindows")
        };
        assert_eq!(list.exclude_pid, Some(42));
        assert!(matches!(parse(r#"{"cmd":"stop"}"#), Ok(Command::Stop)));
    }
}
