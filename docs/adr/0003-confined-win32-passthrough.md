# 受限的 Windows 运行一律透传（rtk 在受限令牌下无法代理）

真机验收（issue #6）在运行中的 `dsh web` host 上实测：`workspace-write` 下 `ctx.shell` 把 `git status` 改写为 `rtk git status` 后，rtk 以 `Failed to run git status: Failed to execute command: 拒绝访问。 (os error 5)` 失败（exit 1、无输出）；同一条命令**不经 rtk** 时正常成功。手写 `rtk git status`（不经过插件的改写）失败方式完全相同，证明故障属于 rtk 与环境，而非改写本身。

根因见 `@deepseek-ai/dsh-sandbox-windows-acl` 的文档化限制：该后端以 `WRITE_RESTRICTED` 令牌约束子进程，而*受限*进程无法以管道 stdio 生成孙子进程（libuv 的管道 stdio 走命名管道，客户端请求的写权限没有任何 restricting SID 被授予 → `EPERM`）。rtk 过滤任何工具都用管道捕获输出，因此受限运行里**所有过滤类**子命令都不可用；`danger-full-access` 运行（无受限令牌，含一次性升级）与 POSIX 主机不受此限。

决定：沙箱执行器在 `resolve()` 里检查本次运行的沙箱模式（`confinedWindowsRun()`），win32 且模式非 `danger-full-access` 时跳过改写、逐字节透传。判定为纯函数（平台可注入），真值表单测覆盖。不改工具面、不加配置项。

## Considered Options

- **照常包装，把失败交给用户看**（拒绝）：本插件的第一承诺是"包装绝不改变语义"（`src/wrap.ts` 文档头）。默认的 Windows profile 就是 `workspace-write`，照常包装等于让 `git status`/`git log`/`git diff` 这类最常用命令直接坏掉——违反承诺，且比不省 token 更糟。
- **只对"会过滤的"子命令透传**（拒绝）：过滤与否是 rtk 内部实现细节（实测 `rtk git rev-parse HEAD` 透传成功、`rtk git status` 过滤失败），插件侧无法预判，任何白名单都会随 rtk 版本漂移。
- **加配置项让用户自行决定**（拒绝，YAGNI）：只有在用户明知会坏仍要开的情况下才需要；一次性升级到 `danger-full-access` 已经提供了"我要 rtk"的路径。
- **让执行器自动升级到 `danger-full-access`**（拒绝）：那是在替用户改沙箱策略——审批属于 approval 服务的职责，执行器不得绕过。

## Consequences

- Windows 默认 profile（`workspace-write`）下插件退化为透传：不省 token，但也不破坏命令；要省 token 就走一次性升级（`pwsh` 工具的 `sandbox_permissions` + 审批），实测该路径下 `rtk gain --history` 出现 `rtk git status` 记录。
- POSIX 与 `danger-full-access` 行为不变；`./pwsh`、`./auto`、`./wrap` 的公开面不变。
- 代价是"可用性"关卡变成两层（进程级探针 + 单次运行级判定），CONTEXT.md 与双语 README 已同步说明。
- 上游若修好受限孙进程的管道 stdio（或 rtk 改为继承 stdio 生成子进程），删掉 `confinedWindowsRun()` 与相关用例即可恢复全平台包装。
