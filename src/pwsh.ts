/**
 * rtk (Rust Token Killer) pwsh executor family for the DeepSeek Harness: the
 * pwsh members of the package's executor family, mirroring the bash ones. Both
 * providers subclass the stock pwsh executors and rewrite `spec.command` after
 * `resolve()`, so workdir/timeout/env/exit-code/background-job and (for the
 * sandbox variant) confinement semantics are inherited unchanged. The pwsh
 * `ENCODING_PREAMBLE` is an argv-level concern and never appears at this
 * boundary.
 *
 * A command that is not eligible for wrapping (complex pwsh source, a
 * non-whitelisted tool, or a missing `rtk` binary) passes through
 * byte-for-byte.
 *
 * @module @deeptrial/dsh-bash-rtk/pwsh
 */

import { Context } from 'cordis'
import { PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-pwsh-local'
import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'
import type { Config as SandboxConfig } from '@deepseek-ai/dsh-pwsh-sandbox'
import type { ShellExecRequest, ShellExecSpec } from '@deepseek-ai/dsh-shell'
import { wrapWithRtk } from './wrap.ts'
import { probeRtk } from './rtk.ts'

/** Extend the upstream pwsh config so cordis plugin() accepts rtkAvailable. */
declare module '@deepseek-ai/dsh-pwsh-local' {
  interface Config {
    rtkAvailable?: boolean
  }
}

/**
 * rtk-wrapping LOCAL pwsh executor (no file sandbox). Registers as `ctx.shell`
 * in place of `dsh-pwsh-local`; use where confinement is not required (e.g.
 * `danger-full-access` deployments).
 */
export class RtkPwshExecutor extends PwshLocalExecutor {
  private readonly rtkAvailable: boolean

  constructor(ctx: Context, config: LocalConfig) {
    super(ctx, config)
    this.rtkAvailable = config.rtkAvailable ?? probeRtk()
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    const spec = super.resolve(request)
    return { ...spec, command: wrapWithRtk(spec.command, this.rtkAvailable, 'pwsh') }
  }
}

/**
 * rtk-wrapping SANDBOX pwsh executor (preserves file confinement). Registers
 * as `ctx.shell` in place of `dsh-pwsh-sandbox`; the wrap happens before
 * `run`/`start` build the pwsh argv, so both the `danger-full-access` and the
 * confined paths run the already-wrapped source.
 */
export class RtkSandboxPwshExecutor extends SandboxPwshExecutor {
  static override inject = ['subprocess', 'sandbox', 'sandboxPolicy']

  private readonly rtkAvailable: boolean

  constructor(ctx: Context, config: SandboxConfig) {
    super(ctx, config)
    this.rtkAvailable = config.rtkAvailable ?? probeRtk()
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    const spec = super.resolve(request)
    return { ...spec, command: wrapWithRtk(spec.command, this.rtkAvailable, 'pwsh') }
  }
}

export default RtkSandboxPwshExecutor
