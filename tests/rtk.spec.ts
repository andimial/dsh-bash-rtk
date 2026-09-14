import { describe, expect, it } from 'vitest'
import { confinedWindowsRun } from '../src/rtk.ts'

describe('confinedWindowsRun', () => {
  it('confines exactly the Windows restricted-token modes', () => {
    expect(confinedWindowsRun('read-only', 'win32')).toBe(true)
    expect(confinedWindowsRun('workspace-write', 'win32')).toBe(true)
    expect(confinedWindowsRun('danger-full-access', 'win32')).toBe(false)
    expect(confinedWindowsRun(undefined, 'win32')).toBe(false)
  })

  it('never confines a POSIX host, whatever the mode says', () => {
    expect(confinedWindowsRun('read-only', 'linux')).toBe(false)
    expect(confinedWindowsRun('workspace-write', 'linux')).toBe(false)
    expect(confinedWindowsRun('read-only', 'darwin')).toBe(false)
    expect(confinedWindowsRun('workspace-write', 'darwin')).toBe(false)
  })

  it('defaults the platform to the running host', () => {
    expect(confinedWindowsRun('workspace-write')).toBe(process.platform === 'win32')
  })
})
