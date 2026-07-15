import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

import { config } from 'dotenv';

import { streamAgentResponse as defaultStreamAgentResponse } from './agent.js';
import {
  appendMessage,
  createSession,
  readMessages,
  sessionIdFromLogName,
  sessionPath,
  type ChatMessage,
} from './sessions.js';

const EXIT_COMMANDS = new Set(['exit', 'quit', 'q']);

export interface ChatOptions {
  logName?: string | null;
  /** Prompt the user for one line of input. Return null to end the chat (EOF). */
  inputFunc?: (prompt: string) => Promise<string | null> | string | null;
  /** Write raw text (no trailing newline is added). */
  output?: (text: string) => void;
  /** Injectable for testing; defaults to the real agent stream. */
  streamAgentResponse?: (
    messages: Iterable<ChatMessage>,
  ) => AsyncIterable<string>;
}

export async function chat(options: ChatOptions = {}): Promise<string> {
  config({ quiet: true });

  const output = options.output ?? ((text: string) => stdout.write(text));
  const streamAgentResponse =
    options.streamAgentResponse ?? defaultStreamAgentResponse;

  let rl: readline.Interface | undefined;
  const inputFunc =
    options.inputFunc ??
    ((prompt: string) => {
      if (!rl) {
        rl = readline.createInterface({ input: stdin, output: stdout });
      }
      return rl.question(prompt);
    });

  const logName = options.logName ?? null;
  const sessionId = logName ? sessionIdFromLogName(logName) : null;
  const session = createSession(sessionId, logName !== null);
  const logPath = sessionPath(session.id);

  output('SkyServe Airline Support\n');
  output(`Session: ${session.id}\n`);
  output(`Log: ${logPath}\n`);
  output('Type exit, quit, or q to end the chat.\n');

  try {
    while (true) {
      const rawInput = await inputFunc('\nYou: ');
      if (rawInput === null || rawInput === undefined) {
        output('\n');
        break;
      }

      const userText = rawInput.trim();
      if (!userText) {
        continue;
      }
      if (EXIT_COMMANDS.has(userText.toLowerCase())) {
        break;
      }

      appendMessage(session.id, 'user', userText);
      const messages = readMessages(session.id);
      const chunks: string[] = [];

      output('\nAgent: ');
      for await (const delta of streamAgentResponse(messages)) {
        chunks.push(delta);
        output(delta);
      }
      output('\n');

      const assistantText = chunks.join('').trim();
      if (assistantText) {
        appendMessage(session.id, 'assistant', assistantText);
      }
    }
  } finally {
    rl?.close();
  }

  output(`\nSaved conversation log to ${logPath}\n`);
  return logPath;
}

export async function run(): Promise<void> {
  const logName = process.argv[2] ?? null;
  await chat({ logName });
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
