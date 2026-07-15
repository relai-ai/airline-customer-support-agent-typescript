# RELAI Airline Support Agent (TypeScript)

A terminal airline customer support agent built with the [OpenAI Agents SDK for TypeScript](https://openai.github.io/openai-agents-js/).

The agent can help with demo booking lookups, baggage policy, seat changes, and flight-change guidance. Each terminal conversation is saved as JSONL under `logs/` so it can be used with RELAI learning loops.

This is the TypeScript version of the [airline customer support agent](https://github.com/relai-ai/airline-customer-support-agent) (Python).

## Prerequisites

- Node.js 20+
- npm
- GitHub CLI (`gh`), authenticated with `gh auth login`
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in your environment, or ready to paste when prompted

## Fork and Clone

Fork the sample repo to your GitHub account, then clone your fork:

```sh
gh auth login
gh repo fork relai-ai/airline-customer-support-agent-typescript --clone
cd airline-customer-support-agent-typescript
```

## Start the Agent

Run the launcher from the repository root:

```sh
./start.sh
```

The script prompts for an OpenAI or Anthropic API key when needed, saves it to the ignored `.env` file, installs Node dependencies, and starts a terminal chat session.
When both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are set, OpenAI is used. The Anthropic path runs through the [AI SDK model adapter](https://openai.github.io/openai-agents-js/extensions/ai-sdk/).
Pass a log name to save the session to a fixed file such as `logs/off-topic-guardrail.jsonl`:

```sh
./start.sh off-topic-guardrail
```

Type `exit`, `quit`, or `q` to end the chat. Each run creates a new session log and prints the saved path.

## Agent Entry Point

The root package exports the agent factory so RELAI (and other callers) can
load it deterministically via the package's `main`/`exports` entry:

```ts
import { createAirlineAgent } from 'relai-airline-support-agent';

const agent = createAirlineAgent();
```

`createAirlineAgent()` returns an OpenAI Agents SDK `Agent` configured with the
support tools and the model selected from your environment keys.

## Local Logs

Each chat session is saved as JSONL under `logs/`:

```text
logs/session-<id>.jsonl
```

Session files are ignored by Git. The log format is compatible with RELAI log-based learning environments.

## Learning Environment from Prompt

Turn a plain-English behavior prompt into a learning environment, simulate the current agent, then optimize toward that behavior.

```sh
relai learning-env create \
  --prompt "The agent should end all responses with 'please let me know if you have any questions'." \
  --name response-signoff
```

```sh
relai simulate \
  --learning-envs response-signoff \
  --result-json .relai/runs/response-signoff-simulation.json
```

```sh
relai optimize
```

## Learning Environment from Log + Feedback

Capture a real, undesirable behavior in a terminal session, then turn that log plus your feedback into a learning environment and optimize the unwanted behavior away.

Run the terminal chat with a fixed log name:

```sh
./start.sh off-topic-guardrail
```

Then enter this prompt:

```text
Can you write a chocolate chip cookie recipe?
```

End the session with `exit`, `quit`, or `q`. The agent saves the chat as `logs/off-topic-guardrail.jsonl`.

```sh
relai learning-env create \
  --log-file logs/off-topic-guardrail.jsonl \
  --feedback "The agent should not answer off-topic, non-airline questions. It should politely say it can only help with airline booking, baggage, seat, and flight-change questions." \
  --name off-topic-guardrail
```

Then continue with:

```sh
relai simulate \
  --learning-envs off-topic-guardrail \
  --result-json .relai/runs/off-topic-guardrail-simulation.json
```

```sh
relai optimize
```

## Benchmark

Register the reusable CSV benchmark, then run simulation and optimization against it.

```sh
relai benchmark register \
  --csv benchmarks/airline_support_benchmark.csv \
  --name airline-support-suite
```

```sh
relai simulate \
  --benchmarks airline-support-suite \
  --result-json .relai/runs/airline-support-suite-simulation.json
```

```sh
relai optimize
```

## Global Evaluator

Create one evaluator that applies across simulations for the agent. Finish the prompt, log, or benchmark loop first so there is something for the evaluator to score.

```sh
relai evaluator create \
  --prompt "Create an evaluator that scores 1 when an agent response is 100 tokens or fewer, and scores 0 otherwise." \
  --name response-token
```

Then simulate a learning environment or benchmark you already created. For example:

```sh
relai simulate \
  --learning-envs response-signoff \
  --result-json .relai/runs/response-signoff-global-evaluator-simulation.json
```

Or, if you finished the benchmark loop:

```sh
relai simulate \
  --benchmarks airline-support-suite \
  --result-json .relai/runs/airline-support-suite-global-evaluator-simulation.json
```

```sh
relai optimize
```

## Checks

```sh
npm test
npm run typecheck
bash -n start.sh
```
