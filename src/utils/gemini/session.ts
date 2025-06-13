import type { GeminiMessage, MessagePart, Role, MetadataValue } from './types';

// Chat session management
export class ChatSession {
  id: string;
  messages: GeminiMessage[];
  createdAt: Date;
  lastUpdated: Date;
  metadata: Record<string, MetadataValue>;
  maxHistoryLength: number;

  constructor(id: string, initialMessages: GeminiMessage[] = [], maxHistoryLength = 10) {
    this.id = id;
    this.messages = initialMessages;
    this.createdAt = new Date();
    this.lastUpdated = new Date();
    this.metadata = {};
    this.maxHistoryLength = maxHistoryLength;
  }

  addMessage(role: Role, parts: MessagePart[]) {
    const partsCopy = parts.map(part => {
      if ('text' in part) {
        return { text: part.text };
      } else if ('inline_data' in part) {
        return {
          inline_data: {
            data: part.inline_data.data,
            mime_type: part.inline_data.mime_type,
          },
        };
      }
      return part;
    });

    this.messages.push({ role, parts: partsCopy });
    this.lastUpdated = new Date();
    this.pruneHistory();
  }

  pruneHistory() {
    if (this.messages.length > this.maxHistoryLength) {
      this.messages = this.messages.slice(-this.maxHistoryLength);
    }
  }

  getMessages(): GeminiMessage[] {
    return this.messages.map(msg => ({
      role: msg.role,
      parts: msg.parts.map(part => {
        if ('text' in part) {
          return { text: part.text };
        } else if ('inline_data' in part) {
          return {
            inline_data: {
              data: part.inline_data.data,
              mime_type: part.inline_data.mime_type,
            },
          };
        }
        return part;
      }),
    }));
  }

  setMetadata(key: string, value: MetadataValue) {
    this.metadata[key] = value;
  }

  getMetadata(key: string): MetadataValue | undefined {
    return this.metadata[key];
  }
}

// Singleton to manage chat sessions
export class ChatSessionManager {
  private static instance: ChatSessionManager;
  private sessions: Map<string, ChatSession> = new Map();

  private constructor() {}

  static getInstance(): ChatSessionManager {
    if (!ChatSessionManager.instance) {
      ChatSessionManager.instance = new ChatSessionManager();
    }
    return ChatSessionManager.instance;
  }

  createSession(id: string, initialMessages: GeminiMessage[] = []): ChatSession {
    const session = new ChatSession(id, initialMessages);
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): ChatSession | undefined {
    return this.sessions.get(id);
  }

  getOrCreateSession(id: string): ChatSession {
    let session = this.getSession(id);
    if (!session) {
      session = this.createSession(id);
    }
    return session;
  }

  deleteSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }
}

// Export the chat session manager for use across the application
export const chatManager = ChatSessionManager.getInstance();
