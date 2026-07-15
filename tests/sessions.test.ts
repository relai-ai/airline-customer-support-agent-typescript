import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendMessage,
  createSession,
  deleteSession,
  listSessions,
  readMessages,
} from '../src/sessions.js';

let tmpDir: string;
const savedLogDir = process.env.AIRLINE_SUPPORT_LOG_DIR;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airline-sessions-'));
  process.env.AIRLINE_SUPPORT_LOG_DIR = tmpDir;
});

afterEach(() => {
  if (savedLogDir === undefined) delete process.env.AIRLINE_SUPPORT_LOG_DIR;
  else process.env.AIRLINE_SUPPORT_LOG_DIR = savedLogDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('sessions', () => {
  it('logs session messages', () => {
    const session = createSession();
    appendMessage(session.id, 'user', 'Can I change my seat for SKY123?');
    appendMessage(session.id, 'assistant', 'I can help after verifying the booking.');

    const messages = readMessages(session.id);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].content).toBe('Can I change my seat for SKY123?');

    const sessions = listSessions();
    expect(sessions[0].id).toBe(session.id);
    expect(sessions[0].messageCount).toBe(2);
    expect(sessions[0].preview).toContain('change my seat');
  });

  it('deletes a session', () => {
    const session = createSession();
    expect(listSessions().some((item) => item.id === session.id)).toBe(true);

    expect(deleteSession(session.id)).toBe(true);
    expect(listSessions().every((item) => item.id !== session.id)).toBe(true);
    // Deleting a missing session is a no-op (false), not an error.
    expect(deleteSession(session.id)).toBe(false);
  });
});
