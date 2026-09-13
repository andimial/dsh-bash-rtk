import { wrapWithRtk } from "./wrap.js";
import { t as probeRtk } from "./rtk-CcNyrxlC.js";
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
* `run`/`start` build the pwsh argv, so both the `danger-full-access` and the
* confined paths run the already-wrapped source.
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
		return {
			...spec,
			command: wrapWithRtk(spec.command, this.rtkAvailable, "pwsh")
		};
	}
};
//#endregion
export { RtkPwshExecutor, RtkSandboxPwshExecutor, RtkSandboxPwshExecutor as default };
