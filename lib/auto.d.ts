import { ShellDimension } from "./wrap.js";
import { Config as Config$1 } from "@deepseek-ai/dsh-bash-sandbox";
import { Context } from "cordis";
//#region src/auto.d.ts
/** Configured shell preference: `auto` follows the pwsh probe, the others pin it. */
type PreferShell = 'auto' | ShellDimension;
/** Assembler config: the sandbox executor's knobs plus the shell preference. */
interface Config extends Config$1 {
  /** Which family to mount (default `auto`: the pwsh probe decides). */
  preferShell?: PreferShell;
  /** Pin the probe verdict, skipping the probe entirely (tests, known platforms). */
  pwshAvailable?: boolean;
  /** Explicit pwsh executable: the probed candidate, and the executable the pwsh family spawns. */
  pwshPath?: string;
}
/**
 * Probe whether the pwsh executable the pwsh family would spawn can start.
 * `resolvePwshPath()` never fails — it falls back to a bare `pwsh` for PATH
 * resolution — so existence is only observable by launching the candidate.
 * @param pwshPath - an explicit `pwshPath` config value, resolved exactly as the executor resolves it.
 * @returns true when the candidate started and exited 0.
 */
declare function probePwsh(pwshPath?: string): boolean;
/**
 * Decide which shell family to mount. The decision is pure: the caller owns
 * the probe, this owns the policy.
 * @param preferShell - the configured preference.
 * @param pwshAvailable - the probe verdict.
 * @returns `'pwsh'` or `'bash'`: explicit preferences pass through, `auto` prefers pwsh.
 */
declare function pickShell(preferShell: PreferShell, pwshAvailable: boolean): ShellDimension;
/**
 * Assembler plugin body: probe once, then mount the selected sandbox executor
 * with the same config, so its own knobs (`rtkAvailable`, `pwshPath`, budgets)
 * keep their meaning. Awaiting the mount makes this entry settle only once its
 * chosen executor is live, and makes a refusing executor (a double-claimed
 * `ctx.shell`) fail the entry instead of passing silently.
 * @param ctx - the context the overlay entry was applied to.
 * @param config - the assembler config.
 */
declare function apply(ctx: Context, config: Config): Promise<void>;
//#endregion
export { Config, PreferShell, apply, apply as default, pickShell, probePwsh };