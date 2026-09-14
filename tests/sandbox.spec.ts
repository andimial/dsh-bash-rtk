import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { RtkSandboxBashExecutor } from '../src/index.ts'
import { confinedWindowsRun } from '../src/rtk.ts'
import { sandboxHarness } from './support/sandbox-harness.ts'

async function setup(config: { mode?: SandboxMode } = {}) {
  const { ctx, calls } = await sandboxHarness(config)
  await ctx.plugin(RtkSandboxBashExecutor, { graceMs: 200, rtkAvailable: true })
  const bash = ctx.shell as RtkSandboxBashExecutor
  return { ctx, bash, calls }
}

describe('RtkSandboxBashExecutor', () => {
  it('registers as ctx.shell', async () => {
    const { bash } = await setup()
    expect(bash).toBeInstanceOf(RtkSandboxBashExecutor)
  })

  it('routes eligible commands before the sandbox confines them, wherever the host allows routing', async () => {
    const { bash, calls } = await setup({ mode: 'read-only' })
    // Confined Windows runs pass through instead: rtk cannot spawn its piped
    // child under the restricted token, so wrapping there would break the
    // command (see rtk.spec.ts for the decision and its truth table).
    const expected = confinedWindowsRun('read-only') ? 'git status' : 'rtk git status'
    await bash.run(bash.resolve({ command: 'git status' }))
    expect(calls).toEqual([{
      argv: ['bash', '-c', expected],
      policy: { mode: 'read-only', workspaceRoot: resolve(process.cwd()) },
    }])
  })

  it('keeps routing full-access runs on every host', async () => {
    const { bash } = await setup({ mode: 'danger-full-access' })
    expect(bash.resolve({ command: 'git status' }).command).toBe('rtk git status')
  })

  it('leaves complex commands unchanged before confinement', async () => {
    const { bash, calls } = await setup({ mode: 'read-only' })
    await bash.run(bash.resolve({ command: 'git status | grep x' }))
    expect(calls[0]?.argv).toEqual(['bash', '-c', 'git status | grep x'])
  })

  it('leaves non-whitelisted commands unchanged before confinement', async () => {
    const { bash, calls } = await setup({ mode: 'read-only' })
    await bash.run(bash.resolve({ command: 'ls -la' }))
    expect(calls[0]?.argv).toEqual(['bash', '-c', 'ls -la'])
  })

  it('stamps sandbox facts on the result', async () => {
    const { bash } = await setup({ mode: 'read-only' })
    const result = await bash.run(bash.resolve({ command: 'echo hi' }))
    expect(result.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
  })
})
