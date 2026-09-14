# 受限的 Windows 运行照旧改写（撤回 0003 的透传闸门）

用户在 ticket #6 的收尾决策上裁定「照常改写」：撤销 0.2.0 为守住「包装绝不改变语义」而加的受限运行闸门。win32 受限运行（`read-only` / `workspace-write`）与其它运行同等对待 —— 符合条件即改写为 `rtk <子命令>`，不再有单次运行级的可用性判定。

代价已知，且保留为证据：该环境下 rtk 的过滤类子命令以 `拒绝访问 (os error 5)` 失败（根因见 [`0003-confined-win32-passthrough.md`](0003-confined-win32-passthrough.md)，原始实测摘录见 [`docs/acceptance-v0.2.0.md`](../acceptance-v0.2.0.md)）。0.2.1 起这不再由代码拦，改为文档化警示：双语 README 的「Confined Windows runs / Windows 受限运行」章节、`CONTEXT.md` 的「受限运行」术语、`cordis.patch.yml` 的末尾注释。

## Considered Options

- **保留 0003 的透传闸门**（已实施，被撤销）：默认 Windows profile（`workspace-write`）下插件静默不省 token，用户在命令输出里找不到任何「为什么没压缩」的线索；闸门还把可用性变成按平台/模式分叉的隐式行为，同一份 profile 在不同模式下语义不同。
- **只对过滤类子命令透传**（拒绝，同 0003）：过滤与否是 rtk 内部实现细节（实测 `rtk git rev-parse HEAD` 转发成功、`rtk git status` 过滤失败），插件侧无法预判，任何白名单都会随 rtk 版本漂移。
- **加配置项让用户自行选择**（拒绝，YAGNI，同 0003）：一次性升级到 `danger-full-access` 已经是「我要 rtk」的路径。
- **让执行器自动升级沙箱策略**（拒绝，同 0003）：审批属于 approval 服务的职责，执行器不得绕过。

## Consequences

- 实现层不再有按运行决策的可用性关卡：`confinedWindowsRun()` 与其真值表用例删除，`src/rtk.ts` 只剩进程级 `probeRtk()`；`src/index.ts` / `src/pwsh.ts` 的 `resolve()` 无条件改写。
- Windows 默认 profile 下，`git status` / `git log` / `git diff` 等过滤类命令会以 rtk 的访问拒绝失败（rtk 仅做转发的命令仍成功）；要真省 token 就走 `danger-full-access`（含一次性升级）。
- 「包装绝不改变语义」在 0.2.1 修订为：**改写无条件、失败可见** —— 插件不因平台静默改变自己做什么；平台可用性写进文档，由用户决定用哪种模式。
- 上游若修好受限孙进程的管道 stdio（或 rtk 改为继承 stdio 生成子进程），删掉各处警示即可，代码无需再改。
