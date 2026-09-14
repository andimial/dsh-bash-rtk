import { wrapWithRtk } from "./wrap.js";
import { t as probeRtk } from "./rtk-MOPO1A7J.js";
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
* already wrapped. Every run is wrapped, confined Windows runs included: the
* restricted token cannot host rtk's piped child, and that is documented as a
* warning instead of guarded here (see docs/adr/0004).
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
