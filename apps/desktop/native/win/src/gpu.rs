// Direct3D 11: the device shared by Windows Graphics Capture and Media Foundation, and the
// D3D11 video processor that turns captured BGRA frames into NV12 at the video size (color
// conversion and any downscaling on the GPU) and NV12 frames into small BGRA thumbnails.
use std::cell::Cell;
use std::rc::Rc;
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Win32::Foundation::{HMODULE, RECT};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Media::MediaFoundation::{
    IMF2DBuffer, IMFMediaBuffer, MFCreateDXGISurfaceBuffer,
};
use windows::Win32::System::WinRT::Direct3D11::CreateDirect3D11DeviceFromDXGIDevice;
use windows::core::{IUnknown_Vtbl, Interface, Result};

pub struct Gpu {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    video_device: ID3D11VideoDevice,
    video_context: ID3D11VideoContext,
}

impl Gpu {
    pub fn new() -> Result<Gpu> {
        let mut device = None;
        let mut context = None;
        unsafe {
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                // BGRA for capture surfaces, VIDEO for the video processor and the encoder
                D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )?;
        }
        let device: ID3D11Device = device.ok_or_else(windows::core::Error::empty)?;
        let context = context.ok_or_else(windows::core::Error::empty)?;
        // Media Foundation uses the device from its own threads.
        let multithread: ID3D11Multithread = device.cast()?;
        let _ = unsafe { multithread.SetMultithreadProtected(true) };
        Ok(Gpu {
            video_device: device.cast()?,
            video_context: context.cast()?,
            device,
            context,
        })
    }

    /// The same device, as the WinRT object Windows Graphics Capture wants.
    pub fn winrt_device(&self) -> Result<IDirect3DDevice> {
        let dxgi: IDXGIDevice = self.device.cast()?;
        unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()
    }

    pub fn texture(
        &self,
        width: u32,
        height: u32,
        format: DXGI_FORMAT,
        staging: bool,
    ) -> Result<ID3D11Texture2D> {
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: format,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: if staging {
                D3D11_USAGE_STAGING
            } else {
                D3D11_USAGE_DEFAULT
            },
            BindFlags: if staging {
                0
            } else {
                D3D11_BIND_RENDER_TARGET.0 as u32
            },
            CPUAccessFlags: if staging {
                D3D11_CPU_ACCESS_READ.0 as u32
            } else {
                0
            },
            MiscFlags: 0,
        };
        let mut texture = None;
        unsafe {
            self.device
                .CreateTexture2D(&desc, None, Some(&mut texture))?
        };
        texture.ok_or_else(windows::core::Error::empty)
    }

    /// Copies `texture` into `staging` and calls `read(rows, row_pitch)` with the mapped bytes.
    pub fn read_back<T>(
        &self,
        texture: &ID3D11Texture2D,
        staging: &ID3D11Texture2D,
        read: impl FnOnce(*const u8, usize) -> T,
    ) -> Result<T> {
        unsafe {
            self.context.CopyResource(staging, texture);
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            self.context
                .Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
            let value = read(mapped.pData as *const u8, mapped.RowPitch as usize);
            self.context.Unmap(staging, 0);
            Ok(value)
        }
    }
}

/// One D3D11 video processor between two formats and sizes.
pub struct Processor {
    enumerator: ID3D11VideoProcessorEnumerator,
    processor: ID3D11VideoProcessor,
    output_width: u32,
    output_height: u32,
}

impl Processor {
    pub fn new(
        gpu: &Gpu,
        input: (u32, u32),
        output: (u32, u32),
        input_space: DXGI_COLOR_SPACE_TYPE,
        output_space: DXGI_COLOR_SPACE_TYPE,
    ) -> Result<Processor> {
        let desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
            InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            InputFrameRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            InputWidth: input.0,
            InputHeight: input.1,
            OutputFrameRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            OutputWidth: output.0,
            OutputHeight: output.1,
            Usage: D3D11_VIDEO_USAGE_OPTIMAL_QUALITY,
        };
        unsafe {
            let enumerator = gpu.video_device.CreateVideoProcessorEnumerator(&desc)?;
            let processor = gpu.video_device.CreateVideoProcessor(&enumerator, 0)?;
            let vc = &gpu.video_context;
            vc.VideoProcessorSetStreamFrameFormat(
                &processor,
                0,
                D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            );
            // no driver "enhancements" (denoise, edge enhancement...): screen content stays crisp
            vc.VideoProcessorSetStreamAutoProcessingMode(&processor, 0, false);
            let vc1: ID3D11VideoContext1 = vc.cast()?;
            vc1.VideoProcessorSetStreamColorSpace1(&processor, 0, input_space);
            vc1.VideoProcessorSetOutputColorSpace1(&processor, output_space);
            let full = rect(output.0, output.1);
            vc.VideoProcessorSetStreamDestRect(&processor, 0, true, Some(&full));
            vc.VideoProcessorSetOutputTargetRect(&processor, true, Some(&full));
            // What a window fitted inside the video leaves around it (A-08) is black.
            let black = D3D11_VIDEO_COLOR {
                Anonymous: D3D11_VIDEO_COLOR_0 {
                    RGBA: D3D11_VIDEO_COLOR_RGBA {
                        R: 0.0,
                        G: 0.0,
                        B: 0.0,
                        A: 1.0,
                    },
                },
            };
            vc.VideoProcessorSetOutputBackgroundColor(&processor, false, &black);
            Ok(Processor {
                enumerator,
                processor,
                output_width: output.0,
                output_height: output.1,
            })
        }
    }

    pub fn output_view(
        &self,
        gpu: &Gpu,
        texture: &ID3D11Texture2D,
    ) -> Result<ID3D11VideoProcessorOutputView> {
        let desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
            ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 {
                Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 },
            },
        };
        let mut view = None;
        unsafe {
            gpu.video_device.CreateVideoProcessorOutputView(
                texture,
                &self.enumerator,
                &desc,
                Some(&mut view),
            )?
        };
        view.ok_or_else(windows::core::Error::empty)
    }

    /// Draws the `source` part of `input` over the whole output, scaling as needed.
    pub fn blit(
        &self,
        gpu: &Gpu,
        input: &ID3D11Texture2D,
        source: (u32, u32),
        output: &ID3D11VideoProcessorOutputView,
    ) -> Result<()> {
        let full = rect(self.output_width, self.output_height);
        self.blit_rect(gpu, input, rect(source.0, source.1), full, output)
    }

    /// Draws the `source` rectangle of `input` into the `dest` rectangle of the output, scaling
    /// as needed; the rest of the output is the background (black). A-08: a region is a
    /// `source` crop, a resized window a smaller `dest`.
    pub fn blit_rect(
        &self,
        gpu: &Gpu,
        input: &ID3D11Texture2D,
        source: RECT,
        dest: RECT,
        output: &ID3D11VideoProcessorOutputView,
    ) -> Result<()> {
        let desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
            FourCC: 0,
            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 {
                Texture2D: D3D11_TEX2D_VPIV {
                    MipSlice: 0,
                    ArraySlice: 0,
                },
            },
        };
        unsafe {
            let mut view = None;
            gpu.video_device.CreateVideoProcessorInputView(
                input,
                &self.enumerator,
                &desc,
                Some(&mut view),
            )?;
            gpu.video_context.VideoProcessorSetStreamSourceRect(
                &self.processor,
                0,
                true,
                Some(&source),
            );
            gpu.video_context.VideoProcessorSetStreamDestRect(
                &self.processor,
                0,
                true,
                Some(&dest),
            );
            let mut stream = D3D11_VIDEO_PROCESSOR_STREAM {
                Enable: true.into(),
                pInputSurface: core::mem::ManuallyDrop::new(view),
                ..Default::default()
            };
            let result = gpu.video_context.VideoProcessorBlt(
                &self.processor,
                output,
                0,
                std::slice::from_ref(&stream),
            );
            core::mem::ManuallyDrop::drop(&mut stream.pInputSurface);
            result
        }
    }

    pub fn output_size(&self) -> (u32, u32) {
        (self.output_width, self.output_height)
    }
}

fn rect(width: u32, height: u32) -> RECT {
    RECT {
        left: 0,
        top: 0,
        right: width as i32,
        bottom: height as i32,
    }
}

/// COM reference count of an object, without changing it.
fn com_refs<T: Interface>(object: &T) -> u32 {
    unsafe {
        let raw = object.as_raw();
        let vtable = *(raw as *const *const IUnknown_Vtbl);
        let count = ((*vtable).AddRef)(raw);
        ((*vtable).Release)(raw);
        count - 1
    }
}

/// An NV12 frame at the video size: what the encoder gets.
pub struct Surface {
    pub texture: ID3D11Texture2D,
    pub view: ID3D11VideoProcessorOutputView,
    /// The DXGI buffer given to Media Foundation (GPU path), created once per texture.
    pub buffer: Option<IMFMediaBuffer>,
    /// COM references on `texture` and `buffer` when nothing but this pool holds them.
    idle_refs: (u32, u32),
}

impl Surface {
    /// The encoder may keep a sample (and through it, the texture) for a few frames after
    /// WriteSample returns; a surface is reused only once Media Foundation let go of it.
    fn idle(&self) -> bool {
        com_refs(&self.texture) == self.idle_refs.0
            && self
                .buffer
                .as_ref()
                .is_none_or(|b| com_refs(b) == self.idle_refs.1)
    }
}

/// Recycles NV12 surfaces.
pub struct SurfacePool {
    surfaces: Vec<Rc<Surface>>,
    width: u32,
    height: u32,
    dxgi_buffers: bool,
    warned: Cell<bool>,
}

/// Above this the encoder is far behind; frames are dropped rather than piling up in VRAM.
const MAX_SURFACES: usize = 24;

impl SurfacePool {
    pub fn new(width: u32, height: u32, dxgi_buffers: bool) -> SurfacePool {
        SurfacePool {
            surfaces: Vec::new(),
            width,
            height,
            dxgi_buffers,
            warned: Cell::new(false),
        }
    }

    /// The GPU path wraps each texture in a DXGI buffer; the CPU path reads it back instead.
    pub fn set_dxgi_buffers(&mut self, dxgi_buffers: bool) {
        if self.dxgi_buffers != dxgi_buffers {
            self.dxgi_buffers = dxgi_buffers;
            self.surfaces.clear();
        }
    }

    /// A free surface, or None if too many are still held by the encoder.
    pub fn acquire(&mut self, gpu: &Gpu, processor: &Processor) -> Result<Option<Rc<Surface>>> {
        if let Some(surface) = self
            .surfaces
            .iter()
            .find(|s| Rc::strong_count(s) == 1 && s.idle())
        {
            return Ok(Some(surface.clone()));
        }
        if self.surfaces.len() >= MAX_SURFACES {
            if !self.warned.replace(true) {
                crate::out::diag("encoder is behind: dropping captured frames");
            }
            return Ok(None);
        }
        let texture = gpu.texture(self.width, self.height, DXGI_FORMAT_NV12, false)?;
        let view = processor.output_view(gpu, &texture)?;
        let buffer = if self.dxgi_buffers {
            Some(dxgi_buffer(&texture)?)
        } else {
            None
        };
        let mut surface = Surface {
            texture,
            view,
            buffer,
            idle_refs: (0, 0),
        };
        // Measured now that only the pool holds it: includes what the view and buffer hold.
        surface.idle_refs = (
            com_refs(&surface.texture),
            surface.buffer.as_ref().map_or(0, com_refs),
        );
        let surface = Rc::new(surface);
        self.surfaces.push(surface.clone());
        Ok(Some(surface))
    }
}

/// Wraps an NV12 texture for Media Foundation. The buffer's current length must be set to the
/// image size, or WriteSample refuses it (E_INVALIDARG).
fn dxgi_buffer(texture: &ID3D11Texture2D) -> Result<IMFMediaBuffer> {
    unsafe {
        let buffer = MFCreateDXGISurfaceBuffer(&ID3D11Texture2D::IID, texture, 0, false)?;
        let length = buffer.cast::<IMF2DBuffer>()?.GetContiguousLength()?;
        buffer.SetCurrentLength(length)?;
        Ok(buffer)
    }
}
