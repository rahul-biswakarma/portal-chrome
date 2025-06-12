// Chat management service for the Chat Customization System
import type { 
  ChatMessage, 
  ChatSession, 
  UserPreferences,
  StyleTemplate,
  PageContext 
} from '../types';

export class ChatService {
  private sessions: Map<string, ChatSession> = new Map();
  private currentSessionId: string | null = null;
  private preferences: UserPreferences = {
    defaultModel: 'gpt-4',
    autoApplyChanges: false,
    showSuggestions: true,
    theme: 'system',
    maxHistoryLength: 100,
  };

  // Session management
  createSession(title?: string, context?: PageContext): ChatSession {
    const id = this.generateId();
    const session: ChatSession = {
      id,
      title: title || `Chat ${new Date().toLocaleDateString()}`,
      messages: [{
        id: this.generateId(),
        type: 'system',
        content: 'Welcome! I can help modify your website styles. Describe what you\'d like to change.',
        timestamp: Date.now()
      }],
      context: context || this.createDefaultContext(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: true
    };

    this.sessions.set(id, session);
    this.currentSessionId = id;
    return session;
  }

  getCurrentSession(): ChatSession | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }

  setCurrentSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      return true;
    }
    return false;
  }

  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
      return true;
    }
    return false;
  }

  // Message management
  addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage | null {
    const session = this.getCurrentSession();
    if (!session) return null;

    const newMessage: ChatMessage = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now()
    };

    session.messages.push(newMessage);
    session.updatedAt = Date.now();

    // Limit history length
    if (session.messages.length > this.preferences.maxHistoryLength!) {
      session.messages = session.messages.slice(-this.preferences.maxHistoryLength!);
    }

    return newMessage;
  }

  updateMessage(messageId: string, updates: Partial<ChatMessage>): boolean {
    const session = this.getCurrentSession();
    if (!session) return false;

    const messageIndex = session.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return false;

    session.messages[messageIndex] = { ...session.messages[messageIndex], ...updates };
    session.updatedAt = Date.now();
    return true;
  }

  deleteMessage(messageId: string): boolean {
    const session = this.getCurrentSession();
    if (!session) return false;

    const messageIndex = session.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return false;

    session.messages.splice(messageIndex, 1);
    session.updatedAt = Date.now();
    return true;
  }

  // Context management
  updateContext(sessionId: string, context: Partial<PageContext>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.context = { ...session.context, ...context };
    session.updatedAt = Date.now();
    return true;
  }

  // Preferences management
  getPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  updatePreferences(updates: Partial<UserPreferences>): void {
    this.preferences = { ...this.preferences, ...updates };
  }

  // Template management
  createTemplate(name: string, description: string, sessionId: string): StyleTemplate | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const cssChanges = session.messages
      .filter(m => m.metadata?.cssChanges)
      .flatMap(m => m.metadata!.cssChanges!);

    const template: StyleTemplate = {
      id: this.generateId(),
      name,
      description,
      cssChanges,
      tags: [],
      createdAt: Date.now(),
      usageCount: 0
    };

    return template;
  }

  // Search and filter
  searchMessages(query: string, sessionId?: string): ChatMessage[] {
    const sessions = sessionId ? [this.sessions.get(sessionId)] : Array.from(this.sessions.values());
    const results: ChatMessage[] = [];

    sessions.forEach(session => {
      if (!session) return;
      session.messages.forEach(message => {
        if (message.content.toLowerCase().includes(query.toLowerCase())) {
          results.push(message);
        }
      });
    });

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Export/import
  exportSession(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return JSON.stringify(session, null, 2);
  }

  importSession(data: string): ChatSession | null {
    try {
      const session: ChatSession = JSON.parse(data);
      
      // Validate session structure
      if (!session.id || !session.messages || !Array.isArray(session.messages)) {
        throw new Error('Invalid session format');
      }

      // Generate new ID to avoid conflicts
      session.id = this.generateId();
      session.updatedAt = Date.now();

      this.sessions.set(session.id, session);
      return session;
    } catch (error) {
      console.error('Failed to import session:', error);
      return null;
    }
  }

  // Utility methods
  private generateId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createDefaultContext(): PageContext {
    return {
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      portalElements: [],
      currentCSS: '',
      computedStyles: {},
      tailwindClasses: {}
    };
  }

  // Statistics
  getSessionStats(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const messageCount = session.messages.length;
    const userMessages = session.messages.filter(m => m.type === 'user').length;
    const cssChanges = session.messages.reduce((acc, m) => 
      acc + (m.metadata?.cssChanges?.length || 0), 0);
    
    return {
      messageCount,
      userMessages,
      cssChanges,
      duration: Date.now() - session.createdAt,
      lastActivity: session.updatedAt
    };
  }
} 