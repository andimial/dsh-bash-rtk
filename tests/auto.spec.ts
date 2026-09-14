import { spawnSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvePwshPath } from '@deepseek-ai/dsh-pwsh-local'
import apply, { pickShell } from '../src/auto.ts'
import type { Config as AutoConfig, PreferShell } from '../src/auto.ts'
import { RtkSandboxBashExecutor } from '../src/index.ts'
import { RtkSandboxPwshExecutor } from '../src/pwsh.ts'
import { sandboxHarness } from './support/sandbox-harness.ts'

/**
 * The probe is the only process the assembler starts, so this spec intercepts
 * `spawnSync` to serve verdicts instead of launching a real pwsh: every
 * assembler case below is deterministic on a host with or without one.
 */
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawnSync: vi.fn() }
})

const spawnSyncMock = vi.mocked(spawnSync)

/** The only field either probe reads; the rest of the spawn result is irrelevant here. */
const exitStatus = (status: number | null) => ({ status }) as unknown as ReturnType<typeof spawnSync>

beforeEach(() => {
  spawnSyncMock.mockReset()
})

/** One unconfined per-run policy, so routing cases stay host-independent. */
const FULL_ACCESS = { mode: 'danger-full-access', workspaceRoot: process.cwd() } as const

async function setup(config: AutoConfig = {}) {
  const { ctx } = await sandboxHarness()
  await ctx.plugin(apply, { rtkAvailable: true, ...config })
  return { ctx }
}

describe('pickShell', () => {
  const cases: [PreferShell, boolean, 'bash' | 'pwsh'][] = [
    ['auto', true, 'pwsh'],
    ['auto', false, 'bash'],
    ['pwsh', true, 'pwsh'],
    ['pwsh', false, 'pwsh'],
    ['bash', true, 'bash'],
    ['bash', false, 'bash'],
  ]

  it.each(cases)('preferShell %s + pwshAvailable %s -> %s', (preferShell, pwshAvailable, expected) => {
    expect(pickShell(preferShell, pwshAvailable)).toBe(expected)
  })
})

describe('auto assembler', () => {
  it('mounts the pwsh family when the probe starts pwsh', async () => {
    spawnSyncMock.mockReturnValue(exitStatus(0))
    const { ctx } = await setup()
    expect(ctx.shell).toBeInstanceOf(RtkSandboxPwshExecutor)
  })

  it('falls back to the bash family when the probe cannot start pwsh', async () => {
    spawnSyncMock.mockReturnValue(exitStatus(1))
    const { ctx } = await setup()
    expect(ctx.shell).toBeInstanceOf(RtkSandboxBashExecutor)
  })

  it('takes a pinned verdict from config without probing', async () => {
    const { ctx } = await setup({ preferShell: 'bash', pwshAvailable: true })
    expect(ctx.shell).toBeInstanceOf(RtkSandboxBashExecutor)
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it('pins the pwsh family even where the probe would say no', async () => {
    const { ctx } = await setup({ preferShell: 'pwsh', pwshAvailable: false })
    expect(ctx.shell).toBeInstanceOf(RtkSandboxPwshExecutor)
  })

  it('probes the pwsh candidate the executor would spawn, once', async () => {
    spawnSyncMock.mockReturnValue(exitStatus(0))
    const { ctx } = await setup()
    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
    expect(spawnSyncMock.mock.calls[0]?.[0]).toBe(resolvePwshPath())
    ctx.shell.resolve({ command: 'git status' })
    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
  })

  it('probes a configured pwshPath instead of resolving one', async () => {
    spawnSyncMock.mockReturnValue(exitStatus(0))
    const { ctx } = await setup({ pwshPath: 'C:\\custom\\pwsh.exe' })
    expect(spawnSyncMock.mock.calls[0]?.[0]).toBe('C:\\custom\\pwsh.exe')
    expect(ctx.shell).toBeInstanceOf(RtkSandboxPwshExecutor)
  })

  it('hands the mounted executor the whole config, not just the verdict', async () => {
    spawnSyncMock.mockReturnValue(exitStatus(0))
    const { ctx } = await setup({ pwshPath: 'C:\\custom\\pwsh.exe' })
    const shell = ctx.shell
    if (!(shell instanceof RtkSandboxPwshExecutor)) throw new Error('expected the pwsh family to be mounted')
    expect(shell.pwshPath).toBe('C:\\custom\\pwsh.exe')
  })

  it('wraps through the bash metacharacter set when bash is mounted', async () => {
    spawnSyncMock.mockReturnValue(exitStatus(1))
    const { ctx } = await setup()
    // An unconfined run: confined Windows runs pass through on either dialect.
    expect(ctx.shell.resolve({ command: 'git status # note', sandboxPolicy: FULL_ACCESS }).command).toBe('rtk git status # note')
  })

  it('wraps through the pwsh metacharacter set when pwsh is mounted', async () => {
    spawnSyncMock.mockReturnValue(exitStatus(0))
    const { ctx } = await setup()
    expect(ctx.shell.resolve({ command: 'git status # note', sandboxPolicy: FULL_ACCESS }).command).toBe('git status # note')
  })
})
