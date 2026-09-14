# dsh-bash-rtk

[![CI](https://github.com/andimial/dsh-bash-rtk/actions/workflows/ci.yml/badge.svg)](https://github.com/andimial/dsh-bash-rtk/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/andimial/dsh-bash-rtk)](https://github.com/andimial/dsh-bash-rtk/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/andimial/dsh-bash-rtk/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933?logo=nodedotjs)](https://nodejs.org/)

> Route eligible shell commands through [rtk](https://github.com/rtk-ai/rtk) (Rust Token Killer) inside the DeepSeek Harness (`dsh`) bash executor — compress tool output, save tokens, change nothing else.

> **This repository is a fork of [DeepTrial/dsh-bash-rtk](https://github.com/DeepTrial/dsh-bash-rtk).** Releases and issues live here (fork **andimial/dsh-bash-rtk**).

[中文版](README.zh.md)

---

## Table of Contents

- [Quick Example](#quick-example)
- [Requirements](#requirements)
- [Why](#why)
- [How it works](#how-it-works)
  - [Confined Windows runs](#confined-windows-runs)
- [Install & enable](#install--enable)
- [pwsh support](#pwsh-support)
  - [Assembly matrix](#assembly-matrix)
- [API / Configuration](#api--configuration)
- [Which commands are routed](#which-commands-are-routed)
- [Upgrading from 0.1.x](#upgrading-from-01x)
- [Development](#development)
- [License](#license)

---

## Quick Example

The plugin rewrites commands at the `resolve()` boundary — before anything runs:

| Input (`command`) | Resolved output | Reason |
|---|---|---|
| `git status` | `rtk git status` | Simple + whitelisted |
| `cargo build --release` | `rtk cargo build --release` | Simple + whitelisted |
| `git status \| grep x` | `git status \| grep x` | Complex shell — **passthrough** |
| `ls -la` | `ls -la` | Not whitelisted — **passthrough** |
| `git status` (rtk absent) | `git status` | Binary missing — **identity fallback** |
| `git status # note` | bash: `rtk git status # note`, pwsh: unchanged | `#` is a pwsh comment, plain text in bash (see below) |

Everything else — workdir, timeout, env, exit code, sandbox confinement — is inherited unchanged.

## Requirements

- **Node.js:** >= 20.0.0
- **rtk:** `rtk --version` must exit 0 on PATH (install separately, e.g. `cargo install rtk`)

## Why

LLM agents burn tokens on verbose tool output (`git log`, `cargo build`, `pytest` trails…). `rtk` already knows how to shrink those for 30–90%. This plugin bolts that filtering onto `dsh`'s bash executor so every eligible command is auto-routed through `rtk` — **with zero semantic change** to what actually runs.

## How it works

```
model → dsh bash tool → RtkBashExecutor.resolve()
                              │
              ┌───────────────┴────────────────┐
         eligible?                         not eligible
     (simple + whitelisted)           (complex / unknown)
              │                                │
      rtk <subcommand> …              command runs unchanged
   (rtk compresses output)            (byte-for-byte passthrough)
```

Three independent guards decide (see [`src/wrap.ts`](src/wrap.ts)):

1. **Complexity** — any shell metacharacter (`| & ; < > \` $`) disqualifies the command. Wrapping those would silently alter what runs, so they pass through untouched.
2. **Whitelist** — only known dev tools that `rtk` actually implements are eligible (map in `wrap.ts`).
3. **Availability** — the transform is the **identity** whenever the `rtk` binary is absent on `PATH`; the deployment then behaves exactly like the stock local executor. This gate is a property of the *process*, not of a run: every run is routed, confined Windows runs included — see [Confined Windows runs](#confined-windows-runs) for the one environment where routing fails.

Guard 2 reads the **shell dimension**: it applies the metacharacter set of the shell that will parse the command, so `git status # note` passes through under pwsh but is plain argument text under bash. Guards 1 and 3 are dialect-independent — `git` is `git` in either shell.

### Confined Windows runs

Windows keeps routing: a run confined by the **Windows restricted-token sandbox** (`read-only` / `workspace-write`) is still rewritten to `rtk <subcommand>`. What changes there is whether rtk can *work* — it cannot. That backend confines the child with a `WRITE_RESTRICTED` token, and its documented limit is that a *confined* process cannot spawn a grandchild with piped stdio (libuv's pipe stdio uses named pipes whose client end requests write access no restricting SID holds, so `spawn(..., { stdio: 'pipe' })` fails with `EPERM`). rtk captures every tool it filters through pipes, so its filtering subcommands fail with *access denied* exactly where the bare command succeeds:

```
rtk: Failed to run git status: Failed to execute command: 拒绝访问。 (os error 5)
```

Measured in a live `dsh web` host against `dsh-sandbox-windows-acl` with rtk 0.43.0: `git status`, `git log`, `git diff`, `rg`, `pnpm list` and `gh repo view` all fail that way, while commands rtk merely forwards (`git remote -v`, `git rev-parse HEAD`, `git --version`) still succeed.

This is a **documented warning, not a guard**. 0.2.1 deliberately dropped the confined-run passthrough 0.2.0 shipped, so that one profile behaves the same way in every Windows mode instead of changing semantics by sandbox mode (see [`docs/adr/0004`](docs/adr/0004-confined-win32-routing-restored.md)).

On Windows that means:

- `danger-full-access` runs — including one-shot escalations, which the harness approves per call — are how you get the token savings. Verified in a live `dsh web` host: under such a policy `git status` resolved to `rtk git status`, returned rtk's compact output, and showed up in `rtk gain --history`.
- In the default `workspace-write` profile, expect the failure above on filtering subcommands instead of compression. The plugin does not suppress it: a loud error beats a silent, platform-dependent rewrite.
- POSIX hosts are unaffected: their sandbox backends impose no such limit on a confined grandchild, so routing works in every mode.

### Versioning note

The plugin **does not bundle or pin rtk**. At `dsh` startup it probes `rtk --version` on `PATH` (see `probeRtk()` in [`src/rtk.ts`](src/rtk.ts)). Therefore:

- When **rtk ships a new release**, any user who upgrades `rtk` on their machine automatically gets the new behavior — no plugin update required.
- The plugin version (this repo) and the rtk version are **independent**; keep them separate. This README states the *minimum* rtk version tested against, not a lockstep number.

> **Requires:** `rtk` on `PATH` (`rtk --version` exits 0). The plugin does **not** install or manage rtk — **you must install and update rtk yourself** (e.g. `cargo install rtk` or download a release binary). When rtk is absent the plugin is a silent no-op passthrough.

### Compatibility & version alignment

This plugin depends on five `@deepseek-ai/dsh-*` packages that DeepSeek Harness publishes to npm **independently** from the `dsh` aggregate package. Because those sub-packages (and `dsh` itself) ship as **prereleases** (`x.y.z-rc.n`), the peer ranges must carry an explicit prerelease branch per [awesome-dsh-plugin/contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) — a broad-looking range like `>=0.0.1-rc.1 <0.2.0` would *silently* exclude every `0.1.0-*` / `0.1.1-*` prerelease (node-semver only lets a prerelease satisfy a range if some comparator shares its exact `major.minor.patch` tuple and also carries a prerelease tag).

The actual ranges (see `peerDependencies` in `package.json`) are:

```
"@deepseek-ai/dsh-bash-local":   ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
"@deepseek-ai/dsh-bash-sandbox": ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
"@deepseek-ai/dsh-pwsh-local":   ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
"@deepseek-ai/dsh-pwsh-sandbox": ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
"@deepseek-ai/dsh-shell":        ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
```

`cordis` is **not** a peer dependency: it is injected by `dsh` at runtime, so declaring it would break install for anyone on a registry that lacks a matching published `cordis`. All five `@deepseek-ai/dsh-*` peers are marked `optional` in `peerDependenciesMeta`, so the plugin still loads where they are absent (it then behaves as a passthrough).

The plugin's `dsh.plugin.json` declares:

```json
"engines": { "dsh": ">=0.1.0-rc.6 <0.2.0 || >=0.1.1-rc.1 <0.2.0-0" }
```

i.e. it is verified against `dsh` `0.1.1-rc.2`, accepts any `0.1.x` prerelease/build, and deliberately **excludes** `0.2.0+` (a future major that may change the `LocalBashExecutor.resolve()` / `ShellExecSpec` API — a sub-package bump will be required before this plugin can track it).

> **Known version skew:** `dsh` (the aggregate, what `npx @deepseek-ai/dsh` installs) and its `@deepseek-ai/dsh-*` sub-packages are on **separate semver tracks** — the aggregate can be `0.1.1-rc.2` while the published sub-packages are still `0.0.1-rc.1`. The ranges above pin to the *published* sub-package versions so a plain `dsh plugin add` resolves cleanly. Watch the [releases](https://github.com/andimial/dsh-bash-rtk/releases) for a matching update.

## Install & enable

The plugin is **disabled by default** — installing it does nothing until you opt in.

```sh
# 1) from a local checkout
dsh plugin --profile web add "<path-to-this-dir>"

# 2) or directly from the latest GitHub release tarball (no local clone needed)
dsh plugin --profile web add \
  "https://github.com/andimial/dsh-bash-rtk/releases/latest/download/dsh-bash-rtk-latest.tgz"

# enable it via the optional overlay — add to your profile's cordis.patch.yml:
#   - id: bash-sandbox
#     disabled: true
#   - id: pwsh-sandbox
#     disabled: true
#   - id: shell-rtk
#     disabled: false

dsh web   # restart to apply
```

The bundled overlay snippet lives in [`cordis.patch.yml`](cordis.patch.yml): one `shell-rtk` auto assembler, disabled by default. At startup it probes pwsh (resolve the executable, then verify it starts) and mounts the matching rtk executor family — pwsh where pwsh runs, bash otherwise — so **one profile is correct on every platform**. Pin the dialect with `preferShell: 'auto' | 'pwsh' | 'bash'` (default `auto`). The mounted executor wraps the stock sandbox executor, so file confinement is preserved; the unconfined `RtkBashExecutor` / `RtkPwshExecutor` classes stay available for `danger-full-access` setups.

## pwsh support

The plugin covers both shell dialects through one executor family per dimension: `bash` and `pwsh`, each with a `local` and a `sandbox` variant. The pwsh members are subclasses of the stock pwsh executors with the same `resolve()` boundary rewrite, and the pwsh `ENCODING_PREAMBLE` is an argv-level concern that never reaches that boundary — so wrapping behaves exactly as it does on bash.

The safety policy is one policy, two metacharacter sets:

| Dialect | Disqualifying metacharacters | Why |
|---|---|---|
| bash | `\|` `&` `;` `<` `>` `` ` `` `$` | Pipelines, lists, redirections, command substitution, variables |
| pwsh | the bash set plus `()` `@` `{}` `#` and line breaks | Expression parentheses, splatting/array `@`, scriptblocks, comments, multi-statement source |

The pwsh set is a superset chosen the conservative way: those characters have a parsing meaning in pwsh, so a command containing one is never wrapped — wrapping it would silently change what runs. That set is also the default of the `wrapWithRtk` library function; a caller executing through bash must say so explicitly to get the narrower set.

| `command` | bash | pwsh |
|---|---|---|
| `git status` | `rtk git status` | `rtk git status` |
| `git status \| grep x` | passthrough | passthrough |
| `git status # note` | `rtk git status # note` | passthrough |
| `git log (dev)` | `rtk git log (dev)` | passthrough |

### Assembly matrix

`ctx.shell` is a **single service slot** on every host: the bash and pwsh executors are mutually exclusive, and registering both fails the host loudly. The bundled `shell-rtk` entry claims it exactly once. It resolves the pwsh executable, verifies it actually starts (exit code 0), and mounts the matching family; `preferShell` overrides that verdict. The probe runs once per process — restart `dsh` after installing pwsh or rtk.

| platform | pwsh | preferShell | mounted executor |
|---|---|---|---|
| Windows | present | `auto` | pwsh family (rtk-wrapped) |
| Windows | present | `pwsh` | pwsh family (rtk-wrapped) |
| Windows | present | `bash` | bash family (rtk-wrapped) |
| Windows | absent | `auto` | bash family (rtk-wrapped) |
| Windows | absent | `pwsh` | pwsh family (rtk-wrapped) |
| Linux / macOS | present | `auto` | pwsh family (rtk-wrapped) |
| Linux / macOS | present | `pwsh` | pwsh family (rtk-wrapped) |
| Linux / macOS | present | `bash` | bash family (rtk-wrapped) |
| Linux / macOS | absent | `auto` | bash family (rtk-wrapped) |
| Linux / macOS | absent | `bash` | bash family (rtk-wrapped) |

Reading the matrix:

- `preferShell: 'pwsh'` wins even when the probe finds nothing — the rtk transform stays in place, and command execution then fails the way a stock pwsh executor would on a host without pwsh. Pin the dialect only where you know it exists.
- `preferShell: 'auto'` is the only setting where the probe decides, so one profile is correct on every machine.
- The probe is a real launch, not a path check: `resolvePwshPath()` never fails — it falls back to a bare `pwsh` string for `PATH` resolution — so existence is only observable by starting the candidate.
- Whichever family is mounted wraps the **sandbox** executor, so file confinement is preserved. The unconfined `RtkBashExecutor` / `RtkPwshExecutor` classes remain available for `danger-full-access` deployments.

## API / Configuration

Both executors accept the same base config as their stock counterparts (`LocalBashExecutor` / `SandboxBashExecutor`) plus one optional field:

| Option | Type | Default | Description |
|---|---|---|---|
| `rtkAvailable` | `boolean` | `rtk --version` probe result | Force-enable or force-disable rtk wrapping. Useful for tests or deployments where the binary path is non-standard. |

The `shell-rtk` assembler entry takes the same executor config plus three fields of its own:

| Option | Type | Default | Description |
|---|---|---|---|
| `preferShell` | `'auto' \| 'pwsh' \| 'bash'` | `'auto'` | Which family to mount. `auto` follows the pwsh probe; the others pin the dialect. |
| `pwshAvailable` | `boolean` | pwsh probe result | Pin the probe verdict, skipping the probe entirely. |
| `pwshPath` | `string` | resolved well-known location, else `pwsh` | Explicit pwsh executable: the probed candidate and the executable the pwsh family spawns. |

All other options — `cwd`, `timeoutMs`, `graceMs`, etc. — are inherited unchanged from the upstream executors.

## Which commands are routed

The set of commands eligible for rtk-wrapping is defined by **rtk itself** — see the [rtk command reference](https://github.com/rtk-ai/rtk#supported-ecosystems) / [`README.md`](https://github.com/rtk-ai/rtk/blob/develop/README.md#test-runners) for the authoritative, maintained list. This plugin mirrors that list; when rtk adds a new subcommand, upgrade rtk (not this plugin) to pick it up.

Complex commands — pipelines, `&&`/`;`, redirects, `$( )`, env assignments — always run natively regardless of the whitelist.

## Upgrading from 0.1.x

0.2.0 replaces the per-dialect overlay entries with the single `shell-rtk` assembler. The main entry (`@deeptrial/dsh-bash-rtk`) still defaults to the bash sandbox executor, so a library consumer importing it keeps the 0.1.x behaviour — but the plugin now wraps through the metacharacter set of the dialect that actually parses the command. A profile written for 0.1.x needs two edits:

```yaml
# before (0.1.x)
- insert:
    - id: bash-rtk
      name: '@deeptrial/dsh-bash-rtk'
      disabled: false

# after (0.2.0)
- insert:
    - id: bash-sandbox
      disabled: true
    - id: pwsh-sandbox
      disabled: true
    - id: shell-rtk
      name: '@deeptrial/dsh-bash-rtk/auto'
      disabled: false
      config:
        preferShell: auto
```

1. Delete the `bash-rtk` row — the entry id no longer exists, because the assembler that replaces it picks the dialect for you.
2. Disable the stock executor the plugin overrides and enable `shell-rtk` (see [Install & enable](#install--enable)).
3. Restart `dsh`. The assembler probes pwsh once at startup; `preferShell: 'bash'` reproduces the 0.1.x dialect exactly, on any platform.

Nothing else changes: `rtkAvailable`, the peer ranges, and the `engines` range are untouched by this release. The `rtk` binary is still yours to install and update.

## Development

```sh
# 1. clone the plugin and its sibling harness
git clone https://github.com/andimial/dsh-bash-rtk.git
git clone https://github.com/deepseek-ai/deepseek-harness.git

# 2. install harness deps and build the libraries the plugin links against
cd deepseek-harness && pnpm install && pnpm build:lib:host

# 3. install plugin deps and run checks
cd ../dsh-bash-rtk && pnpm install --ignore-scripts
pnpm run check        # typecheck + test + build
pnpm run test         # tests only
pnpm run typecheck    # tsc only
```

`devDependencies` use `link:` into the local `deepseek-harness` checkout; tests run inside that workspace (the `@deepseek-ai/dsh-*` packages must resolve).

## License

MIT
