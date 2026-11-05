// A-08: the windows Home can record, for `listWindows` (PROTOCOL.md). Titles and app names go
// to main on stdout only: never to stderr, which is copied into the log.
//
// What counts as a window the user can pick is what Alt+Tab shows: visible, not minimized,
// not cloaked (other virtual desktops, suspended UWP apps), not a tool window, unowned unless it
// asks to be on the taskbar, with a title, and not tiny. The shell's own windows (desktop,
// taskbar) and Kamo's are left out.
use serde_json::{Value, json};
use std::ffi::c_void;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{
    DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::{BOOL, PWSTR};

/// Smaller than this (physical px) is a widget or a splash, not something to record.
const MIN_SIDE: i32 = 64;

/// Shell windows that look like normal top-level windows.
const SHELL_CLASSES: [&str; 4] = [
    "Progman",
    "WorkerW",
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
];

/// Everything the filter looks at, read once per window.
#[derive(Debug, Clone, Default)]
pub struct Candidate {
    pub visible: bool,
    pub minimized: bool,
    pub cloaked: bool,
    pub tool_window: bool,
    pub app_window: bool,
    pub owned: bool,
    pub class: String,
    pub title: String,
    pub pid: u32,
    pub bounds: RECT,
}

/// Whether Home lists this window (see the header).
pub fn listable(c: &Candidate, exclude_pids: &[u32]) -> bool {
    let width = c.bounds.right - c.bounds.left;
    let height = c.bounds.bottom - c.bounds.top;
    c.visible
        && !c.minimized
        && !c.cloaked
        && !c.tool_window
        && (!c.owned || c.app_window)
        && !c.title.trim().is_empty()
        && width >= MIN_SIDE
        && height >= MIN_SIDE
        && !SHELL_CLASSES.contains(&c.class.as_str())
        && !exclude_pids.contains(&c.pid)
}

/// The visible bounds of a window in physical pixels (no drop shadow), which is what Windows
/// Graphics Capture records. Falls back to GetWindowRect.
pub fn frame_bounds(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    let dwm = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut RECT as *mut c_void,
            size_of::<RECT>() as u32,
        )
    };
    if dwm.is_ok() && rect.right > rect.left && rect.bottom > rect.top {
        return Some(rect);
    }
    unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
    (rect.right > rect.left && rect.bottom > rect.top).then_some(rect)
}

fn read_candidate(hwnd: HWND) -> Candidate {
    let ex_style = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
    let mut cloaked = 0u32;
    let cloak = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut c_void,
            size_of::<u32>() as u32,
        )
    };
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    Candidate {
        visible: unsafe { IsWindowVisible(hwnd) }.as_bool(),
        minimized: unsafe { IsIconic(hwnd) }.as_bool(),
        cloaked: cloak.is_ok() && cloaked != 0,
        tool_window: ex_style & WS_EX_TOOLWINDOW.0 != 0,
        app_window: ex_style & WS_EX_APPWINDOW.0 != 0,
        owned: unsafe { GetWindow(hwnd, GW_OWNER) }.is_ok_and(|owner| !owner.is_invalid()),
        class: class_name(hwnd),
        title: window_title(hwnd),
        pid,
        bounds: frame_bounds(hwnd).unwrap_or_default(),
    }
}

fn class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 128];
    let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
    String::from_utf16_lossy(&buffer[..len.max(0) as usize])
}

pub fn window_title(hwnd: HWND) -> String {
    let len = unsafe { GetWindowTextLengthW(hwnd) };
    if len <= 0 {
        return String::new();
    }
    let mut buffer = vec![0u16; len as usize + 1];
    let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    String::from_utf16_lossy(&buffer[..copied.max(0) as usize])
}

/// The executable's name without the extension ("notepad", "chrome"), or "" if hidden from us.
fn app_name(pid: u32) -> String {
    let Ok(process) = (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) })
    else {
        return String::new();
    };
    let mut buffer = [0u16; 1024];
    let mut len = buffer.len() as u32;
    let read = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut len,
        )
    };
    let _ = unsafe { CloseHandle(process) };
    if read.is_err() {
        return String::new();
    }
    exe_stem(&String::from_utf16_lossy(&buffer[..len as usize]))
}

/// `C:\Windows\System32\notepad.exe` → `notepad`.
pub fn exe_stem(path: &str) -> String {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path);
    match file.rsplit_once('.') {
        Some((stem, _)) if !stem.is_empty() => stem.to_string(),
        _ => file.to_string(),
    }
}

unsafe extern "system" fn collect(hwnd: HWND, data: LPARAM) -> BOOL {
    let windows = unsafe { &mut *(data.0 as *mut Vec<HWND>) };
    windows.push(hwnd);
    true.into()
}

/// The windows Home can record, front to back (EnumWindows' z-order), as protocol objects.
pub fn list(exclude_pid: Option<u32>) -> Vec<Value> {
    let mut handles: Vec<HWND> = Vec::new();
    let _ = unsafe {
        EnumWindows(
            Some(collect),
            LPARAM(&mut handles as *mut Vec<HWND> as isize),
        )
    };
    let mut exclude = vec![std::process::id()];
    exclude.extend(exclude_pid);
    handles
        .into_iter()
        .filter_map(|hwnd| {
            let c = read_candidate(hwnd);
            listable(&c, &exclude).then(|| {
                json!({
                    "id": (hwnd.0 as isize).to_string(),
                    "title": c.title,
                    "app": app_name(c.pid),
                    "x": c.bounds.left,
                    "y": c.bounds.top,
                    "width": c.bounds.right - c.bounds.left,
                    "height": c.bounds.bottom - c.bounds.top,
                })
            })
        })
        .collect()
}

/// An id from `listWindows` back to a window that still exists.
pub fn parse_id(id: &str) -> Option<HWND> {
    let raw: isize = id.trim().parse().ok().filter(|v| *v != 0)?;
    let hwnd = HWND(raw as *mut c_void);
    unsafe { IsWindow(Some(hwnd)) }.as_bool().then_some(hwnd)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notepad() -> Candidate {
        Candidate {
            visible: true,
            class: "Notepad".into(),
            title: "notes.txt - Notepad".into(),
            pid: 10,
            bounds: RECT {
                left: 100,
                top: 100,
                right: 900,
                bottom: 700,
            },
            ..Default::default()
        }
    }

    #[test]
    fn lists_what_alt_tab_shows() {
        assert!(listable(&notepad(), &[1]));
        for hidden in [
            Candidate {
                visible: false,
                ..notepad()
            },
            Candidate {
                minimized: true,
                ..notepad()
            },
            Candidate {
                cloaked: true,
                ..notepad()
            },
            Candidate {
                tool_window: true,
                ..notepad()
            },
            Candidate {
                owned: true,
                ..notepad()
            },
            Candidate {
                title: "  ".into(),
                ..notepad()
            },
            Candidate {
                class: "Shell_TrayWnd".into(),
                ..notepad()
            },
            Candidate {
                bounds: RECT {
                    left: 0,
                    top: 0,
                    right: 40,
                    bottom: 400,
                },
                ..notepad()
            },
        ] {
            assert!(!listable(&hidden, &[1]), "{hidden:?}");
        }
        // an owned window that asks for a taskbar button is a real window
        assert!(listable(
            &Candidate {
                owned: true,
                app_window: true,
                ..notepad()
            },
            &[1]
        ));
        // Kamo's own windows never show
        assert!(!listable(&notepad(), &[10]));
    }

    #[test]
    fn names_the_app_after_its_executable() {
        assert_eq!(exe_stem(r"C:\Windows\System32\notepad.exe"), "notepad");
        assert_eq!(exe_stem(r"C:\Apps\my.app.exe"), "my.app");
        assert_eq!(exe_stem("noext"), "noext");
    }

    #[test]
    fn refuses_ids_that_are_not_windows() {
        assert!(parse_id("0").is_none());
        assert!(parse_id("abc").is_none());
        assert!(parse_id("").is_none());
    }
}
