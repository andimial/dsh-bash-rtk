import { wrapWithRtk } from "./wrap.js";
import { n as probeRtk, t as confinedWindowsRun } from "./rtk-CbBGt9xH.js";
import { PwshLocalExecutor } from "@deepseek-ai/dsh-pwsh-local";
import { SandboxPwshExecutor } from "@deepseek-ai/dsh-pwsh-sandbox";
//#region src/pwsh.ts
/**
* rtk-wrapping LOCAL pwsh executor (no file sandbox). Registers as `ctx.shell`
* in place of `dsh-pwsh-local`; use where confinement is not required (e.g.
* `danger-full-access` deployments).
*/
var RtkPwshExecutor = class extends PwshLocalExecutor {
	rtkAvailable;
	constructor(ctx, config) {
		super(ctx, config);
		this.rtkAvailable = config.rtkAvailable ?? probeRtk();
	}
	resolve(request) {
		const spec = super.resolve(request);
		return {
			...spec,
			command: wrapWithRtk(spec.command, this.rtkAvailable, "pwsh")
		};
	}
};
/**
* rtk-wrapping SANDBOX pwsh executor (preserves file confinement). Registers
* as `ctx.shell` in place of `dsh-pwsh-sandbox`; the wrap happens before
* `run`/`start` build the pwsh argv, so the source every routing path runs is
* already wrapped. Confined Windows runs are the one exception: they pass
* through, because the restricted token cannot host an rtk proxy at all
* ({@link confinedWindowsRun}).
*/
var RtkSandboxPwshExecutor = class extends SandboxPwshExecutor {
	static inject = [
		"subprocess",
		"sandbox",
		"sandboxPolicy"
	];
	rtkAvailable;
	constructor(ctx, config) {
		super(ctx, config);
		this.rtkAvailable = config.rtkAvailable ?? probeRtk();
	}
	resolve(request) {
		const spec = super.resolve(request);
		if (confinedWindowsRun(spec.sandboxPolicy?.mode)) return spec;
		return {
			...spec,
			command: wrapWithRtk(spec.command, this.rtkAvailable, "pwsh")
		};
	}
};
//#endregion
export { RtkPwshExecutor, RtkSandboxPwshExecutor, RtkSandboxPwshExecutor as default };
