// H.264 into a fragmented MP4 with the Media Foundation Sink Writer.
//
// Input is NV12 at the video size (gpu.rs converts on the GPU). Two paths:
// - GPU: the sink writer gets the D3D11 device (MF_SINK_WRITER_D3D_MANAGER) and each sample
//   wraps an NV12 texture (MFCreateDXGISurfaceBuffer); a hardware encoder reads it in VRAM.
// - CPU: each new frame is read back to system memory. Used when the GPU path cannot be set up
//   (or KAMO_CAPTURE_CPU=1); about one 3MB copy per new 1080p frame, 12MB at 4K.
// Fragmented MP4 (MFTranscodeContainerType_FMPEG4): every fragment on disk is playable, so a
// crash still leaves a usable `screen.mp4.partial` for recovery (PROTOCOL.md).
use crate::gpu::Gpu;
use windows::Win32::Media::MediaFoundation::*;
use windows::core::{GUID, HSTRING, Interface, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Path {
    Gpu,
    Cpu,
}

pub struct Encoder {
    writer: IMFSinkWriter,
    pub path: Path,
    // Kept alive for the writer's lifetime.
    _manager: Option<IMFDXGIDeviceManager>,
}

/// Screen content is mostly static text: ~0.12 bits per pixel per frame at 30fps is sharp
/// without huge files (1080p30 ≈ 7.5 Mbps); 60fps frames differ less, so ×1.5, not ×2.
fn bitrate(width: u32, height: u32, fps: u32) -> u32 {
    let base = width as f64 * height as f64 * 30.0 * 0.12;
    let rate = if fps >= 60 { base * 1.5 } else { base };
    rate.clamp(2_000_000.0, 80_000_000.0) as u32
}

fn pack(high: u32, low: u32) -> u64 {
    ((high as u64) << 32) | low as u64
}

/// BT.709, limited range: what the video processor writes and what browsers assume for HD.
fn set_video_attributes(t: &IMFMediaType, width: u32, height: u32, fps: u32) -> Result<()> {
    unsafe {
        t.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        t.SetUINT64(&MF_MT_FRAME_SIZE, pack(width, height))?;
        t.SetUINT64(&MF_MT_FRAME_RATE, pack(fps, 1))?;
        t.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack(1, 1))?;
        t.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
        t.SetUINT32(&MF_MT_VIDEO_PRIMARIES, MFVideoPrimaries_BT709.0 as u32)?;
        t.SetUINT32(&MF_MT_TRANSFER_FUNCTION, MFVideoTransFunc_709.0 as u32)?;
        t.SetUINT32(&MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709.0 as u32)?;
        t.SetUINT32(&MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235.0 as u32)?;
    }
    Ok(())
}

impl Encoder {
    /// Opens the writer with constant-quality rate control, then plain VBR, then the encoder's
    /// defaults: not every hardware encoder accepts every mode.
    pub fn new(
        output: &str,
        gpu: &Gpu,
        width: u32,
        height: u32,
        fps: u32,
        path: Path,
    ) -> Result<Encoder> {
        let modes = [
            Some(eAVEncCommonRateControlMode_Quality),
            Some(eAVEncCommonRateControlMode_UnconstrainedVBR),
            None,
        ];
        let mut last = windows::core::Error::empty();
        for mode in modes {
            match Self::open(output, gpu, (width, height), fps, path, mode) {
                Ok(encoder) => return Ok(encoder),
                Err(e) => {
                    crate::out::diag(&format!(
                        "encoder setup with rate control {mode:?} failed: {e}"
                    ));
                    last = e;
                }
            }
        }
        Err(last)
    }

    fn open(
        output: &str,
        gpu: &Gpu,
        (width, height): (u32, u32),
        fps: u32,
        path: Path,
        mode: Option<eAVEncCommonRateControlMode>,
    ) -> Result<Encoder> {
        unsafe {
            let mut attributes = None;
            MFCreateAttributes(&mut attributes, 4)?;
            let attributes = attributes.ok_or_else(windows::core::Error::empty)?;
            attributes.SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 1)?;
            // The name ends in .partial, so the container is set explicitly.
            attributes.SetGUID(
                &MF_TRANSCODE_CONTAINERTYPE,
                &MFTranscodeContainerType_FMPEG4,
            )?;
            let manager = if path == Path::Gpu {
                let mut token = 0u32;
                let mut manager = None;
                MFCreateDXGIDeviceManager(&mut token, &mut manager)?;
                let manager = manager.ok_or_else(windows::core::Error::empty)?;
                manager.ResetDevice(&gpu.device, token)?;
                attributes.SetUnknown(&MF_SINK_WRITER_D3D_MANAGER, &manager)?;
                Some(manager)
            } else {
                None
            };
            let writer = MFCreateSinkWriterFromURL(&HSTRING::from(output), None, &attributes)?;

            let out_type = MFCreateMediaType()?;
            set_video_attributes(&out_type, width, height, fps)?;
            out_type.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)?;
            out_type.SetUINT32(&MF_MT_AVG_BITRATE, bitrate(width, height, fps))?;
            out_type.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High.0 as u32)?;
            let stream = writer.AddStream(&out_type)?;

            let in_type = MFCreateMediaType()?;
            set_video_attributes(&in_type, width, height, fps)?;
            in_type.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_NV12)?;
            in_type.SetUINT32(&MF_MT_DEFAULT_STRIDE, width)?;
            writer.SetInputMediaType(stream, &in_type, &encoding_parameters(fps, mode)?)?;
            log_encoder_settings(&writer);
            writer.BeginWriting()?;
            log_transforms(&writer);
            Ok(Encoder {
                writer,
                path,
                _manager: manager,
            })
        }
    }

    /// Writes one frame. `time` and `duration` are video time in 100ns units.
    pub fn write(&self, buffer: &IMFMediaBuffer, time: i64, duration: i64) -> Result<()> {
        unsafe {
            let sample = MFCreateSample()?;
            sample.AddBuffer(buffer)?;
            sample.SetSampleTime(time)?;
            sample.SetSampleDuration(duration)?;
            self.writer.WriteSample(0, &sample)
        }
    }

    /// Flushes the encoder and closes the file.
    pub fn finalize(self) -> Result<()> {
        unsafe { self.writer.Finalize() }
    }
}

/// Encoder settings, given to the sink writer with the input type (it applies them to the
/// encoder before streaming, when encoders still accept them). Keyframe every 2 seconds (the
/// editor seeks a lot). Constant quality (or VBR) rather than CBR: a repeated frame costs about
/// 200 bytes, so a static screen costs little more than its keyframes (measured on NVENC at
/// 3440x1440, default quality 65: ~1MB per keyframe, ~4Mbps for a still screen).
fn encoding_parameters(
    fps: u32,
    mode: Option<eAVEncCommonRateControlMode>,
) -> Result<IMFAttributes> {
    unsafe {
        let mut attributes = None;
        MFCreateAttributes(&mut attributes, 3)?;
        let attributes = attributes.ok_or_else(windows::core::Error::empty)?;
        if let Some(mode) = mode {
            attributes.SetUINT32(&CODECAPI_AVEncCommonRateControlMode, mode.0 as u32)?;
        }
        attributes.SetUINT32(&CODECAPI_AVEncMPVGOPSize, fps * 2)?;
        Ok(attributes)
    }
}

/// Logs the rate control and GOP the encoder ended up with.
fn log_encoder_settings(writer: &IMFSinkWriter) {
    unsafe {
        let mut raw = std::ptr::null_mut();
        if writer
            .GetServiceForStream(0, &GUID::zeroed(), &ICodecAPI::IID, &mut raw)
            .is_err()
            || raw.is_null()
        {
            return;
        }
        let codec = ICodecAPI::from_raw(raw);
        let read = |api: &GUID| {
            codec
                .GetValue(api)
                .map(|v| v.to_string())
                .unwrap_or_else(|e| format!("? ({})", e.code()))
        };
        crate::out::diag(&format!(
            "encoder rate control {}, quality {}, GOP {}, bitrate {}",
            read(&CODECAPI_AVEncCommonRateControlMode),
            read(&CODECAPI_AVEncCommonQuality),
            read(&CODECAPI_AVEncMPVGOPSize),
            read(&CODECAPI_AVEncCommonMeanBitRate),
        ));
    }
}

/// Logs which transforms the sink writer picked (hardware or software encoder, converters).
fn log_transforms(writer: &IMFSinkWriter) {
    let Ok(writer) = writer.cast::<IMFSinkWriterEx>() else {
        return;
    };
    for index in 0..8 {
        let mut category = GUID::zeroed();
        let mut transform = None;
        if unsafe { writer.GetTransformForStream(0, index, Some(&mut category), &mut transform) }
            .is_err()
        {
            break;
        }
        let Some(transform) = transform else { break };
        let kind = if category == MFT_CATEGORY_VIDEO_ENCODER {
            "encoder"
        } else if category == MFT_CATEGORY_VIDEO_PROCESSOR {
            "video processor"
        } else {
            "transform"
        };
        let hardware = unsafe { transform.GetAttributes() }.ok().is_some_and(|a| {
            unsafe { a.GetStringLength(&MFT_ENUM_HARDWARE_URL_Attribute) }.is_ok()
        });
        let d3d11 = unsafe { transform.GetAttributes() }
            .ok()
            .is_some_and(|a| unsafe { a.GetUINT32(&MF_SA_D3D11_AWARE) }.unwrap_or(0) != 0);
        crate::out::diag(&format!(
            "sink writer {kind}: {}, d3d11-aware: {d3d11}",
            if hardware { "hardware" } else { "software" }
        ));
    }
}

/// HRESULTs that mean the disk is full.
pub fn is_disk_full(error: &windows::core::Error) -> bool {
    matches!(
        error.code().0 as u32,
        0x8007_0070 | 0x8007_0027 | 0x8003_0070
    )
}
