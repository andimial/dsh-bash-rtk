/**
 * rtk (Rust Token Killer) bash executor plugin for the DeepSeek Harness.
 * Two providers wrap the stock bash executors and rewrite the shell source at
 * the `resolve` boundary, so workdir/timeout/env/exit-code/background-job and
 * (for the sandbox variant) confinement semantics are all inherited unchanged.
 * A command that is not eligible for wrapping (complex shell, non-whitelisted
 * tool, or a missing `rtk` binary) passes through byte-for-byte.
 *
 * The pwsh members of the same executor family live in the `./pwsh` subpath
 * export.
 *
 * @module @deeptrial/dsh-bash-rtk
 */

import { Context } from 'cordis'
import { LocalBashExecutor } from '@deepseek-ai/dsh-bash-local'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-bash-local'
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox'
import type { Config as SandboxConfig } from '@deepseek-ai/dsh-bash-sandbox'
import type { ShellExecRequest, ShellExecSpec } from '@deepseek-ai/dsh-shell'
import { wrapWithRtk } from './wrap.ts'
import { probeRtk } from './rtk.ts'

export { wrapWithRtk, type ShellDimension } from './wrap.ts'

/** Extend the upstream config so cordis plugin() accepts rtkAvailable. */
declare module '@deepseek-ai/dsh-bash-local' {
  interface Config {
    rtkAvailable?: boolean
  }
}

/**
 * rtk-wrapping LOCAL bash executor (no file sandbox). Registers as `ctx.shell`
 * in place of `dsh-bash-local`; use where confinement is not required (e.g.
 * `danger-full-access` deployments).
 */
export class RtkBashExecutor extends LocalBashExecutor {
  private readonly rtkAvailable: boolean

  constructor(ctx: Context, config: LocalConfig) {
    super(ctx, config)
    this.rtkAvailable = config.rtkAvailable ?? probeRtk()
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    const spec = super.resolve(request)
    return { ...spec, command: wrapWithRtk(spec.command, this.rtkAvailable, 'bash') }
  }
}

/**
 * rtk-wrapping SANDBOX bash executor (preserves file confinement). Registers
 * as `ctx.shell` in place of `dsh-bash-sandbox`; the wrap happens before
 * `run`/`start` read `spec.command`, so the source every routing path runs is
 * already wrapped. Every run is wrapped, confined Windows runs included: the
 * restricted token cannot host rtk's piped child, and that is documented as a
 * warning instead of guarded here (see docs/adr/0004).
 */
export class RtkSandboxBashExecutor extends SandboxBashExecutor {
  static override inject = ['subprocess', 'sandbox', 'sandboxPolicy']

  private readonly rtkAvailable: boolean

  constructor(ctx: Context, config: SandboxConfig) {
    super(ctx, config)
    this.rtkAvailable = config.rtkAvailable ?? probeRtk()
  }

  override resolve(request: ShellExecRequest): ShellExecSpec {
    const spec = super.resolve(request)
    return { ...spec, command: wrapWithRtk(spec.command, this.rtkAvailable, 'bash') }
  }
}

export default RtkSandboxBashExecutor
