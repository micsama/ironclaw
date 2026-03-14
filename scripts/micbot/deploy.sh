#!/usr/bin/env bash
# 将 IronClaw 部署到 Cudy TR3000 路由器（ImmortalWrt）。
#
# 用法：
#   ./deploy.sh [选项]
#
# 选项：
#   -H, --host HOST       路由器地址（默认：192.168.1.1）
#   -u, --user USER       SSH 用户（默认：root）
#   -b, --binary PATH     指定上传的二进制文件（默认：自动检测）
#   --init-d PATH         同时上传 init.d 服务文件到 /etc/init.d/
#   --no-binary           跳过二进制上传（仅部署 init.d 时使用）
#   -h, --help            显示帮助

set -euo pipefail

# ---------- 默认值 ----------
ROUTER_HOST="${ROUTER_HOST:-192.168.1.1}"
ROUTER_USER="${ROUTER_USER:-root}"
BINARY_PATH=""
INITD_PATH=""
SKIP_BINARY=false

REMOTE_BIN_DIR="/tmp/bin/"
REMOTE_INITD_DIR="/etc/init.d"
BINARY_NAME="ironclaw"

# ---------- 解析参数 ----------
while [[ $# -gt 0 ]]; do
    case "$1" in
        -H|--host)      ROUTER_HOST="$2"; shift 2 ;;
        -u|--user)      ROUTER_USER="$2"; shift 2 ;;
        -b|--binary)    BINARY_PATH="$2"; shift 2 ;;
        --init-d)       INITD_PATH="$2"; shift 2 ;;
        --no-binary)    SKIP_BINARY=true; shift ;;
        -h|--help)
            sed -n '/^# 用法/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
            exit 0
            ;;
        *) echo "未知选项：$1" >&2; exit 1 ;;
    esac
done

REMOTE="${ROUTER_USER}@${ROUTER_HOST}"

# ---------- 确定二进制路径 ----------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_TARGET="aarch64-unknown-linux-musl"
BUILD_FEATURES="libsql,html-to-markdown"
CROSS_BIN="$REPO_ROOT/target/$BUILD_TARGET/release/$BINARY_NAME"

if [[ "$SKIP_BINARY" == false ]]; then
    if [[ -z "$BINARY_PATH" ]]; then
        echo "编译中（target: ${BUILD_TARGET}）..."
        cargo zigbuild --release \
            --target "${BUILD_TARGET}" \
            --no-default-features \
            --features "${BUILD_FEATURES}" \
            --manifest-path "$REPO_ROOT/Cargo.toml"
        BINARY_PATH="$CROSS_BIN"
        echo "编译完成：$BINARY_PATH"
    fi

    echo "上传二进制 -> ${REMOTE}:${REMOTE_BIN_DIR}/${BINARY_NAME}"
    scp "$BINARY_PATH" "${REMOTE}:${REMOTE_BIN_DIR}/${BINARY_NAME}"
    ssh "$REMOTE" "chmod +x ${REMOTE_BIN_DIR}/${BINARY_NAME}"
    echo "二进制部署完成。"
fi

# ---------- init.d 服务文件 ----------
if [[ -n "$INITD_PATH" ]]; then
    if [[ ! -f "$INITD_PATH" ]]; then
        echo "错误：init.d 文件不存在：$INITD_PATH" >&2
        exit 1
    fi
    INITD_NAME="$(basename "$INITD_PATH")"
    echo "上传服务文件 -> ${REMOTE}:${REMOTE_INITD_DIR}/${INITD_NAME}"
    scp "$INITD_PATH" "${REMOTE}:${REMOTE_INITD_DIR}/${INITD_NAME}"
    ssh "$REMOTE" "chmod +x ${REMOTE_INITD_DIR}/${INITD_NAME}"
    echo "服务文件部署完成。启用服务："
    echo "  ssh ${REMOTE} '/etc/init.d/${INITD_NAME} enable && /etc/init.d/${INITD_NAME} start'"
fi

# ---------- WASM 工具 ----------
TOOLS_SRC="$REPO_ROOT/tools-src"
REMOTE_TOOLS_DIR="/root/.ironclaw/tools"
WASM_TOOLS=(github web-search)

ssh "$REMOTE" "mkdir -p ${REMOTE_TOOLS_DIR}"

for TOOL in "${WASM_TOOLS[@]}"; do
    TOOL_DIR="$TOOLS_SRC/$TOOL"
    if [[ ! -d "$TOOL_DIR" ]]; then
        echo "跳过 $TOOL（源码目录不存在）"
        continue
    fi

    echo "编译 WASM 工具：$TOOL ..."
    (cd "$TOOL_DIR" && cargo component build --release 2>&1 | tail -3)

    WASM_FILE="$(find "$TOOL_DIR/target" -name "*.wasm" -path "*/release/*" ! -path "*/deps/*" | head -1)"
    CAPS_FILE="$(find "$TOOL_DIR" -maxdepth 1 -name "*.capabilities.json" | head -1)"

    if [[ -z "$WASM_FILE" ]]; then
        echo "警告：$TOOL 未找到编译产物，跳过" >&2
        continue
    fi

    echo "上传 ${TOOL}.wasm -> ${REMOTE}:${REMOTE_TOOLS_DIR}/"
    scp "$WASM_FILE" "${REMOTE}:${REMOTE_TOOLS_DIR}/${TOOL}.wasm"

    if [[ -n "$CAPS_FILE" ]]; then
        scp "$CAPS_FILE" "${REMOTE}:${REMOTE_TOOLS_DIR}/${TOOL}.capabilities.json"
    fi
done

# ---------- WASM Channel ----------
CHANNELS_SRC="$REPO_ROOT/channels-src"
REMOTE_CHANNELS_DIR="/root/.ironclaw/channels"
WASM_CHANNELS=(telegram)

ssh "$REMOTE" "mkdir -p ${REMOTE_CHANNELS_DIR}"

for CHANNEL in "${WASM_CHANNELS[@]}"; do
    CHANNEL_DIR="$CHANNELS_SRC/$CHANNEL"
    if [[ ! -d "$CHANNEL_DIR" ]]; then
        echo "跳过 channel $CHANNEL（源码目录不存在）"
        continue
    fi

    echo "编译 WASM channel：$CHANNEL ..."
    (cd "$CHANNEL_DIR" && cargo component build --release 2>&1 | tail -3)

    WASM_FILE="$(find "$CHANNEL_DIR/target" -name "*.wasm" -path "*/release/*" ! -path "*/deps/*" | head -1)"
    CAPS_FILE="$(find "$CHANNEL_DIR" -maxdepth 1 -name "*.capabilities.json" | head -1)"

    if [[ -z "$WASM_FILE" ]]; then
        echo "警告：channel $CHANNEL 未找到编译产物，跳过" >&2
        continue
    fi

    echo "上传 ${CHANNEL}.wasm -> ${REMOTE}:${REMOTE_CHANNELS_DIR}/"
    scp "$WASM_FILE" "${REMOTE}:${REMOTE_CHANNELS_DIR}/${CHANNEL}.wasm"

    if [[ -n "$CAPS_FILE" ]]; then
        scp "$CAPS_FILE" "${REMOTE}:${REMOTE_CHANNELS_DIR}/${CHANNEL}.capabilities.json"
    fi
done

echo "全部完成。"
