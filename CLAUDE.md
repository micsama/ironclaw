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

## 二次开发工作流（向上游提 PR）

- **起点**：从 `upstream/staging` 新建 worktree 分支，命名如 `fix/xxx` 或 `feat/xxx`
- **remote 配置**：
  - `origin` → `git@github.com:micsama/ironclaw.git`（你的 fork）
  - `upstream` → `git@github.com:nearai/ironclaw.git`
- **push 目标**：push 到 `origin`（micsama fork），PR target 指向 `nearai/ironclaw` 的 `staging` 分支
- **commit 规则**：每次 commit 前必须让用户 review，不自动 commit
- **质量门**：提 PR 前跑 `cargo fmt` + `cargo clippy --all --all-features`（zero warnings）+ `cargo test`
- **遵循 CONTRIBUTING.md**：不用 `.unwrap()`/`.expect()`（测试除外），用 `thiserror`，必要时更新 `FEATURE_PARITY.md`


TODO / Bug 跟踪（2026-03-13 更新）

---

### ✅ 已解决（upstream 已合入）

**WASM 工具加载时无法从组件提取 description/parameters**
- 上游 commit `94b448f`（Gabe, 2026-03-11）在 `src/tools/wasm/capabilities_schema.rs` 加入可选 `description`/`parameters` 字段，WasmToolLoader 读取并注入。
- 已合入 staging，待 promote 到 main。
- 临时解法（capabilities 文件手动加字段）可继续兼容，无需删除。

**safety validator 空字符串透传**
- 上游 PR #848（micsama, 2026-03-11）已修复 `src/safety/validator.rs`，已合入 main + staging + mic/dev。

---

### 🔧 计划提 PR（按优先级）

**[P1] Bug: time 工具在 LLM 传空字符串时区参数时报错**
- 症状：LLM 传 `timezone: ""` 时，`parse_timezone("")` 报 `Unknown timezone ''`。
- 修法：`src/tools/builtin/time.rs` L250、L289，在 `.and_then(|v| v.as_str())` 后加 `.filter(|s| !s.is_empty())`。
- 上游现有 PR #755（Changes Requested，策略不同：改了 dispatcher+validator，风险更高）。我们的修法只改 time.rs，Track B。
- **下一步**：从 `upstream/staging` 新建 worktree `fix/time-empty-timezone`，提 PR 到 nearai/ironclaw staging。

**[P2] Bug: `ironclaw onboard` 在离线/无注册中心环境下无法安装 WASM channel**
- 症状：ImmortalWrt 上 onboard 选 Telegram 报 `Source fallback unavailable for 'telegram' after artifact install failed`。
- 修法：安装前检测 `~/.ironclaw/channels/{name}.wasm`，存在则跳过远程下载。
- 上游无直接对应 PR/issue（最近似 #840，但问题不同）。
- **临时解法**：手动编译后 scp 到路由器 `/root/.ironclaw/channels/`。

**[P3] Bug: `ironclaw service start` 在 ImmortalWrt 上失败**
- 症状：`ironclaw service install` 生成 systemd 文件，ImmortalWrt 用 procd，导致启动失败。
- 修法：检测 OS init 体系，ImmortalWrt/OpenWrt 下生成 `/etc/init.d/` procd 格式脚本。
- 上游无对应 issue/PR，改动面较大，建议先开 issue 探水。

---

### 💤 暂缓 / 本地解决

**rig-core musl 交叉编译失败**
- 临时解法已应用：`Cargo.toml` 中 `rig-core = { default-features = false, features = ["reqwest-rustls"] }`。
- 长期方案需上游 rig-core 支持，暂不提 PR。

**定时将路由器配置备份到坚果云**
- 本地需求，不适合提上游 PR。
- 方案待评估：坚果云 WebDAV + ironclaw routine 或 OpenWrt cron。

