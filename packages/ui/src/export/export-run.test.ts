import { describe, expect, it } from 'vitest'
import { jobsAfterFailure, jobStep, type ExportJob } from './useExportRun.ts'

const waiting: ExportJob = {
  aspect: '16:9',
  status: 'waiting',
  progress: 0,
  name: null,
  path: null,
}

describe('export retry', () => {
  it('exports the whole file for a job that never saved one', () => {
    expect(jobStep(waiting)).toBe('file')
    expect(
      jobStep({ ...waiting, status: 'exporting', progress: 0.4, name: 'Demo 16x9 1080p30.mp4' }),
    ).toBe('file')
  })

  it('only writes the .srt again when the video was saved and the .srt failed', () => {
    const saved: ExportJob = {
      ...waiting,
      status: 'exporting',
      progress: 1,
      name: 'Demo 16x9 1080p30.mp4',
      path: '/Videos/Demo 16x9 1080p30.mp4',
    }
    const [after] = jobsAfterFailure([saved], 0)
    expect(after).toMatchObject({
      status: 'waiting',
      progress: 1,
      name: 'Demo 16x9 1080p30.mp4',
      path: '/Videos/Demo 16x9 1080p30.mp4',
    })
    expect(jobStep(after as ExportJob)).toBe('srt')
  })

  it('skips finished jobs and resets only the failed one', () => {
    const done: ExportJob = {
      ...waiting,
      status: 'done',
      progress: 1,
      path: '/a.mp4',
      name: 'a.mp4',
    }
    const failing: ExportJob = { ...waiting, aspect: '1:1', status: 'exporting', progress: 0.5 }
    const jobs = jobsAfterFailure([done, failing], 1)
    expect(jobs[0]).toBe(done)
    expect(jobStep(done)).toBe('none')
    expect(jobs[1]).toMatchObject({ status: 'waiting', progress: 0, path: null })
    expect(jobStep(jobs[1] as ExportJob)).toBe('file')
  })
})
