# RELAI TypeScript Simulator SDK Reference

Use this reference instead of reading RELAI SDK source while scaffolding a
TypeScript project simulator.

## Learning Environments

- Load a TypeScript learning environment with `loadLearningEnvironment(path)`.
- Agent environments use `FixedInput` or `PersonaInput`.
- Component environments use `new ComponentTarget({ module: "path.ts", exportName: "exportName" })`
  plus `new FixedComponentInput({ args: [...] })`,
  `new FixedComponentInput({ input: { ... } })`, or
  `new GeneratedComponentInput({ instructions, model, mode: "args" | "input" })`.
  Generated calls must produce `{ args: [...] }` for `mode: "args"` or
  `{ input: { ... } }` for `mode: "input"`.
- Every `RELAIEnvironment`, `CodeEvaluator`, and `LLMJudgeEvaluator` needs a
  short `description`.

## Runner And Adapter Contract

Implement `.relai/simulator/src/relai_simulator/adapter.ts`.

`buildAgentAdapter()` must return an object with:

- `agentOrTools`: framework agent, mutable tool list, or `undefined`.
- `runTurn(userInput)`: sync or async method. `userInput` is the
  JSON-serializable fixed-turn content value. It may be a string, object, array,
  number, boolean, or null.

`runTurn` may return:

- `new AgentTurnResult({ assistantMessage, metadata, toolCalls, toolResults })`
- a plain string
- an object with `assistantMessage`, `assistant_message`, `finalOutput`, or
  `final_output`

## Init Smoke Validation

Write `.relai/simulator/smoke_learning_env.ts` as a minimal
`RELAIEnvironment` that runs one representative, project-valid fixed turn
through the generated adapter. Use the same public input shape that normal
learning environments should use.

## Dependency Edits

Do not manually add `@relai-ai/relai` registry or local-path logic. The CLI owns
RELAI SDK installation in `.relai/package.json` so both simulator files and
`.relai/learning-envs/*.ts` can import `@relai-ai/relai`. The CLI also installs
the root project's declared dependencies with its existing package manager and
runs its `build` script when present. If the project needs extra setup beyond
that baseline, edit only the `BEGIN PROJECT DEPENDENCY INSTALL` section of
`.relai/simulator/install.sh`. Do not replace the CLI-owned root install or
build blocks.
