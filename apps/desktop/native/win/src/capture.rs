// Windows Graphics Capture of one monitor or one window (D-023, A-08), without the system cursor
// (D-005).
//
// The frame pool is free-threaded: FrameArrived fires on a system thread, which only takes the
// frame and hands it to the recorder's thread. Windows that ask not to be captured
// (SetWindowDisplayAffinity WDA_EXCLUDEFROMCAPTURE, which Electron's setContentProtection uses
// for Kamo's floating bar) are left out of the frames by the compositor.
use crate::gpu::Gpu;
use windows::Foundation::{TimeSpan, TypedEventHandler};
use windows::Graphics::Capture::*;
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Direct3D11::ID3D11Texture2D;
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::Win32::System::WinRT::Direct3D11::IDirect3DDxgiInterfaceAccess;
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::core::{IInspectable, Interface, Result};

/// Buffers in the frame pool: one being converted, one arriving.
const POOL_BUFFERS: i32 = 2;

pub fn create_item(monitor: HMONITOR) -> Result<GraphicsCaptureItem> {
    let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
    unsafe { interop.CreateForMonitor(monitor) }
}

/// A-08: one window. WGC follows it when it moves, captures it even when other windows cover
/// it, and its frames change size when it is resized (`texture` recreates the pool).
pub fn create_window_item(window: HWND) -> Result<GraphicsCaptureItem> {
    let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
    unsafe { interop.CreateForWindow(window) }
}

/// Asks for capture without the yellow border (Windows 11). Unpackaged desktop apps are
/// normally allowed without a prompt. Returns a description for the log.
pub fn request_borderless() -> String {
    match GraphicsCaptureAccess::RequestAccessAsync(GraphicsCaptureAccessKind::Borderless)
        .and_then(|op| op.join())
    {
        Ok(status) => {
            // AppCapabilityAccessStatus: 0 denied by system, 1 not declared, 2 denied by user,
            // 3 prompt required, 4 allowed
            let name = [
                "denied by system",
                "not declared",
                "denied by user",
                "prompt required",
                "allowed",
            ]
            .get(status.0 as usize)
            .copied()
            .unwrap_or("unknown");
            format!("borderless access: {name}")
        }
        Err(e) => format!("borderless access not available: {e}"),
    }
}

pub struct Capture {
    /// Kept alive: its Closed event reports a removed monitor.
    _item: GraphicsCaptureItem,
    device: IDirect3DDevice,
    pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    pool_size: SizeInt32,
}

impl Capture {
    pub fn new(
        gpu: &Gpu,
        item: GraphicsCaptureItem,
        fps: u32,
        on_frame: impl Fn(Direct3D11CaptureFrame) + Send + 'static,
        on_closed: impl Fn() + Send + 'static,
    ) -> Result<Capture> {
        let device = gpu.winrt_device()?;
        let size = item.Size()?;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            POOL_BUFFERS,
            size,
        )?;
        pool.FrameArrived(&TypedEventHandler::new(
            move |pool: windows::core::Ref<Direct3D11CaptureFramePool>,
                  _: windows::core::Ref<IInspectable>| {
                if let Some(pool) = pool.as_ref()
                    && let Ok(frame) = pool.TryGetNextFrame()
                {
                    on_frame(frame);
                }
                Ok(())
            },
        ))?;
        // Fires when the monitor goes away, the window is closed, or capture is revoked.
        item.Closed(&TypedEventHandler::new(move |_, _| {
            on_closed();
            Ok(())
        }))?;
        let session = pool.CreateCaptureSession(&item)?;
        // D-005: Kamo draws its own cursor from the mouse events.
        if let Err(e) = session.SetIsCursorCaptureEnabled(false) {
            crate::out::diag(&format!(
                "cannot hide the cursor in the capture (needs Windows 10 2004+): {e}"
            ));
        }
        // Windows 11: no yellow border around the recorded monitor.
        if let Err(e) = session.SetIsBorderRequired(false) {
            crate::out::diag(&format!("capture border stays on: {e}"));
        }
        // Windows 11 24H2: no more frames than the video needs from a 144Hz monitor.
        let interval = TimeSpan {
            Duration: crate::clock::HNS_PER_SECOND / fps as i64,
        };
        if let Err(e) = session.SetMinUpdateInterval(interval) {
            crate::out::diag(&format!("min update interval not set: {e}"));
        }
        Ok(Capture {
            _item: item,
            device,
            pool,
            session,
            pool_size: size,
        })
    }

    pub fn start(&self) -> Result<()> {
        self.session.StartCapture()
    }

    /// The frame's texture and the size of its content. Recreates the pool when the monitor's
    /// resolution changed, so the next frames have the new size.
    pub fn texture(
        &mut self,
        frame: &Direct3D11CaptureFrame,
    ) -> Result<(ID3D11Texture2D, (u32, u32))> {
        let content = frame.ContentSize()?;
        if content.Width != self.pool_size.Width || content.Height != self.pool_size.Height {
            self.pool.Recreate(
                &self.device,
                DirectXPixelFormat::B8G8R8A8UIntNormalized,
                POOL_BUFFERS,
                content,
            )?;
            self.pool_size = content;
        }
        let access: IDirect3DDxgiInterfaceAccess = frame.Surface()?.cast()?;
        let texture: ID3D11Texture2D = unsafe { access.GetInterface()? };
        let mut desc = Default::default();
        unsafe { texture.GetDesc(&mut desc) };
        let width = (content.Width.max(1) as u32).min(desc.Width);
        let height = (content.Height.max(1) as u32).min(desc.Height);
        Ok((texture, (width, height)))
    }

    pub fn close(&self) {
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}
