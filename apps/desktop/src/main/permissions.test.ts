import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ desktopCapturer: {}, shell: {}, systemPreferences: {} }))

const { isPermissionKind, permissionKinds } = await import('./permissions.ts')

describe('permissions', () => {
  it('lists the camera after the others on Mac and Windows', () => {
    expect(permissionKinds('darwin')).toEqual(['screen', 'microphone', 'camera'])
    expect(permissionKinds('win32')).toEqual(['microphone', 'camera'])
    expect(permissionKinds('linux')).toEqual([])
  })

  it('accepts the camera from the renderer, nothing unknown', () => {
    expect(isPermissionKind('camera')).toBe(true)
    expect(isPermissionKind('keyboard')).toBe(false)
  })
})
