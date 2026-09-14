import { wrapWithRtk } from "./wrap.js";
import { n as probeRtk, t as confinedWindowsRun } from "./rtk-CbBGt9xH.js";
import { LocalBashExecutor } from "@deepseek-ai/dsh-bash-local";
import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
//#region src/index.ts
/**
* rtk-wrapping LOCAL bash executor (no file sandbox). Registers as `ctx.shell`
* in place of `dsh-bash-local`; use where confinement is not required (e.g.
* `danger-full-access` deployments).
*/
var RtkBashExecutor = class extends LocalBashExecutor {
	rtkAvailable;
	constructor(ctx, config) {
		super(ctx, config);
		this.rtkAvailable = config.rtkAvailable ?? probeRtk();
	}
	resolve(request) {
		const spec = super.resolve(request);
		return {
			...spec,
			command: wrapWithRtk(spec.command, this.rtkAvailable, "bash")
		};
	}
};
/**
* rtk-wrapping SANDBOX bash executor (preserves file confinement). Registers
* as `ctx.shell` in place of `dsh-bash-sandbox`; the wrap happens before
* `run`/`start` read `spec.command`, so the source every routing path runs is
* already wrapped. Confined Windows runs are the one exception: they pass
* through, because the restricted token cannot host an rtk proxy at all
* ({@link confinedWindowsRun}).
*/
var RtkSandboxBashExecutor = class extends SandboxBashExecutor {
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
			command: wrapWithRtk(spec.command, this.rtkAvailable, "bash")
		};
	}
};
//#endregion
export { RtkBashExecutor, RtkSandboxBashExecutor, RtkSandboxBashExecutor as default, wrapWithRtk };
