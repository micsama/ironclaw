export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatToolDefinition {
  type: string;
  function?: {
    name: string;
    description?: string;
    parameters?: JsonObject;
  };
}

export interface ChatToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ChatMessage {
  role: ChatRole;
  content?: JsonValue;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
  name?: string;
}

export interface ChatCompletionRequest extends JsonObject {
  model?: string;
  messages?: ChatMessage[];
  tools?: ChatToolDefinition[];
  temperature?: number;
  max_tokens?: number;
  stop?: JsonValue;
  tool_choice?: JsonValue;
  stream?: boolean;
}

export interface ResponsesMessageBlock {
  type: string;
  text?: string;
}

export interface ResponsesInputItem extends JsonObject {
  type: string;
}

export interface ResponsesRequest extends JsonObject {
  model: string;
  instructions?: string;
  input: ResponsesInputItem[];
  tools?: JsonObject[];
  temperature?: number;
  max_output_tokens?: number;
  stop?: JsonValue;
  tool_choice?: JsonValue;
  stream?: boolean;
}

export interface ResponsesOutputItem extends JsonObject {
  type: string;
}

export interface ResponsesUsage extends JsonObject {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface ResponsesResponse extends JsonObject {
  id?: string;
  object?: string;
  status?: string;
  model?: string;
  output?: ResponsesOutputItem[];
  usage?: ResponsesUsage;
}
