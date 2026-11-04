// Reference frames (D-023, data-model.md): a JPEG every `frameIntervalMs` of video time,
// `frameWidth` px wide, encoded with WIC on its own thread so the capture loop never waits on
// the disk. The `frame` event goes out once the file is closed.
use std::path::PathBuf;
use std::sync::mpsc::{Sender, channel};
use std::thread::JoinHandle;
use windows::Win32::Foundation::GENERIC_WRITE;
use windows::Win32::Graphics::Imaging::*;
use windows::Win32::System::Com::StructuredStorage::PROPBAG2;
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
};
use windows::Win32::System::Variant::VARIANT;
use windows::core::{HSTRING, PWSTR, Result, w};

/// JPEG quality (D-023: ~0.7).
const QUALITY: f32 = 0.7;

/// One thumbnail: 32bpp BGRX rows, `width * 4` bytes each.
pub struct Job {
    pub file: String,
    pub t_ms: f64,
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

pub struct Thumbs {
    sender: Option<Sender<Job>>,
    thread: Option<JoinHandle<u32>>,
}

impl Thumbs {
    pub fn start(dir: PathBuf) -> Thumbs {
        let (sender, receiver) = channel::<Job>();
        let thread = std::thread::Builder::new()
            .name("thumbs".into())
            .spawn(move || {
                let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
                let factory: Option<IWICImagingFactory> = unsafe {
                    CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)
                }
                .map_err(|e| {
                    crate::out::diag(&format!("WIC unavailable, no reference frames: {e}"))
                })
                .ok();
                let mut written = 0u32;
                for job in receiver {
                    let Some(factory) = &factory else { continue };
                    match encode(factory, &dir.join(&job.file), &job) {
                        Ok(()) => {
                            written += 1;
                            crate::out::frame(&job.file, job.t_ms);
                        }
                        Err(e) => crate::out::diag(&format!("reference frame not written: {e}")),
                    }
                }
                written
            })
            .expect("spawn the thumbnail thread");
        Thumbs {
            sender: Some(sender),
            thread: Some(thread),
        }
    }

    pub fn send(&self, job: Job) {
        if let Some(sender) = &self.sender {
            let _ = sender.send(job);
        }
    }

    /// Waits for the queued thumbnails; returns how many were written.
    pub fn finish(&mut self) -> u32 {
        self.sender = None;
        self.thread.take().map_or(0, |t| t.join().unwrap_or(0))
    }
}

fn encode(factory: &IWICImagingFactory, path: &std::path::Path, job: &Job) -> Result<()> {
    unsafe {
        let stream = factory.CreateStream()?;
        stream.InitializeFromFilename(&HSTRING::from(path), GENERIC_WRITE.0)?;
        let encoder = factory.CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())?;
        encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
        let mut frame = None;
        let mut options = None;
        encoder.CreateNewFrame(&mut frame, &mut options)?;
        let frame = frame.ok_or_else(windows::core::Error::empty)?;
        if let Some(options) = &options {
            let name = PROPBAG2 {
                pstrName: PWSTR(w!("ImageQuality").as_ptr() as *mut u16),
                ..Default::default()
            };
            options.Write(1, &name, &VARIANT::from(QUALITY))?;
        }
        frame.Initialize(options.as_ref())?;
        frame.SetSize(job.width, job.height)?;
        let bitmap = factory.CreateBitmapFromMemory(
            job.width,
            job.height,
            &GUID_WICPixelFormat32bppBGR,
            job.width * 4,
            &job.pixels,
        )?;
        // WriteSource converts to the encoder's pixel format (24bpp BGR for JPEG).
        frame.WriteSource(&bitmap, std::ptr::null())?;
        frame.Commit()?;
        encoder.Commit()?;
        stream.Commit(windows::Win32::System::Com::STGC_DEFAULT)?;
    }
    Ok(())
}
