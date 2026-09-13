import { RtkSandboxBashExecutor } from "./index.js";
import { RtkSandboxPwshExecutor } from "./pwsh.js";
import { spawnSync } from "node:child_process";
import { resolvePwshPath } from "@deepseek-ai/dsh-pwsh-local";
//#region src/auto.ts
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
/** Startup budget for the probe; a candidate that cannot exit in time counts as absent. */
const PROBE_TIMEOUT_MS = 1e4;
/** Probe argv: a minimal non-interactive startup whose only contract is exit code 0. */
const PROBE_ARGS = [
	"-NoLogo",
	"-NoProfile",
	"-NonInteractive",
	"-Command",
	"exit 0"
];
/**
* Probe whether the pwsh executable the pwsh family would spawn can start.
* `resolvePwshPath()` never fails — it falls back to a bare `pwsh` for PATH
* resolution — so existence is only observable by launching the candidate.
* @param pwshPath - an explicit `pwshPath` config value, resolved exactly as the executor resolves it.
* @returns true when the candidate started and exited 0.
*/
function probePwsh(pwshPath) {
	try {
		return spawnSync(resolvePwshPath(pwshPath), [...PROBE_ARGS], {
			stdio: "ignore",
			timeout: PROBE_TIMEOUT_MS
		}).status === 0;
	} catch {
		/* v8 ignore next -- spawnSync throws only on a broken runtime, not a missing binary */
		return false;
	}
}
/**
* Decide which shell family to mount. The decision is pure: the caller owns
* the probe, this owns the policy.
* @param preferShell - the configured preference.
* @param pwshAvailable - the probe verdict.
* @returns `'pwsh'` or `'bash'`: explicit preferences pass through, `auto` prefers pwsh.
*/
function pickShell(preferShell, pwshAvailable) {
	if (preferShell === "auto") return pwshAvailable ? "pwsh" : "bash";
	return preferShell;
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
async function apply(ctx, config) {
	const { preferShell = "auto", pwshAvailable, ...executorConfig } = config;
	if (pickShell(preferShell, pwshAvailable ?? probePwsh(executorConfig.pwshPath)) === "pwsh") await ctx.plugin(RtkSandboxPwshExecutor, executorConfig);
	else await ctx.plugin(RtkSandboxBashExecutor, executorConfig);
}
//#endregion
export { apply, apply as default, pickShell, probePwsh };
