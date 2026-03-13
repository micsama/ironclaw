• 截至 2026-03-13，我用 gh 查了 nearai/ironclaw 的 open issues 和 open PR，并且按本地 AGENTS.md 里后半段那三条具体说明逐条对照了，不是只按模糊关键词归类。

  结论

  - time.rs 空字符串时区：没有找到“完全同题”的 open issue；有一个很接近的 open PR，属于同一底层症状。
  - onboard 离线 WASM channel：没有找到“完全同题”的 open issue 或 PR；只有几个相邻问题。
  - systemd vs procd / ImmortalWrt：没有找到直接对应的 open issue 或 PR；只有泛化的 systemd 服务集成讨论。

  1. time.rs 空字符串时区
  AGENTS.md 里的定义很明确：是 src/tools/builtin/time.rs 对 timezone: "" 处理不对，应该把空字符串当成未传参。

  相关项：

  - PR #755 (https://github.com/nearai/ironclaw/pull/755) fix: built-in time tool call failure
      - 这是当前最接近的一项。
      - 它确实改了 src/tools/builtin/time.rs，也改了 src/safety/validator.rs 和调度层。
      - 它的做法不是只在 time.rs 里加 .filter(|s| !s.is_empty())，而是更上游地把 LLM 传来的空字符串统一转成 null，再让 time 工具按“未传参”处理。
      - 所以它和 AGENTS.md 说的是同一类 bug、同一类输入症状，但修复策略更广，不是 AGENTS.md 写的那个“最小范围 time.rs 局部修复”。
  - PR #1029 (https://github.com/nearai/ironclaw/pull/1029) feat(heartbeat): fire_at time-of-day scheduling with IANA timezone
      - 不是同一件事。它是 heartbeat 调度时区功能，不是 time tool 的空字符串参数 bug。
  - Issue #663 (https://github.com/nearai/ironclaw/issues/663) Standardize libSQL timestamp storage to RFC 3339 with UTC offset
      - 不是同一件事。它是数据库时间戳格式问题。

  我的判断：

  - 这一条有“相关 PR”，就是 #755。
  - 但如果按 AGENTS.md 的精确定义说，目前没有看到一个标题和描述都直接点名“time.rs optional timezone empty string”的 open issue。
  - 可以归类为“已有较强相关 PR，在修同一底层问题”。

  2. ironclaw onboard 离线 / 无 registry 时安装 WASM channel
  AGENTS.md 里的定义也很具体：ImmortalWrt 上跑 onboarding，选择 Telegram channel 时，因为访问不到远程 registry，报 Source fallback unavailable for 'telegram' after
  artifact install failed；希望支持本地 ~/.ironclaw/channels/telegram.wasm fallback。

  相关项：

  - Issue #840 (https://github.com/nearai/ironclaw/issues/840) onboard installs stale default WASM tool artifacts incompatible with host WIT 0.3.0
      - 这是最接近的 open issue。
      - 相同点：都发生在 onboard、都和 WASM 安装/fallback 有关。
      - 不同点：#840 说的是“装下来的默认 WASM tool artifact 版本过旧，和宿主 WIT 版本不兼容”；对象是 tools，不是 channels；问题是版本兼容，不是离线/无 registry。
      - 所以它不是 AGENTS.md 那个问题本身，只能算邻近问题。
  - Issue #748 (https://github.com/nearai/ironclaw/issues/748) feat: publish ironclaw-worker Docker image to public registry for auto-pull during onboarding
      - 不是同一件事。它是 onboarding 期间 Docker worker image 的 registry 问题，不是 WASM channel 本地 fallback。
  - Issue #459 (https://github.com/nearai/ironclaw/issues/459) Missing docker images ? "ironclaw-worker:latest"
      - 也不是同一件事。还是 worker image 缺失，不是 Telegram channel 的 .wasm 安装路径。
  - Issue #1052 (https://github.com/nearai/ironclaw/issues/1052) Hot-activated WASM channel reverts to 'awaiting pairing' state
      - 这是 WASM channel 运行态问题，不是 onboarding 安装阶段的离线 fallback。

  我的判断：

  - 没有找到直接对应 AGENTS.md 这条描述的 open issue 或 open PR。
  - #840 是最近似项，但不是同一件事。
  - 也就是说，这条现在在 upstream 的 open 列表里大概率还没有被精确立项。

  3. systemd vs procd / ImmortalWrt
  AGENTS.md 的定义是：ironclaw service install 现在生成 systemd service 文件，但 ImmortalWrt / OpenWrt 实际用的是 procd 和 /etc/init.d/，导致 ironclaw service start 失败。

  相关项：

  - Issue #89 (https://github.com/nearai/ironclaw/issues/89) feat: Network modes and gateway operational features (LAN/remote, PID lock, launchd, mDNS, doctor)
      - 里面提到 launchd/systemd integration。
      - 但这是 gateway 的泛化服务管理能力，不是 ironclaw service install 在 OpenWrt/ImmortalWrt 上生成错误服务脚本的问题。
  - Issue #30 (https://github.com/nearai/ironclaw/issues/30) Gateway System: Feature Parity Tracking
      - 同样只是在 parity tracking 里把 launchd/systemd integration 列为缺项。
      - 不是 procd/init.d 的兼容 bug。
  - Issue #134 (https://github.com/nearai/ironclaw/issues/134) Edge Hardware Support (Pattern A): MCP GPIO Daemon over Unix Socket + Security/Policy Model
      - 里面提到 systemd-managed daemon。
      - 但这是 edge 硬件 daemon 部署模式，不是 CLI service install 在 ImmortalWrt 上的兼容性问题。

  我的判断：

  - 没有找到直接提到 ImmortalWrt、OpenWrt、procd、init.d 的 open issue。
  - 也没有找到正在做这个方向的 open PR。
  - 当前 upstream 只有泛化的 systemd / launchd 服务集成讨论，没有覆盖到你这条“OpenWrt init 体系兼容”问题。

  最终汇总

  - time.rs 空字符串时区
      - 有相关 open PR：#755
      - 性质：同一底层问题，修法比 AGENTS.md 更广；算“相关，但不是一模一样的票面描述”
  - onboard 离线 WASM channel
      - 没有直接对应的 open issue / PR
      - 最接近：#840，但它是 onboard + WASM artifact 版本兼容，不是离线本地 channel fallback
  - systemd vs procd / ImmortalWrt
      - 没有直接对应的 open issue / PR
      - 只有泛化的 systemd/launchd 服务能力讨论：#89、#30
      - 不等于你的 ImmortalWrt/procd 问题
