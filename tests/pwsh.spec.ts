import { describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { RtkPwshExecutor } from '../src/pwsh.ts'

async function setup(opts: { rtkAvailable?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(RtkPwshExecutor, { pwshPath: 'pwsh', rtkAvailable: true, ...opts })
  const pwsh = ctx.shell as RtkPwshExecutor
  return { ctx, pwsh }
}

describe('RtkPwshExecutor', () => {
  it('registers as ctx.shell', async () => {
    const { pwsh } = await setup()
    expect(pwsh).toBeInstanceOf(RtkPwshExecutor)
  })

  it('wraps eligible simple commands in resolve()', async () => {
    const { pwsh } = await setup()
    const spec = pwsh.resolve({ command: 'git status' })
    expect(spec.command).toBe('rtk git status')
  })

  it('leaves complex commands unchanged in resolve()', async () => {
    const { pwsh } = await setup()
    const spec = pwsh.resolve({ command: 'git status | Select-String x' })
    expect(spec.command).toBe('git status | Select-String x')
  })

  it('leaves non-whitelisted commands unchanged in resolve()', async () => {
    const { pwsh } = await setup()
    const spec = pwsh.resolve({ command: 'Get-ChildItem -Recurse' })
    expect(spec.command).toBe('Get-ChildItem -Recurse')
  })

  it('judges complexity by the pwsh metacharacter set', async () => {
    const { pwsh } = await setup()
    const spec = pwsh.resolve({ command: 'git status # note' })
    expect(spec.command).toBe('git status # note')
  })

  it('routes under a confined-looking policy, which a local executor never applies', async () => {
    const { pwsh } = await setup()
    const spec = pwsh.resolve({ command: 'git status', sandboxPolicy: { mode: 'workspace-write', workspaceRoot: process.cwd() } })
    expect(spec.command).toBe('rtk git status')
  })

  it('falls back to identity when rtkAvailable is false', async () => {
    const { pwsh } = await setup({ rtkAvailable: false })
    const spec = pwsh.resolve({ command: 'git status' })
    expect(spec.command).toBe('git status')
  })

  it('keeps the upstream workdir and timeout semantics', async () => {
    const { pwsh } = await setup()
    const spec = pwsh.resolve({ command: 'git status', workdir: 'C:\\work', timeoutMs: 1234 })
    expect(spec.workdir).toBe('C:\\work')
    expect(spec.timeoutMs).toBe(1234)
  })
})
