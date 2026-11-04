// Desktop side of the export (F-11): the raw files come from main in byte ranges, the output
// goes to main in positioned chunks (FileSink), and main owns the folder and the dialogs.
import { ExportError, type ExportRecord, type FileSink, type SinkChunk } from '@kamo/core'
import type { RandomAccessFile } from '@kamo/core/export'
import type { ExportPlatform } from '@kamo/ui'
import { ipcErrorCode, type ExportMediaName } from '../../shared/api.ts'

/** A project file read through main (no file:// or fetch in the sandboxed renderer). */
export function projectMedia(projectId: string, file: ExportMediaName | string): RandomAccessFile {
  const name = file as ExportMediaName
  return {
    async size() {
      const size = await window.kamo.getMediaSize(projectId, name)
      if (size === null) throw new Error(`missing ${name}`)
      return size
    },
    read: (start, end) => window.kamo.readMedia(projectId, name, start, end),
  }
}

function toExportError(error: unknown): ExportError {
  const code = ipcErrorCode(error)
  return new ExportError(code === 'disk_full' ? 'disk_full' : 'write_failed', { cause: error })
}

/** Writes into `<export folder>/<name>.partial` through main; commit renames it. */
export const desktopSink: FileSink = {
  async open(fileName) {
    const { id, name } = await window.kamo.openExportFile(fileName).catch((error: unknown) => {
      throw toExportError(error)
    })
    return {
      name,
      stream: new WritableStream<SinkChunk>({
        async write(chunk) {
          // IPC copies the whole underlying buffer of a view: send only these bytes.
          const { data } = chunk
          const bytes =
            data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
              ? data
              : data.slice()
          await window.kamo.writeExportFile(id, chunk.position, bytes).catch((error: unknown) => {
            throw toExportError(error)
          })
        },
      }),
      commit: () =>
        window.kamo.commitExportFile(id).catch((error: unknown) => {
          throw toExportError(error)
        }),
      abort: () => window.kamo.abortExportFile(id),
    }
  },
}

export interface DesktopExportOptions {
  projectId: string
  micEnabled: boolean
  systemEnabled: boolean
  /** the project has a webcam recording (project.webcam set, A-03) */
  webcamEnabled?: boolean
  onExported(record: ExportRecord): void
  onBusyChange(busy: boolean): void
}

export function desktopExportPlatform(options: DesktopExportOptions): ExportPlatform {
  const { projectId } = options
  return {
    sink: desktopSink,
    media: {
      video: projectMedia(projectId, 'screen.mp4'),
      // A track that is on but whose file is missing is reported as unreadable (warning).
      mic: options.micEnabled ? projectMedia(projectId, 'audio.m4a') : null,
      system: options.systemEnabled ? projectMedia(projectId, 'system.m4a') : null,
      webcam: options.webcamEnabled ? projectMedia(projectId, 'webcam.mp4') : null,
      // A-04: main only serves names that look like a project background image.
      backgroundImage: (file) => projectMedia(projectId, file),
    },
    getFolder: async () => (await window.kamo.getFolders()).exportDir,
    chooseFolder: async () => (await window.kamo.chooseFolder('export'))?.exportDir ?? null,
    showInFolder: (path) => void window.kamo.showExportedFile(path),
    onExported: options.onExported,
    onBusyChange: options.onBusyChange,
  }
}
