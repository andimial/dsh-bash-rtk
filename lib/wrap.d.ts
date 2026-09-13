//#region src/wrap.d.ts
/**
 * Command wrapping for the rtk (Rust Token Killer) shell executors. Pure,
 * side-effect-free decision logic: whether a shell command may be routed
 * through `rtk` and, when it may, the exact `rtk` argv to replace the raw
 * shell source with.
 *
 * The policy is conservative on purpose — wrapping is a best-effort token
 * optimization, never a semantic change. Three independent guards, in order:
 *
 * 1. **Availability**: when the `rtk` binary is absent the whole transform is
 *    the identity, so a deployment without rtk behaves exactly like the plain
 *    local executor.
 * 2. **Complexity**: any metacharacter of the parsing shell's dimension that
 *    would survive rtk's single-command boundary (pipelines, lists,
 *    redirections, command substitution, shell variables, and — for pwsh —
 *    expression parentheses, `@`, scriptblocks, comments and line breaks)
 *    disqualifies the command. Wrapping those would silently change what runs,
 *    so they pass through unchanged.
 * 3. **Whitelist**: only a fixed prefix map of development tools that rtk
 *    actually implements is eligible. The map keys are the *executable* name
 *    the shell invokes; the value is the rtk subcommand name (they differ for
 *    a few tools). The map is shared by both dimensions.
 *
 * @module @deeptrial/dsh-bash-rtk/wrap
 */
/** Shell dimension of the command (bash or pwsh); selects the metacharacter set. */
type ShellDimension = 'bash' | 'pwsh';
/**
 * Decide whether `command` should be routed through `rtk`, and the argv to use
 * when it should. Returns the original command unchanged for every
 * non-eligible case (complex shell, non-whitelisted tool, or rtk absent).
 *
 * The returned string is handed straight to the shell, so a wrapped result is
 * still executed through the shell and preserves the executor's
 * workdir/timeout/env/exit-code semantics unchanged.
 *
 * @param command - the raw shell command the model asked to run.
 * @param rtkAvailable - whether the `rtk` binary resolved on PATH.
 * @param shell - the dimension that will parse the command. Defaults to
 * `'pwsh'`, whose metacharacter set is the conservative superset; a caller
 * executing through bash must say so explicitly.
 * @returns the command to execute (possibly wrapped), always non-empty.
 */
declare function wrapWithRtk(command: string, rtkAvailable: boolean, shell?: ShellDimension): string;
//#endregion
export { ShellDimension, wrapWithRtk };