# v0.2.0 真机验收记录（ticket #6）

对象：运行中的 `dsh web` host（PID 10300，`@deepseek-ai/dsh` 0.1.5-rc.2，Windows 10 + pwsh 7.6.1 + rtk 0.43.0）。
方式：不重启进程，profile patch 改写后由 `include.refresh` 进程内重装配；观测与执行都通过一个临时注入的验收探针（host 内 HTTP 路由，验收完成后已 `dev_uninject` 卸载、profile patch 复原）。

## 验收结论

| 验收项 | 结果 | 证据 |
|---|---|---|
| 构建产物热注入运行中的 host | 通过 | 同一 PID 10300；`shell-rtk` entry 启用（fiber uid 341 → 重载后 358）；挂载的 `ctx.shell` 原型链 `RtkSandboxPwshExecutor → SandboxPwshExecutor → PwshLocalExecutor → ShellExecutor → Service`，其 `resolve()` 源码哈希与磁盘产物 `lib/pwsh.js` 一致（`e626ad3881f0bd18…`） |
| pwsh 语义（非 bash 退化） | 通过 | `Get-Location` 经 `ctx.shell` 得 `Path / ---- / F:\dsh-plugins\dsh-bash-rtk`（exit 0）；官方 `@deepseek-ai/dsh-tool-pwsh` 定义在同一 seam 上执行 `Get-Location` 同样成功 |
| 真走 rtk + `rtk gain --history` 记录 | 通过（一次性升级运行） | `resolve()` 产出 `rtk git status`，exit 0，输出为 rtk 压缩形态；`rtk gain --history` 新增 `09-14 09:34 ■ rtk git status -52% (134)` |
| 原生执行器保持禁用 / `shell-rtk` 启用 | 通过 | 组合树：`bash-sandbox disabled: true`、`pwsh-sandbox disabled: true`、`shell-rtk disabled: false`；旧 `bash-rtk` entry 在 0.2.0 已不存在（组合树中无此行） |
| host 未被打断 | 通过 | 重装配期间 profile patch 与 `cordis.yml` md5 不变；`/super-injector/api/list` 与工具调用全程可用 |

## 关键证据（原始输出摘录）

1. 组合树（`dsh --profile web --dump-config`）：

```yaml
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

2. 受限运行（profile 默认 `workspace-write`）—— 命令不再被 rtk 改写，语义不变：

```
cmd=git status (standing policy) -> resolved='git status'  exit=0
stdout: On branch dev / Your branch is up to date with 'origin/dev'. …
```

3. 一次性升级运行（`danger-full-access`）—— 真走 rtk：

```
cmd=git status (danger-full-access) -> resolved='rtk git status'  exit=0
stdout: * dev...origin/dev / M CONTEXT.md / …
rtk gain --history: 09-14 09:34 ■ rtk git status  -52% (134)
```

4. 官方 pwsh 工具定义（`@deepseek-ai/dsh-tool-pwsh` 的 `execute()` + `render()`，在同一 `ctx.shell` 上执行）：

```
git rev-parse HEAD  -> exit=0  "3f99bdb0d774bb38d1756543921df1642e797457"
Get-Location        -> exit=0  "Path / ---- / F:\dsh-plugins\dsh-bash-rtk"
git status          -> exit=0  （pass-through，输出为完整 git status）
```

## 真机发现：Windows 受限沙箱下 rtk 不可用

初版 v0.2.0（照常改写）在默认 `workspace-write` 下把 `git status`/`git log`/`git diff` 直接跑坏：
`rtk: Failed to run git status: Failed to execute command: 拒绝访问。 (os error 5)`（exit 1、无输出），而同样条件下不经 rtk 的 `git status` 正常。手写 `rtk git status`（不经过插件改写）失败方式一致——故障属于 rtk × 环境，而非改写。

根因：`@deepseek-ai/dsh-sandbox-windows-acl` 用 `WRITE_RESTRICTED` 令牌约束子进程，其文档化的限制是受限进程无法以管道 stdio 生成**孙子进程**（命名管道客户端请求的写权限没有任何 restricting SID 被授予 → `EPERM`）；rtk 过滤任何工具都用管道捕获输出，于是受限运行里所有过滤类子命令都不可用。

处理：见 [`docs/adr/0003-confined-win32-passthrough.md`](adr/0003-confined-win32-passthrough.md)——win32 且运行受限时一律透传（`confinedWindowsRun()`），`danger-full-access` 运行与 POSIX 主机照常改写。这样"包装绝不改变语义"的承诺在默认 profile 下依然成立；代价是默认 Windows profile 下不省 token，要省 token 就走一次性升级（`pwsh` 工具的 `sandbox_permissions` + 审批）。

## 复现步骤

1. `pnpm run check`（typecheck + 108 用例 + 构建）。
2. profile 的 `cordis.patch.yml` 追加：`bash-sandbox disabled: true`、`pwsh-sandbox disabled: true`、`shell-rtk disabled: false`，保存即触发 `include.refresh`（不重启）。
3. 运行中的 host 内跑 `git status`（默认模式）应透传成功；加一次 `danger-full-access` 升级后应得到 `rtk git status` 的压缩输出，并出现在 `rtk gain --history`。
   （第 3 步是 v0.2.0 的行为记录：0.2.1 起默认模式不再透传，见下节。）

## 决策反转（v0.2.1）

上一节的处理（受限即透传）在 ticket #6 收尾时被用户裁定撤销：0.2.1 起受限运行照旧改写，上述失败降级为文档化警示（见 [`docs/adr/0004-confined-win32-routing-restored.md`](adr/0004-confined-win32-routing-restored.md)）。

本文其余部分（v0.2.0 的验收结论与原始摘录）保持原样 —— 它们仍是这次反转所依据的实测证据：受限运行下 `resolve()` 产出 `rtk git status`、执行以 `拒绝访问 (os error 5)` 失败，而 `danger-full-access` 下同一命令成功并留下 `-52% (134)` 记录。
