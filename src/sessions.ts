import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

export interface ChatMessage {
  role: string;
  content: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export function utcNow(): string {
  return new Date().toISOString();
}

export function logsDir(): string {
  return path.resolve(process.env.AIRLINE_SUPPORT_LOG_DIR ?? 'logs');
}

export function ensureLogsDir(): string {
  const directory = logsDir();
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export function validateSessionId(sessionId: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('session id contains unsupported characters');
  }
  return sessionId;
}

export function sessionPath(sessionId: string): string {
  return path.join(ensureLogsDir(), `${validateSessionId(sessionId)}.jsonl`);
}

export function sessionIdFromLogName(logName: string): string {
  let name = path.basename(logName);
  if (name.endsWith('.jsonl')) {
    name = name.slice(0, -'.jsonl'.length);
  }
  return validateSessionId(name);
}

export function createSession(
  sessionId: string | null = null,
  overwrite = false,
): ChatSession {
  const id = sessionId
    ? validateSessionId(sessionId)
    : `session-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const timestamp = utcNow();
  const filePath = sessionPath(id);
  const flag = overwrite ? 'w' : 'wx';
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ type: 'session', id, created_at: timestamp })}\n`,
    { encoding: 'utf-8', flag },
  );
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    messageCount: 0,
    preview: 'New session',
  };
}

export function deleteSession(sessionId: string): boolean {
  const filePath = sessionPath(sessionId);
  if (!fs.existsSync(filePath)) {
    return false;
  }
  fs.unlinkSync(filePath);
  return true;
}

export function appendMessage(
  sessionId: string,
  role: string,
  content: string,
): ChatMessage {
  if (role !== 'user' && role !== 'assistant') {
    throw new Error('role must be user or assistant');
  }
  const message: ChatMessage = { role, content, createdAt: utcNow() };
  fs.appendFileSync(
    sessionPath(sessionId),
    `${JSON.stringify({
      type: 'message',
      role: message.role,
      content: message.content,
      created_at: message.createdAt,
    })}\n`,
    { encoding: 'utf-8' },
  );
  return message;
}

export function readMessages(sessionId: string): ChatMessage[] {
  const filePath = sessionPath(sessionId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No log file found for session ${sessionId}`);
  }

  const messages: ChatMessage[] = [];
  const lines = fs.readFileSync(filePath, { encoding: 'utf-8' }).split('\n');
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const event = JSON.parse(line);
    if (event.type !== 'message') {
      continue;
    }
    messages.push({
      role: String(event.role),
      content: String(event.content),
      createdAt: String(event.created_at),
    });
  }
  return messages;
}

export function listSessions(): ChatSession[] {
  ensureLogsDir();
  const directory = logsDir();
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith('.jsonl'))
    .map((file) => ({
      file,
      mtimeMs: fs.statSync(path.join(directory, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const sessions: ChatSession[] = [];
  for (const { file } of files) {
    const sessionId = file.slice(0, -'.jsonl'.length);
    const stats = fs.statSync(path.join(directory, file));
    let createdAt = new Date(stats.birthtimeMs).toISOString();
    let updatedAt = new Date(stats.mtimeMs).toISOString();
    const messages = readMessages(sessionId);
    if (messages.length > 0) {
      createdAt = messages[0].createdAt;
      updatedAt = messages[messages.length - 1].createdAt;
    }
    const preview =
      messages.find((message) => message.role === 'user')?.content ??
      'New session';
    sessions.push({
      id: sessionId,
      createdAt,
      updatedAt,
      messageCount: messages.length,
      preview: preview.slice(0, 96),
    });
  }
  return sessions;
}
