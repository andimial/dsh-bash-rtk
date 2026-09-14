import { Config, PwshLocalExecutor } from "@deepseek-ai/dsh-pwsh-local";
import { Config as Config$1, SandboxPwshExecutor } from "@deepseek-ai/dsh-pwsh-sandbox";
import { Context } from "cordis";
import { ShellExecRequest, ShellExecSpec } from "@deepseek-ai/dsh-shell";
//#region src/pwsh.d.ts
/** Extend the upstream pwsh config so cordis plugin() accepts rtkAvailable. */
declare module '@deepseek-ai/dsh-pwsh-local' {
  interface Config {
    rtkAvailable?: boolean;
  }
}
/**
 * rtk-wrapping LOCAL pwsh executor (no file sandbox). Registers as `ctx.shell`
 * in place of `dsh-pwsh-local`; use where confinement is not required (e.g.
 * `danger-full-access` deployments).
 */
declare class RtkPwshExecutor extends PwshLocalExecutor {
  private readonly rtkAvailable;
  constructor(ctx: Context, config: Config);
  resolve(request: ShellExecRequest): ShellExecSpec;
}
/**
 * rtk-wrapping SANDBOX pwsh executor (preserves file confinement). Registers
 * as `ctx.shell` in place of `dsh-pwsh-sandbox`; the wrap happens before
 * `run`/`start` build the pwsh argv, so the source every routing path runs is
 * already wrapped. Confined Windows runs are the one exception: they pass
 * through, because the restricted token cannot host an rtk proxy at all
 * ({@link confinedWindowsRun}).
 */
declare class RtkSandboxPwshExecutor extends SandboxPwshExecutor {
  static inject: string[];
  private readonly rtkAvailable;
  constructor(ctx: Context, config: Config$1);
  resolve(request: ShellExecRequest): ShellExecSpec;
}
//#endregion
export { RtkPwshExecutor, RtkSandboxPwshExecutor, RtkSandboxPwshExecutor as default };