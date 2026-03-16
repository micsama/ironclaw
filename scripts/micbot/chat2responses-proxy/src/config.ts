export interface ProxyConfig {
  host: string;
  port: number;
  responsesEndpointUrl: string;
  models: string[];
  fixedHeaders: Record<string, string>;
}

// 这里保留“写死配置”的形式，目的是让这个代理在本地直接 `bun run start`
// 就能启动，不依赖先导出一串环境变量。
export function loadConfig(): ProxyConfig {
  return {
    host: "127.0.0.1",
    port: 9090,
    // 这里写完整上游地址，代理收到 /v1/chat/completions 后会直接转发到这里。
    responsesEndpointUrl: "https://api.yescode.cloud/v1/responses",
    models: ["gpt-4o"],
    // 这些头部来自你当前后端可用的 curl 样例，直接固定写入代理。
    fixedHeaders: {
      "user-agent": "codex_cli_rs/0.111.0",
      accept: "*/*",
      originator: "codex_cli_rs",
    },
  };
}
