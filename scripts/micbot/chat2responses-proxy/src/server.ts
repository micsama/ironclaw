import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "./config.ts";
import { chatCompletionsToResponses, responsesToChatCompletions } from "./convert.ts";
import { renderDashboard } from "./dashboard.ts";
import {
  completeRequestTrace,
  createRequestTrace,
  incrementModelsRequests,
  logError,
  logInfo,
  logWarn,
  snapshotRecentRequests,
  snapshotStats,
} from "./observability.ts";
import type { ChatCompletionRequest, JsonObject, JsonValue } from "./types.ts";

const config = loadConfig();
const upstreamModelsUrl = new URL("/v1/models", config.responsesEndpointUrl).toString();

function json(
  res: ServerResponse,
  statusCode: number,
  body: JsonObject,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function html(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function errorBody(message: string, type = "invalid_request_error"): JsonObject {
  return {
    error: {
      message,
      type,
    },
  };
}

async function readJsonBody(req: IncomingMessage): Promise<JsonValue> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new Error("request body is empty");
  }

  return JSON.parse(raw) as JsonValue;
}

function getUpstreamAuthHeader(req: IncomingMessage): string | undefined {
  const forwardedAuth = req.headers.authorization;
  if (typeof forwardedAuth === "string" && forwardedAuth.trim()) {
    return forwardedAuth;
  }
  return undefined;
}

async function proxyResponsesRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const startedAt = Date.now();
  let requestBody: ChatCompletionRequest;

  try {
    const parsed = await readJsonBody(req);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      json(res, 400, errorBody("request body must be a JSON object"));
      return;
    }
    requestBody = parsed as ChatCompletionRequest;
  } catch (error) {
    logError("failed to parse chat.completions request", {
      error: error instanceof Error ? error.message : "invalid JSON body",
    });
    json(res, 400, errorBody(error instanceof Error ? error.message : "invalid JSON body"));
    return;
  }

  let upstreamBody: JsonObject;
  try {
    upstreamBody = chatCompletionsToResponses(requestBody);
  } catch (error) {
    logError("failed to convert chat.completions request", {
      error: error instanceof Error ? error.message : "request conversion failed",
      model: typeof requestBody.model === "string" ? requestBody.model : "unknown",
    });
    json(res, 400, errorBody(error instanceof Error ? error.message : "request conversion failed"));
    return;
  }

  const trace = createRequestTrace({
    route: "/v1/chat/completions",
    model: typeof requestBody.model === "string" ? requestBody.model : "unknown",
    requestMessages: Array.isArray(requestBody.messages) ? requestBody.messages.length : 0,
    requestTools: Array.isArray(requestBody.tools) ? requestBody.tools.length : 0,
    upstreamTarget: config.responsesEndpointUrl,
    authMode: getUpstreamAuthHeader(req) ? "present" : "missing",
  });

  logInfo("forwarding chat.completions request", {
    requestId: trace.id,
    model: typeof requestBody.model === "string" ? requestBody.model : "unknown",
    messages: Array.isArray(requestBody.messages) ? requestBody.messages.length : 0,
    tools: Array.isArray(requestBody.tools) ? requestBody.tools.length : 0,
    target: config.responsesEndpointUrl,
  });

  const headers = new Headers({
    "content-type": "application/json",
  });
  for (const [key, value] of Object.entries(config.fixedHeaders)) {
    headers.set(key, value);
  }
  const authHeader = getUpstreamAuthHeader(req);
  if (authHeader) {
    headers.set("authorization", authHeader);
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(config.responsesEndpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
    });
  } catch (error) {
    completeRequestTrace(trace, {
      status: "error",
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "upstream request failed",
    });
    logError("upstream request failed", {
      requestId: trace.id,
      target: config.responsesEndpointUrl,
      error: error instanceof Error ? error.message : "upstream request failed",
    });
    json(res, 502, errorBody(
      error instanceof Error ? `upstream request failed: ${error.message}` : "upstream request failed",
      "api_connection_error",
    ));
    return;
  }

  const responseText = await upstreamResponse.text();
  const responseJson = responseText ? safeParseJson(responseText) : null;

  if (!upstreamResponse.ok) {
    completeRequestTrace(trace, {
      status: "error",
      upstreamStatus: upstreamResponse.status,
      elapsedMs: Date.now() - startedAt,
      error: `${upstreamResponse.status} ${upstreamResponse.statusText}`,
      bodyPreview: responseText.slice(0, 500),
    });
    logError("upstream returned non-2xx status", {
      requestId: trace.id,
      target: config.responsesEndpointUrl,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      bodyPreview: responseText.slice(0, 500),
      elapsedMs: Date.now() - startedAt,
    });
    if (responseJson && typeof responseJson === "object" && !Array.isArray(responseJson)) {
      json(res, upstreamResponse.status, responseJson as JsonObject);
      return;
    }

    json(res, upstreamResponse.status, errorBody(
      `upstream returned ${upstreamResponse.status}`,
      "upstream_error",
    ));
    return;
  }

  if (!responseJson || typeof responseJson !== "object" || Array.isArray(responseJson)) {
    completeRequestTrace(trace, {
      status: "error",
      upstreamStatus: upstreamResponse.status,
      elapsedMs: Date.now() - startedAt,
      error: "upstream response is not a JSON object",
      bodyPreview: responseText.slice(0, 500),
    });
    logError("upstream returned invalid JSON object", {
      requestId: trace.id,
      target: config.responsesEndpointUrl,
      status: upstreamResponse.status,
      bodyPreview: responseText.slice(0, 500),
      elapsedMs: Date.now() - startedAt,
    });
    json(res, 502, errorBody("upstream response is not a JSON object", "invalid_response_error"));
    return;
  }

  completeRequestTrace(trace, {
    status: "ok",
    upstreamStatus: upstreamResponse.status,
    elapsedMs: Date.now() - startedAt,
  });
  const converted = responsesToChatCompletions(responseJson as JsonObject, requestBody.model);
  const toolCallSummaries = summarizeToolCalls(converted);
  logInfo("chat.completions request completed", {
    requestId: trace.id,
    target: config.responsesEndpointUrl,
    status: upstreamResponse.status,
    elapsedMs: Date.now() - startedAt,
    toolCalls: toolCallSummaries,
  });
  json(res, 200, converted);
}

async function handleModels(req: IncomingMessage, res: ServerResponse): Promise<void> {
  incrementModelsRequests();
  const authHeader = getUpstreamAuthHeader(req);
  const headers = new Headers();
  for (const [key, value] of Object.entries(config.fixedHeaders)) {
    headers.set(key, value);
  }
  if (authHeader) {
    headers.set("authorization", authHeader);
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamModelsUrl, {
      method: "GET",
      headers,
    });
  } catch (error) {
    logError("upstream models request failed", {
      target: upstreamModelsUrl,
      error: error instanceof Error ? error.message : "upstream request failed",
    });
    json(res, 502, errorBody(
      error instanceof Error ? `upstream models request failed: ${error.message}` : "upstream models request failed",
      "api_connection_error",
    ));
    return;
  }

  const text = await upstreamResponse.text();
  const parsed = text ? safeParseJson(text) : null;

  if (!upstreamResponse.ok) {
    logError("upstream models endpoint returned non-2xx status", {
      target: upstreamModelsUrl,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      bodyPreview: text.slice(0, 500),
    });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      json(res, upstreamResponse.status, parsed as JsonObject);
      return;
    }

    json(res, upstreamResponse.status, errorBody(
      `upstream models endpoint returned ${upstreamResponse.status}`,
      "upstream_error",
    ));
    return;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    logError("upstream models endpoint returned invalid JSON object", {
      target: upstreamModelsUrl,
      status: upstreamResponse.status,
      bodyPreview: text.slice(0, 500),
    });
    json(res, 502, errorBody("upstream models response is not a JSON object", "invalid_response_error"));
    return;
  }

  logInfo("served upstream models list", {
    target: upstreamModelsUrl,
    status: upstreamResponse.status,
  });
  json(res, 200, parsed as JsonObject);
}

function safeParseJson(value: string): JsonValue | null {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}

function summarizeToolCalls(payload: JsonObject): JsonObject[] {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const summaries: JsonObject[] = [];

  for (const choice of choices) {
    if (typeof choice !== "object" || choice === null || Array.isArray(choice)) {
      continue;
    }

    const message = choice.message;
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      continue;
    }

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const toolCall of toolCalls) {
      if (typeof toolCall !== "object" || toolCall === null || Array.isArray(toolCall)) {
        continue;
      }

      const fn = toolCall.function;
      if (typeof fn !== "object" || fn === null || Array.isArray(fn)) {
        continue;
      }

      summaries.push({
        id: typeof toolCall.id === "string" ? toolCall.id : "unknown",
        name: typeof fn.name === "string" ? fn.name : "unknown",
        argumentsPreview:
          typeof fn.arguments === "string" ? fn.arguments.slice(0, 300) : String(fn.arguments),
      });
    }
  }

  return summaries;
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (method === "GET" && url.pathname === "/") {
    html(res, 200, renderDashboard({
      config,
      stats: snapshotStats(),
      recentRequests: snapshotRecentRequests(),
    }));
    return;
  }

  if (method === "GET" && url.pathname === "/api/requests") {
    json(res, 200, {
      stats: snapshotStats(),
      recent_requests: snapshotRecentRequests(),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      status: "ok",
      upstream: config.responsesEndpointUrl,
    });
    return;
  }

  if (method === "GET" && url.pathname === "/v1/models") {
    await handleModels(req, res);
    return;
  }

  if (method === "POST" && url.pathname === "/v1/chat/completions") {
    await proxyResponsesRequest(req, res);
    return;
  }

  json(res, 404, errorBody(`route not found: ${method} ${url.pathname}`, "not_found_error"));
});

server.listen(config.port, config.host, () => {
  logInfo(
    `chat2responses proxy listening on http://${config.host}:${config.port} -> ${config.responsesEndpointUrl}`,
  );
});
