import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { chat } from '../src/main.js';
import type { ChatMessage } from '../src/sessions.js';

let tmpDir: string;
const savedLogDir = process.env.AIRLINE_SUPPORT_LOG_DIR;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airline-cli-'));
  process.env.AIRLINE_SUPPORT_LOG_DIR = tmpDir;
});

afterEach(() => {
  if (savedLogDir === undefined) delete process.env.AIRLINE_SUPPORT_LOG_DIR;
  else process.env.AIRLINE_SUPPORT_LOG_DIR = savedLogDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function inputFrom(values: string[]): () => string {
  let index = 0;
  return () => values[index++];
}

function collector(): { write: (text: string) => void; value: () => string } {
  let buffer = '';
  return { write: (text: string) => (buffer += text), value: () => buffer };
}

function readEvents(filePath: string): Record<string, unknown>[] {
  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('terminal chat', () => {
  it('logs user and assistant messages', async () => {
    async function* fakeStream(
      messages: Iterable<ChatMessage>,
    ): AsyncGenerator<string> {
      const list = [...messages];
      expect(list[list.length - 1].content).toBe('What is the baggage policy?');
      yield 'Standard tickets include ';
      yield 'one checked bag.';
    }

    const inputs = inputFrom(['What is the baggage policy?', 'exit']);
    const output = collector();

    const logPath = await chat({
      inputFunc: inputs,
      output: output.write,
      streamAgentResponse: fakeStream,
    });

    const messages = readEvents(logPath).filter((e) => e.type === 'message');
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('What is the baggage policy?');
    expect(messages[1].content).toBe('Standard tickets include one checked bag.');
    expect(output.value()).toContain('Standard tickets include one checked bag.');
    expect(output.value()).toContain(`Saved conversation log to ${logPath}`);
  });

  it('creates a new log each run', async () => {
    async function* fakeStream(): AsyncGenerator<string> {
      yield 'Hello.';
    }

    const firstLogPath = await chat({
      inputFunc: () => 'exit',
      output: () => {},
      streamAgentResponse: fakeStream,
    });
    const secondLogPath = await chat({
      inputFunc: () => 'q',
      output: () => {},
      streamAgentResponse: fakeStream,
    });

    expect(firstLogPath).not.toBe(secondLogPath);
    expect(fs.existsSync(firstLogPath)).toBe(true);
    expect(fs.existsSync(secondLogPath)).toBe(true);
  });

  it('can use a named log', async () => {
    fs.writeFileSync(path.join(tmpDir, 'off-topic-guardrail.jsonl'), 'old log');

    async function* fakeStream(
      messages: Iterable<ChatMessage>,
    ): AsyncGenerator<string> {
      const list = [...messages];
      expect(list[list.length - 1].content).toBe(
        'Can you write a chocolate chip cookie recipe?',
      );
      yield 'I can only help with airline support questions.';
    }

    const inputs = inputFrom([
      'Can you write a chocolate chip cookie recipe?',
      'exit',
    ]);

    const logPath = await chat({
      logName: 'off-topic-guardrail.jsonl',
      inputFunc: inputs,
      output: () => {},
      streamAgentResponse: fakeStream,
    });

    expect(logPath).toBe(path.join(tmpDir, 'off-topic-guardrail.jsonl'));
    const events = readEvents(logPath);
    expect(events[0].id).toBe('off-topic-guardrail');
    expect(events[1].content).toBe('Can you write a chocolate chip cookie recipe?');
    expect(events[2].content).toBe(
      'I can only help with airline support questions.',
    );
  });

  it('ignores empty input', async () => {
    let calls = 0;
    async function* fakeStream(): AsyncGenerator<string> {
      calls += 1;
      yield 'This should not be called.';
    }

    const inputs = inputFrom(['', '   ', 'quit']);

    const logPath = await chat({
      inputFunc: inputs,
      output: () => {},
      streamAgentResponse: fakeStream,
    });

    const events = readEvents(logPath);
    expect(events.map((e) => e.type)).toEqual(['session']);
    expect(calls).toBe(0);
  });
});
