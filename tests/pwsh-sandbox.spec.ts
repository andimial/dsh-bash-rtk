import { describe, expect, it } from 'vitest'
import { ENCODING_PREAMBLE } from '@deepseek-ai/dsh-pwsh-local'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { RtkSandboxPwshExecutor } from '../src/pwsh.ts'
import { sandboxHarness } from './support/sandbox-harness.ts'

/**
 * The executable the executor is configured with. Any runnable file proves the
 * boundary this spec owns (the pwsh argv SHAPE is upstream's contract, and the
 * fake provider confines before anything executes), so the suite stays
 * independent of a pwsh install on the machine running it.
 */
const PWSH_PATH = process.execPath

const PWSH_ARGV = [PWSH_PATH, '-NoLogo', '-NoProfile', '-NonInteractive', '-Command'] as const

async function setup(config: { mode?: SandboxMode } = {}) {
  const { ctx, calls } = await sandboxHarness(config)
  await ctx.plugin(RtkSandboxPwshExecutor, { pwshPath: PWSH_PATH, graceMs: 200, rtkAvailable: true })
  const pwsh = ctx.shell as RtkSandboxPwshExecutor
  return { ctx, pwsh, calls }
}

describe('RtkSandboxPwshExecutor', () => {
  it('registers as ctx.shell', async () => {
    const { pwsh } = await setup()
    expect(pwsh).toBeInstanceOf(RtkSandboxPwshExecutor)
  })

  it('routes eligible commands before the sandbox confines them', async () => {
    const { pwsh, calls } = await setup({ mode: 'read-only' })
    await pwsh.run(pwsh.resolve({ command: 'git status' }))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual([...PWSH_ARGV, `${ENCODING_PREAMBLE}rtk git status`])
  })

  it('keeps routing full-access runs on every host', async () => {
    const { pwsh } = await setup({ mode: 'danger-full-access' })
    expect(pwsh.resolve({ command: 'git status' }).command).toBe('rtk git status')
  })

  it('wraps in resolve(), not in argv()', async () => {
    const { pwsh } = await setup()
    const spec = pwsh.resolve({ command: 'git status' })
    expect(spec.command).toBe('rtk git status')
    expect(spec.command).not.toContain(ENCODING_PREAMBLE)
  })

  it('leaves complex commands unchanged before confinement', async () => {
    const { pwsh, calls } = await setup()
    await pwsh.run(pwsh.resolve({ command: 'git status | Select-String x' }))
    expect(calls[0]?.argv).toEqual([...PWSH_ARGV, `${ENCODING_PREAMBLE}git status | Select-String x`])
  })

  it('leaves non-whitelisted commands unchanged before confinement', async () => {
    const { pwsh, calls } = await setup()
    await pwsh.run(pwsh.resolve({ command: 'Get-ChildItem -Recurse' }))
    expect(calls[0]?.argv).toEqual([...PWSH_ARGV, `${ENCODING_PREAMBLE}Get-ChildItem -Recurse`])
  })

  it('leaves pwsh-specific metacharacters unchanged before confinement', async () => {
    const { pwsh, calls } = await setup()
    await pwsh.run(pwsh.resolve({ command: 'git status # note' }))
    expect(calls[0]?.argv).toEqual([...PWSH_ARGV, `${ENCODING_PREAMBLE}git status # note`])
  })

  it('stamps sandbox facts on the result', async () => {
    const { pwsh } = await setup({ mode: 'read-only' })
    const result = await pwsh.run(pwsh.resolve({ command: 'echo hi' }))
    expect(result.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
  })
})
