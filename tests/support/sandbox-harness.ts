/**
 * Shared sandbox-executor spec fixture: a real cordis Context carrying a
 * passthrough sandbox provider (recording every confined argv), the real
 * sandbox-policy service, and the real local subprocess runtime. Both the bash
 * and the pwsh sandbox specs register their executor on top of it, so the two
 * dialects are exercised by one identical assembly.
 *
 * @module tests/support/sandbox-harness
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from 'cordis'
import { SandboxProvider } from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv, SandboxMode, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'

/** Per-spec spill directory for the subprocess runtime's overflow files. */
const spillDir = mkdtempSync(join(tmpdir(), 'dsh-bash-rtk-sandbox-spec-'))

/** A passthrough wrap: the caller's argv unchanged, asserted full. */
const passthrough = (argv: readonly string[]): ConfinedArgv =>
  ({ argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] })

/**
 * Stand-in for `ctx.sessionProjections`: the published sandbox-policy service
 * declares it as an injected service and registers its `sandboxMode` fold in
 * the constructor. A spec that never passes a session never reads a fold back,
 * so accepting the registration is the whole contract this fixture needs.
 */
class SessionProjectionsStub extends Service {
  static inject: string[] = []

  constructor(ctx: Context) {
    super(ctx, 'sessionProjections')
  }

  register(_definition: unknown): void {}
}

/** One confined invocation as the fake provider saw it. */
export interface ConfineCall {
  argv: string[]
  policy: SandboxPolicy
}

/** A Context assembled for a sandbox-executor spec, plus the confinement log. */
export interface SandboxHarness {
  ctx: Context
  calls: ConfineCall[]
}

/**
 * Assemble the sandbox spec Context. The executor under test is registered by
 * the caller afterwards (it must be the last provider to claim `ctx.shell`).
 * @param config - the sandbox-policy config (mode only) for this spec.
 * @returns the Context and the recording array every confinement appends to.
 */
export async function sandboxHarness(config: { mode?: SandboxMode } = {}): Promise<SandboxHarness> {
  const { mode } = config
  const calls: ConfineCall[] = []
  class FakeSandboxProvider extends SandboxProvider {
    confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv {
      calls.push({ argv: [...argv], policy })
      return passthrough(argv)
    }
  }
  const ctx = new Context()
  await ctx.plugin(SessionProjectionsStub)
  await ctx.plugin(FakeSandboxProvider)
  await ctx.plugin(SandboxPolicyService, { ...mode !== undefined ? { mode } : {} })
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  return { ctx, calls }
}
