// Pure size and rectangle math for the capture targets (A-08), unit tested: the video size of a
// source, where a window's frames land in the video, and a region's crop on its monitor.
use crate::protocol::Rect;
use windows::Win32::Foundation::RECT;

/// H.264 encoders top out around 4096 px; larger sources are scaled down to fit.
pub const MAX_VIDEO_SIDE: f64 = 4096.0;

/// Video size for a source of `source` physical pixels: even sides, the longest at most 4096.
pub fn video_size(source: (u32, u32)) -> (u32, u32) {
    let fit = (MAX_VIDEO_SIDE / source.0.max(source.1).max(1) as f64).min(1.0);
    let even = |v: u32| (((v as f64 * fit).round() as u32) & !1).max(2);
    (even(source.0), even(source.1))
}

pub fn rect(left: i32, top: i32, right: i32, bottom: i32) -> RECT {
    RECT {
        left,
        top,
        right,
        bottom,
    }
}

pub fn width(r: &RECT) -> i32 {
    r.right - r.left
}

pub fn height(r: &RECT) -> i32 {
    r.bottom - r.top
}

/// Where a `content`-sized frame lands in a `video`-sized picture: scaled to fit (up or down),
/// aspect kept, centered, on even pixels (NV12 chroma is 2×2). A window that is resized while
/// recording keeps its proportions; the rest of the picture is black.
pub fn fit_rect(content: (u32, u32), video: (u32, u32)) -> RECT {
    let (cw, ch) = (content.0.max(1) as f64, content.1.max(1) as f64);
    let (vw, vh) = (video.0 as f64, video.1 as f64);
    let scale = (vw / cw).min(vh / ch);
    let w = (((cw * scale).round() as i32) & !1).clamp(2, video.0 as i32);
    let h = (((ch * scale).round() as i32) & !1).clamp(2, video.1 as i32);
    let left = ((video.0 as i32 - w) / 2) & !1;
    let top = ((video.1 as i32 - h) / 2) & !1;
    rect(left, top, left + w, top + h)
}

/// A region (DIP, relative to the display's top left) in physical pixels of that display,
/// clipped to it, with even sides. None when nothing of it is on the display.
pub fn region_crop(region: Rect, dpi_scale: f64, display: (u32, u32)) -> Option<RECT> {
    let scale = if dpi_scale.is_finite() && dpi_scale > 0.0 {
        dpi_scale
    } else {
        1.0
    };
    let px = |v: f64| (v * scale).round();
    let (dw, dh) = (display.0 as f64, display.1 as f64);
    let left = px(region.x).clamp(0.0, dw) as i32;
    let top = px(region.y).clamp(0.0, dh) as i32;
    let right = px(region.x + region.width).clamp(0.0, dw) as i32;
    let bottom = px(region.y + region.height).clamp(0.0, dh) as i32;
    let w = (right - left) & !1;
    let h = (bottom - top) & !1;
    (w >= 2 && h >= 2).then(|| rect(left, top, left + w, top + h))
}

/// Clips `crop` to a source that is now `size` (a monitor whose resolution changed).
pub fn clip(crop: RECT, size: (u32, u32)) -> RECT {
    let (w, h) = (size.0 as i32, size.1 as i32);
    let left = crop.left.clamp(0, (w - 2).max(0));
    let top = crop.top.clamp(0, (h - 2).max(0));
    rect(
        left,
        top,
        crop.right.clamp(left + 2, w.max(left + 2)),
        crop.bottom.clamp(top + 2, h.max(top + 2)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_sizes_are_even_and_at_most_4096() {
        assert_eq!(video_size((1920, 1080)), (1920, 1080));
        assert_eq!(video_size((801, 601)), (800, 600));
        assert_eq!(video_size((5120, 2880)), (4096, 2304));
        assert_eq!(video_size((0, 0)), (2, 2));
    }

    #[test]
    fn fits_a_resized_window_centered_with_its_aspect() {
        // same size: fills the video
        assert_eq!(fit_rect((1280, 720), (1280, 720)), rect(0, 0, 1280, 720));
        // narrower: pillarboxed
        assert_eq!(fit_rect((640, 720), (1280, 720)), rect(320, 0, 960, 720));
        // wider and bigger: scaled down, letterboxed
        assert_eq!(fit_rect((2560, 720), (1280, 720)), rect(0, 180, 1280, 540));
        // smaller: scaled up to fit
        assert_eq!(fit_rect((640, 360), (1280, 720)), rect(0, 0, 1280, 720));
        // odd sizes land on even pixels
        let r = fit_rect((333, 777), (1280, 720));
        assert_eq!(
            (r.left % 2, r.top % 2, width(&r) % 2, height(&r) % 2),
            (0, 0, 0, 0)
        );
        assert!(r.right <= 1280 && r.bottom <= 720);
    }

    #[test]
    fn crops_a_region_in_physical_pixels() {
        let region = Rect {
            x: 100.0,
            y: 50.0,
            width: 641.0,
            height: 481.0,
        };
        // 150%: DIP → physical (right edge 741 DIP → 1112 px), even sides
        assert_eq!(
            region_crop(region, 1.5, (3840, 2160)),
            Some(rect(150, 75, 1112, 797))
        );
        // clipped to the display
        let off = Rect {
            x: 1800.0,
            y: 1000.0,
            width: 400.0,
            height: 400.0,
        };
        assert_eq!(
            region_crop(off, 1.0, (1920, 1080)),
            Some(rect(1800, 1000, 1920, 1080))
        );
        // nothing on the display
        let outside = Rect {
            x: 3000.0,
            y: 0.0,
            width: 400.0,
            height: 400.0,
        };
        assert_eq!(region_crop(outside, 1.0, (1920, 1080)), None);
        // a bad scale reads as 1
        assert_eq!(
            region_crop(region, f64::NAN, (1920, 1080)),
            Some(rect(100, 50, 740, 530))
        );
    }

    #[test]
    fn clips_a_crop_to_a_smaller_source() {
        assert_eq!(
            clip(rect(100, 100, 900, 700), (800, 600)),
            rect(100, 100, 800, 600)
        );
        assert_eq!(
            clip(rect(100, 100, 900, 700), (1920, 1080)),
            rect(100, 100, 900, 700)
        );
    }
}
