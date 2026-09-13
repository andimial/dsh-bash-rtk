/**
 * The auto assembler — the package's single overlay entry
 * (`@deeptrial/dsh-bash-rtk/auto`). It probes the pwsh executable the pwsh
 * family would spawn, once, at construction, and mounts exactly one sandbox
 * executor family: the pwsh one when the probe reaches exit 0, the bash one
 * when it does not. One profile is therefore correct on every platform,
 * without a hand-maintained platform switch.
 *
 * `pickShell()` is the whole decision and stays pure; `preferShell` pins the
 * dialect explicitly when the probe would guess wrong. Only the selected
 * family is mounted, so the single-provider `ctx.shell` slot is never
 * double-claimed (upstream fails loud on a second executor).
 *
 * @module @deeptrial/dsh-bash-rtk/auto
 */

import { spawnSync } from 'node:child_process'
import type { Context } from 'cordis'
import { resolvePwshPath } from '@deepseek-ai/dsh-pwsh-local'
import type { Config as SandboxConfig } from '@deepseek-ai/dsh-bash-sandbox'
import { RtkSandboxBashExecutor } from './index.ts'
import { RtkSandboxPwshExecutor } from './pwsh.ts'
import type { ShellDimension } from './wrap.ts'

/** Configured shell preference: `auto` follows the pwsh probe, the others pin it. */
export type PreferShell = 'auto' | ShellDimension

/** Assembler config: the sandbox executor's knobs plus the shell preference. */
export interface Config extends SandboxConfig {
  /** Which family to mount (default `auto`: the pwsh probe decides). */
  preferShell?: PreferShell
  /** Pin the probe verdict, skipping the probe entirely (tests, known platforms). */
  pwshAvailable?: boolean
  /** Explicit pwsh executable: the probed candidate, and the executable the pwsh family spawns. */
  pwshPath?: string
}

/** Startup budget for the probe; a candidate that cannot exit in time counts as absent. */
const PROBE_TIMEOUT_MS = 10_000

/** Probe argv: a minimal non-interactive startup whose only contract is exit code 0. */
const PROBE_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'exit 0'] as const

/**
 * Probe whether the pwsh executable the pwsh family would spawn can start.
 * `resolvePwshPath()` never fails — it falls back to a bare `pwsh` for PATH
 * resolution — so existence is only observable by launching the candidate.
 * @param pwshPath - an explicit `pwshPath` config value, resolved exactly as the executor resolves it.
 * @returns true when the candidate started and exited 0.
 */
export function probePwsh(pwshPath?: string): boolean {
  try {
    const probe = spawnSync(resolvePwshPath(pwshPath), [...PROBE_ARGS], {
      stdio: 'ignore',
      timeout: PROBE_TIMEOUT_MS,
    })
    return probe.status === 0
  } catch {
    /* v8 ignore next -- spawnSync throws only on a broken runtime, not a missing binary */
    return false
  }
}

/**
 * Decide which shell family to mount. The decision is pure: the caller owns
 * the probe, this owns the policy.
 * @param preferShell - the configured preference.
 * @param pwshAvailable - the probe verdict.
 * @returns `'pwsh'` or `'bash'`: explicit preferences pass through, `auto` prefers pwsh.
 */
export function pickShell(preferShell: PreferShell, pwshAvailable: boolean): ShellDimension {
  if (preferShell === 'auto') return pwshAvailable ? 'pwsh' : 'bash'
  return preferShell
}

/**
 * Assembler plugin body: probe once, then mount the selected sandbox executor
 * with the same config, so its own knobs (`rtkAvailable`, `pwshPath`, budgets)
 * keep their meaning. Awaiting the mount makes this entry settle only once its
 * chosen executor is live, and makes a refusing executor (a double-claimed
 * `ctx.shell`) fail the entry instead of passing silently.
 * @param ctx - the context the overlay entry was applied to.
 * @param config - the assembler config.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const { preferShell = 'auto', pwshAvailable, ...executorConfig } = config
  const shell = pickShell(preferShell, pwshAvailable ?? probePwsh(executorConfig.pwshPath))
  if (shell === 'pwsh') {
    await ctx.plugin(RtkSandboxPwshExecutor, executorConfig)
  } else {
    await ctx.plugin(RtkSandboxBashExecutor, executorConfig)
  }
}

export default apply
