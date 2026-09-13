# 智能二选一装配器：单 shell-rtk entry，砍显式 entry

ctx.shell 是单服务位（见 CONTEXT.md）：bash 与 pwsh 执行器互斥，host 只装配其一。按平台手动切换已被实证易错——win32 误启 bash-rtk 后，pwsh 工具全部退化为 bash 执行（`Get-ChildItem` 报 `/usr/bin/bash: command not found`）。且 `resolvePwshPath()` 永远返回非空（找不到安装位置时回退裸 `pwsh` 字符串），"pwsh 存在与否"必须用启动探针判定。

决定：overlay 只提供一条 `shell-rtk` entry（`./auto` 子路径的装配器插件）。构造时运行 pwsh 探针：pwsh 存在则装配 pwsh 执行器族，否则装配 bash 族——单 entry 在所有平台默认正确。强制需求走 `preferShell: 'auto' | 'pwsh' | 'bash'` 配置，不再提供显式 `pwsh-rtk` / `bash-rtk` overlay entry；`./pwsh` 子路径导出保留作编程逃生口。

## Considered Options

- **两条显式 entry 手动二选一**（拒绝）：易错已实证；用户每次换环境都要改配置。
- **三条 entry 并存（auto + bash-rtk + pwsh-rtk）**（拒绝）：并排 entry 必被选错；`preferShell` 已覆盖强制需求，overlay 多一条就多一份解释负担。

## Consequences

- 主入口 default export 保持 `RtkSandboxBashExecutor` 不变，0.1.x 已发布行为与旧 profile 配置不破。
- 旧 profile 里残留的 `bash-rtk` entry 引用由 README 迁移说明处理（禁用它、启 `shell-rtk`）。
- 探针只在装配器构造时运行一次；中途安装 pwsh/rtk 需重启生效（与现有 rtk 探测语义一致）。
