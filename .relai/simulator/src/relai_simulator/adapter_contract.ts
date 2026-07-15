export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export type ToolCallRecord = {
  name: string;
  arguments: unknown;
  callId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ToolResultRecord = {
  name: string;
  result?: unknown;
  error?: string | null;
  callId?: string | null;
  metadata?: Record<string, unknown>;
};

export class AgentTurnResult {
  readonly assistantMessage: string | null;
  readonly metadata: Record<string, unknown>;
  readonly toolCalls: ToolCallRecord[];
  readonly toolResults: ToolResultRecord[];

  constructor({
    assistantMessage = null,
    metadata = {},
    toolCalls = [],
    toolResults = [],
  }: {
    assistantMessage?: string | null;
    metadata?: Record<string, unknown>;
    toolCalls?: ToolCallRecord[];
    toolResults?: ToolResultRecord[];
  }) {
    this.assistantMessage = assistantMessage;
    this.metadata = metadata;
    this.toolCalls = toolCalls;
    this.toolResults = toolResults;
  }
}

export type AgentAdapter = {
  agentOrTools?: unknown;
  runTurn(userInput: JSONValue): AgentTurnResult | unknown | Promise<AgentTurnResult | unknown>;
};

export function normalizeAgentTurnResult(result: unknown): AgentTurnResult {
  if (result instanceof AgentTurnResult) return result;
  if (typeof result === "string" || result === null || result === undefined) {
    return new AgentTurnResult({ assistantMessage: result == null ? null : result });
  }
  if (typeof result === "object") {
    const record = result as Record<string, unknown>;
    const message =
      record.assistantMessage ??
      record.assistant_message ??
      record.finalOutput ??
      record.final_output ??
      null;
    return new AgentTurnResult({
      assistantMessage: message == null ? null : String(message),
      metadata: objectRecord(record.metadata),
      toolCalls: arrayRecord(record.toolCalls ?? record.tool_calls),
      toolResults: arrayRecord(record.toolResults ?? record.tool_results),
    });
  }
  return new AgentTurnResult({ assistantMessage: String(result) });
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayRecord<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
