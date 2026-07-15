import { readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildInputDriver,
  buildSimulationResultJson,
  combineEvaluators,
  ComponentTarget,
  filterGlobalEvaluatorsForEnvironment,
  loadGlobalEvaluator,
  loadLearningEnvironment,
  MockApplication,
  runComponentEnvironment,
  runEvaluators,
  TranscriptWriter,
  writeSimulationResultJson,
  type EvaluatorSpec,
  type RELAIEnvironment,
  type SimulationResult,
  type SimulationTimings,
} from "@relai-ai/relai";
import {
  normalizeAgentTurnResult,
  type AgentAdapter,
  type ToolCallRecord,
  type ToolResultRecord,
} from "./adapter_contract.js";

type JSONValue =
  string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

type RunnerArgs = {
  projectRoot: string;
  learningEnv: string;
  resultJson?: string;
};

const RESERVED_METADATA_KEYS = new Set([
  "arguments",
  "call_id",
  "callId",
  "content",
  "error",
  "name",
  "result",
  "turn_index",
  "turnIndex",
]);

export async function runEnvironmentFile({
  projectRoot,
  learningEnvPath,
  resultJsonPath,
}: {
  projectRoot: string;
  learningEnvPath: string;
  resultJsonPath?: string;
}): Promise<SimulationResult> {
  const environment = await loadLearningEnvironment(learningEnvPath);
  return runLoadedEnvironment({ projectRoot, environment, resultJsonPath });
}

export async function runLoadedEnvironment({
  projectRoot,
  environment,
  resultJsonPath,
}: {
  projectRoot: string;
  environment: RELAIEnvironment;
  resultJsonPath?: string;
}): Promise<SimulationResult> {
  const transcript = TranscriptWriter.fromEnvironment(environment, {
    baseDir: projectRoot,
  });
  let result =
    environment.target.type === "component"
      ? await runComponentEnvironment(environment, transcript, {
          baseDir: projectRoot,
        })
      : await runAgentEnvironment({ environment, transcript });

  const globalEvaluators = await loadGlobalEvaluators(projectRoot);
  const evaluators = combineEvaluators(
    environment.evaluators,
    filterGlobalEvaluatorsForEnvironment(globalEvaluators, environment),
  );
  await runEvaluators(evaluators, result, {
    transcriptWriter: transcript,
    continueOnError: true,
  });
  result = transcript.toSimulationResult({
    metadata: { ...result.metadata, target: targetLabel(environment) },
    timings: result.timings,
  });

  if (resultJsonPath) {
    await writeSimulationResultJson(
      resultJsonPath,
      buildSimulationResultJson(result),
    );
  }
  return result;
}

async function runAgentEnvironment({
  environment,
  transcript,
}: {
  environment: RELAIEnvironment;
  transcript: TranscriptWriter;
}): Promise<SimulationResult> {
  const inputDriver = buildInputDriver(environment.input);
  if (!inputDriver) {
    throw new Error("Agent environments require FixedInput or PersonaInput.");
  }

  await transcript.runStart({
    input_type: environment.input?.type ?? "none",
    target_type: "agent",
    target: targetLabel(environment),
  });

  let finalOutput: JSONValue | undefined;
  let turnIndex = 0;
  let agentMessage: JSONValue | undefined;
  let totalDurationMs = 0;

  const mockApp = new MockApplication(environment.mocks);
  await mockApp.run(async () => {
    const adapter = await buildAgentAdapter();
    if (adapter.agentOrTools !== undefined) {
      mockApp.applyToolMocks(adapter.agentOrTools);
    }
    let recordedMockCalls = 0;

    while (true) {
      const nextTurn = await inputDriver.nextTurn(agentMessage);
      if (nextTurn.shouldStop) {
        await transcript.runEnd({
          reason: nextTurn.reason ?? "input driver stopped",
        });
        break;
      }

      const userInput = nextTurn.content ?? null;
      await transcript.record(
        "user_message",
        { content: jsonSafe(userInput), ...safeMetadata(nextTurn.metadata) },
        turnIndex,
      );

      try {
        const startedAt = performance.now();
        const turnResult = normalizeAgentTurnResult(
          await adapter.runTurn(userInput),
        );
        totalDurationMs += Math.max(
          0,
          Math.floor(performance.now() - startedAt),
        );
        for (const toolCall of turnResult.toolCalls) {
          await transcript.record(
            "tool_call",
            toolCallData(toolCall),
            turnIndex,
          );
        }
        for (const toolResult of turnResult.toolResults) {
          await transcript.record(
            "tool_result",
            toolResultData(toolResult),
            turnIndex,
          );
        }

        agentMessage = turnResult.assistantMessage;
        finalOutput = turnResult.assistantMessage;
        await transcript.record(
          "agent_message",
          {
            content: turnResult.assistantMessage,
            ...safeMetadata(turnResult.metadata),
          },
          turnIndex,
        );

        for (const mockCall of mockApp.calls.slice(recordedMockCalls)) {
          await transcript.record(
            "mock_call",
            {
              target: mockCall.target,
              arguments: jsonSafe(mockCall.arguments),
              ...(mockCall.result !== undefined
                ? { result: jsonSafe(mockCall.result) }
                : {}),
              ...(mockCall.error ? { error: mockCall.error } : {}),
            },
            turnIndex,
          );
        }
        recordedMockCalls = mockApp.calls.length;
        turnIndex += 1;
      } catch (error) {
        await transcript.record(
          "error",
          {
            error: error instanceof Error ? error.message : String(error),
            error_type: error instanceof Error ? error.name : "Error",
          },
          turnIndex,
        );
        await transcript.runEnd({ reason: "agent error" });
        throw error;
      }
    }
  });

  return transcript.toSimulationResult({
    metadata: {
      target: targetLabel(environment),
      ...(finalOutput !== undefined ? { final_output: finalOutput } : {}),
    },
    timings: { totalDurationMs, componentRuns: [] } satisfies SimulationTimings,
  });
}

async function buildAgentAdapter(): Promise<AgentAdapter> {
  const module = await import("./adapter.js");
  if (typeof module.buildAgentAdapter !== "function") {
    throw new Error("Simulator adapter must export buildAgentAdapter().");
  }
  return module.buildAgentAdapter();
}

async function loadGlobalEvaluators(
  projectRoot: string,
): Promise<EvaluatorSpec[]> {
  const dir = join(projectRoot, ".relai", "evaluators");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const paths = entries
    .filter((entry) =>
      [".ts", ".mts", ".js", ".mjs"].some((suffix) => entry.endsWith(suffix)),
    )
    .sort()
    .map((entry) => join(dir, entry));
  return Promise.all(paths.map((path) => loadGlobalEvaluator(path)));
}

function toolCallData(toolCall: ToolCallRecord): Record<string, JSONValue> {
  return {
    name: toolCall.name,
    arguments: jsonSafe(toolCall.arguments),
    ...(toolCall.callId ? { call_id: toolCall.callId } : {}),
    ...safeMetadata(toolCall.metadata ?? {}),
  };
}

function toolResultData(
  toolResult: ToolResultRecord,
): Record<string, JSONValue> {
  return {
    name: toolResult.name,
    ...(toolResult.result !== undefined
      ? { result: jsonSafe(toolResult.result) }
      : {}),
    ...(toolResult.error ? { error: toolResult.error } : {}),
    ...(toolResult.callId ? { call_id: toolResult.callId } : {}),
    ...safeMetadata(toolResult.metadata ?? {}),
  };
}

function targetLabel(environment: RELAIEnvironment): string {
  return environment.target instanceof ComponentTarget
    ? environment.target.importTarget
    : environment.target.type;
}

function safeMetadata(
  metadata: Record<string, unknown>,
): Record<string, JSONValue> {
  const safe: Record<string, JSONValue> = {};
  const reserved: Record<string, JSONValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (RESERVED_METADATA_KEYS.has(key)) {
      reserved[key] = jsonSafe(value);
    } else {
      safe[key] = jsonSafe(value);
    }
  }
  if (Object.keys(reserved).length > 0) safe.metadata = reserved;
  return safe;
}

function jsonSafe(value: unknown): JSONValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as JSONValue;
}

function parseArgs(argv: string[]): RunnerArgs {
  const args: Partial<RunnerArgs> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project-root") {
      args.projectRoot = argv[++index];
    } else if (arg === "--learning-env") {
      args.learningEnv = argv[++index];
    } else if (arg === "--result-json") {
      args.resultJson = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.projectRoot || !args.learningEnv) {
    throw new Error(
      "Usage: runner.ts --project-root <path> --learning-env <path> [--result-json <path>]",
    );
  }
  return args as RunnerArgs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = resolve(args.projectRoot);
  const learningEnvPath = isAbsolute(args.learningEnv)
    ? args.learningEnv
    : resolve(projectRoot, args.learningEnv);
  const resultJsonPath = args.resultJson
    ? isAbsolute(args.resultJson)
      ? args.resultJson
      : resolve(projectRoot, args.resultJson)
    : undefined;
  await runEnvironmentFile({ projectRoot, learningEnvPath, resultJsonPath });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exit(1);
  });
}
