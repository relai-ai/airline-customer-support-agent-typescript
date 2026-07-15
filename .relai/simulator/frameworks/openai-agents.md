# OpenAI Agents SDK TypeScript Reference

Use this reference when the project uses `@openai/agents`.

- Prefer end-to-end environments for final-answer, routing, and tool-use behavior.
- For a direct tool boundary, target a plain exported implementation and use
  `new FixedComponentInput({ input: { ... } })` for its structured input.
- The simulator adapter should expose the agent or its mutable `tools` array.
  RELAI mocks named function tools by replacing their `execute` handler.
- Mock functions receive the structured tool input and optional invocation
  context, and must return the same shape as the real tool.
