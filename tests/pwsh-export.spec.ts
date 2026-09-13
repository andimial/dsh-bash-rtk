import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local'
import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'
import pwshDefault, { RtkPwshExecutor, RtkSandboxPwshExecutor } from '../src/pwsh.ts'

/** The declared export map, as npm publishes it. */
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, unknown>
}

describe('@deeptrial/dsh-bash-rtk/pwsh export', () => {
  it('defaults to the sandbox pwsh executor and names the local one', () => {
    expect(pwshDefault).toBe(RtkSandboxPwshExecutor)
  })

  it('places the two classes on the right side of the local/sandbox split', () => {
    expect(RtkPwshExecutor.prototype).toBeInstanceOf(PwshLocalExecutor)
    expect(RtkPwshExecutor.prototype).not.toBeInstanceOf(SandboxPwshExecutor)
    expect(RtkSandboxPwshExecutor.prototype).toBeInstanceOf(SandboxPwshExecutor)
  })

  it('resolves the ./pwsh subpath to the built pwsh entry', () => {
    expect(pkg.exports['./pwsh']).toEqual({
      types: './lib/pwsh.d.ts',
      default: './lib/pwsh.js',
    })
  })
})
