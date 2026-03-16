import type {
  ChatCompletionRequest,
  ChatMessage,
  ChatToolCall,
  JsonObject,
  JsonValue,
  ResponsesInputItem,
  ResponsesOutputItem,
  ResponsesRequest,
  ResponsesResponse,
} from "./types.ts";

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTextFromContentParts(content: JsonValue | undefined): string[] {
  if (!Array.isArray(content)) {
    return [];
  }

  const textParts: string[] = [];

  for (const part of content) {
    if (typeof part === "string") {
      textParts.push(part);
      continue;
    }

    if (!isObject(part)) {
      continue;
    }

    // 兼容几种常见块格式：
    // - { type: "text", text: "..." }
    // - { type: "output_text", text: "..." }
    // - { type: "input_text", text: "..." }
    if (
      (part.type === "text" || part.type === "output_text" || part.type === "input_text")
      && typeof part.text === "string"
    ) {
      textParts.push(part.text);
      continue;
    }

    // 有些上游会把真正的文本塞在 value/content 字段里，这里顺手兼容掉。
    if (typeof part.value === "string") {
      textParts.push(part.value);
      continue;
    }

    if (typeof part.content === "string") {
      textParts.push(part.content);
    }
  }

  return textParts;
}

function stringifyContent(content: JsonValue | undefined): string | undefined {
  if (content === undefined || content === null) {
    return undefined;
  }

  if (typeof content === "string") {
    return content;
  }

  const extractedText = extractTextFromContentParts(content);
  if (extractedText.length > 0) {
    return extractedText.join("\n");
  }

  // IronClaw 当前主要走纯文本；这里保底把复杂结构序列化，
  // 避免因为数组/对象 content 直接丢失而让多轮上下文断裂。
  return JSON.stringify(content);
}

function normalizeToolCall(toolCall: ChatToolCall, index: number): ResponsesInputItem | null {
  const name = toolCall.function?.name?.trim();
  if (!name) {
    return null;
  }

  return {
    type: "function_call",
    call_id: toolCall.id?.trim() || `generated_call_${index}`,
    name,
    arguments: toolCall.function?.arguments ?? "{}",
  };
}

function stringifyJsonValue(value: JsonValue | undefined, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function normalizeToolChoice(toolChoice: JsonValue | undefined): JsonValue | undefined {
  if (!isObject(toolChoice)) {
    return toolChoice;
  }

  // Chat Completions 风格是 function 嵌套，
  // Responses 风格要求 name 提到外层。
  if (
    toolChoice.type === "function"
    && isObject(toolChoice.function)
    && typeof toolChoice.function.name === "string"
  ) {
    return {
      type: "function",
      name: toolChoice.function.name,
    };
  }

  return toolChoice;
}

function convertMessageToInputItems(message: ChatMessage): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = [];
  const content = stringifyContent(message.content);

  switch (message.role) {
    case "system":
      return items;
    case "user":
      if (content !== undefined) {
        items.push({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: content }],
        });
      }
      return items;
    case "assistant":
      if (content !== undefined && content !== "") {
        items.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: content }],
        });
      }
      (message.tool_calls ?? []).forEach((toolCall, index) => {
        const item = normalizeToolCall(toolCall, index);
        if (item) {
          items.push(item);
        }
      });
      return items;
    case "tool":
      items.push({
        type: "function_call_output",
        call_id: message.tool_call_id ?? "",
        output: content ?? "",
      });
      return items;
    default:
      return items;
  }
}

export function chatCompletionsToResponses(body: ChatCompletionRequest): ResponsesRequest {
  const model = body.model?.trim();
  if (!model) {
    throw new Error("chat.completions request is missing model");
  }

  if (body.stream === true) {
    throw new Error("stream=true is not supported by this proxy yet");
  }

  const instructionsParts: string[] = [];
  const input: ResponsesInputItem[] = [];

  for (const message of body.messages ?? []) {
    if (message.role === "system") {
      const content = stringifyContent(message.content);
      if (content) {
        instructionsParts.push(content);
      }
      continue;
    }

    input.push(...convertMessageToInputItems(message));
  }

  const converted: ResponsesRequest = {
    model,
    input,
  };

  if (instructionsParts.length > 0) {
    converted.instructions = instructionsParts.join("\n");
  }

  if (body.tools?.length) {
    converted.tools = body.tools
      .filter((tool) => tool.type === "function" && tool.function?.name)
      .map((tool) => ({
        type: "function",
        name: tool.function!.name,
        description: tool.function!.description ?? "",
        parameters: isObject(tool.function!.parameters) ? tool.function!.parameters : {},
      }));
  }

  if (typeof body.temperature === "number") {
    converted.temperature = body.temperature;
  }

  if (typeof body.max_tokens === "number") {
    converted.max_output_tokens = body.max_tokens;
  }

  if (body.stop !== undefined) {
    converted.stop = body.stop;
  }

  if (body.tool_choice !== undefined) {
    converted.tool_choice = normalizeToolChoice(body.tool_choice);
  }

  return converted;
}

function collectOutputText(item: ResponsesOutputItem): string[] {
  return extractTextFromContentParts(item.content);
}

export function responsesToChatCompletions(
  body: ResponsesResponse,
  requestedModel?: string,
): JsonObject {
  const textParts: string[] = [];
  const toolCalls: JsonObject[] = [];

  for (const item of body.output ?? []) {
    if (!isObject(item)) {
      continue;
    }

    if (item.type === "message") {
      textParts.push(...collectOutputText(item));
      continue;
    }

    if (item.type === "function_call" && typeof item.name === "string") {
      toolCalls.push({
        id: typeof item.call_id === "string" && item.call_id.trim() ? item.call_id : `generated_call_${toolCalls.length}`,
        type: "function",
        function: {
          name: item.name,
          // 有些 Responses 后端返回 string，有些直接返回 object。
          // 这里统一序列化成 Chat Completions 期待的 JSON string，
          // 否则对象参数会被错误降级成 "{}"，工具收到的就全空了。
          arguments: stringifyJsonValue(item.arguments, "{}"),
        },
      });
    }
  }

  const message: JsonObject = {
    role: "assistant",
  };

  if (toolCalls.length > 0) {
    // Chat Completions 允许 tool call 响应同时带文本；
    // 没有文本时保持 null，避免把无内容误写成空字符串。
    message.content = textParts.length > 0 ? textParts.join("\n") : null;
    message.tool_calls = toolCalls;
  } else {
    message.content = textParts.join("\n");
  }

  const usage = isObject(body.usage) ? body.usage : {};

  return {
    id: `chatcmpl-${typeof body.id === "string" ? body.id : "unknown"}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel || (typeof body.model === "string" ? body.model : "unknown"),
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
      completion_tokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
      total_tokens: typeof usage.total_tokens === "number" ? usage.total_tokens : 0,
    },
  };
}
