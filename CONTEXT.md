# dsh-bash-rtk

DeepSeek Harness 的 shell 执行器覆盖插件：把符合条件的命令改写为 rtk（Rust Token Killer）调用，压缩工具输出、省 token；其余一切语义不变。支持 bash 与 pwsh 两个 shell 方言。

## Language

### 路由判定

**rtk 包装（Rtk Wrap）**:
把符合条件的命令改写为等价的 rtk 子命令调用。只改命令文本，不改执行语义。
_Avoid_: 代理、拦截、注入

**透传（Pass-through）**:
不符合条件的命令原样交给执行器，逐字节零改动。
_Avoid_: 回退、fallback

**三道关卡（Three Gates）**:
决定一条命令被 rtk 包装还是透传的三个独立判据，按序：可用性、复杂度、白名单。任一关不过即透传。可用性含两层：进程级（rtk 探针）与单次运行级（受限运行透传，见 docs/adr/0003）。

**白名单（Whitelist）**:
可执行名到 rtk 子命令的固定映射。与 shell 方言无关——git 在 bash 和 pwsh 里都是 git。
_Avoid_: 支持列表、命令表

**元字符集（Metacharacter Set）**:
复杂度关卡使用的排除字符表，按 shell 维度分两套。pwsh 集是 bash 集的超集：多排除 `()`、`@`、`{}`、`#`、换行——这些在 pwsh 里有独立解析含义，包装它们可能改变语义。
_Avoid_: 特殊字符、黑名单

**shell 维度（Shell Dimension）**:
命令所属的 shell 方言：bash 或 pwsh。决定元字符集的选套。是方言属性，不是操作系统属性。
_Avoid_: 平台、OS

### 执行器

**执行器家族（Executor Family）**:
按 shell × 隔离两轴划分的四个执行器：bash/pwsh × local/sandbox。同族同构——都在 resolve() 边界接收原始命令。
_Avoid_: 执行器变体、twin

**单服务位（Single Service Slot）**:
上游约束：一个 host 的 ctx.shell 只能装配一个执行器。bash 与 pwsh 执行器互斥，同时注册即启动失败（刻意的响亮报错）。
_Avoid_: 双壳、共存

**ENCODING_PREAMBLE**:
pwsh 执行器在 argv 层拼接的 UTF-8 输出前置语句。不在 resolve() 边界出现，故 rtk 包装不受它影响。

### 装配

**智能装配器（Auto Assembler）**:
overlay 的唯一入口（shell-rtk entry）：启动时探 pwsh，存在则装配 pwsh 族，不存在则装配 bash 族。始终只占一个服务位。
_Avoid_: 路由器、调度器

**受限运行（Confined Run）**:
Windows 上以受限令牌（WRITE_RESTRICTED）执行的沙箱运行：`read-only` 或 `workspace-write`。rtk 的过滤类子命令在其中无法用管道 stdio 生成孙子进程（EPERM），故一律透传；`danger-full-access` 运行不是受限运行。
_Avoid_: 沙箱模式、隔离运行

**探针（Probe）**:
启动时执行一次的外部能力存在性检测。两种：rtk 探针（`rtk --version` 退出码 0）、pwsh 探针（解析出的 pwsh 可执行文件能启动）。结果缓存至进程生命周期。
_Avoid_: 检测、嗅探

**preferShell**:
装配器的配置字段：`auto`（默认，探针决定）| `pwsh` | `bash`（强制覆盖探针）。
_Avoid_: 平台开关、选择器

**overlay**:
随包分发的装配片段（cordis.patch.yml 的 insert 列表）。默认禁用；用户在 profile 里启用。
_Avoid_: 补丁、配置
