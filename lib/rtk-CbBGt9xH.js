import { spawnSync } from "node:child_process";
//#region src/rtk.ts
/**
* The availability gate of `wrapWithRtk`, shared by both members of the
* executor family. It has two halves: the process — a deployment without the
* binary behaves exactly like the stock executor it replaces — and the single
* run, which a confined Windows host cannot host an rtk proxy in at all (see
* {@link confinedWindowsRun}).
*
* Internal module — not a public subpath.
*
* @module @deeptrial/dsh-bash-rtk/rtk
*/
/**
* Probe for the `rtk` binary on PATH; absence degrades to the identity
* transform. An explicit `rtkAvailable` config value overrides this.
* @returns true when `rtk --version` exits 0.
*/
function probeRtk() {
	try {
		return spawnSync("rtk", ["--version"], { stdio: "ignore" }).status === 0;
	} catch {
		/* v8 ignore next -- spawnSync throws only on a broken runtime, not a missing binary */
		return false;
	}
}
/**
* Whether this run is confined by the Windows restricted-token sandbox.
*
* That backend confines a child with a `WRITE_RESTRICTED` token, and its
* documented limit is that a *confined* process cannot spawn a grandchild with
* piped stdio: libuv's pipe stdio uses named pipes whose client end requests
* write access no restricting SID holds, so `spawn(..., { stdio: 'pipe' })`
* fails with EPERM. rtk captures every tool it filters through pipes, so
* `rtk git status` fails with access denied exactly where `git status`
* succeeds. Routing such a run would change the command's outcome, and this
* plugin never does that: confined Windows runs pass through unchanged.
* `danger-full-access` runs (no restricted token — one-shot escalations
* included) and every POSIX host keep routing.
*
* @param mode - the resolved sandbox mode of this run; `undefined` means the
* run carries no sandbox policy, so nothing confines it.
* @param platform - the host platform; a parameter so the decision stays pure.
* @returns true when the run must not be routed through rtk.
*/
function confinedWindowsRun(mode, platform = process.platform) {
	return platform === "win32" && mode !== void 0 && mode !== "danger-full-access";
}
//#endregion
export { probeRtk as n, confinedWindowsRun as t };
