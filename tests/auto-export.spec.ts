import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import mainDefault, { RtkSandboxBashExecutor } from '../src/index.ts'
import autoDefault, { apply } from '../src/auto.ts'

/** The declared export map, as npm publishes it. */
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, unknown>
}

describe('@deeptrial/dsh-bash-rtk/auto export', () => {
  it('resolves the ./auto subpath to the built auto entry', () => {
    expect(pkg.exports['./auto']).toEqual({
      types: './lib/auto.d.ts',
      default: './lib/auto.js',
    })
  })

  it('defaults to the assembler plugin', () => {
    expect(autoDefault).toBe(apply)
    expect(typeof autoDefault).toBe('function')
  })

  it('leaves the main entry default on the bash sandbox executor', () => {
    expect(mainDefault).toBe(RtkSandboxBashExecutor)
  })
})
