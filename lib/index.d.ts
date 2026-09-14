import { ShellDimension, wrapWithRtk } from "./wrap.js";
import { Config, LocalBashExecutor } from "@deepseek-ai/dsh-bash-local";
import { Config as Config$1, SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
import { Context } from "cordis";
import { ShellExecRequest, ShellExecSpec } from "@deepseek-ai/dsh-shell";
//#region src/index.d.ts
/** Extend the upstream config so cordis plugin() accepts rtkAvailable. */
declare module '@deepseek-ai/dsh-bash-local' {
  interface Config {
    rtkAvailable?: boolean;
  }
}
/**
 * rtk-wrapping LOCAL bash executor (no file sandbox). Registers as `ctx.shell`
 * in place of `dsh-bash-local`; use where confinement is not required (e.g.
 * `danger-full-access` deployments).
 */
declare class RtkBashExecutor extends LocalBashExecutor {
  private readonly rtkAvailable;
  constructor(ctx: Context, config: Config);
  resolve(request: ShellExecRequest): ShellExecSpec;
}
/**
 * rtk-wrapping SANDBOX bash executor (preserves file confinement). Registers
 * as `ctx.shell` in place of `dsh-bash-sandbox`; the wrap happens before
 * `run`/`start` read `spec.command`, so the source every routing path runs is
 * already wrapped. Confined Windows runs are the one exception: they pass
 * through, because the restricted token cannot host an rtk proxy at all
 * ({@link confinedWindowsRun}).
 */
declare class RtkSandboxBashExecutor extends SandboxBashExecutor {
  static inject: string[];
  private readonly rtkAvailable;
  constructor(ctx: Context, config: Config$1);
  resolve(request: ShellExecRequest): ShellExecSpec;
}
//#endregion
export { RtkBashExecutor, RtkSandboxBashExecutor, RtkSandboxBashExecutor as default, type ShellDimension, wrapWithRtk };