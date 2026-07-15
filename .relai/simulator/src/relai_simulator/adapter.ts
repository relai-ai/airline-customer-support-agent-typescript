import { run } from "@openai/agents";
import { createAirlineAgent } from "relai-airline-support-agent";
import {
  AgentTurnResult,
  type AgentAdapter,
  type JSONValue,
} from "./adapter_contract.js";

class ProjectAgentAdapter implements AgentAdapter {
  private readonly agent = createAirlineAgent();

  readonly agentOrTools = this.agent;

  async runTurn(userInput: JSONValue): Promise<AgentTurnResult> {
    const prompt = expectStringTurn(userInput);
    const result = await run(this.agent, prompt);

    return new AgentTurnResult({
      assistantMessage: extractAssistantMessage(result),
      metadata: { input_type: "string" },
    });
  }
}

function expectStringTurn(userInput: JSONValue): string {
  if (typeof userInput !== "string") {
    throw new Error(
      "The airline support simulator expects each turn to be a plain string.",
    );
  }
  return userInput;
}

function extractAssistantMessage(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (!result || typeof result !== "object") {
    return String(result ?? "");
  }

  const record = result as Record<string, unknown>;
  const directMessage =
    firstString(
      record.finalOutput,
      record.final_output,
      record.assistantMessage,
      record.assistant_message,
      record.outputText,
      record.output_text,
    ) ?? extractLastTextFromItems(record.newItems);

  if (directMessage) {
    return directMessage;
  }

  return JSON.stringify(record);
}

function extractLastTextFromItems(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (!item || typeof item !== "object") {
      continue;
    }

    const text =
      firstString(
        (item as Record<string, unknown>).text,
        (item as Record<string, unknown>).outputText,
        (item as Record<string, unknown>).output_text,
      ) ?? extractTextFromContent((item as Record<string, unknown>).content);
    if (text) {
      return text;
    }
  }

  return null;
}

function extractTextFromContent(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const textParts = value
    .map((part) => {
      if (!part || typeof part !== "object") {
        return null;
      }
      return firstString(
        (part as Record<string, unknown>).text,
        (part as Record<string, unknown>).outputText,
        (part as Record<string, unknown>).output_text,
      );
    })
    .filter((part): part is string => Boolean(part));

  return textParts.length > 0 ? textParts.join("") : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

export function buildAgentAdapter(): AgentAdapter {
  return new ProjectAgentAdapter();
}
