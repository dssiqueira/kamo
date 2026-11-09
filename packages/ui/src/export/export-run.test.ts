import { describe, expect, it } from 'vitest'
import {
  exportJobs,
  jobCaptions,
  jobKey,
  jobsAfterFailure,
  jobStep,
  type ExportJob,
} from './useExportRun.ts'

const waiting: ExportJob = {
  format: 'mp4',
  aspect: '16:9',
  status: 'waiting',
  progress: 0,
  name: null,
  path: null,
}

describe('export jobs', () => {
  it('exports every checked aspect in every checked format, MP4s first', () => {
    const jobs = exportJobs(['16:9', '9:16'], ['gif', 'mp4'])
    expect(jobs.map(jobKey)).toEqual(['mp4-16:9', 'mp4-9:16', 'gif-16:9', 'gif-9:16'])
    expect(jobs.every((job) => job.status === 'waiting' && job.progress === 0)).toBe(true)
    expect(jobs.every((job) => job.name === null && job.path === null)).toBe(true)
  })

  it('makes one job per aspect for a single format, duplicates counted once', () => {
    expect(exportJobs(['1:1', '1:1'], ['gif']).map(jobKey)).toEqual(['gif-1:1'])
    expect(exportJobs(['16:9'], ['mp4']).map(jobKey)).toEqual(['mp4-16:9'])
    expect(exportJobs([], ['mp4', 'gif'])).toEqual([])
    expect(exportJobs(['16:9'], [])).toEqual([])
  })

  it('gives the .srt to the MP4s and burns the captions into the GIFs', () => {
    expect(jobCaptions('srt', 'mp4')).toBe('srt')
    expect(jobCaptions('srt', 'gif')).toBe('burn')
    expect(jobCaptions('burn', 'gif')).toBe('burn')
    expect(jobCaptions('burn', 'mp4')).toBe('burn')
    expect(jobCaptions('none', 'gif')).toBe('none')
  })
})

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

  it('retries only the failed GIF when its MP4 of the same aspect was saved', () => {
    const [mp4, gif] = exportJobs(['16:9'], ['mp4', 'gif']) as [ExportJob, ExportJob]
    const savedMp4: ExportJob = {
      ...mp4,
      status: 'done',
      progress: 1,
      path: '/a.mp4',
      name: 'a.mp4',
    }
    const jobs = jobsAfterFailure([savedMp4, { ...gif, status: 'exporting', progress: 0.3 }], 1)
    expect(jobs.map(jobStep)).toEqual(['none', 'file'])
    expect(jobs[1]).toMatchObject({ format: 'gif', aspect: '16:9', status: 'waiting', progress: 0 })
  })
})
