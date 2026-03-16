# micbot chat2responses proxy

给当前只能访问 OpenAI Chat Completions 接口的 IronClaw 提供一个轻量中转层：

- 接收 `POST /v1/chat/completions`
- 转成上游 `POST /v1/responses`
- 把上游响应再转回 Chat Completions 格式

这样 IronClaw 只需要把 `LLM_BASE_URL` 指到这个代理，不需要改主程序。

## 特性

- 支持非流式 `POST /v1/chat/completions`
- 支持 `GET /v1/models`
- 支持 `GET /` dashboard 和 `GET /api/requests` 调试接口
- 支持 function calling 多轮闭环
- 保留 `call_id <-> tool_calls[].id <-> tool_call_id` 映射
- 无第三方运行时依赖，安装 Bun 后可直接启动
- 上游异常时直接失败，不做本地 fallback

## 当前边界

- 不支持 `stream: true`
- 不支持图片等多模态内容
- 只处理最常见的 text/function call 路径

## 配置

默认配置已经直接写在 [`src/config.ts`](./src/config.ts) 里，开箱可启动。

你通常只需要按自己的环境改这几个常量：

- `responsesEndpointUrl`
- `port`
- `models`

当前默认上游已经写成：

```text
https://api.yescode.cloud/v1/responses
```

代理行为是：

- 接收本地 `POST /v1/chat/completions`
- 把请求体从 Chat Completions 格式转换成 Responses 格式
- 原样透传客户端带来的 `Authorization` 请求头
- 固定补上 `User-Agent: codex_cli_rs/0.111.0`、`Accept: */*`、`originator: codex_cli_rs`
- 转发到上面的固定上游 URL
- 在终端打印带请求 ID 的日志，并把最近请求保存在内存里供 dashboard 查看

## 启动

```bash
cd scripts/micbot/chat2responses-proxy
bun run start
```

开发模式：

```bash
cd scripts/micbot/chat2responses-proxy
bun run dev
```

## IronClaw 配置示例

```env
LLM_BACKEND=openai_compatible
LLM_BASE_URL=http://127.0.0.1:9090/v1
LLM_API_KEY=dummy
LLM_MODEL=gpt-4o
```

`LLM_API_KEY` 给任意非空值即可，真正访问上游时由代理转发或注入。
`LLM_API_KEY` 会由 IronClaw 带到代理，再由代理继续透传给上游。

## 调试入口

启动后可直接打开：

```text
http://127.0.0.1:9090/
```

接口：

- `GET /`：浏览器 dashboard，显示 upstream、统计和最近请求
- `GET /api/requests`：返回最近请求和统计的 JSON
- `GET /health`：简单健康检查
