# dsh-bash-rtk

[![CI](https://github.com/DeepTrial/dsh-bash-rtk/actions/workflows/ci.yml/badge.svg)](https://github.com/DeepTrial/dsh-bash-rtk/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/DeepTrial/dsh-bash-rtk)](https://github.com/DeepTrial/dsh-bash-rtk/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/DeepTrial/dsh-bash-rtk/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933?logo=nodedotjs)](https://nodejs.org/)

> 在 DeepSeek Harness（`dsh`）的 bash 执行器里，把符合条件的 shell 命令路由给 [rtk](https://github.com/rtk-ai/rtk)（Rust Token Killer）执行 —— 压缩工具输出、省 token、其余一概不变。

[English version](README.md)

---

## 目录

- [快速示例](#快速示例)
- [环境要求](#环境要求)
- [为什么需要它](#为什么需要它)
- [工作原理](#工作原理)
  - [Windows 受限运行](#windows-受限运行)
- [安装与启用](#安装与启用)
- [pwsh 支持](#pwsh-支持)
  - [装配矩阵](#装配矩阵)
- [API / 配置](#api--配置)
- [哪些命令会被路由](#哪些命令会被路由)
- [从 0.1.x 升级](#从-01x-升级)
- [开发](#开发)
- [许可证](#许可证)

---

## 快速示例

插件在 `resolve()` 边界重写命令 —— 在实际执行之前：

| 输入 (`command`) | 解析后的输出 | 原因 |
|---|---|---|
| `git status` | `rtk git status` | 简单命令 + 在白名单内 |
| `cargo build --release` | `rtk cargo build --release` | 简单命令 + 在白名单内 |
| `git status \| grep x` | `git status \| grep x` | 复杂 shell —— **直接透传** |
| `ls -la` | `ls -la` | 不在白名单 —— **直接透传** |
| `git status`（无 rtk） | `git status` | 二进制缺失 —— **恒等回退** |
| `git status # note` | bash: `rtk git status # note`，pwsh: 原样 | `#` 在 pwsh 是注释、在 bash 只是普通字符（见下文） |

其余一切 —— 工作目录、超时、环境变量、退出码、沙箱隔离 —— 均原样继承。

## 环境要求

- **Node.js:** >= 20.0.0
- **rtk:** `rtk --version` 在 PATH 上退出码为 0（需单独安装，例如 `cargo install rtk`）

## 为什么需要它

LLM agent 在冗长的工具输出上浪费大量 token（`git log`、`cargo build`、`pytest` 输出……）。`rtk` 已知道如何把这些输出压缩 30–90%。本插件把这套过滤接到 `dsh` 的 bash 执行器上，让每个符合条件的命令自动走 `rtk` —— **且对实际运行内容零语义改动**。

## 工作原理

```
model → dsh bash 工具 → RtkBashExecutor.resolve()
                              │
              ┌───────────────┴────────────────┐
         符合条件？                        不符合条件
   （简单命令 + 在白名单内）          （复杂 / 未知命令）
              │                                │
      rtk <子命令> …                  命令原样执行
   （rtk 压缩输出）              （逐字节透传）
```

三道独立关卡决定路由（见 [`src/wrap.ts`](src/wrap.ts)）：

1. **复杂度** — 任何 shell 元字符（`| & ; < > \` $`）都会取消资格。包装这些会改变实际运行内容，故直接透传。
2. **白名单** — 仅 `rtk` 实际实现的已知开发工具才符合资格（`wrap.ts` 中的映射表）。
3. **可用性** — `PATH` 上找不到 `rtk` 二进制时，变换退化为**恒等**（此时部署行为与原始本地执行器完全一致）。这一关是*进程*属性、不是单次运行属性：任何运行都照常改写，Windows 受限运行也不例外 —— 唯一会失败的环境见 [Windows 受限运行](#windows-受限运行)。

第 2 关按 **shell 维度**取元字符集：用实际解析该命令的 shell 的那一套，因此 `git status # note` 在 pwsh 下透传、在 bash 下只是普通参数文本。第 1、3 关与方言无关 —— `git` 在哪个 shell 里都是 `git`。

### Windows 受限运行

Windows 上照常路由：被 **Windows 受限令牌沙箱**（`read-only` / `workspace-write`）限制的这次运行仍会被改写为 `rtk <子命令>`。变的是 rtk 在那里*能不能干活* —— 干不了。该后端用 `WRITE_RESTRICTED` 令牌约束子进程，而它自己文档化的限制是：*受限*进程无法以管道 stdio 再生成孙子进程（libuv 的管道 stdio 走命名管道，其客户端请求的写权限没有任何 restricting SID 被授予，于是 `spawn(..., { stdio: 'pipe' })` 以 `EPERM` 失败）。rtk 过滤每个工具时都用管道捕获输出，因此它的过滤类子命令会以*拒绝访问*失败，而同样的命令不经 rtk 时正常成功：

```
rtk: Failed to run git status: Failed to execute command: 拒绝访问。 (os error 5)
```

实测（运行中的 `dsh web` host，`dsh-sandbox-windows-acl` + rtk 0.43.0）：`git status`、`git log`、`git diff`、`rg`、`pnpm list`、`gh repo view` 全部以上述方式失败；rtk 仅做转发的命令（`git remote -v`、`git rev-parse HEAD`、`git --version`）仍然成功。

这是**文档化警示，不是代码闸门**：0.2.1 刻意撤回了 0.2.0 的「受限即透传」，好让同一份 profile 在 Windows 各模式下行为一致，而不是按沙箱模式静默改变语义（见 [`docs/adr/0004`](docs/adr/0004-confined-win32-routing-restored.md)）。

在 Windows 上这意味着：

- 想要 rtk 的省 token 效果，就走 `danger-full-access` 运行 —— 包括 harness 按次审批的一次性升级。已在运行中的 `dsh web` host 实测：带上该策略后 `git status` 解析为 `rtk git status`，返回 rtk 的压缩输出，并出现在 `rtk gain --history` 中。
- 默认的 `workspace-write` profile 下，过滤类子命令会以上述报错失败，而不是被压缩。插件不会替你压掉它：响亮的报错好过静默的平台相关改写。
- POSIX 主机不受影响：其沙箱后端对受限的孙子进程没有这一限制，任何模式都能路由。

### 版本说明

本插件**不捆绑、不锁定 rtk 版本**。`dsh` 启动时会探测 `PATH` 上的 `rtk --version`（见 [`src/rtk.ts`](src/rtk.ts) 的 `probeRtk()`）。因此：

- **rtk 发布新版本时**，任何在本地升级了 `rtk` 的用户会自动获得新行为 —— 无需更新本插件。
- 本插件版本（本仓库）与 rtk 版本**相互独立**，请勿混为一谈。本说明给出的是测试所基于的*最低* rtk 版本，而非锁步版本号。

> **要求：** `rtk` 在 `PATH` 上（`rtk --version` 退出码为 0）。插件**不会**安装或管理 rtk —— **你必须自行安装并更新 rtk**（例如 `cargo install rtk` 或下载发布二进制）。当 rtk 缺失时，插件静默退化为透传。

### 兼容性与版本对齐

本插件依赖五个 `@deepseek-ai/dsh-*` 包，DeepSeek Harness 将它们与 `dsh` 聚合包**分开**发布到 npm。由于这些子包（以及 `dsh` 本身）都以**预发布**形式（`x.y.z-rc.n`）发布，peer 范围必须按 [awesome-dsh-plugin/contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) 带上显式的预发布分支——像 `>=0.0.1-rc.1 <0.2.0` 这样"看起来很宽"的范围会*静默*排除所有 `0.1.0-*` / `0.1.1-*` 预发布（node-semver 只有当某比较符与候选版本同 `major.minor.patch` 元组且自身也带预发布标签时，才放行预发布版本）。

实际范围（见 `package.json` 的 `peerDependencies`）为：

```
"@deepseek-ai/dsh-bash-local":   ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
"@deepseek-ai/dsh-bash-sandbox": ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
"@deepseek-ai/dsh-pwsh-local":   ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
"@deepseek-ai/dsh-pwsh-sandbox": ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
"@deepseek-ai/dsh-shell":        ">=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0"
```

`cordis` **不是** peer 依赖：它由 `dsh` 在运行时注入，声明它会导致任何所在 registry 没有对应 `cordis` 发布的用户安装失败。五个 `@deepseek-ai/dsh-*` peer 都在 `peerDependenciesMeta` 中标记为 `optional`，因此在它们缺失时插件仍可加载（此时退化为透传）。

本插件的 `dsh.plugin.json` 声明：

```json
"engines": { "dsh": ">=0.1.0-rc.6 <0.2.0 || >=0.1.1-rc.1 <0.2.0-0" }
```

即：以 `dsh` `0.1.1-rc.2` 为验证基准，接受任意 `0.1.x` 预发布/正式版，并**刻意排除** `0.2.0+`（未来大版本可能改动 `LocalBashExecutor.resolve()` / `ShellExecSpec` API，届时本插件需要一次子包升级才能跟进）。

> **已知的版本错位：** `dsh`（聚合包，即 `npx @deepseek-ai/dsh` 安装的）与其 `@deepseek-ai/dsh-*` 子包处于**独立的 semver 轨道**——聚合包可能是 `0.1.1-rc.2`，而发布的子包仍是 `0.0.1-rc.1`。上述范围锁定到*已发布*的子包版本，因此普通 `dsh plugin add` 能干净解析。跟进匹配更新请关注 [releases](https://github.com/DeepTrial/dsh-bash-rtk/releases)。

## 安装与启用

插件**默认禁用** —— 安装后不会生效，需手动开启。

```sh
# 1) 从本地 checkout 安装
dsh plugin --profile web add "<path-to-this-dir>"

# 2) 或直接用最新 GitHub release tarball 安装（无需本地 clone）
dsh plugin --profile web add \
  "https://github.com/DeepTrial/dsh-bash-rtk/releases/latest/download/dsh-bash-rtk-latest.tgz"

# 通过可选 overlay 启用 —— 在你的 profile 的 cordis.patch.yml 中添加：
#   - id: bash-sandbox
#     disabled: true
#   - id: pwsh-sandbox
#     disabled: true
#   - id: shell-rtk
#     disabled: false

dsh web   # 重启以生效
```

内置的 overlay 片段位于 [`cordis.patch.yml`](cordis.patch.yml)：唯一入口是 `shell-rtk` 智能装配器，默认禁用。启动时它探测 pwsh（先解析可执行文件位置，再实际启动验证）并装配对应的 rtk 执行器族 —— 有 pwsh 就挂 pwsh 族，没有就落 bash 族 —— 因此**同一份 profile 在任何平台都正确**。用 `preferShell: 'auto' | 'pwsh' | 'bash'`（默认 `auto`）钉死方言。被挂载的执行器包装原生沙箱执行器，文件隔离保留；非隔离的 `RtkBashExecutor` / `RtkPwshExecutor` 类仍可供 `danger-full-access` 场景使用。

## pwsh 支持

插件按 shell 方言划分执行器族：`bash` 与 `pwsh` 各一族，每族含 `local` 与 `sandbox` 两个变体。pwsh 成员是上游 pwsh 执行器的子类，沿用同一处 `resolve()` 边界改写；pwsh 的 `ENCODING_PREAMBLE` 属于 argv 层，不会出现在该边界上 —— 因此包装行为与 bash 侧完全一致。

安全策略只有一套，元字符集有两套：

| 方言 | 取消资格的元字符 | 原因 |
|---|---|---|
| bash | `\|` `&` `;` `<` `>` `` ` `` `$` | 管道、命令列表、重定向、命令替换、变量 |
| pwsh | bash 集再加 `()` `@` `{}` `#` 与换行 | 表达式括号、splatting/数组 `@`、scriptblock、注释、多语句源码 |

pwsh 集是刻意取的超集：这些字符在 pwsh 里有解析含义，含其一即绝不包装 —— 包装会静默改变实际运行内容。该集同时也是库函数 `wrapWithRtk` 的默认值；经 bash 执行的调用方必须显式声明，才能拿到较小的那一套。

| `command` | bash | pwsh |
|---|---|---|
| `git status` | `rtk git status` | `rtk git status` |
| `git status \| grep x` | 透传 | 透传 |
| `git status # note` | `rtk git status # note` | 透传 |
| `git log (dev)` | `rtk git log (dev)` | 透传 |

### 装配矩阵

每个 host 上 `ctx.shell` 都是**单服务位**：bash 与 pwsh 执行器互斥，同时注册会让 host 响亮失败。随包的 `shell-rtk` entry 只认领它一次：先解析 pwsh 可执行文件，再实际启动验证（退出码 0），然后装配匹配的族；`preferShell` 可覆盖该判定。探针每个进程只跑一次 —— 装完 pwsh 或 rtk 后请重启 `dsh`。

| 平台 | pwsh | preferShell | 挂载的执行器 |
|---|---|---|---|
| Windows | 存在 | `auto` | pwsh 族（rtk 包装） |
| Windows | 存在 | `pwsh` | pwsh 族（rtk 包装） |
| Windows | 存在 | `bash` | bash 族（rtk 包装） |
| Windows | 缺失 | `auto` | bash 族（rtk 包装） |
| Windows | 缺失 | `pwsh` | pwsh 族（rtk 包装） |
| Linux / macOS | 存在 | `auto` | pwsh 族（rtk 包装） |
| Linux / macOS | 存在 | `pwsh` | pwsh 族（rtk 包装） |
| Linux / macOS | 存在 | `bash` | bash 族（rtk 包装） |
| Linux / macOS | 缺失 | `auto` | bash 族（rtk 包装） |
| Linux / macOS | 缺失 | `bash` | bash 族（rtk 包装） |

读表要点：

- 即使探针一无所获，`preferShell: 'pwsh'` 依然生效 —— rtk 包装照旧在位，只是命令会像「在没装 pwsh 的机器上跑原生 pwsh 执行器」那样失败。只在你确知 pwsh 存在的场合才钉死方言。
- 只有 `preferShell: 'auto'` 让探针做决定，因此一份 profile 在任何机器上都正确。
- 探针是真启动，不是查路径：`resolvePwshPath()` 永不失败（找不到安装位置时回退裸 `pwsh` 字符串交给 `PATH` 解析），故「是否存在」只能靠启动候选者来观测。
- 无论挂哪一族，包装的都是 **sandbox** 执行器，文件隔离保留。非隔离的 `RtkBashExecutor` / `RtkPwshExecutor` 类仍可供 `danger-full-access` 场景使用。

## API / 配置

两个执行器均接受与其原生对应物（`LocalBashExecutor` / `SandboxBashExecutor`）相同的基础配置，外加一个可选字段：

| 选项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `rtkAvailable` | `boolean` | `rtk --version` 探测结果 | 强制启用或禁用 rtk 包装。适用于测试或二进制路径非标准的部署环境。 |

`shell-rtk` 装配器 entry 接受同样的执行器配置，外加它自己的三个字段：

| 选项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `preferShell` | `'auto' \| 'pwsh' \| 'bash'` | `'auto'` | 装配哪一族。`auto` 跟随 pwsh 探针；另两者钉死方言。 |
| `pwshAvailable` | `boolean` | pwsh 探针结果 | 钉死探针判定，完全跳过探测。 |
| `pwshPath` | `string` | 解析到的常见安装位置，否则 `pwsh` | 显式指定 pwsh 可执行文件：既是探测候选，也是 pwsh 族实际启动的程序。 |

其余选项 —— `cwd`、`timeoutMs`、`graceMs` 等 —— 均原样继承自上游执行器。

## 哪些命令会被路由

符合 rtk 包装条件的命令集合由 **rtk 本身**定义 —— 权威且持续维护的列表见 [rtk 命令参考](https://github.com/rtk-ai/rtk#supported-ecosystems) / [`README.md`](https://github.com/rtk-ai/rtk/blob/develop/README.md#test-runners)。本插件镜像该列表；当 rtk 新增子命令时，升级 rtk（而非本插件）即可生效。

复杂命令 —— 管道、`&&`/`;`、重定向、`$( )`、环境变量赋值 —— 无论白名单如何，始终以原生方式运行。

## 从 0.1.x 升级

0.2.0 用单条 `shell-rtk` 装配器取代了按方言划分的 overlay entry。主入口（`@deeptrial/dsh-bash-rtk`）仍默认导出 bash sandbox 执行器，因此直接 import 它的库消费者保持 0.1.x 行为；但插件现在会按实际解析该命令的方言选择元字符集。0.1.x 写的 profile 需要两处改动：

```yaml
# 旧（0.1.x）
- insert:
    - id: bash-rtk
      name: '@deeptrial/dsh-bash-rtk'
      disabled: false

# 新（0.2.0）
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

1. 删掉 `bash-rtk` 那一行 —— 该 entry id 已不存在，取代它的装配器会替你挑方言。
2. 禁用被本插件覆盖的原生执行器并启用 `shell-rtk`（见 [安装与启用](#安装与启用)）。
3. 重启 `dsh`。装配器在启动时探一次 pwsh；`preferShell: 'bash'` 可在任何平台复刻 0.1.x 的方言。

其余一切不变：`rtkAvailable`、peer 范围与 `engines` 范围本次发布都未改动。`rtk` 二进制依旧由你自行安装与更新。

## 开发

```sh
# 1. 克隆插件及其依赖的 harness
git clone https://github.com/DeepTrial/dsh-bash-rtk.git
git clone https://github.com/deepseek-ai/deepseek-harness.git

# 2. 安装 harness 依赖并构建插件所链接的库
cd deepseek-harness && pnpm install && pnpm build:lib:host

# 3. 安装插件依赖并运行检查
cd ../dsh-bash-rtk && pnpm install --ignore-scripts
pnpm run check        # 类型检查 + 测试 + 构建
pnpm run test         # 仅测试
pnpm run typecheck    # 仅 tsc
```

`devDependencies` 通过 `link:` 指向本地 `deepseek-harness` 源码仓；测试需在该 workspace 内运行（`@deepseek-ai/dsh-*` 包必须可解析）。

## 许可证

MIT
