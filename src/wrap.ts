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
export type ShellDimension = 'bash' | 'pwsh'

/** Metacharacters both dimensions read as more than the first command's argument list. */
const SHARED_METACHARACTER = /[|&;<>`$]/

/**
 * Metacharacters only pwsh gives a parsing meaning to: expression parentheses,
 * splatting/array `@`, scriptblock braces, comments, and line breaks. The pwsh
 * metacharacter set is the shared set plus these.
 */
const PWSH_METACHARACTER = /[()@{}#\r\n]/

/**
 * Complexity gate: does the parsing dimension give `command` a structure that
 * would not survive rtk's single-command boundary?
 * @param command - the raw shell source.
 * @param shell - the dimension that will parse it.
 * @returns true when the command must pass through unchanged.
 */
function isComplex(command: string, shell: ShellDimension): boolean {
  if (SHARED_METACHARACTER.test(command)) return true
  // bash is the only dimension with the smaller set: every other value keeps
  // the conservative pwsh reading, the default direction included.
  return shell !== 'bash' && PWSH_METACHARACTER.test(command)
}

/** Executable name → rtk subcommand. Keys are lowercase and match the shell's first token. */
const RTK_COMMAND_MAP: Readonly<Record<string, string>> = {
  git: 'git',
  gh: 'gh',
  glab: 'glab',
  gt: 'gt',
  cargo: 'cargo',
  go: 'go',
  'golangci-lint': 'golangci-lint',
  npm: 'npm',
  npx: 'npx',
  pnpm: 'pnpm',
  docker: 'docker',
  kubectl: 'kubectl',
  aws: 'aws',
  ruff: 'ruff',
  pytest: 'pytest',
  mypy: 'mypy',
  uv: 'uv',
  dotnet: 'dotnet',
  jest: 'jest',
  vitest: 'vitest',
  prisma: 'prisma',
  tsc: 'tsc',
  playwright: 'playwright',
  curl: 'curl',
  wget: 'wget',
  grep: 'grep',
  rg: 'rg',
  find: 'find',
  psql: 'psql',
  mvn: 'mvn',
  gradlew: 'gradlew',
  sbt: 'sbt',
  pip: 'pip',
  rspec: 'rspec',
  rubocop: 'rubocop',
  rake: 'rake',
  php: 'php',
  phpunit: 'phpunit',
  phpstan: 'phpstan',
  pint: 'pint',
  pest: 'pest',
  next: 'next',
} as const

/**
 * Extract the first whitespace-delimited token of a shell command. Quotes and
 * leading environment assignments (`FOO=bar cmd`) are not special-cased: such
 * commands pass through to the plain executor, which is the safe default.
 * @param command - the raw shell source.
 * @returns the leading executable token, or undefined when empty.
 */
function firstToken(command: string): string | undefined {
  const trimmed = command.trimStart()
  if (trimmed.length === 0) return undefined
  const end = trimmed.search(/\s/)
  // trimmed is non-empty and starts with a non-whitespace byte, so the token
  // is never empty; the conditional only guards the no-whitespace case.
  return (end === -1 ? trimmed : trimmed.slice(0, end)).toLowerCase()
}

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
export function wrapWithRtk(command: string, rtkAvailable: boolean, shell: ShellDimension = 'pwsh'): string {
  if (!rtkAvailable) return command
  if (isComplex(command, shell)) return command
  const token = firstToken(command)
  if (token === undefined) return command
  const rtkCommand = RTK_COMMAND_MAP[token]
  if (rtkCommand === undefined) return command
  const rest = command.trimStart().slice(token.length)
  return `rtk ${rtkCommand}${rest}`
}
