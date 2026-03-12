# IronClaw Branch Guide

用户优先用`nushell`
这个分支主要用于：

- 思考 IronClaw 的应用方式
- 探索可行的二次开发方向
- 进行少量、低风险的小改动

工作原则：

- 以方案分析、产品思路、交互设计、能力评估为主
- 默认避免大规模重构、底层架构调整和成体系的新功能开发
- 如果需要改代码，优先选择局部、小范围、可回退的修改
- 输出应尽量帮助快速验证想法，而不是引入长期维护负担

如果任务明显属于正式开发、架构演进或较大范围的功能实现，应在独立开发分支中进行。


TODO：

**Bug: `ironclaw service start` 在 ImmortalWrt 上失败**
`ironclaw service install` 生成的是 systemd service 文件，但 ImmortalWrt 用的是 procd（OpenWrt init 体系），systemd 不存在，导致 `ironclaw service start` 报 `No such file or directory`。需要生成 procd 格式的 `/etc/init.d/` 脚本。

**Bug: WASM 工具加载时无法从组件提取 description/parameters**
工具源码通过 `wit_bindgen` 定义了 `description()` 和 `schema()`，但运行时（`loader.rs`）无法从编译好的 wasip1 WASM 中提取这两个字段，降级靠 capabilities 文件补丁。正确做法是运行时调用 WASM 导出函数读取元数据，不应要求 capabilities 文件重复声明。临时解法：手动在 capabilities 文件加 `description` 和 `parameters` 字段。

**Bug: time 工具在 LLM 传空字符串时区参数时报错**
LLM 对未使用的可选参数会传空字符串 `""`（正常行为）。`3f64c1c` 已修复 safety validator 层允许空字符串透传，但 `time.rs` 的 `optional_timezone`（L289）和 `resolve_timezone_for_output`（L250）未同步处理：`.and_then(|v| v.as_str())` 对 `""` 返回 `Some("")`，导致 `parse_timezone("")` 报 `Unknown timezone ''`。修复方案：加 `.filter(|s| !s.is_empty())` 跳过空字符串，视为未传参。范围仅 `src/tools/builtin/time.rs`，其他工具不受影响。

**已知问题: rig-core 默认 feature 引入 openssl-sys，导致 musl 交叉编译失败**
`rig-core` 默认 feature 包含 `reqwest-tls` → `reqwest/default` → `native-tls` → `openssl-sys`，在 `aarch64-unknown-linux-musl` 目标下编译失败。临时解法（已应用到 `Cargo.toml`）：`rig-core = { default-features = false, features = ["reqwest-rustls"] }`，切换为 rustls 避开 openssl-sys。潜在风险：rustls 与 native-tls 行为存在差异（证书验证策略等），需在目标平台验证 TLS 兼容性。长期方案：上游 rig-core 应将 openssl/rustls 做成互斥可选 feature，或官方支持 musl 编译目标。

**TODO: 定时将路由器配置备份到坚果云**
路由器 /overlay 空间有限且无自动备份，需定期将 `~/.ironclaw/` 关键配置（`config.toml`、`.env`、`ironclaw.db`）同步到坚果云。可通过 ironclaw 内置定时任务（routine）或 OpenWrt cron 实现，调用 WebDAV 接口上传。需评估：坚果云 WebDAV 地址、认证方式、备份频率，以及 db 文件是否需要先 dump 再上传。

**Bug: `ironclaw onboard` 在离线/无注册中心环境下无法安装 WASM channel**
在 ImmortalWrt 路由器上运行 setup wizard 选择 Telegram channel 时，报 `Source fallback unavailable for 'telegram' after artifact install failed`。原因：程序尝试从远程 registry 下载 telegram channel 的 WASM artifact，但在无法访问注册中心的环境（或网络受限设备）下直接失败，没有从本地路径加载的 fallback。需要支持预先手动放置 WASM channel 文件（`~/.ironclaw/channels/telegram.wasm`），onboard 时检测到本地文件则跳过下载。临时解法：手动编译并 scp 上传到 `/root/.ironclaw/channels/`。

