# pwsh 支持在 resolve() 边界改写命令（镜像 bash twin）

上游 `dsh-pwsh-local` / `dsh-pwsh-sandbox` 与 bash twin 完全同构：都暴露 `resolve(request): ShellExecSpec`，且 `spec.command` 在该边界是原始命令（pwsh 的 ENCODING_PREAMBLE 要到 `argv()` 才拼接）。因此 pwsh 支持通过子类化 `PwshLocalExecutor` / `SandboxPwshExecutor` 并在 `resolve()` 返回后改写 `spec.command` 实现，与现有 bash 侧逐字同构。

## Considered Options

- **argv 层包装**（拒绝）：要自己重拼 `-Command` 参数并处理 ENCODING_PREAMBLE 前缀，重实现上游已解决的边界。
- **工具层包装**（拒绝）：绑死具体工具（dsh-tool-pwsh 等），对其他 ctx.shell 消费者不生效。

## Consequences

- workdir、超时、env、退出码、沙箱隔离、后台作业语义全部继承上游，零重复实现。
- 沙箱 confinement 在 argv 层生效，改写后的命令文本自动被沙箱链处理。
